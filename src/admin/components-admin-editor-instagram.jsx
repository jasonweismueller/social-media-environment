// components-admin-editor-instagram.jsx
import React from "react";
import {
  uid,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  uploadFileToS3ViaSigner,
} from "../utils";
import { PostCard } from "../ui-posts";
import { MediaFieldset } from "./components-admin-media-facebook";
import { randomAvatarByKind } from "../avatar-utils";

/* ---------------- Avatar (neutral) ---------------- */
export function genNeutralAvatarDataUrl(size = 64) {
  const s = size;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
    <defs><clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath></defs>
    <g clip-path="url(#r)">
      <rect width="32" height="32" fill="#e5e7eb"/>
      <circle cx="16" cy="12.5" r="6" fill="#9ca3af"/>
      <rect x="5" y="20" width="22" height="10" rx="5" fill="#9ca3af"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---------------- Random Post Generator ---------------- */
const RAND_NAMES = [
  "Maya Patel","Jordan Li","Priya Nair","Alex Chen","Hana Suzuki","Luca Rossi",
  "Nora Williams","Diego Santos","Ava Johnson","Ethan Brown","Leo Muller","Zoe Martin"
];
const RAND_TIMES = ["Just now","2m","8m","23m","1h","3h","Yesterday","2d","3d"];
const LOREM_SNIPS = [
  "Loving this vibe today.", "Caught this light just right.", "What a view.",
  "So grateful for this moment.", "Weekend mood.", "Chasing sunsets again.",
  "Morning coffee hits different.", "Another day, another memory."
];
const NOTE_SNIPS = [
  "Fact-checkers say this post lacks context.",
  "Experts caution readers to verify before sharing.",
  "Independent sources note that the claim is unsubstantiated."
];
const randPick = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance = (p) => Math.random() < p;

export function makeRandomPost() {
  const author = randPick(RAND_NAMES);
  const avatarRandomKind = "any";
  const base = randInt(10, 300);
  return {
    id: uid(),
    author,
    time: randPick(RAND_TIMES),
    text: randPick(LOREM_SNIPS),
    avatarMode: "random",
    avatarRandomKind,
    avatarUrl: randomAvatarByKind(avatarRandomKind, author, author, randomAvatarUrl),
    badge: chance(0.2),
    imageMode: "random",
    image: randomSVG("Image"),
    videoMode: "none",
    video: null,
    interventionType: "none",
    noteText: "",
    showReactions: true,
    selectedReactions: ["like"],
    reactions: { like: randInt(0, base) },
    metrics: { comments: randInt(0, base / 2), saves: randInt(0, base / 3) },
    adType: "none",
  };
}

/* ---------------- Instagram Post Editor ---------------- */
export function AdminPostEditor({
  editing,
  setEditing,
  isNew,
  projectId,
  feedId,
  setUploadingVideo,
  setUploadingPoster,
}) {
  return (
    <div className="editor-grid">
      <div className="editor-form">
        <h4 className="section-title">Basics</h4>

        <label>Author
          <input
            className="input"
            value={editing.author}
            onChange={(e) => {
              const author = e.target.value;
              setEditing((ed) => ({
                ...ed,
                author,
                avatarUrl:
                  ed.avatarMode === "neutral"
                    ? genNeutralAvatarDataUrl(64)
                    : ed.avatarUrl,
              }));
            }}
          />
        </label>

        <div className="grid-2">
          <label>Verification badge
            <select
              className="select"
              value={String(!!editing.badge)}
              onChange={(e) =>
                setEditing({ ...editing, badge: e.target.value === "true" })
              }
            >
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </label>
          <label>Time
            <input
              className="input"
              value={editing.time}
              onChange={(e) =>
                setEditing({ ...editing, time: e.target.value })
              }
            />
          </label>
        </div>

        <label>Post text
          <textarea
            className="textarea"
            rows={4}
            value={editing.text}
            onChange={(e) =>
              setEditing({ ...editing, text: e.target.value })
            }
          />
        </label>

        <h4 className="section-title">Profile Photo</h4>
        <fieldset className="fieldset">
          <div className="grid-2">
            <label>Mode
              <select
                className="select"
                value={editing.avatarMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  let url = editing.avatarUrl;
                  if (mode === "random") {
                    const kind = editing.avatarRandomKind || "any";
                    url = randomAvatarByKind(
                      kind,
                      editing.id || editing.author || "seed",
                      editing.author || "",
                      randomAvatarUrl
                    );
                  } else if (mode === "neutral") {
                    url = genNeutralAvatarDataUrl(64);
                  } else if (mode === "upload") {
                    url = "";
                  }
                  setEditing({ ...editing, avatarMode: mode, avatarUrl: url });
                }}
              >
                <option value="random">Random avatar</option>
                <option value="neutral">Neutral avatar</option>
                <option value="upload">Upload</option>
                <option value="url">Direct URL</option>
              </select>
            </label>
            <div className="avatar-preview">
              <div className="avatar">
                <img
                  className="avatar-img"
                  alt=""
                  src={editing.avatarUrl || pravatar(6)}
                />
              </div>
            </div>
          </div>

          {editing.avatarMode === "url" && (
            <label>Avatar URL
              <input
                className="input"
                value={editing.avatarUrl || ""}
                onChange={(e) =>
                  setEditing({ ...editing, avatarUrl: e.target.value })
                }
              />
            </label>
          )}

          {editing.avatarMode === "upload" && (
            <label>Upload avatar
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file,
                      projectId: projectId || "global",
                      feedId: feedId || "default",
                      prefix: "avatars",
                    });
                    setEditing((ed) => ({
                      ...ed,
                      avatarMode: "url",
                      avatarUrl: cdnUrl,
                    }));
                    alert("Avatar uploaded ✔");
                  } catch (err) {
                    console.error("Upload failed", err);
                    alert("Avatar upload failed");
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
          )}
        </fieldset>

        <MediaFieldset
          editing={editing}
          setEditing={setEditing}
          projectId={projectId}
          feedId={feedId}
          isNew={isNew}
          setUploadingVideo={setUploadingVideo}
          setUploadingPoster={setUploadingPoster}
        />

        <h4 className="section-title">Reactions & Metrics</h4>
        <fieldset className="fieldset">
          <label>Show like count
            <select
              className="select"
              value={String(!!editing.showReactions)}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  showReactions: e.target.value === "true",
                })
              }
            >
              <option value="false">Hide</option>
              <option value="true">Show</option>
            </select>
          </label>

          <div className="grid-3">
            <label>Likes
              <input
                className="input"
                type="number"
                min="0"
                value={editing.reactions?.like || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    reactions: { like: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
            <label>Comments
              <input
                className="input"
                type="number"
                min="0"
                value={editing.metrics?.comments || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    metrics: {
                      ...(editing.metrics || {}),
                      comments: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
            <label>Saves
              <input
                className="input"
                type="number"
                min="0"
                value={editing.metrics?.saves || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    metrics: {
                      ...(editing.metrics || {}),
                      saves: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          </div>
        </fieldset>
      </div>

      <aside className="editor-preview">
        <div className="preview-head">Live preview</div>
        <div className="preview-zoom admin-preview-sandbox" style={{ pointerEvents: "auto" }}>
          <PostCard
            key={editing.id || "preview"}
            post={{
              ...editing,
              avatarUrl:
                editing.avatarMode === "neutral"
                  ? genNeutralAvatarDataUrl(64)
                  : editing.avatarUrl,
              image:
                editing.imageMode === "random"
                  ? editing.image || randomSVG("Image")
                  : editing.imageMode === "none"
                  ? null
                  : editing.image,
            }}
            registerViewRef={() => () => {}}
            onAction={(a, m) => console.debug("preview action:", a, m)}
            respectShowReactions={true}
          />
        </div>
      </aside>
    </div>
  );
}