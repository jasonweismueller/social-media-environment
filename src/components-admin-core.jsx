// components-admin-core.jsx
import React, { useEffect, useState } from "react";
import {
  uid,
  REACTION_META,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  fileToDataURL,
  listFeedsFromBackend,
  getDefaultFeedFromBackend,
  setDefaultFeedOnBackend,
  savePostsToBackend,
  loadPostsFromBackend,
  wipeParticipantsOnBackend,
  deleteFeedOnBackend,
} from "./utils";
import { PostCard, Modal } from "./components-ui";
import { ParticipantsPanel } from "./components-admin-parts";
import { randomAvatarByKind } from "./avatar-utils";

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

function makeRandomPost() {
  const author = randPick(RAND_NAMES);
  const time = randPick(RAND_TIMES);
  const text = Array.from({ length: randInt(1, 3) }, () => randPick(LOREM_SNIPPETS)).join(" ");

  const willHaveImage = chance(0.55);
  const fixedImage = willHaveImage ? randomSVG(randPick(["Image", "Update", "Breaking"])) : null;

  const interventionType = chance(0.20) ? randPick(["label", "note"]) : "none";
  const noteText = interventionType === "note" ? randPick(NOTE_SNIPPETS) : "";

  const showReactions = chance(0.85);
  const rxKeys = Object.keys(REACTION_META);
  const selectedReactions = showReactions ? rxKeys.sort(() => 0.5 - Math.random()).slice(0, randInt(1, 3)) : ["like"];

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
    author, time, text, links: [],
    badge: chance(0.15),

    // avatar controls (real photos for male/female; logos for company)
    avatarMode: "random",
    avatarRandomKind,
    avatarUrl: randomAvatarByKind(avatarRandomKind, author, author, randomAvatarUrl),

    imageMode: willHaveImage ? "random" : "none",
    image: fixedImage,

    interventionType, noteText,
    showReactions, selectedReactions, reactions, metrics,

    // ads
    adType: "none",
    adDomain: "",
    adHeadline: "",
    adSubheadline: "",
    adButtonText: "",

  };
}

/* ------------------------ Tiny admin stats fetcher ------------------------ */
async function fetchParticipantsStats(feedId) {
  try {
    const base = window.CONFIG?.API_BASE;
    const admin = window.ADMIN_TOKEN;
    if (!base || !admin) return null;
    const url = `${base}?path=participants_stats&feed_id=${encodeURIComponent(feedId)}&admin_token=${encodeURIComponent(admin)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json || null;
  } catch {
    return null;
  }
}

/* ---------------------------- Posts local cache --------------------------- */
function getCachedPosts(feedId, checksum) {
  try {
    const k = `posts::${feedId}`;
    const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
    if (!meta || meta.checksum !== checksum) return null;
    const data = JSON.parse(localStorage.getItem(k) || "null");
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}
function setCachedPosts(feedId, checksum, posts) {
  try {
    const k = `posts::${feedId}`;
    localStorage.setItem(k, JSON.stringify(posts || []));
    localStorage.setItem(`${k}::meta`, JSON.stringify({ checksum, t: Date.now() }));
  } catch {}
}

/* ------------------------------- UI Bits --------------------------------- */
function Section({ title, subtitle, right = null, children }) {
  return (
    <section className="card" style={{ padding: "1rem" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap", marginBottom:".5rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle && <div className="subtle" style={{ marginTop: 4 }}>{subtitle}</div>}
        </div>
        {!!right && <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" }}>{right}</div>}
      </div>
      {children}
    </section>
  );
}

function ChipToggle({ label, checked, onChange }) {
  return (
    <button
      className={`btn ghost ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{ borderRadius: 999, padding: ".35rem .7rem" }}
    >
      <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", marginRight:8, background: checked ? "var(--accent, #2563eb)" : "var(--line)" }} />
      {label}
    </button>
  );
}

