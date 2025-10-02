// components-admin-media.jsx
import React from "react";
import { randomSVG, uploadFileToS3ViaSigner } from "./utils";

export function MediaFieldset({
  editing,
  setEditing,
  feedId,
  isNew,
  setUploadingVideo,
  setUploadingPoster,
}) {
  return (
    <>
      <h4 className="section-title">Post Media</h4>
      <fieldset className="fieldset">
        <label>Media type
          <select
            className="select"
            value={
              editing.videoMode !== "none" ? "video"
              : (editing.imageMode !== "none" ? "image" : "none")
            }
            onChange={(e) => {
              const type = e.target.value;
              if (type === "none") {
                setEditing(ed => ({ ...ed, imageMode: "none", image: null, videoMode: "none", video: null, videoPosterUrl: "" }));
              } else if (type === "image") {
                setEditing(ed => ({
                  ...ed,
                  videoMode: "none",
                  video: null,
                  videoPosterUrl: "",
                  imageMode: (ed.imageMode === "none" ? "random" : ed.imageMode) || "random",
                  image: ed.image || randomSVG("Image")
                }));
              } else if (type === "video") {
                setEditing(ed => ({
                  ...ed,
                  imageMode: "none",
                  image: null,
                  videoMode: (ed.videoMode === "none" ? "url" : ed.videoMode) || "url",
                  video: ed.video || { url: "" }
                }));
              }
            }}
          >
            <option value="none">None</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>

        {/* Image controls */}
        {editing.videoMode === "none" && editing.imageMode !== "none" && (
          <>
            <div className="grid-2">
              <label>Image mode
                <select
                  className="select"
                  value={editing.imageMode}
                  onChange={(e) => {
                    const m = e.target.value;
                    let image = editing.image;
                    if (m === "none") image = null;
                    if (m === "random") image = randomSVG("Image");
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

            {editing.imageMode === "url" && (
              <label>Image URL
                <input
                  className="input"
                  value={(editing.image && editing.image.url) || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      image: { ...(editing.image||{}), url: e.target.value, alt: (editing.image && editing.image.alt) || "Image" }
                    })
                  }
                />
              </label>
            )}
            {editing.imageMode === "upload" && (
   <label>Upload image
     <input
       type="file"
       accept="image/*"
       onChange={async (e) => {
         const f = e.target.files?.[0]; if (!f) return;
         try {
           // optional inline progress UI (safe if selector not found)
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
           setEditing((ed) => ({
             ...ed,
             imageMode: "url",
             image: { alt: f.name || "Image", url: cdnUrl },
           }));
           alert("Image uploaded ✔");
         } catch (err) {
           console.error(err);
           alert(String(err?.message || "Image upload failed."));
         } finally {
           e.target.value = ""; // allow re-pick
         }
       }}
     />
   </label>
 )}

            {(editing.imageMode === "upload" || editing.imageMode === "url") && editing.image?.url && (
              <div className="img-preview" style={{ maxWidth:"100%", maxHeight:"min(40vh, 360px)", minHeight:120, overflow:"hidden", borderRadius:8, background:"#f9fafb", display:"flex", alignItems:"center", justifyContent:"center", padding:8 }}>
                <img src={editing.image.url} alt={editing.image.alt || ""} style={{ maxWidth:"100%", maxHeight:"100%", width:"auto", height:"auto", display:"block" }} />
              </div>
            )}
            {editing.imageMode === "random" && editing.image?.svg && (
              <div className="img-preview" style={{ maxWidth:"100%", maxHeight:"min(40vh, 360px)", minHeight:120, overflow:"hidden", borderRadius:8, background:"#f9fafb", display:"flex", alignItems:"center", justifyContent:"center", padding:8 }}>
                <div className="svg-wrap" dangerouslySetInnerHTML={{ __html: editing.image.svg.replace("<svg ", "<svg preserveAspectRatio='xMidYMid meet' style='display:block;max-width:100%;height:auto;max-height:100%' ") }} />
              </div>
            )}
          </>
        )}

        {/* VIDEO controls */}
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
                    setEditing(ed => ({
                      ...ed,
                      video: { ...(ed.video || {}), url: e.target.value }
                    }))
                  }
                />
              </label>
            )}

            {editing.videoMode === "upload" && (
              <label>Upload video
                <input
                  type="file"
                  accept="video/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try {
                      setUploadingVideo?.(true);

                      // UI progress hook that won't throw if header not present
                      const setPct = (pct) => {
                        const el = document.querySelector(".modal h3, .section-title");
                        if (el && typeof pct === "number") el.textContent = `Uploading… ${pct}%`;
                      };

                      // FIX for “Failed to fetch”: rely on utils’ robust helper
                      // (ensures correct presign URL, CORS mode, timeout, and better error surfacing)
                      const { cdnUrl } = await uploadFileToS3ViaSigner({
                        file: f,
                        feedId,
                        onProgress: setPct,
                        prefix: "videos",
                      });

                      const el = document.querySelector(".modal h3, .section-title");
                      if (el) el.textContent = isNew ? "Add Post" : "Edit Post";

                      setEditing(ed => ({
                        ...ed,
                        videoMode: "url",
                        video: { url: cdnUrl },
                      }));
                      alert("Video uploaded ✔");
                    } catch (err) {
                      console.error(err);
                      alert(String(err?.message || "Video upload failed."));
                    } finally {
                      setUploadingVideo?.(false);
                      e.target.value = ""; // allow re-pick
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
                  type="file"
                  accept="image/*"
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