// components-admin-editor.jsx
import React from "react";
import {
  uid,
  REACTION_META,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  uploadFileToS3ViaSigner,
  compressImageFile,
} from "../utils";

import { PostCard } from "../ui-posts";
import { MediaFieldset } from "./components-admin-media-facebook";
import { randomAvatarByKind } from "../avatar-utils";
import { EditorSection, Field, Group, RadioGroup, CheckRow, PreviewPane, Toggle } from "./components-admin-editor-ui";
import { useToast } from "./ui";

/* ---------- gender-neutral comic avatar (64px) ---------------- */
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
    topic: "",
    showBio: false,
    bio_text: "",
    bio_url: "",
    bio_posts: 0,
    bio_followers: 0,
    bio_following: 0,
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
    adUrl: "",
    newsDomain: "",
    newsHeadline: "",
    newsDescription: "",
    newsUrl: "",
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
  const hasBio = !!editing.showBio;
  const hasIntervention = (editing.interventionType || "none") !== "none";
  const customAvatar = (editing.avatarMode || "random") !== "random";

  // Ad/News and Intervention are independent data fields (a post can technically carry
  // both at once — InterventionBlock renders regardless of adType), but the admin only
  // ever wants to pick one "post type" at a time. This derives the unified selector value
  // from whichever is currently set, preferring intervention if both happen to be set,
  // without mutating anything just from rendering — only an explicit change below clears
  // the other dimension.
  const postType = hasIntervention ? "intervention" : (editing.adType || "none");
  const postTypeBadge =
    postType === "ad" ? "Ad"
    : postType === "news" ? "News"
    : postType === "intervention" ? (editing.interventionType === "note" ? "Note" : "Label")
    : null;

  const setPostType = (next) => {
    setEditing((ed) => {
      if (next === "intervention") {
        return {
          ...ed,
          adType: "none",
          interventionType: (ed.interventionType && ed.interventionType !== "none") ? ed.interventionType : "label",
        };
      }
      if (next === "none") {
        return { ...ed, adType: "none", interventionType: "none" };
      }
      // "ad" or "news"
      return {
        ...ed,
        interventionType: "none",
        adType: next,
        authorType: next === "ad" || next === "news" ? "company" : (ed.authorType || "female"),
        newsDomain: ed.newsDomain || ed.adDomain || "",
        newsHeadline: ed.newsHeadline || ed.adHeadline || "",
        newsDescription: ed.newsDescription || ed.adSubheadline || "",
        newsUrl: ed.newsUrl || ed.adUrl || "",
      };
    });
  };

  return (
    <div className="editor-grid">
      <div className="editor-form">
        <EditorSection title="Basics" subtitle="Author, timestamp &amp; post text">
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
              onChange={(e) => setEditing(ed => ({ ...ed, postName: e.target.value }))}
            />
          </Field>

          <Field label="Author">
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
          </Field>

          <div className="grid-2">
            <Toggle
              label="Verification badge"
              checked={!!editing.badge}
              onChange={(v) => setEditing({ ...editing, badge: v })}
            />
            <Field label="Time" hint="Leave blank to hide time.">
              <input className="input" value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
            </Field>
          </div>

          <Group label="Author Type">
            <RadioGroup
              name={`authorType-${editing.id}`}
              value={editing.authorType || "female"}
              onChange={(v) => setEditing(ed => ({ ...ed, authorType: v }))}
              options={[{ value: "female" }, { value: "male" }, { value: "company" }]}
            />
          </Group>

          <Field
            label="Topic"
            hint="Saved with the post and included in feed JSON. The media randomizer can use this to pick images from your S3 topic folder."
          >
            <input
              className="input"
              placeholder='e.g. "climate_change" or "education"'
              value={editing.topic || ""}
              onChange={(e) => setEditing(ed => ({ ...ed, topic: e.target.value }))}
            />
          </Field>

          <Field label="Post text">
            <textarea className="textarea" rows={5} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          </Field>
        </EditorSection>

        <EditorSection title="Profile Photo" subtitle="Avatar shown next to the author name" badge={customAvatar ? "Custom" : null}>
          <div className="grid-2">
            <Field label="Mode">
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
            </Field>
            <div className="avatar-preview">
              <div className="avatar"><img className="avatar-img" alt="" src={editing.avatarUrl || pravatar(8)} /></div>
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

                    const compressed = await compressImageFile(f, "avatar");
                    const { cdnUrl } = await uploadFileToS3ViaSigner({
                      file: compressed,
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

        <EditorSection title="Facebook Profile / Bio" subtitle="Optional profile preview on click/hover" badge={hasBio ? "On" : null}>
          <Toggle
            label="Enable profile preview"
            hint="Participants can open a Facebook-style profile preview by clicking or hovering over the author name/avatar. Recorded as bio_opened and bio_url_clicked."
            checked={!!editing.showBio}
            onChange={(enabled) => {
              setEditing((ed) => ({
                ...ed,
                showBio: enabled,
                bio_posts: Number.isFinite(Number(ed.bio_posts)) ? Number(ed.bio_posts) : 0,
                bio_followers: Number.isFinite(Number(ed.bio_followers)) ? Number(ed.bio_followers) : 0,
                bio_following: Number.isFinite(Number(ed.bio_following)) ? Number(ed.bio_following) : 0,
              }));
            }}
          />

          {editing.showBio && (
            <>
              <Field label="Bio / About text">
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder="Short profile description shown in the Facebook-style profile preview"
                  value={editing.bio_text || ""}
                  onChange={(e) => setEditing((ed) => ({ ...ed, bio_text: e.target.value }))}
                />
              </Field>

              <Field
                label="Profile / website URL"
                hint="The feed does not navigate participants away; it records the click and shows the same study message used elsewhere."
              >
                <input
                  className="input"
                  placeholder="https://example.com"
                  value={editing.bio_url || ""}
                  onChange={(e) => setEditing((ed) => ({ ...ed, bio_url: e.target.value }))}
                />
              </Field>

              <div className="grid-3">
                <Field label="Posts">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={(editing.bio_posts ?? 0) === 0 ? "" : editing.bio_posts}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setEditing((ed) => ({ ...ed, bio_posts: Number.isFinite(v) ? v : 0 }));
                    }}
                  />
                </Field>
                <Field label="Followers">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={(editing.bio_followers ?? 0) === 0 ? "" : editing.bio_followers}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setEditing((ed) => ({ ...ed, bio_followers: Number.isFinite(v) ? v : 0 }));
                    }}
                  />
                </Field>
                <Field label="Following">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={(editing.bio_following ?? 0) === 0 ? "" : editing.bio_following}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      setEditing((ed) => ({ ...ed, bio_following: Number.isFinite(v) ? v : 0 }));
                    }}
                  />
                </Field>
              </div>
            </>
          )}
        </EditorSection>

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

        <EditorSection title="Post type" subtitle="Regular post, ad, news link, or intervention" badge={postTypeBadge}>
          <Field label="Post type">
            <select
              className="select"
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
            >
              <option value="none">Regular post</option>
              <option value="ad">Sponsored ad</option>
              <option value="news">News link preview</option>
              <option value="intervention">Intervention</option>
            </select>
          </Field>

          {postType === "ad" && (
            <>
              <Field label="Domain / URL">
                <input className="input" value={editing.adDomain || ""} onChange={(e) => setEditing({ ...editing, adDomain: e.target.value })} placeholder="www.example.com" />
              </Field>
              <Field label="Headline">
                <input className="input" value={editing.adHeadline || ""} onChange={(e) => setEditing({ ...editing, adHeadline: e.target.value })} placeholder="Free Shipping" />
              </Field>
              <Field label="Subheadline">
                <input className="input" value={editing.adSubheadline || ""} onChange={(e) => setEditing({ ...editing, adSubheadline: e.target.value })} placeholder="Product sub copy here" />
              </Field>
              <Field label="Destination URL">
                <input className="input" value={editing.adUrl || ""} onChange={(e) => setEditing({ ...editing, adUrl: e.target.value })} placeholder="https://www.example.com" />
              </Field>
              <Field label="Button Text">
                <input className="input" value={editing.adButtonText || ""} onChange={(e) => setEditing({ ...editing, adButtonText: e.target.value })} placeholder="Shop now" />
              </Field>
            </>
          )}

          {postType === "news" && (
            <>
              <div className="subtle">
                A news post uses the uploaded/selected image as the preview image. Clicking the image or grey preview banner records <code>news_clicked</code> and shows an “Action noted” message instead of opening the website.
              </div>
              <Field label="News source / domain">
                <input className="input" value={editing.newsDomain || ""} onChange={(e) => setEditing({ ...editing, newsDomain: e.target.value })} placeholder="example.com" />
              </Field>
              <Field label="News headline">
                <input className="input" value={editing.newsHeadline || ""} onChange={(e) => setEditing({ ...editing, newsHeadline: e.target.value })} placeholder="Headline shown below the image" />
              </Field>
              <Field label="Short preview text">
                <input className="input" value={editing.newsDescription || ""} onChange={(e) => setEditing({ ...editing, newsDescription: e.target.value })} placeholder="Optional short summary" />
              </Field>
              <Field label="Destination URL / tracked link">
                <input className="input" value={editing.newsUrl || ""} onChange={(e) => setEditing({ ...editing, newsUrl: e.target.value })} placeholder="https://www.example.com/story" />
              </Field>
            </>
          )}

          {postType === "intervention" && (
          <Field label="Intervention type">
            <select
              className="select"
              value={editing.interventionType === "note" ? "note" : "label"}
              onChange={(e) => {
                const nextType = e.target.value;

                setEditing((ed) => {
                  // If switching to note, ensure noteText exists (but don't force meta/groups)
                  if (nextType === "note") {
                    return {
                      ...ed,
                      interventionType: nextType,
                      noteText: ed.noteText ?? "",
                      noteMetaEnabled: !!ed.noteMetaEnabled,
                      noteReaderGroups: Array.isArray(ed.noteReaderGroups) ? ed.noteReaderGroups : [],
                      noteReaderGroup2Enabled: !!ed.noteReaderGroup2Enabled,
                    };
                  }
                  return { ...ed, interventionType: nextType };
                });
              }}
            >
              <option value="label">False info label</option>
              <option value="note">Context note</option>
            </select>
          </Field>
          )}

          {editing.interventionType === "note" && (
            <>
              <Field
                label="Note text"
                hint="Tip: Add blank lines for readability. URLs will render as clickable links in the feed."
              >
                <textarea
                  className="textarea"
                  rows={6}
                  value={editing.noteText || ""}
                  onChange={(e) => setEditing((ed) => ({ ...ed, noteText: e.target.value }))}
                  placeholder={
                    "Write the context note.\n\nYou can use blank lines. URLs like https://... will be clickable in the feed."
                  }
                />
              </Field>

              <CheckRow
                checked={!!editing.noteMetaEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setEditing((ed) => {
                    // When enabling, ensure at least group 1 exists
                    const groups = Array.isArray(ed.noteReaderGroups) ? [...ed.noteReaderGroups] : [];
                    if (on && groups.length === 0) groups.push({ type: "", size: "" });

                    return {
                      ...ed,
                      noteMetaEnabled: on,
                      noteReaderGroups: on ? groups : [],
                      noteReaderGroup2Enabled: on ? !!ed.noteReaderGroup2Enabled : false,
                    };
                  });
                }}
              >
                Add contributor info tooltip (optional)
              </CheckRow>

              {editing.noteMetaEnabled && (() => {
                const groups = Array.isArray(editing.noteReaderGroups) ? editing.noteReaderGroups : [];
                const g0 = groups[0] || { type: "", size: "" };
                const g1 = groups[1] || { type: "", size: "" };
                const hasSecond = !!editing.noteReaderGroup2Enabled;

                const setGroup = (idx, patch) => {
                  setEditing((ed) => {
                    const prev = Array.isArray(ed.noteReaderGroups) ? [...ed.noteReaderGroups] : [];
                    while (prev.length < 2) prev.push({ type: "", size: "" });
                    prev[idx] = { ...prev[idx], ...patch };
                    // If second group is disabled, keep only first group in storage
                    return {
                      ...ed,
                      noteReaderGroups: ed.noteReaderGroup2Enabled ? prev : [prev[0]],
                    };
                  });
                };

                // Fixed value (free text, unchanged) or a random range —
                // when a group is set to "range", each participant sees a
                // deterministic-but-per-participant random whole number
                // drawn from [min, max] (resolveNoteReaderGroupSize,
                // utils-core.js), recorded to CSV as
                // `<post_id>_note_group{1,2}_size_shown` so it can be
                // controlled for in analysis.
                const renderSizeControl = (idx, g) => {
                  const mode = g.sizeMode === "range" ? "range" : "fixed";
                  return (
                    <Group
                      label={`Group ${idx + 1} size`}
                      hint={
                        mode === "range"
                          ? "Each participant sees a random whole number in this range. Recorded per participant for analysis."
                          : undefined
                      }
                    >
                      <RadioGroup
                        name={`note-group${idx + 1}-size-mode`}
                        value={mode}
                        options={[
                          { value: "fixed", label: "Fixed value" },
                          { value: "range", label: "Random range" },
                        ]}
                        onChange={(val) => setGroup(idx, { sizeMode: val })}
                      />
                      {mode === "range" ? (
                        <div className="grid-2">
                          <Field label="Min">
                            <input
                              className="input"
                              type="number"
                              value={g.sizeMin ?? ""}
                              onChange={(e) => setGroup(idx, { sizeMin: e.target.value })}
                              placeholder="e.g., 40"
                            />
                          </Field>
                          <Field label="Max">
                            <input
                              className="input"
                              type="number"
                              value={g.sizeMax ?? ""}
                              onChange={(e) => setGroup(idx, { sizeMax: e.target.value })}
                              placeholder="e.g., 120"
                            />
                          </Field>
                        </div>
                      ) : (
                        <input
                          className="input"
                          value={g.size}
                          onChange={(e) => setGroup(idx, { size: e.target.value })}
                          placeholder='e.g., "Several" or "Many"'
                        />
                      )}
                    </Group>
                  );
                };

                return (
                  <Group label="Contributor groups" hint="This tooltip can show one or two contributor groups and their approximate sizes.">
                    <div className="grid-2">
                      <Field label="Group 1 type">
                        <input
                          className="input"
                          value={g0.type}
                          onChange={(e) => setGroup(0, { type: e.target.value })}
                          placeholder='e.g., "Community readers"'
                        />
                      </Field>

                      {renderSizeControl(0, g0)}
                    </div>

                    <CheckRow
                      checked={!!editing.noteReaderGroup2Enabled}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setEditing((ed) => {
                          const prev = Array.isArray(ed.noteReaderGroups) ? [...ed.noteReaderGroups] : [];
                          while (prev.length < 2) prev.push({ type: "", size: "" });
                          return {
                            ...ed,
                            noteReaderGroup2Enabled: on,
                            noteReaderGroups: on ? prev : [prev[0]],
                          };
                        });
                      }}
                    >
                      Add second contributor group
                    </CheckRow>

                    {hasSecond && (
                      <div className="grid-2">
                        <Field label="Group 2 type">
                          <input
                            className="input"
                            value={g1.type}
                            onChange={(e) => setGroup(1, { type: e.target.value })}
                            placeholder='e.g., "Subject-matter experts"'
                          />
                        </Field>

                        {renderSizeControl(1, g1)}
                      </div>
                    )}
                  </Group>
                );
              })()}
            </>
          )}

          {editing.interventionType === "label" && (
            <>
              <CheckRow
                checked={!!editing.noteMetaEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setEditing((ed) => ({
                    ...ed,
                    noteMetaEnabled: on,
                    noteReaderGroups: on
                      ? (Array.isArray(ed.noteReaderGroups)
                          ? ed.noteReaderGroups
                          : [{ type: "", size: "" }])
                      : [],
                    noteReaderGroup2Enabled: false
                  }));
                }}
              >
                Add “Type” and “Size” info tooltip
              </CheckRow>

              {editing.noteMetaEnabled && (() => {
                const groups = Array.isArray(editing.noteReaderGroups)
                  ? editing.noteReaderGroups
                  : [];

                const g0 = groups[0] || { type: "", size: "" };
                const g1 = groups[1] || { type: "", size: "" };

                const setGroup = (idx, patch) => {
                  setEditing((ed) => {
                    const prev = Array.isArray(ed.noteReaderGroups)
                      ? [...ed.noteReaderGroups]
                      : [];

                    while (prev.length < 2) prev.push({ type: "", size: "" });
                    prev[idx] = { ...prev[idx], ...patch };

                    return { ...ed, noteReaderGroups: prev };
                  });
                };

                return (
                  <Group label="Reader groups">
                    <div className="grid-2">
                      <Field label="Group 1 type">
                        <input
                          className="input"
                          value={g0.type}
                          onChange={(e) => setGroup(0, { type: e.target.value })}
                          placeholder='e.g., "Community readers"'
                        />
                      </Field>

                      <Field label="Group 1 size">
                        <input
                          className="input"
                          value={g0.size}
                          onChange={(e) => setGroup(0, { size: e.target.value })}
                          placeholder='e.g., "Several"'
                        />
                      </Field>
                    </div>

                    <CheckRow
                      checked={!!editing.noteReaderGroup2Enabled}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setEditing((ed) => ({
                          ...ed,
                          noteReaderGroup2Enabled: on,
                          noteReaderGroups: on
                            ? (Array.isArray(ed.noteReaderGroups)
                                ? ed.noteReaderGroups
                                : [{ type: "", size: "" }, { type: "", size: "" }])
                            : [g0],
                        }));
                      }}
                    >
                      Add second reader group
                    </CheckRow>

                    {editing.noteReaderGroup2Enabled && (
                      <div className="grid-2">
                        <Field label="Group 2 type">
                          <input
                            className="input"
                            value={g1.type}
                            onChange={(e) => setGroup(1, { type: e.target.value })}
                            placeholder='e.g., "Subject-matter experts"'
                          />
                        </Field>

                        <Field label="Group 2 size">
                          <input
                            className="input"
                            value={g1.size}
                            onChange={(e) => setGroup(1, { size: e.target.value })}
                            placeholder='e.g., "A few"'
                          />
                        </Field>
                      </div>
                    )}
                  </Group>
                );
              })()}
            </>
          )}
        </EditorSection>

        <EditorSection title="Reactions & Metrics" subtitle="Reaction counts, comments, shares">
          <Toggle
            label="Show reactions"
            checked={!!editing.showReactions}
            onChange={(v) => setEditing({ ...editing, showReactions: v })}
          />

          <Group label="Display these reactions">
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
          </Group>

          <div className="grid-3">
            {Object.keys(REACTION_META).map((key) => (
              <Field key={key} label={REACTION_META[key].label}>
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
              </Field>
            ))}
          </div>

          <div className="grid-2">
            <Field label="Comments">
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
            </Field>
            <Field label="Shares">
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
            </Field>
          </div>
        </EditorSection>
      </div>

      <PreviewPane platformLabel="Facebook">
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
      </PreviewPane>
    </div>
  );
}
