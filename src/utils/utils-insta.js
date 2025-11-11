
/* ------------------------- Video preload helpers -------------------------- */
const DRIVE_RE = /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i;
const __videoPreloadSet = new Set();

export function injectVideoPreload(url, mime = "video/mp4") {
  if (!url || DRIVE_RE.test(url)) return;
  if (__videoPreloadSet.has(url)) return;

  const exists = Array.from(document.querySelectorAll('link[rel="preload"][as="video"]'))
    .some(l => l.href === url);
  if (exists) { __videoPreloadSet.add(url); return; }

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "video";
  link.href = url;
  link.crossOrigin = "anonymous";
  if (mime) link.type = mime;
  document.head.appendChild(link);
  __videoPreloadSet.add(url);
}

export function primeVideoCache(url) {
  if (!url || DRIVE_RE.test(url)) return;
  if (__videoPreloadSet.has(`prime:${url}`)) return;

  const v = document.createElement("video");
  v.src = url;
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.crossOrigin = "anonymous";
  try { v.load(); } catch {}
  __videoPreloadSet.add(`prime:${url}`);

  setTimeout(() => { try { v.src = ""; } catch {} }, 30000);
}

/* --- In-view autoplay hook for videos --- */
import { useEffect, useRef, useState } from "react";

export function useInViewAutoplay(threshold = 0.6, opts = {}) {
  const { startMuted = true, unmuteOnFirstGesture = true } = opts;
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  const [didUnmute, setDidUnmute] = useState(false);

  // Observe viewport visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) =>
        setInView(entry.isIntersecting && entry.intersectionRatio >= threshold),
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  // Autoplay/pause based on inView
  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (inView) {
      // Autoplay compliance
      v.muted = startMuted || !didUnmute;
      v.playsInline = true;

      v.play().catch(() => {
        // Some mobile browsers might still need a tap before play
      });
    } else {
      v.pause();
    }
  }, [inView, startMuted, didUnmute]);

  // One-time auto-unmute on first user gesture while in view
  useEffect(() => {
    if (!unmuteOnFirstGesture) return;
    let handled = false;

    const handler = () => {
      if (handled) return;
      handled = true;

      const v = ref.current;
      if (!v) return;
      if (!inView) return;

      try {
        v.muted = false;
        setDidUnmute(true);
        const p = v.play();
        if (p && typeof p.then === "function") p.catch(() => {});
      } catch (_) {}
      // remove listener after first gesture
      remove();
    };

    const events = ["pointerdown", "keydown", "touchstart", "mousedown"];
    const add = () => events.forEach(e => window.addEventListener(e, handler, { once: true }));
    const remove = () => events.forEach(e => window.removeEventListener(e, handler, { once: true }));
    add();
    return remove;
  }, [inView, unmuteOnFirstGesture]);

  return ref;
}


export async function tryEnterFullscreen(target) {
  const el = target || document.documentElement;
  try {
    if (document.fullscreenElement) return true;

    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    // Safari prefixes
    const anyEl = /** @type {*} */ (el);
    if (anyEl.webkitRequestFullscreen) {
      anyEl.webkitRequestFullscreen();
      return true;
    }
  } catch (_) {}

  // iOS <= 15: only <video> can go fullscreen programmatically
  try {
    const v = document.querySelector('video');
    const anyVid = /** @type {*} */ (v);
    if (v && anyVid?.webkitEnterFullscreen) {
      anyVid.webkitEnterFullscreen();
      return true;
    }
  } catch (_) {}

  return false;
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
    const anyDoc = /** @type {*} */ (document);
    if (anyDoc.webkitExitFullscreen) anyDoc.webkitExitFullscreen();
  } catch (_) {}
}