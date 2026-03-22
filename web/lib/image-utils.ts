/**
 * image-utils.ts — Browser-side image validation, reading, resizing, and processing.
 *
 * Pure utilities shared by chat mode (drag/paste → base64 inline) and terminal mode
 * (drag/paste → upload). All functions are side-effect-free except for Canvas usage
 * in resizeImageInBrowser.
 *
 * Observability:
 * - console.warn on validation failure (wrong MIME type, oversized file)
 * - Errors thrown with descriptive messages for upstream catch handlers
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

/** Raw file size limit before base64 encoding (20 MB) */
const MAX_RAW_FILE_SIZE = 20 * 1024 * 1024

/** Maximum base64 payload size after encoding/resize (4.5 MB) */
const MAX_BASE64_PAYLOAD_SIZE = 4.5 * 1024 * 1024

/** Maximum image dimension (width or height) before resize triggers */
const MAX_DIMENSION = 2000

/** Maximum number of pending images per message */
export const MAX_PENDING_IMAGES = 5

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingImage {
  /** Unique identifier for removal */
  id: string
  /** Base64-encoded image data (no data URI prefix) */
  data: string
  /** MIME type of the image */
  mimeType: string
  /** Blob URL for efficient thumbnail rendering — must be revoked on cleanup */
  previewUrl: string
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    const error = `Unsupported image type: ${file.type || "unknown"}. Accepted: JPEG, PNG, GIF, WebP.`
    console.warn("[image-utils] validation failed:", error)
    return { valid: false, error }
  }

  if (file.size > MAX_RAW_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    const error = `Image too large (${sizeMB} MB). Maximum: 20 MB.`
    console.warn("[image-utils] validation failed:", error)
    return { valid: false, error }
  }

  return { valid: true }
}

// ─── File Reading ─────────────────────────────────────────────────────────────

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ""
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      resolve(btoa(binary))
    }
    reader.onerror = () => reject(new Error("Failed to read image file"))
    reader.readAsArrayBuffer(file)
  })
}

// ─── Resize ───────────────────────────────────────────────────────────────────

/**
 * Resize an image if its dimensions exceed MAX_DIMENSION or its payload exceeds
 * MAX_BASE64_PAYLOAD_SIZE.
 *
 * For GIF/WebP: skip resize if the base64 payload is already under the byte limit
 * (canvas strips animation frames). If over limit, convert to JPEG.
 *
 * Re-checks final payload size after resize; rejects if still over limit.
 */
export async function resizeImageInBrowser(
  base64: string,
  mimeType: string,
): Promise<{ data: string; mimeType: string }> {
  const payloadBytes = base64.length * 0.75 // approximate decoded size

  // For animated formats (GIF/WebP), preserve if under limit
  if ((mimeType === "image/gif" || mimeType === "image/webp") && payloadBytes <= MAX_BASE64_PAYLOAD_SIZE) {
    return { data: base64, mimeType }
  }

  // Load image to check dimensions
  const img = await loadImage(base64, mimeType)
  const needsDimensionResize = img.width > MAX_DIMENSION || img.height > MAX_DIMENSION
  const needsPayloadResize = payloadBytes > MAX_BASE64_PAYLOAD_SIZE

  if (!needsDimensionResize && !needsPayloadResize) {
    return { data: base64, mimeType }
  }

  // Determine output format — animated formats convert to JPEG when resized
  const outputMime =
    mimeType === "image/gif" || mimeType === "image/webp"
      ? "image/jpeg"
      : mimeType

  // Calculate target dimensions
  let targetWidth = img.width
  let targetHeight = img.height

  if (needsDimensionResize) {
    const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height)
    targetWidth = Math.round(img.width * scale)
    targetHeight = Math.round(img.height * scale)
  }

  // Canvas resize
  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context not available")

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  // Encode — JPEG gets quality 0.85, PNG is lossless
  const quality = outputMime === "image/jpeg" ? 0.85 : undefined
  const dataUrl = canvas.toDataURL(outputMime, quality)
  const resizedBase64 = dataUrl.split(",")[1]

  // Re-check payload size
  const finalBytes = resizedBase64.length * 0.75
  if (finalBytes > MAX_BASE64_PAYLOAD_SIZE) {
    throw new Error(
      `Image still exceeds 4.5 MB after resize (${(finalBytes / (1024 * 1024)).toFixed(1)} MB). Try a smaller image.`,
    )
  }

  return { data: resizedBase64, mimeType: outputMime }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Single entry point: validate → read → resize.
 * Used by both chat mode and terminal mode.
 */
export async function processImageFile(
  file: File,
): Promise<{ data: string; mimeType: string }> {
  const validation = validateImageFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const base64 = await readFileAsBase64(file)
  return resizeImageInBrowser(base64, file.type)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(base64: string, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to decode image"))
    img.src = `data:${mimeType};base64,${base64}`
  })
}

/** Generate a short unique ID for pending image tracking */
export function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
