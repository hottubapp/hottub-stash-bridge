"use strict";

const { rewriteStashUrl, ensureApiKeyQuery } = require("../utils/rewriteUrl");

function primaryFile(scene) {
  return scene?.files?.[0] || null;
}

function sceneTitle(scene) {
  if (scene?.title) return scene.title;
  const file = primaryFile(scene);
  if (file?.basename) return file.basename;
  if (file?.path) {
    const parts = String(file.path).split(/[/\\]/);
    return parts[parts.length - 1] || `Scene ${scene.id}`;
  }
  return `Scene ${scene?.id ?? "unknown"}`;
}

function mediaUrl(raw, { stashUrl, stashPublicUrl, stashApiKey }) {
  const rewritten = rewriteStashUrl(raw, stashUrl, stashPublicUrl || stashUrl);
  return ensureApiKeyQuery(rewritten, stashApiKey);
}

/** Instant Stash markers have no `end_seconds`; heatmap spans must be non-zero to paint. */
const POINT_MARKER_SPAN_SECONDS = 1;

function markerLabel(marker) {
  const title = typeof marker?.title === "string" ? marker.title.trim() : "";
  if (title) return title;
  const tag = marker?.primary_tag?.name;
  if (typeof tag === "string") {
    const trimmed = tag.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Map Stash scene markers to Hot Tub `heatmap[]` (scrub chapters).
 * Range markers keep `seconds`…`end_seconds`; point markers become a 1s labeled span.
 */
function mapSceneMarkersToHeatmap(scene) {
  const markers = Array.isArray(scene?.scene_markers) ? scene.scene_markers : [];
  if (!markers.length) return undefined;

  const fileDuration = Number(primaryFile(scene)?.duration);
  const duration = Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : null;

  const heatmap = [];
  for (const marker of markers) {
    const start = Number(marker?.seconds);
    if (!Number.isFinite(start) || start < 0) continue;

    const rawEnd = Number(marker?.end_seconds);
    let end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + POINT_MARKER_SPAN_SECONDS;

    let lo = start;
    let hi = end;
    if (duration != null) {
      lo = Math.min(lo, duration);
      hi = Math.min(hi, duration);
      if (hi <= lo) {
        lo = Math.max(0, hi - POINT_MARKER_SPAN_SECONDS);
      }
    }
    if (!(hi > lo)) continue;

    const segment = { start_seconds: lo, end_seconds: hi };
    const label = markerLabel(marker);
    if (label) segment.label = label;
    heatmap.push(segment);
  }

  heatmap.sort((a, b) => a.start_seconds - b.start_seconds);
  return heatmap.length ? heatmap : undefined;
}

function mapFormats(scene, opts) {
  const file = primaryFile(scene);
  const stream = scene?.paths?.stream;
  if (!stream) {
    return [];
  }

  const height = file?.height || undefined;
  const url = mediaUrl(stream, opts);
  return [
    {
      url,
      formatId: height ? `mp4-${height}` : "mp4",
      height,
      ext: "mp4",
      quality: height || undefined,
    },
  ];
}

/**
 * Map a Stash scene to a Hot Tub video leaf.
 * @param {object} scene
 * @param {{ stashUrl: string, stashPublicUrl?: string, stashApiKey?: string, channelId?: string }} opts
 */
function mapSceneToVideo(scene, opts) {
  const channelId = opts.channelId || "stash";
  const file = primaryFile(scene);
  const duration = Math.round(Number(file?.duration) || 0);
  const width = file?.width || 0;
  const height = file?.height || 0;
  const studio = scene?.studio;
  const primaryPerformer = scene?.performers?.[0];

  // Prefer studio as "uploader" when present; else first performer.
  const uploaderName = studio?.name || primaryPerformer?.name || null;
  const uploaderId = studio
    ? `studio-${studio.id}`
    : primaryPerformer
      ? `performer-${primaryPerformer.id}`
      : null;
  const uploaderAvatar = studio?.image_path || primaryPerformer?.image_path || null;

  const thumb = scene?.paths?.screenshot
    ? mediaUrl(scene.paths.screenshot, opts)
    : null;
  const preview = scene?.paths?.preview
    ? mediaUrl(scene.paths.preview, opts)
    : null;

  const watchUrl = `${opts.stashPublicUrl || opts.stashUrl}/scenes/${scene.id}`;
  const formats = mapFormats(scene, opts);

  const video = {
    id: `stash-${scene.id}`,
    title: sceneTitle(scene),
    url: watchUrl,
    duration,
    channel: channelId,
    thumb: thumb || "",
    preview: preview || null,
    views: scene.play_count ?? undefined,
    rating: scene.rating100 ?? undefined,
    uploader: uploaderName || undefined,
    uploaderId: uploaderId || undefined,
    tags: (scene.tags || []).map((t) => t.name).filter(Boolean),
    categories: studio?.name ? [studio.name] : [],
    uploadedAt: scene.date || undefined,
    aspectRatio: width && height ? Number((width / height).toFixed(3)) : undefined,
    playbackMethod: "formats",
    formats,
    // Local library streams are direct files — allow offline download in Hot Tub.
    downloadable: true,
  };

  const heatmap = mapSceneMarkersToHeatmap(scene);
  if (heatmap) video.heatmap = heatmap;

  if (uploaderId && uploaderName) {
    video.uploaderProfile = {
      id: uploaderId,
      name: uploaderName,
      avatar: uploaderAvatar ? mediaUrl(uploaderAvatar, opts) : undefined,
      videoCount: studio?.scene_count ?? primaryPerformer?.scene_count ?? undefined,
      type: studio ? "studio" : "performer",
    };
  }

  return video;
}

module.exports = { mapSceneToVideo, sceneTitle, mapFormats, primaryFile };
