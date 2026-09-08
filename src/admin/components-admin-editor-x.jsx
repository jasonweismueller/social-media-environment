// components-admin-editor-x.jsx
// Admin post editor for X (Twitter) — mirrors the Facebook/Instagram/Amazon
// editors' structure (EditorSection/Field/Group/RadioGroup/CheckRow/
// PreviewPane primitives, MediaFieldset, a random-content generator, a
// live PreviewPane rendering the real PostCard), scoped down to X's
// simpler engagement model: no reaction breakdown/intervention/bio blocks
// — just author/handle/verified/time/text, one image-or-video attachment,
// a Promoted (ad) toggle, and reply/repost/like/view counts.
import React from "react";
import { uid, randomAvatarUrl, randomSVG, uploadFileToS3ViaSigner, compressImageFile } from "../utils";

import { PostCard } from "../ui-posts";
import { MediaFieldset } from "./components-admin-media-x";
import { randomAvatarByKind } from "../avatar-utils";
import { EditorSection, Field, Group, RadioGroup, PreviewPane, Toggle } from "./components-admin-editor-ui";
import { useToast } from "./ui";

export function genNeutralAvatarDataUrl(size = 64) {
  const s = size;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <defs>
    <clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="var(--admin-border-subtle)"/>
    <circle cx="16" cy="12.5" r="6" fill="var(--admin-muted-2)"/>
    <rect x="5" y="20" width="22" height="10" rx="5" fill="var(--admin-muted-2)"/>
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* -------------------- Random Post Generator helpers -------------------- */
const RAND_NAMES = [
  "Jordan Li", "Maya Patel", "Samir Khan", "Alex Chen", "Luca Rossi",
  "Nora Williams", "Priya Nair", "Diego Santos", "Hana Suzuki", "Ava Johnson",
];
const RAND_TIMES = ["Just now", "2m", "8m", "23m", "1h", "2h", "3h", "Yesterday", "2d", "3d"];
const LOREM_SNIPPETS = [
  "This is wild—can't believe it happened.", "Anyone else following this?",
  "New details emerging as we speak.", "Here is what I've learned so far.",
  "Thoughts?", "Quick thread on what matters here.", "Posting this for visibility.",
];
const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance = (p) => Math.random() < p;

function makeHandleFromName(name) {
  return String(name || "user").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function makeRandomPost() {
  const author = randPick(RAND_NAMES);
  const time = randPick(RAND_TIMES);
  const text = Array.from({ length: randInt(1, 2) }, () => randPick(LOREM_SNIPPETS)).join(" ");
  const willHaveImage = chance(0.5);

  return {
    id: uid(),
    postName: "",
    author,
    handle: makeHandleFromName(author),
    time,
    text,
    verified: chance(0.15),
    authorType: "female",
    avatarMode: "random",
    avatarRandomKind: "any",
    avatarUrl: randomAvatarByKind("any", author, author, randomAvatarUrl),
    imageMode: willHaveImage ? "random" : "none",
    image: willHaveImage ? randomSVG(randPick(["Image", "Update", "Breaking"])) : null,
    videoMode: "none",
    video: null,
    videoPosterUrl: "",
    videoAutoplayMuted: true,
    videoShowControls: true,
    videoLoop: false,
    adType: "none",
    like_count: randInt(0, 400),
    reply_count: randInt(0, 60),
    repost_count: randInt(0, 120),
    view_count: randInt(200, 20000),
  };
}

/* ----------------------------- Editor Component ------------------------------ */
export function AdminPostEditor({
  editing,
  setEditing,
  isNew,
  projectId,
  feedId,
  setUploadingVideo,
  setUploadingPoster,
}) {
  const toast = useToast();
  const customAvatar = (editing.avatarMode || "random") !== "random";
  const isPromoted = (editing.adType || "none") === "ad";

  const numField = (key, label, placeholder = "0") => (
    <Field label={label}>
      <input
        className="input"
        type="number"
        min="0"
        inputMode="numeric"
        placeholder={placeholder}
        value={Number(editing[key] || 0) === 0 ? "" : editing[key]}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value === "" ? 0 : Number(e.target.value);
          setEditing((ed) => ({ ...ed, [key]: Number.isFinite(v) ? v : 0 }));
        }}
      />
    </Field>
  );

  return (
    <div className="editor-grid">
      <div className="editor-form">
        <EditorSection title="Basics" subtitle="Post identity for CSV export">
          {isNew && (
            <button
              type="button"
              className="admin-btn"
              onClick={() => setEditing((ed) => ({ ...makeRandomPost(), id: ed.id }))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                marginBottom: 14,
                borderRadius: 8,
                border: "1px solid var(--admin-accent-border)",
                background: "var(--admin-accent-soft)",
                color: "var(--admin-accent)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              🎲 Fill with random content
            </button>
          )}

          <Field
            label="Post name (for CSV)"
            hint={
              <>
                This label replaces the post ID in CSV headers (e.g., <code>{(editing.postName || "Name")}_reacted</code>).
                {editing.id && <> ID: <span style={{ fontFamily: "monospace" }}>{editing.id}</span></>}
              </>
            }
          >
            <input
              className="input"
              placeholder="e.g. Vaccine Story A"
              value={editing.postName || ""}
              onChange={(e) => setEditing((ed) => ({ ...ed, postName: e.target.value }))}
            />
          </Field>
        </EditorSection>

        <EditorSection title="Author" subtitle="Name, handle, type &amp; verification">
          <div className="grid-2">
            <Field label="Display name">
              <input
                className="input"
                value={editing.author || ""}
                onChange={(e) => {
                  const author = e.target.value;
                  setEditing((ed) => ({
                    ...ed,
                    author,
                    avatarUrl:
                      ed.avatarMode === "random" && ed.avatarRandomKind === "company"
                        ? randomAvatarByKind("company", ed.id || author || "seed", author || "")
                        : (ed.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : ed.avatarUrl),
                  }));
                }}
              />
            </Field>
            <Field label="Handle" hint="Shown as @handle. Leave blank to auto-derive from the display name.">
              <input
                className="input"
                placeholder="username"
                value={editing.handle || ""}
                onChange={(e) => setEditing((ed) => ({ ...ed, handle: e.target.value }))}
              />
            </Field>
          </div>

          <Group label="Author Type">
            <RadioGroup
              name={`authorType-${editing.id}`}
              value={editing.authorType || "female"}
              onChange={(v) => setEditing((ed) => ({ ...ed, authorType: v }))}
              options={[{ value: "female" }, { value: "male" }, { value: "company" }]}
            />
          </Group>

          <Toggle
            label="Verification badge"
            checked={!!editing.verified}
            onChange={(v) => setEditing({ ...editing, verified: v })}
          />
        </EditorSection>

        <EditorSection title="Post content" subtitle="Timestamp &amp; post text">
          <Field label="Time" hint="Leave blank to hide time.">
            <input className="input" value={editing.time || ""} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
          </Field>

          <Field label="Post text">
            <textarea className="textarea" rows={5} value={editing.text || ""} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          </Field>
        </EditorSection>

        <EditorSection title="Profile Photo" subtitle="Avatar shown next to the author name" badge={customAvatar ? "Custom" : null}>
          <div className="grid-2">
            <Field label="Mode">
              <select
                className="select"
                value={editing.avatarMode || "random"}
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
                  if (m === "url") url = editing.avatarUrl || "";
                  setEditing({ ...editing, avatarMode: m, avatarUrl: url });
                }}
              >
                <option value="random">Random avatar</option>
                <option value="neutral">Neutral avatar</option>
                <option value="upload">Upload image</option>
                <option value="url">Direct URL</option>
              </select>
            </Field>
            <div className="avatar-preview">
              <div className="avatar"><img className="avatar-img" alt="" src={editing.avatarUrl || ""} /></div>
            </div>
          </div>

          {editing.avatarMode === "random" && (
            <Field label="Random type">
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
            </Field>
          )}

          {editing.avatarMode === "url" && (
            <Field label="Avatar URL">
              <input className="input" value={editing.avatarUrl || ""} onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })} />
            </Field>
          )}
          {editing.avatarMode === "upload" && (
            <Field label="Upload avatar">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const headerEl = document.querySelector(".modal h3, .section-title");
                  const restoreTitle = () => { if (headerEl) headerEl.textContent = isNew ? "Add Post" : "Edit Post"; };
                  const setPct = (pct) => { if (headerEl && typeof pct === "number") headerEl.textContent = `Uploading… ${pct}%`; };
                  try {
                    if (headerEl) headerEl.textContent = "Uploading… 0%";
                    const compressed = await compressImageFile(f, "avatar");
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: compressed,
                      projectId: projectId || "global",
                      feedId: feedId || "default",
                      prefix: "avatars",
                      onProgress: setPct,
                    });
                    restoreTitle();
                    setEditing((ed) => ({ ...ed, avatarMode: "url", avatarUrl: cdnUrl }));
                    toast.success("Avatar uploaded");
                  } catch (err) {
                    console.error("Avatar upload failed", err);
                    toast.error(String(err?.message || "Avatar upload failed."));
                    restoreTitle();
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </Field>
          )}
        </EditorSection>

        <MediaFieldset
          editing={editing}
          setEditing={setEditing}
          projectId={projectId}
          feedId={feedId}
          isNew={isNew}
          setUploadingVideo={setUploadingVideo}
          setUploadingPoster={setUploadingPoster}
        />

        <EditorSection title="Post type" subtitle="Regular post or promoted (ad)" badge={isPromoted ? "Promoted" : null}>
          <Field label="Post type">
            <select
              className="select"
              value={editing.adType || "none"}
              onChange={(e) => setEditing((ed) => ({ ...ed, adType: e.target.value }))}
            >
              <option value="none">Regular post</option>
              <option value="ad">Promoted</option>
            </select>
          </Field>
        </EditorSection>

        <EditorSection title="Engagement counts" subtitle="Reply, repost, like &amp; view counts">
          <div className="grid-2">
            {numField("reply_count", "Replies")}
            {numField("repost_count", "Reposts")}
          </div>
          <div className="grid-2">
            {numField("like_count", "Likes")}
            {numField("view_count", "Views")}
          </div>
        </EditorSection>
      </div>

      <PreviewPane platformLabel="X">
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
        />
      </PreviewPane>
    </div>
  );
}
