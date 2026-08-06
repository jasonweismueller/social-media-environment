import React, { useMemo, useState } from "react";
import { Modal, IconPillButton, IconShuffle, EmptyState, useToast } from "./ui";
import { Feed } from "../ui-posts";
import { APP } from "../utils";

const PREVIEW_NOOP = () => {};

/**
 * Full-screen (see Modal.jsx's `fullScreen` doc comment for why) preview of
 * the real participant-facing `Feed` — same component, same CSS, same
 * per-app randomization logic (`Feed` itself computes the deterministic
 * avatar/name assignment maps FB/AMZ need; IG's `PostCard` does its own
 * internally — see the "Per-app post rendering" note in CLAUDE.md), just
 * fed the admin's current in-memory `posts` array instead of a backend
 * fetch, so an unsaved draft can be previewed before publishing.
 *
 * Not disabled — clicking Like/Comment/Share behaves exactly like the real
 * feed (each is genuinely self-contained local UI state inside `PostCard`,
 * not something this preview needs to own) — but every callback the real
 * app would use to log/persist that activity is a no-op, and "Submit" just
 * shows a toast instead of hitting the backend.
 */
export function FeedPreviewModal({ posts = [], flags = {}, projectId = "", feedId = "", feedName = "", onClose }) {
  const toast = useToast();
  const [seedNonce, setSeedNonce] = useState(0);
  const runSeed = seedNonce === 0 ? "preview" : `preview-${seedNonce}`;

  const hasAnyRandomize = useMemo(() => Object.values(flags || {}).some(Boolean), [flags]);

  const handleSubmit = () => {
    toast.success("Preview complete — no data was recorded.");
  };

  return (
    <Modal
      title="Feed preview"
      subtitle={feedName || feedId || "Untitled feed"}
      onClose={onClose}
      fullScreen
    >
      {hasAnyRandomize && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            justifyContent: "center",
            padding: "10px 0",
            background: "var(--admin-surface-alt)",
            borderBottom: "1px solid var(--admin-border-subtle)",
          }}
        >
          <IconPillButton
            onClick={() => setSeedNonce((n) => n + 1)}
            title="Re-shuffle randomized avatars/images/names/times with a new seed"
          >
            <IconShuffle size={15} />
          </IconPillButton>
        </div>
      )}

      {posts.length === 0 ? (
        <div style={{ padding: 40 }}>
          <EmptyState
            title="Nothing to preview yet"
            message="Add at least one post to see the participant view."
          />
        </div>
      ) : (
        <Feed
          posts={posts}
          registerViewRef={PREVIEW_NOOP}
          disabled={false}
          log={PREVIEW_NOOP}
          flags={flags}
          runSeed={runSeed}
          app={APP}
          projectId={projectId}
          feedId={feedId}
          participantSeed="preview"
          onDisplayedPostSnapshot={PREVIEW_NOOP}
          onSubmit={handleSubmit}
        />
      )}
    </Modal>
  );
}
