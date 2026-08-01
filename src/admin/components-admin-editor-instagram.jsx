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
import { MediaFieldset } from "./components-admin-media-instagram";
import { randomAvatarByKind } from "../avatar-utils";
import { EditorSection, Field, Group, RadioGroup, PreviewPane, Toggle } from "./components-admin-editor-ui";

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
    postName: "",
    author,
    authorType: "female",
    topic: "",
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
  const customAvatar = (editing.avatarMode || "random") !== "random";
  const hasAd = (editing.adType || "none") !== "none";
  const hasBio = !!editing.showBio;

  return (
    <div className="editor-grid">
      <div className="editor-form">
        <EditorSection title="Basics" subtitle="Author, timestamp &amp; caption" defaultOpen>
          <Field
            label="Post name (for CSV)"
            hint={<>Used in CSV export headers (e.g. <code>{(editing.postName || "Name")}_liked</code>).</>}
          >
            <input
              className="input"
              placeholder="e.g. Lifestyle Post A"
              value={editing.postName || ""}
              onChange={(e) => setEditing((ed) => ({ ...ed, postName: e.target.value }))}
            />
          </Field>

          <Field label="Author">
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
          </Field>

          <div className="grid-2">
            <Toggle
              label="Verification badge"
              checked={!!editing.badge}
              onChange={(v) => setEditing((ed) => ({ ...ed, badge: v }))}
            />
            <Field label="Time">
              <input
                className="input"
                value={editing.time}
                onChange={(e) => setEditing({ ...editing, time: e.target.value })}
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

          <Field
            label="Topic"
            hint="Used to randomize images from S3 by topic and exported in feed JSON."
          >
            <input
              className="input"
              placeholder='e.g. "travel" or "fitness"'
              value={editing.topic || ""}
              onChange={(e) => setEditing((ed) => ({ ...ed, topic: e.target.value }))}
            />
          </Field>

          <Field label="Post text">
            <textarea
              className="textarea"
              rows={4}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
          </Field>
        </EditorSection>

        <EditorSection title="Profile Photo" subtitle="Avatar shown next to the author name" defaultOpen={customAvatar}>
          <div className="grid-2">
            <Field label="Mode">
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
            </Field>
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
            <Field label="Avatar URL">
              <input
                className="input"
                value={editing.avatarUrl || ""}
                onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
              />
            </Field>
          )}

          {editing.avatarMode === "upload" && (
            <Field label="Upload avatar">
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

        <EditorSection
          title="Ad"
          subtitle="Sponsored post or influencer partnership"
          defaultOpen={hasAd}
          badge={hasAd ? (editing.adType === "ad" ? "Ad" : "Partnership") : null}
        >
          <Field label="Ad type">
            <select
              className="select"
              value={editing.adType || "none"}
              onChange={(e) => setEditing({ ...editing, adType: e.target.value })}
            >
              <option value="none">None</option>
              <option value="ad">Sponsored Ad</option>
              <option value="influencer">Influencer Partnership</option>
            </select>
          </Field>

          {/* Sponsored Ad (CTA type) */}
          {editing.adType === "ad" && (
            <>
              <Field label="Call-to-Action Text">
                <input
                  className="input"
                  value={editing.adButtonText || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, adButtonText: e.target.value })
                  }
                  placeholder="e.g. Learn more, Shop now"
                />
              </Field>
              <Field label="Target URL" hint="Clicking the call-to-action button will open this URL.">
                <input
                  className="input"
                  value={editing.adUrl || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, adUrl: e.target.value })
                  }
                  placeholder="https://example.com"
                />
              </Field>
            </>
          )}

          {/* Influencer Partnership (disclosure only) */}
          {editing.adType === "influencer" && (
            <Field
              label="Brand partner name"
              hint={
                <>Appears below the username as “Paid partnership with <strong>{editing.adPartner || "Brand"}</strong>”.</>
              }
            >
              <input
                className="input"
                value={editing.adPartner || ""}
                onChange={(e) =>
                  setEditing({ ...editing, adPartner: e.target.value })
                }
                placeholder="e.g. Nike, Samsung"
              />
            </Field>
          )}
        </EditorSection>

        <EditorSection title="Author Bio" subtitle="Optional profile stats & bio text" defaultOpen={hasBio} badge={hasBio ? "On" : null}>
          <Toggle
            label="Show Bio"
            checked={!!editing.showBio}
            onChange={(v) => setEditing((ed) => ({ ...ed, showBio: v }))}
          />

          {editing.showBio && (
            <>
              <div className="grid-3">
                <Field label="Posts">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="e.g. 245"
                    value={editing.bio_posts ?? ""}
                    onChange={(e) =>
                      setEditing((ed) => ({
                        ...ed,
                        bio_posts: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
                <Field label="Followers">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="e.g. 12,400"
                    value={editing.bio_followers ?? ""}
                    onChange={(e) =>
                      setEditing((ed) => ({
                        ...ed,
                        bio_followers: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
                <Field label="Following">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder="e.g. 421"
                    value={editing.bio_following ?? ""}
                    onChange={(e) =>
                      setEditing((ed) => ({
                        ...ed,
                        bio_following: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              </div>

              <Field label="Bio text">
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="e.g. Photographer • Traveler • Coffee enthusiast"
                  value={editing.bio_text ?? ""}
                  onChange={(e) =>
                    setEditing((ed) => ({
                      ...ed,
                      bio_text: e.target.value,
                    }))
                  }
                />
              </Field>

              <Field
                label="Bio URL (optional)"
                hint={<>Optional: If <code>randomize_bios</code> is enabled in feed settings, these values will be replaced with randomized ones at render time.</>}
              >
                <input
                  className="input"
                  type="url"
                  placeholder="https://example.com"
                  value={editing.bio_url ?? ""}
                  onChange={(e) =>
                    setEditing((ed) => ({
                      ...ed,
                      bio_url: e.target.value,
                    }))
                  }
                />
              </Field>
            </>
          )}
        </EditorSection>

        <EditorSection title="Reactions & Metrics" subtitle="Like, comment &amp; save counts" defaultOpen>
          <Toggle
            label="Show like count"
            checked={!!editing.showReactions}
            onChange={(v) => setEditing({ ...editing, showReactions: v })}
          />

          <div className="grid-3">
            <Field label="Likes">
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
            </Field>
            <Field label="Comments">
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
            </Field>
            <Field label="Saves">
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
            </Field>
          </div>
        </EditorSection>
      </div>

      <PreviewPane platformLabel="Instagram">
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
      </PreviewPane>
    </div>
  );
}
