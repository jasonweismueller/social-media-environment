import React from "react";
import { getImageCropStyle } from "../utils";

/* A post's own circular avatar, with optional admin framing (posts.avatar_crop).
 *
 * `crop` null/undefined => the exact plain circular <img> every avatar used before
 * this existed (object-fit:cover, centred), so existing posts are untouched.
 *
 * With a crop, the image is scaled/positioned via the same getImageCropStyle the
 * post-image cropper uses — which relies on a transform, so the circle has to be a
 * clipping wrapper (a scaled <img> would otherwise spill outside its own rounded
 * corners). This lets an admin frame a wide logo on the part that reads at ~34px
 * instead of the centre-crop that cuts it in half. */
export function CropAvatar({ src, size, crop, alt = "", style }) {
  if (!crop) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={{ borderRadius: "999px", objectFit: "cover", ...style }}
      />
    );
  }
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "999px",
        overflow: "hidden",
        flexShrink: 0,
        lineHeight: 0,
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", height: "100%", display: "block", ...getImageCropStyle(crop) }}
      />
    </span>
  );
}
