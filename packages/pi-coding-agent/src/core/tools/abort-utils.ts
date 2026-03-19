/**
 * Shared abort signal handling for tool implementations.
 *
 * Most tools wrap their execute body in a `new Promise` with identical abort
 * boilerplate: early-abort check, addEventListener, an `aborted` flag for
 * mid-flight checks, cleanup in both success/error paths, and a guard that
 * swallows errors after abort.  `withAbortSignal` extracts that pattern into
 * a single utility so each tool only contains its domain logic.
 */

/**
 * Sentinel thrown (and caught internally) when an operation is aborted
 * mid-flight via `checkAborted()`.  Never leaks to callers — the outer
 * promise is rejected with the canonical "Operation aborted" error instead.
 */
class AbortedSentinel extends Error {
	constructor() {
		super("aborted-sentinel");
	}
}

/**
 * Run `fn` inside an abort-aware Promise wrapper.
 *
 * @param signal  - The optional `AbortSignal` supplied by the framework.
 * @param fn      - The async work to perform.  Receives a `checkAborted`
 *                  helper that throws if the signal has fired — call it at
 *                  natural yield points (after awaits) to bail out early.
 * @returns A promise that resolves with the value returned by `fn`, or
 *          rejects with `Error("Operation aborted")` if the signal fires.
 *
 * Behavior contract (identical to the hand-rolled version in each tool):
 * 1. If `signal` is already aborted on entry, rejects immediately.
 * 2. An `"abort"` listener is registered (once) to reject on late aborts.
 * 3. `checkAborted()` throws an internal sentinel when `aborted` is true,
 *    causing `fn` to unwind without producing a result.
 * 4. The listener is removed in a `finally` block (success *or* failure).
 * 5. If `fn` throws after an abort, the error is swallowed — the abort
 *    rejection has already settled the promise.
 */
export function withAbortSignal<T>(
	signal: AbortSignal | undefined,
	fn: (checkAborted: () => void) => Promise<T>,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		// 1. Early abort check
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		let aborted = false;

		// 2. Abort listener
		const onAbort = () => {
			aborted = true;
			reject(new Error("Operation aborted"));
		};

		if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

		// 3. Helper for the caller to check mid-flight
		const checkAborted = () => {
			if (aborted) {
				throw new AbortedSentinel();
			}
		};

		// 4. Run the async work
		(async () => {
			try {
				const result = await fn(checkAborted);

				// Don't resolve if aborted in the meantime
				if (aborted) return;

				resolve(result);
			} catch (error: unknown) {
				if (!aborted) {
					reject(error);
				}
				// If aborted, the onAbort handler already rejected — swallow.
			} finally {
				// 5. Always clean up the listener
				if (signal) {
					signal.removeEventListener("abort", onAbort);
				}
			}
		})();
	});
}
