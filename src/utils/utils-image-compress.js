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
//
// 2026-09-19 tightening (direct report: a 2.3MB, 1122x1402 *PNG* photo in an
// Instagram post rendered black for ~3s before loading): "feed" moved from
// 1400px / 350KB to 1080px (Instagram's own upload cap — the feed card is
// ~470px wide, so 1080 is still >2x retina) / 150KB with a lower quality
// floor. The bigger bug was PNG handling, not the numbers: a PNG was never
// re-encoded at all (no quality knob) and only downscaled when over the
// dimension cap, so any PNG photo at or under 1400px went through completely
// untouched. PNGs/WebPs with no transparent pixels are now treated as photos
// and re-encoded as JPEG — see hasTransparency() below.
const PRESETS = {
  feed: { maxDimension: 1080, qualitySteps: [0.72, 0.6, 0.5, 0.4], maxBytes: 150 * 1024, skipIfUnderBytes: 100 * 1024 },
  avatar: { maxDimension: 320, qualitySteps: [0.78, 0.65, 0.5], maxBytes: 100 * 1024, skipIfUnderBytes: 80 * 1024 },
};

/**
 * compressImageFile(file, preset = "feed") -> Promise<File>
 *
 * Downscales to the preset's max dimension (never upscales), then re-encodes
 * as JPEG at progressively lower quality until the result is under the
 * preset's byte budget. A PNG/WebP that actually has transparent pixels stays
 * PNG (JPEG would turn transparency black; PNG has no quality knob, so only
 * the downscale applies there) — but one that is fully opaque (i.e. a photo
 * saved as PNG) is converted to JPEG like any other photo. Passes the original file through unchanged —
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

    const canHaveAlpha = file.type === "image/png" || file.type === "image/webp";
    const keepAlpha = canHaveAlpha && hasTransparency(ctx, targetW, targetH);
    const outType = keepAlpha ? "image/png" : "image/jpeg";
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
      // PNG with real transparency: canvas.toBlob's quality argument is
      // ignored per spec, so only one encode is worth doing — the earlier
      // downscale is what shrinks it.
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

// True if any pixel is not fully opaque. Scans the already-downscaled canvas
// (at most maxDimension^2 pixels), so it's cheap. Any failure to read pixels
// is treated as "has transparency" — the safe direction, since it just keeps
// the original PNG behavior instead of risking a black-background JPEG.
function hasTransparency(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true;
  }
}
