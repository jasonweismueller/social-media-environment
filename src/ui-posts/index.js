/// components/ui-posts/index.js

import * as FB from "./ui-posts-facebook";
import * as IG from "./ui-posts-instagram";
import * as AMZ from "./ui-posts-amazon";

import { getApp } from "../utils/utils-backend";

const app = (typeof window !== "undefined" ? getApp() : "fb");

const COMPONENTS =
  app === "ig"
    ? IG
    : app === "amz"
      ? AMZ
      : FB;

export const { Feed, PostCard } = COMPONENTS;

export default COMPONENTS;