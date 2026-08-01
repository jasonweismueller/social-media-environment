// components-admin-media.jsx
import React from "react";
import {
  randomSVG,
  uploadFileToS3ViaSigner,
  getProjectId as getProjectIdUtil, // fallback if prop not provided
  // ⬇️ post name helpers (see utils.js additions)
  readPostNames,
  writePostNames,
} from "../utils";
import { EditorSection, Field, CheckRow } from "./components-admin-editor-ui";

export function MediaFieldset({
  editing,
  setEditing,
  feedId,
  projectId,        // optional
  isNew,
  setUploadingVideo,
  setUploadingPoster,
}) {
  const resolvedProjectId = projectId ?? getProjectIdUtil?.();
  const uploadsDisabled = !feedId; // uploader requires a feedId
  const postId = editing?.id || null;

  // ---- Post name (friendly label used in UI/CSV) ----------------------------
  const [postName, setPostName] = React.useState(() => {
    if (!postId) return editing?.name || "";
    const saved = readPostNames(resolvedProjectId, feedId)[postId] || "";
    return editing?.name || saved || "";
  });

  // When switching which post is being edited, seed from editing/name or storage
  React.useEffect(() => {
    if (!postId) { setPostName(editing?.name || ""); return; }
    const saved = readPostNames(resolvedProjectId, feedId)[postId] || "";
    setPostName(editing?.name || saved || "");
  }, [postId, resolvedProjectId, feedId, editing?.name]);

  // Persist to storage on blur; also mirror into editing.name
  const persistPostName = React.useCallback((name) => {
    const trimmed = (name || "").trim();
    setEditing(ed => ({ ...ed, name: trimmed || undefined }));
    if (!postId) return;
    const map = readPostNames(resolvedProjectId, feedId);
    if (trimmed) {
      map[postId] = trimmed;
    } else {
      // empty name → remove mapping so we fall back to ID
      if (postId in map) delete map[postId];
    }
    writePostNames(resolvedProjectId, feedId, map);
  }, [postId, resolvedProjectId, feedId, setEditing]);

  const headerEl = () => document.querySelector(".modal h3, .section-title");
  const setHeaderText = (txt) => { const el = headerEl(); if (el) el.textContent = txt; };
  const resetHeaderText = () => setHeaderText(isNew ? "Add Post" : "Edit Post");

  const hasMedia = editing.videoMode !== "none" || editing.imageMode !== "none";

  return (
    <EditorSection
      title="Post Media"
      subtitle="Image, video, and a local label for this post"
      defaultOpen
      badge={hasMedia ? (editing.videoMode !== "none" ? "Video" : "Image") : null}
    >
      <Field label="Post name (for CSV/UI)" hint={postId ? <>ID: <span style={{ fontFamily: "monospace" }}>{postId}</span></> : null}>
        <input
          className="input"
          placeholder="e.g., 'Nurse strikes article'"
          value={postName}
          onChange={(e) => setPostName(e.target.value)}
          onBlur={(e) => persistPostName(e.target.value)}
        />
      </Field>

      <Field label="Media type">
        <select
          className="select"
          value={editing.videoMode !== "none" ? "video" : (editing.imageMode !== "none" ? "image" : "none")}
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
                image: ed.image || randomSVG("Image"),
              }));
            } else {
              setEditing(ed => ({
                ...ed,
                imageMode: "none",
                image: null,
                videoMode: (ed.videoMode === "none" ? "url" : ed.videoMode) || "url",
                video: ed.video || { url: "" },
              }));
            }
          }}
        >
          <option value="none">None</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </Field>

      {/* IMAGE controls */}
      {editing.videoMode === "none" && editing.imageMode !== "none" && (
        <>
          <div className="grid-2">
            <Field label="Image mode">
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
            </Field>
          </div>

          {editing.imageMode === "url" && (
            <Field label="Image URL">
              <input
                className="input"
                value={(editing.image && editing.image.url) || ""}
                onChange={(e) => setEditing({
                  ...editing,
                  image: { ...(editing.image || {}), url: e.target.value, alt: (editing.image && editing.image.alt) || "Image" },
                })}
              />
            </Field>
          )}

          {editing.imageMode === "upload" && (
            <Field label="Upload image">
              <input
                type="file"
                accept="image/*"
                disabled={uploadsDisabled}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!feedId) { alert("Select or create a feed before uploading."); e.target.value = ""; return; }
                  try {
                    setHeaderText("Uploading… 0%");
                    const setPct = (pct) => { if (typeof pct === "number") setHeaderText(`Uploading… ${pct}%`); };
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: f,
                      feedId,
                      projectId: resolvedProjectId,
                      prefix: "images",
                      onProgress: setPct,
                    });
                    setEditing((ed) => ({
                      ...ed,
                      imageMode: "url",
                      image: { alt: f.name || "Image", url: cdnUrl },
                    }));
                    alert("Image uploaded ✔");
                  } catch (err) {
                    console.error("Image upload failed", err);
                    alert(String(err?.message || "Image upload failed."));
                  } finally {
                    resetHeaderText();
                    e.target.value = ""; // allow re-pick
                  }
                }}
              />
            </Field>
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
            <Field label="Video source">
              <select
                className="select"
                value={editing.videoMode}
                onChange={(e) => {
                  const m = e.target.value; // "url" | "upload"
                  setEditing(ed => ({
                    ...ed,
                    videoMode: m,
                    video: m === "url" ? (ed.video || { url: "" }) : null,
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
                onChange={(e) => setEditing(ed => ({
                  ...ed,
                  video: { ...(ed.video || {}), url: e.target.value },
                }))}
              />
            </Field>
          )}

          {editing.videoMode === "upload" && (
            <Field label="Upload video">
              <input
                type="file"
                accept="video/*"
                disabled={uploadsDisabled}
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  if (!feedId) { alert("Select or create a feed before uploading."); e.target.value = ""; return; }
                  try {
                    setUploadingVideo?.(true);
                    setHeaderText("Uploading… 0%");
                    const setPct = (pct) => { if (typeof pct === "number") setHeaderText(`Uploading… ${pct}%`); };
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: f,
                      feedId,
                      projectId: resolvedProjectId,
                      onProgress: setPct,
                      prefix: "videos",
                    });
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
                    resetHeaderText();
                    e.target.value = ""; // allow re-pick
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
                onChange={(e) => setEditing(ed => ({ ...ed, videoPosterUrl: e.target.value }))}
              />
            </Field>
            <Field label="Upload poster (optional)">
              <input
                type="file"
                accept="image/*"
                disabled={uploadsDisabled}
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  if (!feedId) { alert("Select or create a feed before uploading."); e.target.value = ""; return; }
                  try {
                    setUploadingPoster?.(true);
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: f,
                      feedId,
                      projectId: resolvedProjectId,
                      prefix: "posters",
                    });
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
            </Field>
          </div>

          <div className="grid-3">
            <CheckRow
              checked={!!editing.videoAutoplayMuted}
              onChange={(e) => setEditing(ed => ({ ...ed, videoAutoplayMuted: !!e.target.checked }))}
            >
              Autoplay muted
            </CheckRow>
            <CheckRow
              checked={!!editing.videoShowControls}
              onChange={(e) => setEditing(ed => ({ ...ed, videoShowControls: !!e.target.checked }))}
            >
              Show controls
            </CheckRow>
            <CheckRow
              checked={!!editing.videoLoop}
              onChange={(e) => setEditing(ed => ({ ...ed, videoLoop: !!e.target.checked }))}
            >
              Loop
            </CheckRow>
          </div>
        </>
      )}
    </EditorSection>
  );
}
