// Client-side image downscaling/re-encoding, run before an admin-uploaded
// image ever reaches uploadFileToS3ViaSigner. Follow-up to the 2026-08-02
// asset-maintenance pass (see CLAUDE.md "Avatar/topic-image assets were
// serving full-camera-resolution files") which fixed the *existing* S3 pool
// with a one-off sips script — this is the same target sizes/quality
// applied automatically at upload time instead, so the problem can't
// silently reappear post by post.
//
// "feed" matches the topic-image-pool target from that pass (1400px long
// edge — 2x retina at the feed's 700px display width). "avatar" matches the
// avatar-pool target (320px). Dimension-wise both intentionally mirror
// those exact numbers rather than inventing new ones.
//
// Quality is adaptive, not fixed (2026-09-17 fix — a single fixed quality
// was the actual bug: real-world photos vary enormously in how well they
// compress, so a starting quality tuned for an "easy" image left busy,
// high-detail photos — dense foliage, textured stock photos, etc. —
// several hundred KB to ~1MB even after the dimension cap, confirmed
// directly against real uploaded images that hit exactly this case).
// `qualitySteps` is tried in order, stopping at the first step that lands
// under `maxBytes`; if even the lowest step doesn't get there, that lowest
// (smallest) attempt is used anyway rather than looping forever — a
// best-effort floor, not a hard guarantee, so this never spends unbounded
// time on a single upload.
const PRESETS = {
  feed: { maxDimension: 1400, qualitySteps: [0.8, 0.65, 0.5], maxBytes: 350 * 1024, skipIfUnderBytes: 300 * 1024 },
  avatar: { maxDimension: 320, qualitySteps: [0.78, 0.65, 0.5], maxBytes: 100 * 1024, skipIfUnderBytes: 80 * 1024 },
};

/**
 * compressImageFile(file, preset = "feed") -> Promise<File>
 *
 * Downscales to the preset's max dimension (never upscales), then re-encodes
 * as JPEG at progressively lower quality until the result is under the
 * preset's byte budget (or leaves PNG as PNG, to not silently drop
 * transparency — PNG has no quality knob to step down, so only the
 * downscale applies there). Passes the original file through unchanged —
 * never throws — for anything it shouldn't touch or can't safely handle:
 * non-images, GIFs (would destroy animation), SVGs (already tiny/vector),
 * decode failures, or a source that's already small enough that re-encoding
 * isn't worth it. Also passes through unchanged if the compressed result
 * isn't actually smaller (can happen with an already-optimized or very
 * simple source image) — this function should never make an upload worse.
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
    const toBlob = (q) => new Promise((resolve) => canvas.toBlob(resolve, outType, q));

    let blob = null;
    if (outType === "image/jpeg") {
      for (const q of cfg.qualitySteps) {
        const attempt = await toBlob(q);
        if (!attempt) continue;
        blob = attempt;
        if (attempt.size <= cfg.maxBytes) break;
      }
    } else {
      // PNG: canvas.toBlob's quality argument is ignored per spec, so only
      // one encode is worth doing — the earlier downscale is what shrinks it.
      blob = await toBlob(undefined);
    }
    if (!blob || blob.size >= file.size) return file;

    const baseName = (file.name || "image").replace(/\.\w+$/, "");
    const ext = outType === "image/png" ? "png" : "jpg";
    return new File([blob], `${baseName}.${ext}`, { type: outType, lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}
