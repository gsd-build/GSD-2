/**
 * Native clipboard access using N-API.
 *
 * Cross-platform clipboard read/write backed by the `arboard` Rust crate.
 * No external tools (pbcopy, xclip, etc.) required.
 */

import { native } from "../native.js";
import type { ClipboardImage } from "./types.js";

export type { ClipboardImage };

/**
 * Copy plain text to the system clipboard.
 *
 * Runs synchronously to avoid macOS AppKit pasteboard warnings
 * when writing from worker threads.
 */
export function copyToClipboard(text: string): void {
  native.copyToClipboard(text);
}

/**
 * Read plain text from the system clipboard.
 *
 * Returns `null` when no text data is available.
 */
export function readTextFromClipboard(): string | null {
  return native.readTextFromClipboard() as string | null;
}

/**
 * Read an image from the system clipboard.
 *
 * Returns a Promise that resolves to a `ClipboardImage` (PNG-encoded bytes)
 * or `null` when no image data is available.
 */
export function readImageFromClipboard(): Promise<ClipboardImage | null> {
  return native.readImageFromClipboard() as Promise<ClipboardImage | null>;
}