/* ----------------------------- Admin Dashboard ---------------------------- */
export function AdminDashboard({
  posts, setPosts,
  randomize, setRandomize,
  showComposer, setShowComposer,
  resetLog,
  onPublishPosts, // optional override
  onLogout,
}) {
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [participantsRefreshKey, setParticipantsRefreshKey] = useState(0);

  const [feeds, setFeeds] = useState([]);
  const [feedId, setFeedId] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [defaultFeedId, setDefaultFeedId] = useState(null);

  const [feedStats, setFeedStats] = useState({});
  const loadStatsFor = async (id) => {
    if (!id || feedStats[id]) return;
    const s = await fetchParticipantsStats(id);
    setFeedStats((m) => ({ ...m, [id]: s || { total: 0, submitted: 0, avg_ms_enter_to_submit: null } }));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setFeedsLoading(true);
      const [list, backendDefault] = await Promise.all([
        listFeedsFromBackend(),
        getDefaultFeedFromBackend(),
      ]);
      if (!alive) return;

      const feedsList = Array.isArray(list) ? list : [];
      setFeeds(feedsList);
      setDefaultFeedId(backendDefault || null);

      const chosen = feedsList.find(f => f.feed_id === backendDefault) || feedsList[0] || null;
      if (chosen) {
        setFeedId(chosen.feed_id);
        setFeedName(chosen.name || chosen.feed_id);

        const cached = getCachedPosts(chosen.feed_id, chosen.checksum);
        if (cached) {
          setPosts(cached);
        } else {
          const fresh = await loadPostsFromBackend(chosen.feed_id, { force: true });
          const arr = Array.isArray(fresh) ? fresh : [];
          setPosts(arr);
          setCachedPosts(chosen.feed_id, chosen.checksum, arr);
        }
      } else {
        setFeedId("feed_1");
        setFeedName("Feed 1");
        setPosts([]);
      }
      setFeedsLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectFeed = async (id) => {
    const row = feeds.find(f => String(f.feed_id) === String(id));
    setFeedId(id);
    setFeedName(row?.name || id);

    const cached = row ? getCachedPosts(id, row.checksum) : null;
    if (cached) {
      setPosts(cached);
      return;
    }
    const fresh = await loadPostsFromBackend(id, { force: true });
    const arr = Array.isArray(fresh) ? fresh : [];
    setPosts(arr);
    if (row) setCachedPosts(id, row.checksum, arr);
  };

  const createNewFeed = () => {
    const id = prompt("New feed ID (letters/numbers/underscores):", `feed_${(feeds.length || 0) + 1}`);
    if (!id) return;
    const name = prompt("Optional feed name (shown in admin):", id) || id;
    setFeedId(id);
    setFeedName(name);
    setPosts([]);
    setFeeds(prev => {
      const exists = prev.some(f => String(f.feed_id) === String(id));
      return exists ? prev : [{ feed_id: id, name, checksum: "", updated_at: "" }, ...prev];
    });
  };

  const openNew = () => {
    setIsNew(true);
    const avatarRandomKind = "any";
    setEditing({
      id: uid(),
      author: "",
      time: "Just now",
      text: "",
      links: [],
      badge: false,
      avatarMode: "random",
      avatarRandomKind,
      avatarUrl: randomAvatarByKind(avatarRandomKind, "new", "", randomAvatarUrl),
      imageMode: "none",
      image: null,
      interventionType: "none",
      noteText: "",
      showReactions: false,
      selectedReactions: ["like"],
      reactions: { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      metrics: { comments: 0, shares: 0 },

      adType: "none",
      adDomain: "",
      adHeadline: "",
      adSubheadline: "",
      adButtonText: "",
    });
  };
  const openEdit = (p) => { setIsNew(false); setEditing({ ...p }); };

  const removePost = (id) => {
    if (!confirm("Delete this post?")) return;
    setPosts((arr) => arr.filter((p) => p.id !== id));
  };

  const saveEditing = () => {
    if (!editing.author?.trim()) { alert("Author is required."); return; }
    if (!editing.text?.trim()) { alert("Post text is required."); return; }

    setPosts((arr) => {
      const idx = arr.findIndex((p) => p.id === editing.id);
      const clean = { ...editing };

      if (clean.avatarMode === "random" && !clean.avatarUrl) {
        clean.avatarUrl = randomAvatarByKind(clean.avatarRandomKind || "any", clean.id || clean.author || "seed", clean.author || "", randomAvatarUrl);
      }
      if (clean.avatarMode === "random" && clean.avatarRandomKind === "company") {
        // keep initials synced with author
        clean.avatarUrl = randomAvatarByKind("company", clean.id || clean.author || "seed", clean.author || "");
      }

      if (clean.imageMode === "none") clean.image = null;
      if (clean.imageMode === "random" && !clean.image) clean.image = randomSVG("Image");

      return idx === -1 ? [...arr, clean] : arr.map((p, i) => (i === idx ? clean : p));
    });
    setEditing(null);
  };

  const clearFeed = () => {
    if (!posts.length) return;
    if (!confirm("Delete ALL posts from this feed? This cannot be undone.")) return;
    setPosts([]);
  };

  return (
    <div className="admin-shell" style={{ display: "grid", gap: "1rem" }}>
      <Section
        title="Admin Dashboard"
        subtitle="Manage multiple feeds (conditions), set the default feed for participants, and review per-feed analytics."
        right={<button className="btn ghost" onClick={onLogout} title="Sign out of the admin session">Log out</button>}
      />

      <div style={{ display:"grid", gap:"1rem", gridTemplateColumns:"minmax(0,1fr)" }} className="admin-grid">
        {/* Feeds */}
        <Section
          title={`Feeds (${feeds.length || 0})`}
          subtitle="Browse all feeds in the registry. Set default, load into editor, save posts to a feed, or delete a feed."
          right={
            <>
              <button className="btn ghost" onClick={createNewFeed}>+ New feed</button>
              <button
                className="btn"
                onClick={async () => {
                  setFeedsLoading(true);
                  const [list, backendDefault] = await Promise.all([listFeedsFromBackend(), getDefaultFeedFromBackend()]);
                  setFeeds(Array.isArray(list) ? list : []);
                  setDefaultFeedId(backendDefault || null);
                  setFeedsLoading(false);
                }}
                title="Reload feed registry from backend"
              >
                Refresh Feeds
              </button>
            </>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr className="subtle" style={{ textAlign:"left" }}>
                  <th style={{ padding: ".4rem .5rem", width: 36 }}>⭐</th>
                  <th style={{ padding: ".4rem .5rem", minWidth: 100 }}>Name</th>
                  <th style={{ padding: ".4rem .5rem", minWidth: 100 }}>ID</th>
                  <th style={{ padding: ".4rem .5rem", minWidth: 80 }}>Updated</th>
                  <th style={{ padding: ".4rem .5rem", textAlign: "center" }}>Total</th>
                  <th style={{ padding: ".4rem .5rem", textAlign: "center" }}>Submitted</th>
                  <th style={{ padding: ".4rem .5rem", textAlign: "center"}}>Avg (ms)</th>
                  <th style={{ padding: ".4rem .5rem", minWidth: 420 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => {
                  const isDefault = f.feed_id === defaultFeedId;
                  const isLoaded = f.feed_id === feedId;
                  const stats = feedStats[f.feed_id];
                  return (
                    <tr key={f.feed_id} style={{ borderTop:"1px solid var(--line)" }}>
                      <td style={{ padding: ".5rem .5rem" }} aria-label={isDefault ? "Default feed" : "Not default"}>
                        {isDefault ? "⭐" : ""}
                      </td>
                      <td style={{ padding: ".5rem .5rem", fontWeight: 600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {f.name || f.feed_id}
                      </td>
                      <td style={{ padding: ".5rem .5rem", fontFamily: "monospace" }}>{f.feed_id}</td>
                      <td style={{ padding: ".5rem .5rem" }}>
                        <span className="subtle">{f.updated_at ? new Date(f.updated_at).toLocaleString() : "—"}</span>
                      </td>

                      <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>{stats ? stats.total : "—"}</td>
                      <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>{stats ? stats.submitted : "—"}</td>
                      <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>
                        {stats && stats.avg_ms_enter_to_submit != null ? stats.avg_ms_enter_to_submit : "—"}
                      </td>

                      <td style={{ padding: ".5rem .5rem" }}>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:".4rem", alignItems:"center" }}>
                          <button className="btn" title="Load this feed into the editor" onClick={() => selectFeed(f.feed_id)} disabled={isLoaded}>Load</button>
                          <button className="btn" title="Make this the backend default feed" onClick={async () => { const ok = await setDefaultFeedOnBackend(f.feed_id); if (ok) setDefaultFeedId(f.feed_id); }} disabled={isDefault}>Default</button>
                          <button
                            className="btn"
                            title="Save CURRENT editor posts into this feed"
                            onClick={async () => {
                              const ok = await savePostsToBackend(posts, { feedId: f.feed_id, name: f.name || f.feed_id });
                              if (ok) {
                                const list = await listFeedsFromBackend();
                                const nextFeeds = Array.isArray(list) ? list : [];
                                setFeeds(nextFeeds);
                                const row = nextFeeds.find(x => x.feed_id === f.feed_id);
                                if (row) {
                                  const fresh = await loadPostsFromBackend(f.feed_id, { force: true });
                                  const arr = Array.isArray(fresh) ? fresh : [];
                                  setPosts(arr);
                                  setCachedPosts(f.feed_id, row.checksum, arr);
                                }
                                alert("Feed saved.");
                              } else {
                                alert("Failed to save feed. Please re-login and try again.");
                              }
                            }}
                          >
                            Save
                          </button>

                          {!stats && (
                            <button className="btn ghost" title="Load participant stats for this feed" onClick={() => loadStatsFor(f.feed_id)}>
                              Load stats
                            </button>
                          )}

                          <button
                            className="btn ghost danger"
                            title="Delete the entire feed (posts, participants, registry)"
                            onClick={async () => {
                              const okGo = confirm(`Delete feed "${f.name || f.feed_id}"?\n\nThis removes posts, participants, and cannot be undone.`);
                              if (!okGo) return;
                              const ok = await deleteFeedOnBackend(f.feed_id);
                              if (ok) {
                                if (f.feed_id === feedId) {
                                  const next = feeds.filter(x => x.feed_id !== f.feed_id);
                                  const nextSel = next[0] || null;
                                  setFeeds(next);
                                  if (nextSel) { await selectFeed(nextSel.feed_id); } else { setFeedId(""); setFeedName(""); setPosts([]); }
                                } else {
                                  setFeeds(prev => prev.filter(x => x.feed_id !== f.feed_id));
                                }
                                if (defaultFeedId === f.feed_id) setDefaultFeedId(null);
                                alert("Feed deleted.");
                              } else {
                                alert("Failed to delete feed. Please re-login and try again.");
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!feeds.length && (
                  <tr>
                    <td colSpan={8} className="subtle" style={{ padding: ".75rem" }}>
                      No feeds yet. Click "+ New feed" to create one, then use "Save" in the table to publish posts into it.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Participants */}
        <Section
          title="Participants"
          subtitle={<><span>Live snapshot & interaction aggregates for </span><code style={{ fontSize: ".9em" }}>{feedId}</code>{defaultFeedId === feedId && <span className="subtle"> · default</span>}</>}
          right={
            <button
              className="btn ghost danger"
              title="Delete the participants sheet for this feed (cannot be undone)"
              onClick={async () => {
                if (!feedId) return;
                const okGo = confirm(`Wipe ALL participants for feed "${feedName || feedId}"?\n\nThis deletes the sheet and cannot be undone.`);
                if (!okGo) return;
                const ok = await wipeParticipantsOnBackend(feedId);
                if (ok) { setParticipantsRefreshKey(k => k + 1); alert("Participants wiped."); }
                else { alert("Failed to wipe participants. Please re-login and try again."); onLogout?.(); }
              }}
            >
              Wipe Participants
            </button>
          }
        >
          <ParticipantsPanel key={`pp::${feedId}::${participantsRefreshKey}`} feedId={feedId} />
        </Section>

        {/* Posts */}
        <Section
          title={`Posts (${posts.length})`}
          subtitle="Curate and publish the canonical feed shown to participants."
          right={
            <>
              <button className="btn" onClick={async () => {
                const fresh = await loadPostsFromBackend(feedId, { force: true });
                const arr = Array.isArray(fresh) ? fresh : [];
                setPosts(arr);
                const row = feeds.find(f => f.feed_id === feedId);
                if (row) setCachedPosts(feedId, row.checksum, arr);
              }} title="Reload posts for this feed from backend">
                Refresh Posts
              </button>

              <ChipToggle label="Randomize feed order" checked={!!randomize} onChange={setRandomize} />
              <button className="btn" onClick={() => { const p = makeRandomPost(); setIsNew(true); setEditing(p); }} title="Generate a synthetic post">
                + Random Post
              </button>
              <button className="btn ghost" onClick={openNew}>+ Add Post</button>
              <button className="btn ghost danger" onClick={clearFeed} disabled={!posts.length} title="Delete all posts from this feed">
                Clear Feed
              </button>
            </>
          }
        >
          <div style={{ display:"grid", gap: ".75rem" }}>
            {posts.map((p) => (
              <div key={p.id} className="card" style={{ padding: ".85rem" }}>
                <div style={{ display:"flex", alignItems:"center", gap: ".75rem" }}>
                  <div className="avatar"><img className="avatar-img" alt="" src={p.avatarUrl || pravatar(7)} /></div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap: ".35rem" }}>
                      <div style={{ fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.author}</div>
                      {p.badge && <span className="badge" aria-label="verified" />}
                      <span className="subtle">· {p.time}</span>
                    </div>

                    <div className="subtle" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {p.adType === "ad" ? "Sponsored" : "Organic"} ·
                      {p.interventionType === "label" ? " False info label" : p.interventionType === "note" ? " Context note" : " No intervention"} ·
                      <span style={{ fontFamily:"monospace" }}>{p.id}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap: ".5rem" }}>
                    <button
                      className="btn ghost"
                      onClick={() => setEditing({
                        ...p,
                        avatarUrl: p.avatarMode === "random" && p.avatarRandomKind === "company"
                          ? randomAvatarByKind("company", p.id || p.author || "seed", p.author || "")
                          : p.avatarUrl
                      })}
                    >
                      Edit
                    </button>
                    <button className="btn ghost danger" onClick={() => removePost(p.id)}>Delete</button>
                  </div>
                </div>

                <div style={{ marginTop: ".5rem", color: "#374151" }}>
                  {p.text.slice(0, 180)}{p.text.length > 180 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {editing && (
        <Modal
          title={isNew ? "Add Post" : "Edit Post"}
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEditing}>{isNew ? "Add" : "Save"}</button>
            </>
          }
        >
          <div className="editor-grid">
            <div className="editor-form">
              <h4 className="section-title">Basics</h4>
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
                          : ed.avatarUrl
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
                </label>
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
                        }
                        if (m === "upload") url = "";
                        if (m === "url")    url = editing.avatarUrl || "";
                        setEditing({ ...editing, avatarMode: m, avatarUrl: url });
                      }}
                    >
                      <option value="random">Random avatar</option>
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
                        const f = e.target.files?.[0]; if (!f) return;
                        const data = await fileToDataURL(f);
                        setEditing((ed) => ({ ...ed, avatarMode: "upload", avatarUrl: data }));
                      }}
                    />
                  </label>
                )}
              </fieldset>

              <h4 className="section-title">Post Image</h4>
              <fieldset className="fieldset">
                <label>Mode
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
                    <option value="none">No image</option>
                    <option value="random">Random graphic</option>
                    <option value="upload">Upload image</option>
                    <option value="url">Direct URL</option>
                  </select>
                </label>

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
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const data = await fileToDataURL(f);
                        setEditing((ed) => ({ ...ed, imageMode: "upload", image: { alt: "Image", url: data } }));
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
              </fieldset>

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
                      editing.avatarMode === "random" && !editing.avatarUrl
                        ? randomAvatarByKind(editing.avatarRandomKind || "any", editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl)
                        : editing.avatarUrl,
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
        </Modal>
      )}
    </div>
  );
}