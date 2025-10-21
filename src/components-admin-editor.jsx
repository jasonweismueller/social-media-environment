// components-admin-editor.jsx
import React from "react";
import {
  uid,
  REACTION_META,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  uploadFileToS3ViaSigner,
} from "./utils";

import { PostCard } from "./components-ui-posts";
import { MediaFieldset } from "./components-admin-media";
import { randomAvatarByKind } from "./avatar-utils";

/* ---------- gender-neutral comic avatar (64px) ---------------- */
export function genNeutralAvatarDataUrl(size = 64) {
  const s = size;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <defs>
    <clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="#e5e7eb"/>
    <circle cx="16" cy="12.5" r="6" fill="#9ca3af"/>
    <rect x="5" y="20" width="22" height="10" rx="5" fill="#9ca3af"/>
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* -------------------- Random Post Generator helpers -------------------- */
const RAND_NAMES = [
  "Jordan Li","Maya Patel","Samir Khan","Alex Chen","Luca Rossi",
  "Nora Williams","Priya Nair","Diego Santos","Hana Suzuki","Ava Johnson",
  "Ethan Brown","Isabella Garcia","Leo Muller","Zoe Martin","Ibrahim Ali"
];
const RAND_TIMES = ["Just now","2m","8m","23m","1h","2h","3h","Yesterday","2d","3d"];
const LOREM_SNIPPETS = [
  "This is wild—can't believe it happened.","Anyone else following this?",
  "New details emerging as we speak.","Here is what I've learned so far.",
  "Not saying it is true, but interesting.","Quick thread on what matters here.",
  "Posting this for discussion.","Context below—make up your own mind.",
  "Sharing for visibility.","Thoughts?","Sources seem mixed on this.",
  "Bookmarking this for later.","Some folks say this is misleading.",
  "If accurate, this is big.","Adding a couple links in the comments."
];
const NOTE_SNIPPETS = [
  "Independent fact-checkers say the claim lacks supporting evidence.",
  "Multiple sources indicate the post omits key context.",
  "Experts disagree and advise caution when sharing.",
  "Additional reporting contradicts the central claim."
];
const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt  = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance   = (p) => Math.random() < p;

export function makeRandomPost() {
  const author = randPick(RAND_NAMES);
  const time = randPick(RAND_TIMES);
  const text = Array.from({ length: randInt(1, 3) }, () => randPick(LOREM_SNIPPETS)).join(" ");
  const willHaveImage = chance(0.55);
  const interventionType = chance(0.20) ? randPick(["label", "note"]) : "none";
  const noteText = interventionType === "note" ? randPick(NOTE_SNIPPETS) : "";
  const showReactions = chance(0.85);
  const rxKeys = Object.keys(REACTION_META);
  const selectedReactions = showReactions
    ? rxKeys.sort(() => 0.5 - Math.random()).slice(0, randInt(1, 3))
    : ["like"];

  const baseCount = randInt(5, 120);
  const rx = (p) => randInt(0, Math.floor(baseCount*p));
  const reactions = {
    like:  chance(0.9) ? rx(0.6) : 0,
    love:  chance(0.5) ? rx(0.5) : 0,
    care:  chance(0.25)? rx(0.3) : 0,
    haha:  chance(0.35)? rx(0.4) : 0,
    wow:   chance(0.3) ? rx(0.35): 0,
    sad:   chance(0.2) ? rx(0.25): 0,
    angry: chance(0.2) ? rx(0.25): 0,
  };
  const metrics = {
    comments: chance(0.6) ? rx(0.5) : 0,
    shares:   chance(0.4) ? rx(0.35): 0,
  };

  const avatarRandomKind = "any";

  return {
    id: uid(),
    postName: "",
    author, time, text, links: [],
    badge: chance(0.15),
    authorType: "female",
    avatarMode: "random",
    avatarRandomKind,
    avatarUrl: randomAvatarByKind(avatarRandomKind, author, author, randomAvatarUrl),
    imageMode: willHaveImage ? "random" : "none",
    image: willHaveImage ? randomSVG(randPick(["Image", "Update", "Breaking"])) : null,
    videoMode: "none",
    video: null,
    videoPosterUrl: "",
    videoAutoplayMuted: true,
    videoShowControls: true,
    videoLoop: false,
    interventionType, noteText,
    showReactions, selectedReactions, reactions, metrics,
    adType: "none",
    adDomain: "",
    adHeadline: "",
    adSubheadline: "",
    adButtonText: "",
  };
}

/* ----------------------------- Editor Component ----------------------------- */
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

        {/* Post name (CSV mapping) */}
        <label>Post name (for CSV)
          <input
            className="input"
            placeholder="e.g. Vaccine Story A"
            value={editing.postName || ""}
            onChange={(e) => setEditing(ed => ({ ...ed, postName: e.target.value }))}
          />
          <div className="subtle" style={{ marginTop: 4 }}>
            This label replaces the post ID in CSV headers (e.g., <code>{(editing.postName || "Name")}_reacted</code>).
          </div>
        </label>

        <label>Author
          <input
            className="input"
            value={editing.author}
            onChange={(e) => {
              const author = e.target.value;
              setEditing(ed => ({
                ...ed,
                author,
                avatarUrl:
                  ed.avatarMode === "random" && ed.avatarRandomKind === "company"
                    ? randomAvatarByKind("company", ed.id || author || "seed", author || "")
                    : (ed.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : ed.avatarUrl)
              }));
            }}
          />
        </label>
        <div className="grid-2">
          <label>Verification badge
            <select className="select" value={String(!!editing.badge)} onChange={(e) => setEditing({ ...editing, badge: e.target.value === "true" })}>
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </label>
          <label>Time
            <input className="input" value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
            <div className="subtle" style={{ marginTop: 6 }}>
              Leave blank to hide time.
            </div>
          </label>

          <label className="label">Author Type</label>
          <div className="row">
            {["female","male","company"].map(opt => (
              <label key={opt} style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  name={`authorType-${editing.id}`}
                  value={opt}
                  checked={(editing.authorType || "female") === opt}
                  onChange={e => setEditing(ed => ({ ...ed, authorType: e.target.value }))}
                />
                <span style={{ marginLeft: 6, textTransform: "capitalize" }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <label>Post text
          <textarea className="textarea" rows={5} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
        </label>

        <h4 className="section-title">Profile Photo</h4>
        <fieldset className="fieldset">
          <div className="grid-2">
            <label>Mode
              <select
                className="select"
                value={editing.avatarMode}
                onChange={(e) => {
                  const m = e.target.value;
                  let url = editing.avatarUrl;
                  if (m === "random") {
                    const kind = editing.avatarRandomKind || "any";
                    url = randomAvatarByKind(kind, editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl);
                  } else if (m === "neutral") {
                    url = genNeutralAvatarDataUrl(64);
                  }
                  if (m === "upload") url = "";
                  if (m === "url")    url = editing.avatarUrl || "";
                  setEditing({ ...editing, avatarMode: m, avatarUrl: url });
                }}
              >
                <option value="random">Random avatar</option>
                <option value="neutral">Neutral avatar</option>
                <option value="upload">Upload image</option>
                <option value="url">Direct URL</option>
              </select>
            </label>
            <div className="avatar-preview">
              <div className="avatar"><img className="avatar-img" alt="" src={editing.avatarUrl || pravatar(8)} /></div>
            </div>
          </div>

          {editing.avatarMode === "random" && (
            <label>Random type
              <select
                className="select"
                value={editing.avatarRandomKind || "any"}
                onChange={(e) => {
                  const kind = e.target.value;
                  const url = randomAvatarByKind(kind, editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl);
                  setEditing({ ...editing, avatarRandomKind: kind, avatarUrl: url });
                }}
              >
                <option value="any">Any</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="company">Company logo</option>
              </select>
            </label>
          )}

          {editing.avatarMode === "url" && (
            <label>Avatar URL
              <input className="input" value={editing.avatarUrl || ""} onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })} />
            </label>
          )}
          {editing.avatarMode === "upload" && (
            <label>Upload avatar
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;

                  const headerEl = document.querySelector(".modal h3, .section-title");
                  const restoreTitle = () => {
                    if (headerEl) headerEl.textContent = isNew ? "Add Post" : "Edit Post";
                  };
                  const setPct = (pct) => {
                    if (headerEl && typeof pct === "number") {
                      headerEl.textContent = `Uploading… ${pct}%`;
                    }
                  };

                  try {
                    if (headerEl) headerEl.textContent = "Uploading… 0%";

                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: f,
                      projectId: projectId || "global",
                      feedId: feedId || "default",
                      prefix: "avatars",
                      onProgress: setPct,
                    });

                    restoreTitle();

                    setEditing((ed) => ({
                      ...ed,
                      avatarMode: "url",
                      avatarUrl: cdnUrl,
                    }));

                    alert("Avatar uploaded ✔");
                  } catch (err) {
                    console.error("Avatar upload failed", err);
                    alert(String(err?.message || "Avatar upload failed."));
                    restoreTitle();
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
          )}
        </fieldset>

        {/* ----------------------- MEDIA (already modular) ----------------------- */}
        <MediaFieldset
          editing={editing}
          setEditing={setEditing}
          projectId={projectId}
          feedId={feedId}
          isNew={isNew}
          setUploadingVideo={setUploadingVideo}
          setUploadingPoster={setUploadingPoster}
        />

        <h4 className="section-title">Ad</h4>
        <fieldset className="fieldset">
          <label>Ad type
            <select className="select" value={editing.adType || "none"} onChange={(e) => setEditing({ ...editing, adType: e.target.value })}>
              <option value="none">None</option>
              <option value="ad">Sponsored Ad</option>
            </select>
          </label>

          {editing.adType === "ad" && (
            <>
              <label>Domain / URL
                <input className="input" value={editing.adDomain || ""} onChange={(e) => setEditing({ ...editing, adDomain: e.target.value })} placeholder="www.example.com" />
              </label>
              <label>Headline
                <input className="input" value={editing.adHeadline || ""} onChange={(e) => setEditing({ ...editing, adHeadline: e.target.value })} placeholder="Free Shipping" />
              </label>
              <label>Subheadline
                <input className="input" value={editing.adSubheadline || ""} onChange={(e) => setEditing({ ...editing, adSubheadline: e.target.value })} placeholder="Product sub copy here" />
              </label>
              <label>Button Text
                <input className="input" value={editing.adButtonText || ""} onChange={(e) => setEditing({ ...editing, adButtonText: e.target.value })} placeholder="Shop now" />
              </label>
            </>
          )}
        </fieldset>

        <h4 className="section-title">Intervention</h4>
        <fieldset className="fieldset">
          <label>Type
            <select className="select" value={editing.interventionType} onChange={(e) => setEditing({ ...editing, interventionType: e.target.value })}>
              <option value="none">None</option>
              <option value="label">False info label</option>
              <option value="note">Context note</option>
            </select>
          </label>
          {editing.interventionType === "note" && (
            <label>Note text
              <input className="input" value={editing.noteText || ""} onChange={(e) => setEditing({ ...editing, noteText: e.target.value })} />
            </label>
          )}
        </fieldset>

        <h4 className="section-title">Reactions & Metrics</h4>
        <fieldset className="fieldset">
          <label>Show reactions
            <select className="select" value={String(!!editing.showReactions)} onChange={(e) => setEditing({ ...editing, showReactions: e.target.value === "true" })}>
              <option value="false">Hide</option>
              <option value="true">Show</option>
            </select>
          </label>

          <div className="subtle">Display these reactions</div>
          <div className="rx-pills">
            {Object.keys(REACTION_META).map((key) => {
              const checked = (editing.selectedReactions || []).includes(key);
              return (
                <label key={key} className={`pill ${checked ? "active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const prev = new Set(editing.selectedReactions || []);
                      e.target.checked ? prev.add(key) : prev.delete(key);
                      setEditing({ ...editing, selectedReactions: Array.from(prev) });
                    }}
                  />
                  <span className="emoji">{REACTION_META[key].emoji}</span>
                  <span>{REACTION_META[key].label}</span>
                </label>
              );
            })}
          </div>

          <div className="grid-3">
            {Object.keys(REACTION_META).map((key) => (
              <label key={key}>
                {REACTION_META[key].label}
                <input
                  className="input"
                  type="number" min="0" inputMode="numeric" placeholder="0"
                  value={Number(editing.reactions?.[key] || 0) === 0 ? "" : editing.reactions?.[key]}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                    setEditing((ed) => ({ ...ed, reactions: { ...(ed.reactions || {}), [key]: v } }));
                  }}
                />
              </label>
            ))}
          </div>

          <div className="grid-2">
            <label>Comments
              <input
                className="input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={(editing.metrics?.comments ?? 0) === 0 ? "" : editing.metrics.comments}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                  setEditing((ed) => ({ ...ed, metrics: { ...(ed.metrics || {}), comments: v } }));
                }}
              />
            </label>
            <label>Shares
              <input
                className="input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={(editing.metrics?.shares ?? 0) === 0 ? "" : editing.metrics.shares}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                  setEditing((ed) => ({ ...ed, metrics: { ...(ed.metrics || {}), shares: v } }));
                }}
              />
            </label>
          </div>
        </fieldset>
      </div>

      <aside className="editor-preview">
        <div className="preview-head">Live preview</div>
        <div className="preview-zoom" style={{ pointerEvents: "auto" }}>
          <PostCard
            key={editing.id || "preview"}
            post={{
              ...editing,
              avatarUrl:
                editing.avatarMode === "neutral"
                  ? genNeutralAvatarDataUrl(64)
                  : (editing.avatarMode === "random" && !editing.avatarUrl
                    ? randomAvatarByKind(editing.avatarRandomKind || "any", editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl)
                    : editing.avatarUrl),
              image:
                editing.imageMode === "random"
                  ? (editing.image || randomSVG("Image"))
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