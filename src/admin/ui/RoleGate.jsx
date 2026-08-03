import { hasAdminRole } from "../../utils";

/**
 * Promoted from a private helper in components-admin-dashboard.jsx —
 * needed by the new Feeds panel too, and duplicating a role gate across
 * files is worse than sharing it.
 */
export function RoleGate({ min = "viewer", children, elseRender = null }) {
  return hasAdminRole(min) ? children : elseRender ?? null;
}
