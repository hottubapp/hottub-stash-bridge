"use strict";

const { mapSceneToVideo } = require("../mappers/video");
const { resolveSort } = require("../mappers/status");
const { FIND_SCENES, FIND_SCENE } = require("../stash/queries");

const MAX_VIDEOS_PER_DETAILS_REQUEST = 50;

function mediaOpts(config) {
  return {
    stashUrl: config.stashUrl,
    stashPublicUrl: config.stashPublicUrl,
    stashApiKey: config.stashApiKey,
    channelId: config.channelId,
  };
}

/**
 * Resolve a Stash scene id from a Hot Tub batch slot (`stash-{id}` / bare id / `/scenes/{id}` URL).
 * @param {{ id?: unknown, url?: unknown }} slot
 * @returns {string|null}
 */
function resolveSceneIdFromDetailsSlot(slot = {}) {
  const rawId = typeof slot.id === "string" ? slot.id.trim() : slot.id != null ? String(slot.id).trim() : "";
  const stripped = rawId.replace(/^stash-/i, "");
  if (/^\d+$/.test(stripped)) {
    return stripped;
  }

  const url = typeof slot.url === "string" ? slot.url.trim() : "";
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname || "";
    const match = pathname.match(/\/scenes\/(\d+)(?:\/|$)/i);
    if (match) return match[1];
  } catch {
    const match = url.match(/\/scenes\/(\d+)(?:\/|$|\?|#)/i);
    if (match) return match[1];
  }
  return null;
}

function buildSceneFilter(body = {}) {
  const sceneFilter = {};

  const tag = body.tag;
  if (tag && tag !== "any") {
    sceneFilter.tags = {
      value: [String(tag)],
      modifier: "INCLUDES",
    };
  }

  if (body.studio_only === "yes") {
    sceneFilter.studios = {
      modifier: "NOT_NULL",
    };
  }

  const performer = body.performer;
  if (performer && performer !== "any") {
    sceneFilter.performers = {
      value: [String(performer)],
      modifier: "INCLUDES",
    };
  }

  const studio = body.studio;
  if (studio && studio !== "any") {
    sceneFilter.studios = {
      value: [String(studio)],
      modifier: "INCLUDES",
    };
  }

  return Object.keys(sceneFilter).length ? sceneFilter : undefined;
}

function createVideosHandler({ config, stash }) {
  return async function getVideos(request, reply) {
    const body = request.body || {};
    const page = Math.max(1, Number(body.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(body.pageSize ?? body.perPage ?? body.limit) || 36)
    );
    const sort = resolveSort(body.sort || "date");

    try {
      const data = await stash.graphql(FIND_SCENES, {
        filter: {
          q: body.query || undefined,
          page,
          per_page: pageSize,
          sort: sort.stashSort,
          direction: sort.direction,
        },
        scene_filter: buildSceneFilter(body),
      });

      const result = data?.findScenes || { count: 0, scenes: [] };
      const scenes = result.scenes || [];
      const count = result.count || 0;
      const items = scenes.map((scene) => mapSceneToVideo(scene, mediaOpts(config)));
      const hasNextPage = page * pageSize < count;

      return {
        pageInfo: {
          hasNextPage,
          parameters: {
            totalResults: String(count),
            currentPage: String(page),
            pageSize: String(pageSize),
          },
          error: items.length === 0 ? "No results were found" : null,
        },
        items,
      };
    } catch (err) {
      reply.log.error({ err }, "findScenes failed");
      return reply.code(502).send({
        pageInfo: {
          hasNextPage: false,
          error: err.message || "Failed to query Stash",
        },
        items: [],
      });
    }
  };
}

function createVideoByIdHandler({ config, stash }) {
  return async function getVideoById(request, reply) {
    const rawId = request.params.id;
    const sceneId = String(rawId || "").replace(/^stash-/i, "");
    if (!sceneId) {
      return reply.code(400).send({ error: "Missing video id" });
    }

    try {
      const data = await stash.graphql(FIND_SCENE, { id: sceneId });
      const scene = data?.findScene;
      if (!scene) {
        return reply.code(404).send({ error: "Video not found" });
      }
      return mapSceneToVideo(scene, mediaOpts(config));
    } catch (err) {
      reply.log.error({ err }, "findScene failed");
      return reply.code(502).send({ error: err.message || "Failed to query Stash" });
    }
  };
}

/**
 * POST /api/videos/details — batch metadata refresh used by Hot Tub library recovery.
 * Request: `{ "videos": [ { "id", "url" }, ... ] }`
 * Response: JSON array aligned with request order (video + reconciliation hints, or `{ request_id, url?, error }`).
 */
function createVideoDetailsBatchHandler({ config, stash }) {
  return async function postVideoDetailsBatch(request, reply) {
    const body = request.body || {};
    const videos = body.videos;
    if (!Array.isArray(videos) || videos.length === 0) {
      return reply.code(400).send({ error: "videos must be a non-empty array" });
    }
    if (videos.length > MAX_VIDEOS_PER_DETAILS_REQUEST) {
      return reply
        .code(400)
        .send({ error: `At most ${MAX_VIDEOS_PER_DETAILS_REQUEST} videos per request` });
    }

    const opts = mediaOpts(config);
    const out = [];

    for (let i = 0; i < videos.length; i += 1) {
      const slot = videos[i];
      if (slot === null || typeof slot !== "object" || Array.isArray(slot)) {
        return reply.code(400).send({ error: `videos[${i}] must be an object` });
      }

      const requestId =
        typeof slot.id === "string" ? slot.id.trim() : slot.id != null ? String(slot.id).trim() : "";
      const url = typeof slot.url === "string" ? slot.url.trim() : "";
      if (!requestId) {
        return reply.code(400).send({ error: `videos[${i}].id is required` });
      }

      const sceneId = resolveSceneIdFromDetailsSlot(slot);
      if (!sceneId) {
        out.push({
          request_id: requestId,
          ...(url ? { url } : {}),
          error: "not_found",
        });
        continue;
      }

      try {
        const data = await stash.graphql(FIND_SCENE, { id: sceneId });
        const scene = data?.findScene;
        if (!scene) {
          out.push({
            request_id: requestId,
            ...(url ? { url } : {}),
            error: "not_found",
          });
          continue;
        }

        const video = mapSceneToVideo(scene, opts);
        const shaped = { ...video };
        shaped.request_id = requestId;
        shaped.provided_id = requestId;
        shaped.reconciled_id = video.id;
        if (url && typeof video.url === "string" && video.url !== url) {
          shaped.canonical_url = video.url;
        }
        out.push(shaped);
      } catch (err) {
        reply.log.error({ err, sceneId, requestId }, "batch findScene failed");
        out.push({
          request_id: requestId,
          ...(url ? { url } : {}),
          error: "not_found",
        });
      }
    }

    return out;
  };
}

module.exports = {
  createVideosHandler,
  createVideoByIdHandler,
  createVideoDetailsBatchHandler,
  buildSceneFilter,
  resolveSceneIdFromDetailsSlot,
  MAX_VIDEOS_PER_DETAILS_REQUEST,
};
