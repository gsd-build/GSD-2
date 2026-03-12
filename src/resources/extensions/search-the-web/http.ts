/**
 * HTTP utilities: retry with backoff, abort signal merging, error types, timing.
 */

// =============================================================================
// Error Types
// =============================================================================

/** Structured error for non-2xx HTTP responses. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly response?: Response;

  constructor(message: string, statusCode: number, response?: Response) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.response = response;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/** Categorized error types for agent-friendly error handling. */
export type SearchErrorKind =
  | "auth_error"       // 401/403 — bad or missing API key
  | "rate_limited"     // 429 — too many requests
  | "network_error"    // DNS, timeout, connection refused
  | "server_error"     // 5xx
  | "invalid_request"  // 400, bad params
  | "not_found"        // 404
  | "unknown";

export function classifyError(err: unknown): { kind: SearchErrorKind; message: string; retryAfterMs?: number } {
  if (err instanceof HttpError) {
    const code = err.statusCode;
    if (code === 401 || code === 403) {
      return { kind: "auth_error", message: `HTTP ${code}: Invalid or missing API key. Check your API key with secure_env_collect.` };
    }
    if (code === 429) {
      let retryAfterMs: number | undefined;
      const retryAfter = err.response?.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        if (!isNaN(seconds)) retryAfterMs = seconds * 1000;
      }
      return { kind: "rate_limited", message: `Rate limited (HTTP 429). ${retryAfterMs ? `Retry after ${Math.ceil(retryAfterMs / 1000)}s.` : "Wait before retrying."}`, retryAfterMs };
    }
    if (code === 400) {
      return { kind: "invalid_request", message: `Bad request (HTTP 400): ${err.message}` };
    }
    if (code === 404) return { kind: "not_found", message: `Not found (HTTP 404)` };
    if (code >= 500) return { kind: "server_error", message: `Server error (HTTP ${code}): ${err.message}` };
    return { kind: "unknown", message: `HTTP ${code}: ${err.message}` };
  }
  if (err instanceof TypeError) {
    return { kind: "network_error", message: `Network error: ${(err as Error).message}` };
  }
  const msg = (err as Error)?.message ?? String(err);
  if (msg.includes("abort") || msg.includes("timeout")) {
    return { kind: "network_error", message: `Request timed out` };
  }
  return { kind: "unknown", message: msg };
}

// =============================================================================
// Rate Limit Info
// =============================================================================

export interface RateLimitInfo {
  remaining?: number;
  limit?: number;
  reset?: number; // epoch seconds
}

/** Extract rate limit headers from a Brave API response. */
export function extractRateLimitInfo(response: Response): RateLimitInfo | undefined {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  const reset = response.headers.get("x-ratelimit-reset");
  if (!remaining && !limit) return undefined;
  return {
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    reset: reset ? parseInt(reset, 10) : undefined,
  };
}

// =============================================================================
// Timing
// =============================================================================

export interface TimedResponse {
  response: Response;
  latencyMs: number;
  rateLimit?: RateLimitInfo;
}

// =============================================================================
// Retry Logic
// =============================================================================

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  if (error instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Merge multiple AbortSignals — aborts as soon as any fires. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      break;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Fetch with automatic retry and full-jitter exponential backoff.
 *
 * - maxRetries: additional attempts after the first (total = maxRetries + 1)
 * - Respects Retry-After header on 429 responses
 * - Each attempt uses a 30-second AbortSignal timeout
 * - Non-retryable errors thrown immediately
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

    const callerSignal = options.signal as AbortSignal | undefined;
    const signal = callerSignal
      ? anySignal([callerSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response
        );
      }
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (!isRetryable(err)) throw err;

      if (attempt < maxRetries) {
        let delayMs: number;
        if (err instanceof HttpError && err.statusCode === 429 && err.response) {
          const retryAfter = err.response.headers.get("Retry-After");
          if (retryAfter) {
            const seconds = parseFloat(retryAfter);
            delayMs = isNaN(seconds) ? 1000 : seconds * 1000;
          } else {
            delayMs = Math.random() * Math.min(32_000, 1_000 * 2 ** attempt);
          }
        } else {
          delayMs = Math.random() * Math.min(32_000, 1_000 * 2 ** attempt);
        }
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Simple fetch with timeout, no retry. For content extraction where
 * we want to fail fast.
 */
export async function fetchSimple(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const callerSignal = fetchOpts.signal as AbortSignal | undefined;
  const signal = callerSignal
    ? anySignal([callerSignal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, { ...fetchOpts, signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response
      );
    }
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Fetch with retry AND timing/rate-limit extraction.
 * Wraps fetchWithRetry and returns latency + rate limit info.
 */
export async function fetchWithRetryTimed(
  url: string,
  options: RequestInit,
  maxRetries: number = 2
): Promise<TimedResponse> {
  const start = performance.now();
  const response = await fetchWithRetry(url, options, maxRetries);
  const latencyMs = Math.round(performance.now() - start);
  const rateLimit = extractRateLimitInfo(response);
  return { response, latencyMs, rateLimit };
}
