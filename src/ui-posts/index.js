// components/ui-posts/index.js
import * as FB from "./ui-posts-facebook";
import * as IG from "./ui-posts-instagram";
import { getApp } from "../utils/utils-backend";

const app = (typeof window !== "undefined" ? getApp() : "fb");

// Export the right Feed and PostCard components depending on app
export const { Feed, PostCard } = app === "ig" ? IG : FB;

// Optional: default export for convenience
export default app === "ig" ? IG : FB;