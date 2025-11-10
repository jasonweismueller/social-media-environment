// components/ui-core/index.js
import * as FB from "./ui-core-facebook";
import * as IG from "./ui-core-instagram";
import { getApp } from "../utils/utils-backend";

const app = (typeof window !== "undefined" ? getApp() : "fb");

export const {
  IconLike,
  IconThumb,
  IconComment,
  IconShare,
  IconDots,
  IconLogo,
  IconInfo,
  IconUsers,
  IconBadge,
  IconGlobe,
  IconVolume,
  IconVolumeMute,
  IconSettings,
  ActionBtn,
  SkeletonFeed,
  PostText,
  Modal,
  NamesPeek,
  neutralAvatarDataUrl,
  ParticipantOverlay,
  LoadingOverlay,
  ThankYouOverlay,
  RouteAwareTopbar,
  TopRailPlaceholder,
} = app === "ig" ? IG : FB;