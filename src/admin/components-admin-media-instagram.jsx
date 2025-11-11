// components-admin-media.jsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { randomSVG, uploadFileToS3ViaSigner } from "../utils";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/* ================== Square focal-point cropper (shared) ================== */
function ImageCropper({ src, alt = "", focalX = 50, focalY = 50, onChange, disabled = false }) {
  const wrapRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    const xPct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPct = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
    onChange?.({ focalX: Math.round(xPct), focalY: Math.round(yPct) });
  }, [dragging, onChange]);

  const startDrag = useCallback((e) => {
    if (disabled) return;
    setDragging(true);
    onPointerMove(e);
    e.preventDefault();
  }, [disabled, onPointerMove]);

  const stopDrag = useCallback(() => setDragging(false), []);

  React.useEffect(() => {
    if (!dragging) return;
    const move = (ev) => onPointerMove(ev);
    const up = () => stopDrag();
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up);
    document.addEventListener("touchcancel", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
    };
  }, [dragging, onPointerMove, stopDrag]);

  const objectPosition = useMemo(() => `${focalX}% ${focalY}%`, [focalX, focalY]);

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          width: "100%", maxWidth: 560, margin: "8px 0",
          aspectRatio: "1 / 1", position: "relative", borderRadius: 8, overflow: "hidden",
          background: "#f3f4f6", userSelect: "none",
          cursor: disabled ? "default" : (dragging ? "grabbing" : "grab"),
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
        }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition, display:"block" }}
            draggable={false}
          />
        ) : (
          <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", color:"#9ca3af" }}>No image</div>
        )}
        {src && (
          <div
            style={{
              position: "absolute",
              left: `calc(${focalX}% - 8px)`,
              top: `calc(${focalY}% - 8px)`,
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid white", background: "rgba(0,0,0,.35)",
              boxShadow: "0 0 0 2px rgba(0,0,0,.15)", pointerEvents: "none",
            }}
          />
        )}
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <label> X position
          <input type="range" min={0} max={100} value={focalX}
                 onChange={(e) => onChange?.({ focalX: Number(e.target.value), focalY })} disabled={disabled}/>
        </label>
        <label> Y position
          <input type="range" min={0} max={100} value={focalY}
                 onChange={(e) => onChange?.({ focalX, focalY: Number(e.target.value) })} disabled={disabled}/>
        </label>
      </div>
      <div className="subtle" style={{ marginTop: 4 }}>Tip: drag inside the square to reposition; sliders fine-tune.</div>
    </div>
  );
}

