// components-admin-media.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomSVG, uploadFileToS3ViaSigner, compressImageFile, getImageCropStyle, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM } from "../utils";
import { EditorSection, Field } from "./components-admin-editor-ui";
import { useToast, Button, IconButton, Spinner } from "./ui";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ZoomOutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="20.5" y1="20.5" x2="16" y2="16" />
    </svg>
  );
}
function ZoomInIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="20.5" y1="20.5" x2="16" y2="16" />
    </svg>
  );
}

/* -------------------------- Crop geometry helpers --------------------------
   The cropper's data model is still just {focalX, focalY, zoom} — same shape
   as before — but every interaction (drag, wheel, pinch, double-click) needs
   to translate a screen-pixel gesture into a focal-point/zoom change that
   matches EXACTLY what `getImageCropStyle` (../utils/utils-core.js) will
   later render with `object-fit:cover` + `transform:scale`. These helpers
   are the inverse of that CSS: given the crop box's pixel size and the
   image's natural (intrinsic) size, they compute the same "cover" render
   geometry the browser computes internally, so drag distance in pixels maps
   to focal-percent movement 1:1 (the photo tracks the pointer exactly), and
   a "zoom toward this point" gesture keeps the same bit of image content
   under the pointer instead of just zooming toward the existing focal point. */
function computeCoverGeometry(containerSize, natural, zoom) {
  if (!containerSize || !natural || !natural.w || !natural.h) return null;
  const imgAspect = natural.w / natural.h; // container is always square (1:1)
  const baseW = imgAspect >= 1 ? containerSize * imgAspect : containerSize;
  const baseH = imgAspect >= 1 ? containerSize : containerSize / imgAspect;
  const w = baseW * zoom;
  const h = baseH * zoom;
  return { w, h, overflowX: Math.max(0, w - containerSize), overflowY: Math.max(0, h - containerSize) };
}
function offsetFromFocalPct(focalPct, overflow) {
  return -(overflow * (focalPct / 100));
}
function focalPctFromOffset(offset, overflow) {
  if (overflow <= 0.0001) return 50;
  return clamp(-(offset / overflow) * 100, 0, 100);
}
// Solve the focal point that keeps the same bit of image content anchored
// under (anchorX, anchorY) — pixels relative to the crop box's own top-left
// — after changing zoom from `fromZoom` to `toZoom`. Anchor = cursor for
// wheel-zoom, pinch midpoint for pinch-zoom, click point for double-click.
function focalAfterZoomAtPoint({ containerSize, natural, anchorX, anchorY, fromZoom, fromFocalX, fromFocalY, toZoom }) {
  const g0 = computeCoverGeometry(containerSize, natural, fromZoom);
  if (!g0) return { focalX: fromFocalX, focalY: fromFocalY };
  const offsetX0 = offsetFromFocalPct(fromFocalX, g0.overflowX);
  const offsetY0 = offsetFromFocalPct(fromFocalY, g0.overflowY);
  const fracX = g0.w > 0 ? clamp((anchorX - offsetX0) / g0.w, 0, 1) : 0.5;
  const fracY = g0.h > 0 ? clamp((anchorY - offsetY0) / g0.h, 0, 1) : 0.5;

  const g1 = computeCoverGeometry(containerSize, natural, toZoom);
  if (!g1) return { focalX: fromFocalX, focalY: fromFocalY };
  const offsetX1 = anchorX - fracX * g1.w;
  const offsetY1 = anchorY - fracY * g1.h;
  return { focalX: focalPctFromOffset(offsetX1, g1.overflowX), focalY: focalPctFromOffset(offsetY1, g1.overflowY) };
}

/* Loads the image's real pixel dimensions off-DOM (a plain `new Image()`,
   not the visible <img>) — needed by the geometry helpers above, since CSS
   handles the actual cover/zoom rendering for us but gives JS no way to ask
   "how much does this image currently overflow its box by". */
function useNaturalImageSize(src) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!src) { setSize(null); return undefined; }
    let cancelled = false;
    setSize(null);
    const img = new window.Image();
    img.onload = () => { if (!cancelled) setSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 }); };
    img.onerror = () => { if (!cancelled) setSize(null); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return size;
}

