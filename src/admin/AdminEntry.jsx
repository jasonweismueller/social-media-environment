import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./components-admin-login";
import { AdminDashboard } from "./components-admin-dashboard";
import { AdminProjectPicker } from "./AdminProjectPicker";
import { AdminPlatformPicker } from "./AdminPlatformPicker";
import { AdminUsersPage } from "./components-admin-users";

/**
 * Owns the whole `/admin/*` sub-tree: login gate, then
 * projects -> platform -> dashboard. Mounted identically by all three
 * App-*.jsx files (which otherwise near-duplicate each other, see
 * CLAUDE.md) so this branching logic exists in exactly one place instead of
 * three.
 */
export function AdminEntry({ adminAuthed, onAuth, currentApp, ...dashboardProps }) {
  if (!adminAuthed) return <AdminLogin onAuth={onAuth} />;

  return (
    <Routes>
      <Route index element={<AdminProjectPicker />} />
      <Route path="users" element={<AdminUsersPage />} />
      <Route path="platform" element={<AdminPlatformPicker currentApp={currentApp} />} />
      <Route path="dashboard/*" element={<AdminDashboard {...dashboardProps} />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default AdminEntry;
