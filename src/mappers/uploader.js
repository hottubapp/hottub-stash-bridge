"use strict";

const { rewriteStashUrl, ensureApiKeyQuery } = require("../utils/rewriteUrl");

function mediaUrl(raw, { stashUrl, stashPublicUrl, stashApiKey }) {
  const rewritten = rewriteStashUrl(raw, stashUrl, stashPublicUrl || stashUrl);
  return ensureApiKeyQuery(rewritten, stashApiKey);
}

/**
 * Map a Stash performer to a Hot Tub uploader profile.
 */
function mapPerformerToUploader(performer, opts, videos = undefined) {
  if (!performer) return null;
  const result = {
    id: `performer-${performer.id}`,
    name: performer.name,
    type: "performer",
    channel: opts.channelId || "stash",
    url: `${opts.stashPublicUrl || opts.stashUrl}/performers/${performer.id}`,
    avatar: performer.image_path
      ? mediaUrl(performer.image_path, opts)
      : undefined,
    description: performer.details || undefined,
    bio: performer.details || undefined,
    videoCount: performer.scene_count ?? undefined,
    verified: Boolean(performer.favorite),
  };
  if (videos) {
    result.videos = videos;
    result.layout = [
      { type: "horizontal", title: "Scenes", videoIds: videos.map((v) => v.id) },
      { type: "videos", title: null },
    ];
  }
  return result;
}

/**
 * Map a Stash studio to a Hot Tub uploader profile (type: studio).
 */
function mapStudioToUploader(studio, opts, videos = undefined) {
  if (!studio) return null;
  const result = {
    id: `studio-${studio.id}`,
    name: studio.name,
    type: "studio",
    channel: opts.channelId || "stash",
    url: studio.url || `${opts.stashPublicUrl || opts.stashUrl}/studios/${studio.id}`,
    avatar: studio.image_path ? mediaUrl(studio.image_path, opts) : undefined,
    description: studio.details || undefined,
    bio: studio.details || undefined,
    videoCount: studio.scene_count ?? undefined,
  };
  if (videos) {
    result.videos = videos;
    result.layout = [
      { type: "horizontal", title: "Scenes", videoIds: videos.map((v) => v.id) },
      { type: "videos", title: null },
    ];
  }
  return result;
}

/**
 * Parse Hot Tub uploaderId (`performer-12` / `studio-3`) into stash entity.
 */
function parseUploaderId(uploaderId) {
  if (!uploaderId || typeof uploaderId !== "string") {
    return null;
  }
  const match = /^(performer|studio)-(.+)$/.exec(uploaderId);
  if (!match) return null;
  return { kind: match[1], id: match[2] };
}

module.exports = {
  mapPerformerToUploader,
  mapStudioToUploader,
  parseUploaderId,
};
