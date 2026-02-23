// components-admin-media.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomSVG, uploadFileToS3ViaSigner } from "../utils";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ImageCropper({
  src,
  alt = "",
  focalX = 50,
  focalY = 50,
  zoom = 1,
  onChange,
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const x = clamp(toNum(focalX, 50), 0, 100);
  const y = clamp(toNum(focalY, 50), 0, 100);
  const z = clamp(toNum(zoom, 1), 0.5, 3); // ✅ allow zoom out

  const emit = useCallback(
    (next) => {
      onChange?.({
        focalX: clamp(Math.round(toNum(next.focalX, x)), 0, 100),
        focalY: clamp(Math.round(toNum(next.focalY, y)), 0, 100),
        zoom: clamp(toNum(next.zoom, z), 0.5, 3),
      });
    },
    [onChange, x, y, z]
  );

  const updateFromXY = useCallback(
    (clientX, clientY) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const xPct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      emit({ focalX: xPct, focalY: yPct, zoom: z });
    },
    [emit, z]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled || !src) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      setDragging(true);
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
      updateFromXY(e.clientX, e.clientY);
      e.preventDefault();
    },
    [disabled, src, updateFromXY]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (disabled || !dragging) return;
      updateFromXY(e.clientX, e.clientY);
      e.preventDefault();
    },
    [disabled, dragging, updateFromXY]
  );

  const endDrag = useCallback(
    (e) => {
      if (!dragging) return;
      setDragging(false);
      try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    },
    [dragging]
  );

  const objectPosition = `${x}% ${y}%`;
  const bgSize = `${z * 100}%`;

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          width: "100%",
          maxWidth: 560,
          margin: "8px 0",
          aspectRatio: "1 / 1",
          position: "relative",
          borderRadius: 8,
          overflow: "hidden",
          background: "#f3f4f6",
          userSelect: "none",
          cursor: disabled ? "default" : (dragging ? "grabbing" : "grab"),
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {src ? (
          <div
            aria-label={alt || ""}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${src})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: objectPosition,
              backgroundSize: bgSize, // ✅ zoom in + zoom out
            }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#9ca3af" }}>
            No image
          </div>
        )}

        {src && (
          <div
            style={{
              position: "absolute",
              left: `calc(${x}% - 8px)`,
              top: `calc(${y}% - 8px)`,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid white",
              background: "rgba(0,0,0,.35)",
              boxShadow: "0 0 0 2px rgba(0,0,0,.15)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <label>
          X position
          <input
            type="range"
            min={0}
            max={100}
            value={x}
            onChange={(e) => emit({ focalX: Number(e.target.value), focalY: y, zoom: z })}
            disabled={disabled}
          />
        </label>

        <label>
          Y position
          <input
            type="range"
            min={0}
            max={100}
            value={y}
            onChange={(e) => emit({ focalX: x, focalY: Number(e.target.value), zoom: z })}
            disabled={disabled}
          />
        </label>

        <label>
          Zoom
          <input
            type="range"
            min={0.5}     // ✅ zoom out
            max={3}
            step={0.01}
            value={z}
            onChange={(e) => emit({ focalX: x, focalY: y, zoom: Number(e.target.value) })}
            disabled={disabled}
          />
          <div className="subtle">{z.toFixed(2)}×</div>
        </label>
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
        onClick={onClick}
        style={{
          width: 72,
          height: 72,
          borderRadius: 8,
          overflow: "hidden",
          border: active ? "2px solid #2563eb" : "1px solid var(--line)",
          padding: 0,
          background: "#fff",
          cursor: "pointer",
        }}
        title={`Image ${idx + 1}`}
      >
        {src ? (
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#f3f4f6" }} />
        )}
      </button>

      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 22,
          height: 22,
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,.12)",
        }}
      >
        ×
      </button>
    </div>
  );
}

function CarouselEditor({ images, setImages, feedId, isNew }) {
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

        const { cdnUrl } = await uploadFileToS3ViaSigner({
          file: f,
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
      alert("Images uploaded ✔");
    } catch (e) {
      console.error(e);
      alert(String(e?.message || "Upload failed."));
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
            border: "1px dashed var(--line)",
            display: "grid",
            placeItems: "center",
            color: "#6b7280",
            cursor: "pointer",
            background: "#fff",
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
      <div className="grid-2">
        <label>
          Add image by URL
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
        </label>
        <div />
      </div>

      {/* cropper for selected */}
      {current?.url ? (
        <ImageCropper
          src={current.url}
          alt={current.alt || ""}
          focalX={toNum(current.focalX, 50)}
          focalY={toNum(current.focalY, 50)}
          zoom={toNum(current.zoom, 1)}
          onChange={({ focalX, focalY, zoom }) => replaceAt(safeSel, { ...current, focalX, focalY, zoom })}
        />
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

  return (
    <>
      <h4 className="section-title">Post Media</h4>
      <fieldset className="fieldset">
        <label>
          Media type
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
        </label>

        {/* ============ IMAGE (single) ============ */}
        {editing.videoMode === "none" && imageMode !== "none" && imageMode !== "multi" && (
          <>
            <div className="grid-2">
              <label>
                Image mode
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
              </label>
            </div>

            {imageMode === "url" && (
              <label>
                Image URL
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
              </label>
            )}

            {imageMode === "upload" && (
              <label>
                Upload image
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

                      const { cdnUrl } = await uploadFileToS3ViaSigner({
                        file: f,
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

                      alert("Image uploaded ✔");
                    } catch (err) {
                      console.error(err);
                      alert(String(err?.message || "Image upload failed."));
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
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
                  background: "#f9fafb",
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
              <label>
                Video source
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
              </label>
              <div />
            </div>

            {editing.videoMode === "url" && (
              <label>
                Video URL
                <input
                  className="input"
                  placeholder="https://…/clip.mp4 (CloudFront URL)"
                  value={editing.video?.url || ""}
                  onChange={(e) =>
                    setEditing((ed) => ({ ...ed, video: { ...(ed.video || {}), url: e.target.value } }))
                  }
                />
              </label>
            )}

            {editing.videoMode === "upload" && (
              <label>
                Upload video
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
                      alert("Video uploaded ✔");
                    } catch (err) {
                      console.error(err);
                      alert(String(err?.message || "Video upload failed."));
                    } finally {
                      setUploadingVideo?.(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            )}

            <div className="grid-2">
              <label>
                Poster image URL (optional)
                <input
                  className="input"
                  placeholder="https://…/poster.jpg"
                  value={editing.videoPosterUrl || ""}
                  onChange={(e) => setEditing((ed) => ({ ...ed, videoPosterUrl: e.target.value }))}
                />
              </label>

              <label>
                Upload poster (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;

                    try {
                      setUploadingPoster?.(true);
                      const { cdnUrl } = await uploadFileToS3ViaSigner({ file: f, feedId, prefix: "posters" });
                      setEditing((ed) => ({ ...ed, videoPosterUrl: cdnUrl }));
                      alert("Poster uploaded ✔");
                    } catch (err) {
                      console.error(err);
                      alert(String(err?.message || "Poster upload failed."));
                    } finally {
                      setUploadingPoster?.(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
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
      </fieldset>
    </>
  );
}