/* ================== Tiny thumbnail strip (carousel editor) ================== */
function Thumb({ src, active, onClick, onRemove, idx }) {
  return (
    <div style={{ position:"relative" }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width:72, height:72, borderRadius:8, overflow:"hidden", border: active ? "2px solid #2563eb" : "1px solid var(--line)",
          padding:0, background:"#fff", cursor:"pointer"
        }}
        title={`Image ${idx+1}`}
      >
        {src ? (
          <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
        ) : <div style={{ width:"100%", height:"100%", background:"#f3f4f6" }}/>}
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        style={{
          position:"absolute", top:-6, right:-6, width:22, height:22, borderRadius:999,
          border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.12)"
        }}
      >×</button>
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
          if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}% (${count+1}/${picked.length})`;
        };
        const { cdnUrl } = await uploadFileToS3ViaSigner({ file: f, feedId, prefix: "images", onProgress: setPct });
        setImages((arr) => [...arr, { url: cdnUrl, alt: f.name || "Image", focalX: 50, focalY: 50 }]);
        count++;
      }
      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";
      alert("Images uploaded ✔");
    } catch (e) {
      console.error(e);
      alert(String(e?.message || "Upload failed."));
    }
  };

  return (
    <div style={{ display:"grid", gap:12 }}>
      {/* thumbs */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
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
            width:72, height:72, borderRadius:8, border:"1px dashed var(--line)",
            display:"grid", placeItems:"center", color:"#6b7280", cursor:"pointer", background:"#fff"
          }}
          title="Add images"
        >
          + Add
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { uploadMany(e.target.files); e.target.value = ""; }}
            style={{ display:"none" }}
          />
        </label>
      </div>

      {/* add via URL */}
      <div className="grid-2">
        <label> Add image by URL
          <input
            className="input"
            placeholder="https://…/image.jpg"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = e.currentTarget.value.trim();
                if (!v) return;
                setImages((arr) => [...arr, { url: v, alt: "Image", focalX: 50, focalY: 50 }]);
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
          focalX={Number(current.focalX ?? 50)}
          focalY={Number(current.focalY ?? 50)}
          onChange={({ focalX, focalY }) => replaceAt(safeSel, { ...current, focalX, focalY })}
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
  // Single-image helpers
  const imgUrl = editing.image?.url || "";
  const focalX = Number(editing.image?.focalX ?? 50);
  const focalY = Number(editing.image?.focalY ?? 50);

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
        <label>Media type
          <select
            className="select"
            value={
              editing.videoMode !== "none"
                ? "video"
                : imageMode === "multi"
                ? "carousel"
                : (imageMode !== "none" ? "image" : "none")
            }
            onChange={(e) => {
              const type = e.target.value;
              if (type === "none") {
                setEditing(ed => ({ ...ed,
                  imageMode: "none", image: null, images: [],
                  videoMode: "none", video: null, videoPosterUrl: "" }));
              } else if (type === "image") {
                setEditing(ed => ({
                  ...ed,
                  videoMode: "none", video: null, videoPosterUrl: "",
                  imageMode: (ed.imageMode === "none" || ed.imageMode === "multi" ? "random" : ed.imageMode) || "random",
                  images: [], // ensure not in multi mode
                  image: ed.image || { ...randomSVG("Image"), focalX: 50, focalY: 50 },
                }));
              } else if (type === "carousel") {
                setEditing(ed => ({
                  ...ed,
                  videoMode: "none", video: null, videoPosterUrl: "",
                  imageMode: "multi",
                  // seed images from single image if present, else empty
                  images: (ed.images && ed.images.length)
                    ? ed.images
                    : (ed.image?.url ? [{ ...ed.image }] : []),
                }));
              } else if (type === "video") {
                setEditing(ed => ({
                  ...ed,
                  imageMode: "none", image: null, images: [],
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
              <label>Image mode
                <select
                  className="select"
                  value={imageMode}
                  onChange={(e) => {
                    const m = e.target.value; // random | upload | url | none
                    let image = editing.image;
                    if (m === "none") image = null;
                    if (m === "random") image = { ...randomSVG("Image"), focalX: 50, focalY: 50 };
                    setEditing({ ...editing, imageMode: m, image });
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
              <label>Image URL
                <input
                  className="input"
                  value={(editing.image && editing.image.url) || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      image: {
                        ...(editing.image||{}),
                        url: e.target.value,
                        alt: (editing.image && editing.image.alt) || "Image",
                        focalX: editing.image?.focalX ?? 50,
                        focalY: editing.image?.focalY ?? 50,
                      }
                    })
                  }
                />
              </label>
            )}

            {imageMode === "upload" && (
              <label>Upload image
                <input
                  type="file" accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const setPct = (pct) => {
                        const el = document.querySelector(".modal h3, .section-title");
                        if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}%`;
                      };
                      const { cdnUrl } = await uploadFileToS3ViaSigner({
                        file: f, feedId, onProgress: setPct, prefix: "images",
                      });
                      const el = document.querySelector(".modal h3, .section-title");
                      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";
                      setEditing((ed) => ({
                        ...ed,
                        imageMode: "url",
                        image: { alt: "Image", url: cdnUrl, focalX: 50, focalY: 50 },
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

            {imageMode !== "none" && imgUrl && (
              <ImageCropper
                src={imgUrl}
                alt={editing.image?.alt || ""}
                focalX={focalX}
                focalY={focalY}
                onChange={({ focalX: x, focalY: y }) =>
                  setEditing((ed) => ({ ...ed, image: { ...(ed.image || {}), focalX: x, focalY: y } }))
                }
              />
            )}

            {imageMode === "random" && editing.image?.svg && (
              <div className="img-preview" style={{
                maxWidth:"100%", maxHeight:"min(40vh, 360px)", minHeight:120, overflow:"hidden",
                borderRadius:8, background:"#f9fafb", display:"flex", alignItems:"center", justifyContent:"center", padding:8
              }}>
                <div
                  className="svg-wrap"
                  dangerouslySetInnerHTML={{
                    __html: editing.image.svg.replace(
                      "<svg ",
                      "<svg preserveAspectRatio='xMidYMid meet' style='display:block;max-width:100%;height:auto;max-height:100%' "
                    )
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
              <label>Video source
                <select
                  className="select"
                  value={editing.videoMode}
                  onChange={(e) => {
                    const m = e.target.value; // "url" | "upload"
                    setEditing(ed => ({
                      ...ed,
                      videoMode: m,
                      video: m === "url" ? (ed.video || { url: "" }) : null
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
              <label>Video URL
                <input
                  className="input"
                  placeholder="https://…/clip.mp4 (CloudFront URL)"
                  value={editing.video?.url || ""}
                  onChange={(e) =>
                    setEditing(ed => ({ ...ed, video: { ...(ed.video || {}), url: e.target.value } }))
                  }
                />
              </label>
            )}

            {editing.videoMode === "upload" && (
              <label>Upload video
                <input
                  type="file" accept="video/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      setUploadingVideo?.(true);
                      const setPct = (pct) => {
                        const el = document.querySelector(".modal h3, .section-title");
                        if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}%`;
                      };
                      const { cdnUrl } = await uploadFileToS3ViaSigner({ file: f, feedId, onProgress: setPct, prefix: "videos" });
                      const el = document.querySelector(".modal h3, .section-title");
                      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";
                      setEditing(ed => ({ ...ed, videoMode: "url", video: { url: cdnUrl } }));
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
              <label>Poster image URL (optional)
                <input
                  className="input"
                  placeholder="https://…/poster.jpg"
                  value={editing.videoPosterUrl || ""}
                  onChange={(e) => setEditing(ed => ({ ...ed, videoPosterUrl: e.target.value }))}
                />
              </label>
              <label>Upload poster (optional)
                <input
                  type="file" accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      setUploadingPoster?.(true);
                      const { cdnUrl } = await uploadFileToS3ViaSigner({ file: f, feedId, prefix: "posters" });
                      setEditing(ed => ({ ...ed, videoPosterUrl: cdnUrl }));
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
                  onChange={(e) => setEditing(ed => ({ ...ed, videoAutoplayMuted: !!e.target.checked }))}
                /> Autoplay muted
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!editing.videoShowControls}
                  onChange={(e) => setEditing(ed => ({ ...ed, videoShowControls: !!e.target.checked }))}
                /> Show controls
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!editing.videoLoop}
                  onChange={(e) => setEditing(ed => ({ ...ed, videoLoop: !!e.target.checked }))}
                /> Loop
              </label>
            </div>
          </>
        )}
      </fieldset>
    </>
  );
}