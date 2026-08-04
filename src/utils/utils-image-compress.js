// Client-side image downscaling/re-encoding, run before an admin-uploaded
// image ever reaches uploadFileToS3ViaSigner. Follow-up to the 2026-08-02
// asset-maintenance pass (see CLAUDE.md "Avatar/topic-image assets were
// serving full-camera-resolution files") which fixed the *existing* S3 pool
// with a one-off sips script — this is the same target sizes/quality
// applied automatically at upload time instead, so the problem can't
// silently reappear post by post.
//
// "feed" matches the topic-image-pool target from that pass (1400px long
// edge — 2x retina at the feed's 700px display width, quality 80). "avatar"
// matches the avatar-pool target (320px, quality 78). Both intentionally
// mirror those exact numbers rather than inventing new ones, so a
// resized-on-upload image and a resized-by-the-2026-08-02-script image look
// the same.
const PRESETS = {
  feed: { maxDimension: 1400, quality: 0.8, skipIfUnderBytes: 300 * 1024 },
  avatar: { maxDimension: 320, quality: 0.78, skipIfUnderBytes: 80 * 1024 },
};

/**
 * compressImageFile(file, preset = "feed") -> Promise<File>
 *
 * Downscales to the preset's max dimension (never upscales) and re-encodes
 * as JPEG (or leaves PNG as PNG, to not silently drop transparency) via a
 * canvas. Passes the original file through unchanged — never throws — for
 * anything it shouldn't touch or can't safely handle: non-images, GIFs
 * (would destroy animation), SVGs (already tiny/vector), decode failures,
 * or a source that's already small enough that re-encoding isn't worth it.
 * Also passes through unchanged if the compressed result isn't actually
 * smaller (can happen with an already-optimized or very simple source
 * image) — this function should never make an upload worse.
 */
export async function compressImageFile(file, preset = "feed") {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  const cfg = PRESETS[preset] || PRESETS.feed;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, cfg.maxDimension / Math.max(width, height));
    if (scale >= 1 && file.size <= cfg.skipIfUnderBytes) {
      return file;
    }

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, cfg.quality));
    if (!blob || blob.size >= file.size) return file;

    const baseName = (file.name || "image").replace(/\.\w+$/, "");
    const ext = outType === "image/png" ? "png" : "jpg";
    return new File([blob], `${baseName}.${ext}`, { type: outType, lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}
