// components-ui-ig-carousel.jsx
import React from "react";

export function IGCarousel({ items = [] }) {
  const [idx, setIdx] = React.useState(0);
  const wrap = React.useRef(null);
  const hasMany = items.length > 1;

  // Swipe (with axis-lock)
  React.useEffect(() => {
    const el = wrap.current; 
    if (!el) return;

    const state = { startX: 0, startY: 0, dx: 0, dy: 0, swiping: false, locked: null };
    const THRESH = 6;  // px to decide x vs y
    const SNAP = 40;   // px to change slide

    const onStart = (x, y) => {
      state.startX = x;
      state.startY = y;
      state.dx = 0;
      state.dy = 0;
      state.swiping = true;
      state.locked = null;
    };

    const onMove = (x, y, e) => {
      if (!state.swiping) return;
      state.dx = x - state.startX;
      state.dy = y - state.startY;

      if (!state.locked) {
        if (Math.abs(state.dx) > THRESH || Math.abs(state.dy) > THRESH) {
          state.locked = Math.abs(state.dx) > Math.abs(state.dy) ? "x" : "y";
        }
      }
      // If we locked horizontal, stop vertical page scroll
      if (state.locked === "x" && e?.preventDefault) e.preventDefault();
    };

    const onEnd = () => {
      if (!state.swiping) return;
      state.swiping = false;

      if (Math.abs(state.dx) > SNAP) {
        const dir = state.dx < 0 ? 1 : -1;
        setIdx(i => Math.min(items.length - 1, Math.max(0, i + dir)));
      }
    };

    // Touch
    const touchStart = (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    };
    const touchMove  = (e) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY, e); // e.preventDefault when locked='x'
    };
    const touchEnd   = () => onEnd();

    // Mouse
    const mouseDown  = (e) => { onStart(e.clientX, e.clientY); e.preventDefault(); };
    const mouseMove  = (e) => onMove(e.clientX, e.clientY);
    const mouseUp    = () => onEnd();
    const mouseLeave = () => onEnd();

    el.addEventListener("touchstart", touchStart, { passive: true });
    // IMPORTANT: passive:false so preventDefault works on iOS
    el.addEventListener("touchmove",  touchMove,  { passive: false });
    el.addEventListener("touchend",   touchEnd);
    el.addEventListener("touchcancel",touchEnd);

    el.addEventListener("mousedown",  mouseDown);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("mouseup",   mouseUp);
    el.addEventListener("mouseleave", mouseLeave);

    return () => {
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove",  touchMove);
      el.removeEventListener("touchend",   touchEnd);
      el.removeEventListener("touchcancel",touchEnd);

      el.removeEventListener("mousedown",  mouseDown);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup",   mouseUp);
      el.removeEventListener("mouseleave", mouseLeave);
    };
  }, [items.length]);

  // Keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(items.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  return (
    <div
      className="igcar-wrap"
      ref={wrap}
      aria-roledescription="carousel"
      // helps browsers understand gesture direction
      style={{ touchAction: "pan-x", overscrollBehavior: "contain" }}
    >
      <div className="igcar-track" style={{ transform:`translateX(-${idx * 100}%)` }}>
        {items.map((it, i) => (
          <div className="igcar-slide" key={i} aria-hidden={i !== idx}>
            <img
              className="igcar-img"
              src={it.url}
              alt={it.alt || ""}
              loading={i <= 1 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>

      {hasMany && (
  <>
    {/* mobile count pill */}
    <div
      className="igcar-count"
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      {idx + 1} / {items.length}
    </div>

    <button className="igcar-arrow left"  onClick={() => setIdx(i => Math.max(0, i-1))} aria-label="Previous" />
    <button className="igcar-arrow right" onClick={() => setIdx(i => Math.min(items.length-1, i+1))} aria-label="Next" />
    <div className="igcar-dots">
      {items.map((_, i) => (
        <button key={i} className={`dot ${i===idx?"on":""}`} onClick={() => setIdx(i)} aria-label={`Slide ${i+1}`} />
      ))}
    </div>
  </>
)}
    </div>
  );
}