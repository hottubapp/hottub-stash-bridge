"use strict";

const { mapSceneToVideo } = require("../mappers/video");
const {
  mapPerformerToUploader,
  mapStudioToUploader,
  parseUploaderId,
} = require("../mappers/uploader");
const {
  FIND_PERFORMER,
  FIND_PERFORMERS,
  FIND_STUDIO,
  FIND_SCENES,
} = require("../stash/queries");

function mediaOpts(config) {
  return {
    stashUrl: config.stashUrl,
    stashPublicUrl: config.stashPublicUrl,
    stashApiKey: config.stashApiKey,
    channelId: config.channelId,
  };
}

async function loadUploaderVideos(stash, config, sceneFilter) {
  const data = await stash.graphql(FIND_SCENES, {
    filter: {
      page: 1,
      per_page: 40,
      sort: "date",
      direction: "DESC",
    },
    scene_filter: sceneFilter,
  });
  const scenes = data?.findScenes?.scenes || [];
  return scenes.map((scene) => mapSceneToVideo(scene, mediaOpts(config)));
}

function createUploadersHandler({ config, stash }) {
  return async function getUploaders(request, reply) {
    const body = request.body || {};
    const profileContent = Boolean(body.profileContent);
    const parsed = parseUploaderId(body.uploaderId);

    try {
      if (parsed?.kind === "performer") {
        const data = await stash.graphql(FIND_PERFORMER, { id: parsed.id });
        const performer = data?.findPerformer;
        if (!performer) {
          return reply.code(404).send({ error: "Uploader not found" });
        }
        let videos;
        if (profileContent) {
          videos = await loadUploaderVideos(stash, config, {
            performers: { value: [parsed.id], modifier: "INCLUDES" },
          });
        }
        return mapPerformerToUploader(performer, mediaOpts(config), videos);
      }

      if (parsed?.kind === "studio") {
        const data = await stash.graphql(FIND_STUDIO, { id: parsed.id });
        const studio = data?.findStudio;
        if (!studio) {
          return reply.code(404).send({ error: "Uploader not found" });
        }
        let videos;
        if (profileContent) {
          videos = await loadUploaderVideos(stash, config, {
            studios: { value: [parsed.id], modifier: "INCLUDES" },
          });
        }
        return mapStudioToUploader(studio, mediaOpts(config), videos);
      }

      if (body.uploaderName) {
        const data = await stash.graphql(FIND_PERFORMERS, {
          filter: { q: body.uploaderName, per_page: 1 },
        });
        const performer = data?.findPerformers?.performers?.[0];
        if (!performer) {
          return reply.code(404).send({ error: "Uploader not found" });
        }
        let videos;
        if (profileContent) {
          videos = await loadUploaderVideos(stash, config, {
            performers: { value: [performer.id], modifier: "INCLUDES" },
          });
        }
        return mapPerformerToUploader(performer, mediaOpts(config), videos);
      }

      return reply
        .code(400)
        .send({ error: "uploaderId or uploaderName is required" });
    } catch (err) {
      reply.log.error({ err }, "uploaders failed");
      return reply
        .code(502)
        .send({ error: err.message || "Failed to query Stash" });
    }
  };
}

module.exports = { createUploadersHandler };