const ZOOM_STEP_FACTOR = 1.2;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 40;
const TAP_MOVE_SLOP_PX = 4;
const TAP_MAX_MS = 400;

/* Real-Instagram-style crop tool: the photo itself is draggable (grab and
   slide it to reposition, exactly like real Instagram's uploader), zoomable
   via scroll wheel / pinch / double-click|tap (all anchored to the pointer,
   not just the existing focal point, so zooming feels like it's zooming
   "into" wherever you're pointing), plus a zoom slider/buttons/Reset for
   precision and accessibility. What's rendered here is pixel-for-pixel the
   same CSS (`getImageCropStyle`) used for the real participant-facing post
   — this preview IS what a participant will see, not an approximation of it. */
export function ImageCropper({
  src,
  alt = "",
  focalX = 50,
  focalY = 50,
  zoom = 1,
  onChange,
  disabled = false,
  // Circular frame (for avatars): the round mask IS the final avatar, so the
  // admin frames exactly what participants will see.
  round = false,
}) {
  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pinching, setPinching] = useState(false);
  const [focused, setFocused] = useState(false);
  const natural = useNaturalImageSize(src);

  const x = clamp(toNum(focalX, 50), 0, 100);
  const y = clamp(toNum(focalY, 50), 0, 100);
  const z = clamp(toNum(zoom, 1), IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);

  const emit = useCallback(
    (next) => {
      onChange?.({
        focalX: clamp(Math.round(toNum(next.focalX, x)), 0, 100),
        focalY: clamp(Math.round(toNum(next.focalY, y)), 0, 100),
        zoom: clamp(toNum(next.zoom, z), IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM),
      });
    },
    [onChange, x, y, z]
  );

  // Live gesture state. Plain refs (not React state) since pointermove can
  // fire far faster than a re-render is useful for — only the resulting
  // focal/zoom values need to trigger a render, via `emit`.
  const pointersRef = useRef(new Map()); // pointerId -> {x,y} in client coords
  const gestureRef = useRef(null);
  const lastTapRef = useRef(null);

  // (Re)derive the active gesture — plain pan (1 pointer) or pinch-zoom (2)
  // — from whatever pointers are currently down. Called after every
  // pointerdown/up/cancel so a finger lifting mid-pinch smoothly falls back
  // to a single-finger pan instead of leaving a stale gesture behind.
  const beginGesture = useCallback(() => {
    const el = wrapRef.current;
    const pts = [...pointersRef.current.values()];
    const rect = el?.getBoundingClientRect();
    if (!rect || pts.length === 0) { gestureRef.current = null; return; }
    if (pts.length === 1) {
      gestureRef.current = {
        type: "pan",
        containerSize: rect.width,
        startClientX: pts[0].x,
        startClientY: pts[0].y,
        startFocalX: x,
        startFocalY: y,
        downTime: performance.now(),
        moved: false,
      };
    } else {
      const [a, b] = pts;
      gestureRef.current = {
        type: "pinch",
        containerSize: rect.width,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: z,
        anchorX: (a.x + b.x) / 2 - rect.left,
        anchorY: (a.y + b.y) / 2 - rect.top,
        startFocalX: x,
        startFocalY: y,
      };
    }
  }, [x, y, z]);

  const zoomAtClientPoint = useCallback(
    (clientX, clientY, toZoom) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextZoom = clamp(toZoom, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);
      const { focalX: nfx, focalY: nfy } = focalAfterZoomAtPoint({
        containerSize: rect.width,
        natural,
        anchorX: clientX - rect.left,
        anchorY: clientY - rect.top,
        fromZoom: z,
        fromFocalX: x,
        fromFocalY: y,
        toZoom: nextZoom,
      });
      emit({ focalX: nfx, focalY: nfy, zoom: nextZoom });
    },
    [natural, x, y, z, emit]
  );

  const toggleZoomAtClientPoint = useCallback(
    (clientX, clientY) => {
      if (disabled || !src || !natural) return;
      const target = z > 1.05 ? IMAGE_CROP_MIN_ZOOM : Math.min(IMAGE_CROP_MAX_ZOOM, 2.2);
      zoomAtClientPoint(clientX, clientY, target);
    },
    [disabled, src, natural, z, zoomAtClientPoint]
  );

  // Zoom around the CURRENT focal point (no anchor math needed — the focal
  // point is already the transform-origin, so leaving it unchanged while
  // changing zoom is itself "zoom centered on the current focal point").
  // Used by the slider, +/- buttons, and keyboard zoom.
  const zoomAroundFocal = useCallback(
    (factor) => emit({ focalX: x, focalY: y, zoom: z * factor }),
    [emit, x, y, z]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled || !src) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      beginGesture();
      setDragging(pointersRef.current.size === 1);
      setPinching(pointersRef.current.size >= 2);
      e.preventDefault();
    },
    [disabled, src, beginGesture]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (disabled || !pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gestureRef.current;
      if (!g) return;
      e.preventDefault();

      if (g.type === "pan") {
        const dx = e.clientX - g.startClientX;
        const dy = e.clientY - g.startClientY;
        if (Math.abs(dx) > TAP_MOVE_SLOP_PX || Math.abs(dy) > TAP_MOVE_SLOP_PX) g.moved = true;
        const geom = computeCoverGeometry(g.containerSize, natural, z);
        if (!geom) return;
        const nextFocalX = geom.overflowX > 0 ? clamp(g.startFocalX - (dx / geom.overflowX) * 100, 0, 100) : g.startFocalX;
        const nextFocalY = geom.overflowY > 0 ? clamp(g.startFocalY - (dy / geom.overflowY) * 100, 0, 100) : g.startFocalY;
        emit({ focalX: nextFocalX, focalY: nextFocalY, zoom: z });
      } else if (g.type === "pinch") {
        const pts = [...pointersRef.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const nextZoom = clamp(g.startZoom * (dist / g.startDist), IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);
        const { focalX: nfx, focalY: nfy } = focalAfterZoomAtPoint({
          containerSize: g.containerSize,
          natural,
          anchorX: g.anchorX,
          anchorY: g.anchorY,
          fromZoom: g.startZoom,
          fromFocalX: g.startFocalX,
          fromFocalY: g.startFocalY,
          toZoom: nextZoom,
        });
        emit({ focalX: nfx, focalY: nfy, zoom: nextZoom });
      }
    },
    [disabled, natural, z, emit]
  );

  const endPointer = useCallback(
    (e) => {
      const g = gestureRef.current;
      const wasTap = g?.type === "pan" && !g.moved && performance.now() - g.downTime < TAP_MAX_MS;
      pointersRef.current.delete(e.pointerId);
      try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}

      // Double-tap-to-toggle-zoom (touch only — mouse gets a native
      // onDoubleClick below, which doesn't need this bookkeeping).
      if (wasTap && e.pointerType !== "mouse") {
        const now = performance.now();
        const last = lastTapRef.current;
        const dist = last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) : Infinity;
        if (last && now - last.time < DOUBLE_TAP_MS && dist < DOUBLE_TAP_SLOP_PX) {
          lastTapRef.current = null;
          toggleZoomAtClientPoint(e.clientX, e.clientY);
        } else {
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
      }

      beginGesture();
      setDragging(pointersRef.current.size === 1);
      setPinching(pointersRef.current.size >= 2);
    },
    [beginGesture, toggleZoomAtClientPoint]
  );

  const onDoubleClick = useCallback(
    (e) => {
      if (disabled || !src) return;
      toggleZoomAtClientPoint(e.clientX, e.clientY);
    },
    [disabled, src, toggleZoomAtClientPoint]
  );

  const onKeyDown = useCallback(
    (e) => {
      if (disabled || !src) return;
      const stepPx = e.shiftKey ? 40 : 14;
      const rect = wrapRef.current?.getBoundingClientRect();
      const geom = rect ? computeCoverGeometry(rect.width, natural, z) : null;
      let handled = true;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!geom) { handled = false; }
        else {
          const dx = e.key === "ArrowLeft" ? -stepPx : e.key === "ArrowRight" ? stepPx : 0;
          const dy = e.key === "ArrowUp" ? -stepPx : e.key === "ArrowDown" ? stepPx : 0;
          const nextFocalX = geom.overflowX > 0 ? clamp(x - (dx / geom.overflowX) * 100, 0, 100) : x;
          const nextFocalY = geom.overflowY > 0 ? clamp(y - (dy / geom.overflowY) * 100, 0, 100) : y;
          emit({ focalX: nextFocalX, focalY: nextFocalY, zoom: z });
        }
      } else if (e.key === "+" || e.key === "=") {
        zoomAroundFocal(ZOOM_STEP_FACTOR);
      } else if (e.key === "-" || e.key === "_") {
        zoomAroundFocal(1 / ZOOM_STEP_FACTOR);
      } else if (e.key === "0") {
        emit({ focalX: 50, focalY: 50, zoom: 1 });
      } else {
        handled = false;
      }
      if (handled) e.preventDefault();
    },
    [disabled, src, natural, x, y, z, emit, zoomAroundFocal]
  );

  // Wheel needs a non-passive native listener — React's onWheel is passive
  // by default, so e.preventDefault() inside it silently can't stop the
  // page/modal from scrolling while the admin is trying to zoom the photo.
  // Registered once (a ref holds the latest values) rather than re-attached
  // on every focal/zoom change, to avoid listener churn during a fast
  // trackpad zoom gesture.
  const latestRef = useRef();
  latestRef.current = { disabled, src, natural, x, y, z, emit };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const handleWheel = (e) => {
      const s = latestRef.current;
      if (s.disabled || !s.src || !s.natural) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0018);
      const nextZoom = clamp(s.z * factor, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);
      const { focalX: nfx, focalY: nfy } = focalAfterZoomAtPoint({
        containerSize: rect.width,
        natural: s.natural,
        anchorX: e.clientX - rect.left,
        anchorY: e.clientY - rect.top,
        fromZoom: s.z,
        fromFocalX: s.x,
        fromFocalY: s.y,
        toZoom: nextZoom,
      });
      s.emit({ focalX: nfx, focalY: nfy, zoom: nextZoom });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const atMinZoom = z <= IMAGE_CROP_MIN_ZOOM + 0.001;
  const atMaxZoom = z >= IMAGE_CROP_MAX_ZOOM - 0.001;
  const atDefault = x === 50 && y === 50 && z === 1;
  const interacting = dragging || pinching;

  return (
    <div>
      <div
        ref={wrapRef}
        role="group"
        aria-label="Photo crop. Drag to reposition, scroll or pinch to zoom, double-click or double-tap to toggle zoom, arrow keys to nudge."
        tabIndex={disabled || !src ? -1 : 0}
        style={{
          width: "100%",
          maxWidth: round ? 240 : 420,
          margin: "8px 0",
          aspectRatio: "1 / 1",
          position: "relative",
          borderRadius: round ? "50%" : 12,
          overflow: "hidden",
          background: "var(--admin-surface-alt)",
          userSelect: "none",
          cursor: disabled || !src ? "default" : dragging ? "grabbing" : "grab",
          border: "1px solid var(--admin-border)",
          boxShadow: focused ? "0 0 0 3px var(--admin-accent-ring), var(--admin-shadow-sm)" : "var(--admin-shadow-sm)",
          transition: "box-shadow var(--admin-duration-fast, 120ms) var(--admin-ease, ease)",
          touchAction: "none",
          outline: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {src ? (
          <img
            src={src}
            alt={alt || ""}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              WebkitUserDrag: "none",
              willChange: interacting ? "transform" : undefined,
              ...getImageCropStyle({ focalX: x, focalY: y, zoom: z }),
            }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--admin-muted-2)", fontSize: 12.5 }}>
            No image
          </div>
        )}

        {/* Loading placeholder while the real pixel size is still resolving
            — avoids a flash of un-zoomable image before drag/zoom geometry
            can be computed. */}
        {src && !natural && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.06)" }}>
            <Spinner size={18} />
          </div>
        )}

        {/* Rule-of-thirds guide, shown only while actively adjusting —
            matches how real photo-crop tools (incl. Instagram's own) surface
            a grid only during the gesture, not at rest. */}
        {src && natural && interacting && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(rgba(0,0,0,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.25) 1px, transparent 1px)",
              backgroundSize: "33.333% 33.333%",
              mixBlendMode: "difference",
              opacity: 0.7,
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <IconButton
          size="sm"
          onClick={() => zoomAroundFocal(1 / ZOOM_STEP_FACTOR)}
          disabled={disabled || !src || atMinZoom}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOutIcon />
        </IconButton>

        <input
          type="range"
          min={IMAGE_CROP_MIN_ZOOM}
          max={IMAGE_CROP_MAX_ZOOM}
          step={0.01}
          value={z}
          onChange={(e) => emit({ focalX: x, focalY: y, zoom: Number(e.target.value) })}
          disabled={disabled || !src}
          aria-label="Zoom"
          style={{ flex: 1 }}
        />

        <IconButton
          size="sm"
          onClick={() => zoomAroundFocal(ZOOM_STEP_FACTOR)}
          disabled={disabled || !src || atMaxZoom}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomInIcon />
        </IconButton>

        <span style={{ fontSize: 12, color: "var(--admin-muted)", minWidth: 38, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(z * 100)}%
        </span>

        <Button size="sm" variant="ghost" onClick={() => emit({ focalX: 50, focalY: 50, zoom: 1 })} disabled={disabled || !src || atDefault}>
          Reset
        </Button>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--admin-muted)", lineHeight: 1.4, marginTop: 6 }}>
        Drag the photo to reposition it. Scroll, pinch, or double-click/tap to zoom.
      </div>
    </div>
  );
}

