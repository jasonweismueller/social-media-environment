import { useEffect, useState } from "react";

// Centralized admin-side equivalent of the participant apps' own
// per-platform `useIsMobile` (duplicated across ui-core-{facebook,instagram,
// amazon,x}.jsx) — the admin never had one at all before this. 880px is the
// canonical admin "mobile shell" breakpoint (nav pattern, master-detail
// drill-down, responsive tables) — see the comment above the corresponding
// rules in tokens.css. Kept here as a single source of truth rather than
// letting each admin component hand-roll its own matchMedia call.
export const ADMIN_MOBILE_BREAKPOINT = 880;

export function useIsAdminMobile(breakpointPx = ADMIN_MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(max-width:${breakpointPx}px)`).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}
