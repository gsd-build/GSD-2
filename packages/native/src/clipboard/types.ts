/** Clipboard image payload encoded as PNG bytes. */
export interface ClipboardImage {
  /** PNG-encoded image bytes. */
  data: Uint8Array;
  /** MIME type for the encoded image payload (always "image/png"). */
  mimeType: string;
}