/* ================== Tiny thumbnail strip (carousel editor) ================== */
function Thumb({ src, active, onClick, onRemove, idx }) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="admin-btn"
        onClick={onClick}
        style={{
          width: 72,
          height: 72,
          borderRadius: 8,
          overflow: "hidden",
          border: active ? "2px solid var(--admin-info)" : "1px solid var(--admin-border)",
          padding: 0,
          background: "var(--admin-surface)",
          cursor: "pointer",
        }}
        title={`Image ${idx + 1}`}
      >
        {src ? (
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "var(--admin-surface-alt)" }} />
        )}
      </button>

      <button
        type="button"
        className="admin-btn"
        onClick={onRemove}
        title="Remove"
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 22,
          height: 22,
          borderRadius: 999,
          border: "1px solid var(--admin-border-subtle)",
          background: "var(--admin-surface)",
          cursor: "pointer",
          boxShadow: "var(--admin-shadow-sm)",
        }}
      >
        ×
      </button>
    </div>
  );
}

function CarouselEditor({ images, setImages, feedId, isNew }) {
  const toast = useToast();
  const [sel, setSel] = useState(0);
  const safeSel = Math.min(sel, Math.max(0, (images?.length || 1) - 1));
  const current = images?.[safeSel] || null;

  const replaceAt = (i, next) => setImages((arr) => arr.map((it, idx) => (idx === i ? next : it)));
  const removeAt = (i) => setImages((arr) => arr.filter((_, idx) => idx !== i));

  const uploadMany = async (files) => {
    const picked = Array.from(files || []);
    if (!picked.length) return;

    const el = document.querySelector(".modal h3, .section-title");

    try {
      let count = 0;
      for (const f of picked) {
        const setPct = (pct) => {
          if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}% (${count + 1}/${picked.length})`;
        };

        const compressed = await compressImageFile(f, "feed");
        const { cdnUrl } = await uploadFileToS3ViaSigner({
          file: compressed,
          feedId,
          prefix: "images",
          onProgress: setPct,
        });

        setImages((arr) => [
          ...arr,
          { url: cdnUrl, alt: f.name || "Image", focalX: 50, focalY: 50, zoom: 1 },
        ]);

        count++;
      }

      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";
      toast.success("Images uploaded");
    } catch (e) {
      console.error(e);
      toast.error(String(e?.message || "Upload failed."));
      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* thumbs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {images.map((img, i) => (
          <Thumb
            key={`${img.url || "img"}-${i}`}
            src={img.url}
            active={i === safeSel}
            idx={i}
            onClick={() => setSel(i)}
            onRemove={() => {
              const nextIdx = Math.max(0, Math.min(i, images.length - 2));
              removeAt(i);
              setSel(nextIdx);
            }}
          />
        ))}

        <label
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            border: "1px dashed var(--admin-border)",
            display: "grid",
            placeItems: "center",
            color: "var(--admin-muted)",
            cursor: "pointer",
            background: "var(--admin-surface)",
          }}
          title="Add images"
        >
          + Add
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              uploadMany(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* add via URL */}
      <Field label="Add image by URL">
        <input
          className="input"
          placeholder="https://…/image.jpg"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = e.currentTarget.value.trim();
              if (!v) return;
              setImages((arr) => [...arr, { url: v, alt: "Image", focalX: 50, focalY: 50, zoom: 1 }]);
              e.currentTarget.value = "";
            }
          }}
        />
      </Field>

      {/* cropper for selected */}
      {current?.url ? (
        <>
          <ImageCropper
            key={`${safeSel}:${current.url}`}
            src={current.url}
            alt={current.alt || ""}
            focalX={toNum(current.focalX, 50)}
            focalY={toNum(current.focalY, 50)}
            zoom={toNum(current.zoom, 1)}
            onChange={({ focalX, focalY, zoom }) => replaceAt(safeSel, { ...current, focalX, focalY, zoom })}
          />
          <Field label={`Caption for image ${safeSel + 1}`} hint="Optional — shown instead of the post's own caption while this image is in view. Leave blank to use the post caption.">
            <input
              className="input"
              value={current.caption || ""}
              onChange={(e) => replaceAt(safeSel, { ...current, caption: e.target.value })}
              placeholder="Caption for this image…"
            />
          </Field>
        </>
      ) : (
        <div className="subtle">Select a thumbnail to edit focal point.</div>
      )}
    </div>
  );
}

/* ========================= Main fieldset ========================= */
export function MediaFieldset({
  editing,
  setEditing,
  feedId,
  isNew,
  setUploadingVideo,
  setUploadingPoster,
}) {
  const toast = useToast();
  // Single-image helpers (tolerate missing fields)
  const imgUrl = editing.image?.url || "";
  const focalX = toNum(editing.image?.focalX, 50);
  const focalY = toNum(editing.image?.focalY, 50);
  const zoom = toNum(editing.image?.zoom, 1);

  const imageMode = editing.imageMode || "none";
  const images = Array.isArray(editing.images) ? editing.images : [];

  const setImages = (updater) =>
    setEditing((ed) => {
      const next = typeof updater === "function" ? updater(ed.images || []) : updater;
      return { ...ed, images: next };
    });

  const mediaBadge =
    editing.videoMode !== "none" ? "Video" : imageMode === "multi" ? "Carousel" : imageMode !== "none" ? "Image" : null;

  return (
    <EditorSection title="Post Media" subtitle="Image, carousel, or video attached to this post" badge={mediaBadge}>
      <Field label="Media type">
        <select
          className="select"
          value={
            editing.videoMode !== "none"
              ? "video"
              : imageMode === "multi"
              ? "carousel"
              : imageMode !== "none"
              ? "image"
              : "none"
          }
          onChange={(e) => {
            const type = e.target.value;

            if (type === "none") {
              setEditing((ed) => ({
                ...ed,
                imageMode: "none",
                image: null,
                images: [],
                videoMode: "none",
                video: null,
                videoPosterUrl: "",
              }));
              return;
            }

            if (type === "image") {
              setEditing((ed) => ({
                ...ed,
                videoMode: "none",
                video: null,
                videoPosterUrl: "",
                imageMode:
                  (ed.imageMode === "none" || ed.imageMode === "multi" ? "random" : ed.imageMode) || "random",
                images: [],
                image:
                  ed.image || { ...randomSVG("Image"), focalX: 50, focalY: 50, zoom: 1 },
              }));
              return;
            }

            if (type === "carousel") {
              setEditing((ed) => ({
                ...ed,
                videoMode: "none",
                video: null,
                videoPosterUrl: "",
                imageMode: "multi",
                images:
                  ed.images && ed.images.length
                    ? ed.images.map((x) => ({ zoom: 1, focalX: 50, focalY: 50, ...x }))
                    : ed.image?.url
                    ? [{ zoom: 1, focalX: 50, focalY: 50, ...ed.image }]
                    : [],
              }));
              return;
            }

            if (type === "video") {
              setEditing((ed) => ({
                ...ed,
                imageMode: "none",
                image: null,
                images: [],
                videoMode: (ed.videoMode === "none" ? "url" : ed.videoMode) || "url",
                video: ed.video || { url: "" },
              }));
            }
          }}
        >
          <option value="none">None</option>
          <option value="image">Image</option>
          <option value="carousel">Carousel (multiple images)</option>
          <option value="video">Video</option>
        </select>
      </Field>

      {/* ============ IMAGE (single) ============ */}
      {editing.videoMode === "none" && imageMode !== "none" && imageMode !== "multi" && (
        <>
          <div className="grid-2">
            <Field label="Image mode">
              <select
                className="select"
                value={imageMode}
                onChange={(e) => {
                  const m = e.target.value; // random | upload | url | none

                  // keep shape stable for url/upload so zoom/focal always exist
                  if (m === "none") {
                    setEditing({ ...editing, imageMode: "none", image: null });
                    return;
                  }

                  if (m === "random") {
                    setEditing({
                      ...editing,
                      imageMode: "random",
                      image: { ...randomSVG("Image"), focalX: 50, focalY: 50, zoom: 1 },
                    });
                    return;
                  }

                  // url/upload:
                  setEditing({
                    ...editing,
                    imageMode: m,
                    image: {
                      ...(editing.image || {}),
                      url: editing.image?.url || "",
                      alt: editing.image?.alt || "Image",
                      focalX: toNum(editing.image?.focalX, 50),
                      focalY: toNum(editing.image?.focalY, 50),
                      zoom: toNum(editing.image?.zoom, 1),
                    },
                  });
                }}
              >
                <option value="random">Random graphic</option>
                <option value="upload">Upload image</option>
                <option value="url">Direct URL</option>
                <option value="none">No image</option>
              </select>
            </Field>
          </div>

          {imageMode === "url" && (
            <Field label="Image URL">
              <input
                className="input"
                value={imgUrl}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    imageMode: "url",
                    image: {
                      ...(editing.image || {}),
                      url: e.target.value,
                      alt: editing.image?.alt || "Image",
                      focalX: toNum(editing.image?.focalX, 50),
                      focalY: toNum(editing.image?.focalY, 50),
                      zoom: toNum(editing.image?.zoom, 1),
                    },
                  })
                }
              />
            </Field>
          )}

          {imageMode === "upload" && (
            <Field label="Upload image">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;

                  try {
                    const setPct = (pct) => {
                      const el = document.querySelector(".modal h3, .section-title");
                      if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}%`;
                    };

                    const compressed = await compressImageFile(f, "feed");
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: compressed,
                      feedId,
                      onProgress: setPct,
                      prefix: "images",
                    });

                    const el = document.querySelector(".modal h3, .section-title");
                    if (el) el.textContent = isNew ? "Add Post" : "Edit Post";

                    // ✅ upload → switch to Direct URL mode (your intended behavior)
                    setEditing((ed) => ({
                      ...ed,
                      imageMode: "url",
                      image: { alt: "Image", url: cdnUrl, focalX: 50, focalY: 50, zoom: 1 },
                    }));

                    toast.success("Image uploaded");
                  } catch (err) {
                    console.error(err);
                    toast.error(String(err?.message || "Image upload failed."));
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          )}

          {/* ✅ Cropper + zoom bar (only when we have a URL) */}
          {imageMode !== "none" && imgUrl && (
            <ImageCropper
              src={imgUrl}
              alt={editing.image?.alt || ""}
              focalX={focalX}
              focalY={focalY}
              zoom={zoom}
              onChange={({ focalX: x, focalY: y, zoom: z }) =>
                setEditing((ed) => ({
                  ...ed,
                  image: {
                    ...(ed.image || {}),
                    url: imgUrl, // keep stable
                    alt: ed.image?.alt || "Image",
                    focalX: x,
                    focalY: y,
                    zoom: z,
                  },
                }))
              }
            />
          )}

          {imageMode === "random" && editing.image?.svg && (
            <div
              className="img-preview"
              style={{
                maxWidth: "100%",
                maxHeight: "min(40vh, 360px)",
                minHeight: 120,
                overflow: "hidden",
                borderRadius: 8,
                background: "var(--admin-surface-alt)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <div
                className="svg-wrap"
                dangerouslySetInnerHTML={{
                  __html: editing.image.svg.replace(
                    "<svg ",
                    "<svg preserveAspectRatio='xMidYMid meet' style='display:block;max-width:100%;height:auto;max-height:100%' "
                  ),
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ============ CAROUSEL (multi) ============ */}
      {editing.videoMode === "none" && imageMode === "multi" && (
        <CarouselEditor images={images} setImages={setImages} feedId={feedId} isNew={isNew} />
      )}

      {/* ============ VIDEO ============ */}
      {editing.videoMode !== "none" && (
        <>
          <div className="grid-2">
            <Field label="Video source">
              <select
                className="select"
                value={editing.videoMode}
                onChange={(e) => {
                  const m = e.target.value; // "url" | "upload"
                  setEditing((ed) => ({
                    ...ed,
                    videoMode: m,
                    video: m === "url" ? ed.video || { url: "" } : null,
                  }));
                }}
              >
                <option value="url">Direct URL</option>
                <option value="upload">Upload video</option>
              </select>
            </Field>
            <div />
          </div>

          {editing.videoMode === "url" && (
            <Field label="Video URL">
              <input
                className="input"
                placeholder="https://…/clip.mp4 (CloudFront URL)"
                value={editing.video?.url || ""}
                onChange={(e) =>
                  setEditing((ed) => ({ ...ed, video: { ...(ed.video || {}), url: e.target.value } }))
                }
              />
            </Field>
          )}

          {editing.videoMode === "upload" && (
            <Field label="Upload video">
              <input
                type="file"
                accept="video/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;

                  try {
                    setUploadingVideo?.(true);

                    const setPct = (pct) => {
                      const el = document.querySelector(".modal h3, .section-title");
                      if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}%`;
                    };

                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: f,
                      feedId,
                      onProgress: setPct,
                      prefix: "videos",
                    });

                    const el = document.querySelector(".modal h3, .section-title");
                    if (el) el.textContent = isNew ? "Add Post" : "Edit Post";

                    setEditing((ed) => ({ ...ed, videoMode: "url", video: { url: cdnUrl } }));
                    toast.success("Video uploaded");
                  } catch (err) {
                    console.error(err);
                    toast.error(String(err?.message || "Video upload failed."));
                  } finally {
                    setUploadingVideo?.(false);
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          )}

          <div className="grid-2">
            <Field label="Poster image URL (optional)">
              <input
                className="input"
                placeholder="https://…/poster.jpg"
                value={editing.videoPosterUrl || ""}
                onChange={(e) => setEditing((ed) => ({ ...ed, videoPosterUrl: e.target.value }))}
              />
            </Field>

            <Field label="Upload poster (optional)">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;

                  try {
                    setUploadingPoster?.(true);
                    const compressed = await compressImageFile(f, "feed");
                    const { cdnUrl } = await uploadFileToS3ViaSigner({ file: compressed, feedId, prefix: "posters" });
                    setEditing((ed) => ({ ...ed, videoPosterUrl: cdnUrl }));
                    toast.success("Poster uploaded");
                  } catch (err) {
                    console.error(err);
                    toast.error(String(err?.message || "Poster upload failed."));
                  } finally {
                    setUploadingPoster?.(false);
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          </div>

          <div className="grid-3">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!editing.videoAutoplayMuted}
                onChange={(e) => setEditing((ed) => ({ ...ed, videoAutoplayMuted: !!e.target.checked }))}
              />{" "}
              Autoplay muted
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!editing.videoShowControls}
                onChange={(e) => setEditing((ed) => ({ ...ed, videoShowControls: !!e.target.checked }))}
              />{" "}
              Show controls
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!editing.videoLoop}
                onChange={(e) => setEditing((ed) => ({ ...ed, videoLoop: !!e.target.checked }))}
              />{" "}
              Loop
            </label>
          </div>
        </>
      )}
    </EditorSection>
  );
}
