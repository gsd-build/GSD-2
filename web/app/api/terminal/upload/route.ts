/**
 * POST endpoint to upload an image file to the OS temp directory.
 *
 * POST /api/terminal/upload
 * Body: multipart/form-data with a single `file` field
 *
 * Returns:
 *   200 { ok: true, path: "/tmp/gsd-upload-..." }
 *   400 { error: "No file provided" }
 *   413 { error: "File too large (...)" }
 *   415 { error: "Unsupported image type: ..." }
 *   500 { error: "Failed to write file: ..." }
 *
 * Observability:
 *   - Structured error responses with descriptive messages
 *   - No custom cleanup — OS handles temp dir cleanup on reboot
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** 20 MB raw file size limit */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      {
        error: `Unsupported image type: ${file.type || "unknown"}. Accepted: JPEG, PNG, GIF, WebP.`,
      },
      { status: 415 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return Response.json(
      { error: `File too large (${sizeMB} MB). Maximum: 20 MB.` },
      { status: 413 },
    );
  }

  // Generate unique filename and write to temp dir
  const ext = MIME_TO_EXT[file.type] ?? "bin";
  const hex = randomBytes(4).toString("hex");
  const filename = `gsd-upload-${Date.now()}-${hex}.${ext}`;
  const filePath = join(tmpdir(), filename);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[terminal-upload] Failed to write file:", message);
    return Response.json(
      { error: `Failed to write file: ${message}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, path: filePath });
}
