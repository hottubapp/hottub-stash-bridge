"use strict";

const Fastify = require("fastify");
const { config } = require("./config");
const { StashClient } = require("./stash/client");
const { createStatusHandler } = require("./routes/status");
const {
  createVideosHandler,
  createVideoByIdHandler,
  createVideoDetailsBatchHandler,
} = require("./routes/videos");
const { createUploadersHandler } = require("./routes/uploaders");

function createApp(overrides = {}) {
  const cfg = { ...config, ...overrides.config };
  const stash =
    overrides.stash ||
    new StashClient({
      stashUrl: cfg.stashUrl,
      stashApiKey: cfg.stashApiKey,
    });

  const fastify = Fastify({
    logger: overrides.logger ?? true,
    extraDefaultContentTypes: ["text/json"],
  });

  if (cfg.bridgeBearerToken) {
    fastify.addHook("onRequest", async (request, reply) => {
      if (request.url === "/" || request.method === "OPTIONS") {
        return;
      }
      const header = request.headers.authorization || "";
      const expected = `Bearer ${cfg.bridgeBearerToken}`;
      if (header !== expected) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });
  }

  const getStatus = createStatusHandler({ config: cfg, stash });
  const getVideos = createVideosHandler({ config: cfg, stash });
  const getVideoById = createVideoByIdHandler({ config: cfg, stash });
  const postVideoDetails = createVideoDetailsBatchHandler({ config: cfg, stash });
  const getUploaders = createUploadersHandler({ config: cfg, stash });

  // Required Hot Tub compatible source routes
  fastify.post("/api/status", getStatus);
  fastify.post("/api/videos", getVideos);
  fastify.post("/api/videos/details", postVideoDetails);
  fastify.post("/api/uploaders", getUploaders);
  fastify.get("/api/videos/:id", getVideoById);

  // Convenience
  fastify.get("/api/status", getStatus);
  fastify.get("/", async () => ({
    status: "ok",
    service: "hottub-stash-bridge",
    sourceId: cfg.source.id,
    stashUrl: cfg.stashUrl,
  }));

  return { fastify, config: cfg, stash };
}

async function start() {
  const { fastify, config: cfg } = createApp();
  try {
    await fastify.listen({ port: cfg.port, host: cfg.host });
    fastify.log.info(
      `Stash → Hot Tub bridge listening on ${cfg.host}:${cfg.port} (stash=${cfg.stashUrl})`
    );
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
