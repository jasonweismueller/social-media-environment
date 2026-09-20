import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./components-admin-login";
import AdminSetPassword from "./AdminSetPassword";
import { AdminDashboard } from "./components-admin-dashboard";
import { AdminProjectPicker } from "./AdminProjectPicker";
import { AdminPlatformPicker } from "./AdminPlatformPicker";
import { AdminUsersPage } from "./components-admin-users";
import { ToastProvider, ConfirmProvider, PromptProvider, ErrorBoundary } from "./ui";
import { isPendingAuthRedirect, startAdminSessionSync } from "../utils";

/**
 * Owns the whole `/admin/*` sub-tree: login gate, then
 * projects -> platform -> dashboard. Mounted identically by all three
 * App-*.jsx files (which otherwise near-duplicate each other, see
 * CLAUDE.md) so this branching logic exists in exactly one place instead of
 * three. Also the single place the Toast/Confirm/Prompt providers are
 * mounted, so every admin surface (including AdminUsersPage, which lives
 * outside AdminShell) can call useToast()/useConfirm()/usePrompt().
 */
export function AdminEntry({ adminAuthed, adminRestoring = false, onAuth, currentApp, onLogout, ...dashboardProps }) {
  // Keep this app's own copy of the access token + expiry in step with the
  // Supabase SDK's silent refresh for EVERY admin page (the project picker,
  // platform picker and Users page have no keep-alive of their own, so without
  // this they'd lapse ~1h after login even though the SDK renewed the token).
  useEffect(() => startAdminSessionSync(), []);

  // A freshly-clicked invite/recovery email link always takes priority over
  // the normal login gate, even if adminAuthed happens to already be true
  // (e.g. a "reset your password" link opened in a tab that was already
  // signed in) — the recipient explicitly asked to (re)set a password.
  if (isPendingAuthRedirect()) return <AdminSetPassword onAuth={onAuth} />;
  // Still checking whether a lapsed local session can be silently renewed from
  // the SDK's refresh token — render nothing rather than flash the login form.
  if (!adminAuthed && adminRestoring) return null;
  if (!adminAuthed) return <AdminLogin onAuth={onAuth} />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <PromptProvider>
          <Routes>
            <Route
              index
              element={
                <ErrorBoundary label="The project list crashed">
                  <AdminProjectPicker onLogout={onLogout} />
                </ErrorBoundary>
              }
            />
            <Route
              path="users"
              element={
                <ErrorBoundary label="The users page crashed">
                  <AdminUsersPage onLogout={onLogout} />
                </ErrorBoundary>
              }
            />
            <Route
              path="platform"
              element={
                <ErrorBoundary label="The platform picker crashed">
                  <AdminPlatformPicker currentApp={currentApp} onLogout={onLogout} />
                </ErrorBoundary>
              }
            />
            <Route
              path="dashboard/*"
              element={
                <ErrorBoundary label="The admin dashboard crashed">
                  <AdminDashboard {...dashboardProps} onLogout={onLogout} />
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </PromptProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default AdminEntry;
