// Policy helpers for cli.ts — extracted as pure functions so they can be
// unit-tested without executing cli.ts's top-level script body.

/**
 * Subcommands that must bypass the managed-resource-mismatch gate.
 *
 * When the synced resource manifest claims a newer gsd version than the
 * running binary, exitIfManagedResourcesAreNewer() blocks every command
 * with a "Version mismatch detected" diagnostic. The `update` subcommand
 * MUST bypass that gate so the user can recover by upgrading the binary —
 * otherwise they're stuck in a broken state with no escape hatch.
 *
 * Any new bypassed subcommand goes here. cli.ts dispatches on this
 * predicate before calling exitIfManagedResourcesAreNewer().
 */
export function shouldBypassManagedResourceMismatchGate(firstMessage: string | undefined): boolean {
  return firstMessage === 'update'
}
