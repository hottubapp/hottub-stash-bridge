"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createApp } = require("../src/index");

const scene = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/scene.json"), "utf8")
);
const performer = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/performer.json"), "utf8")
);

function mockStash() {
  return {
    async graphql(query, variables = {}) {
      if (query.includes("FindScenes")) {
        return {
          findScenes: {
            count: 1,
            scenes: [scene],
          },
        };
      }
      if (query.includes("FindScene")) {
        if (String(variables.id) === "42") {
          return { findScene: scene };
        }
        return { findScene: null };
      }
      if (query.includes("FindPerformer") && !query.includes("FindPerformers")) {
        return { findPerformer: performer };
      }
      if (query.includes("FindStudio")) {
        return { findStudio: scene.studio };
      }
      if (query.includes("FindTags")) {
        return {
          findTags: {
            count: 1,
            tags: [{ id: "1", name: "outdoor", scene_count: 3 }],
          },
        };
      }
      throw new Error(`Unexpected query: ${query.slice(0, 40)}`);
    },
  };
}

describe("HTTP contract", () => {
  let app;
  let baseUrl;

  before(async () => {
    const created = createApp({
      logger: false,
      stash: mockStash(),
      config: {
        stashUrl: "http://127.0.0.1:9999",
        stashPublicUrl: "http://192.168.1.10:9999",
        stashApiKey: "test-key",
        host: "127.0.0.1",
        port: 0,
        source: {
          id: "stash",
          name: "Stash",
          subtitle: "Local Stash library",
          description: "Test",
          color: "#c41e3a",
        },
        bridgeBearerToken: "",
        channelId: "stash",
      },
    });
    app = created.fastify;
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (app) await app.close();
  });

  it("POST /api/status returns Hot Tub source schema", async () => {
    const res = await fetch(`${baseUrl}/api/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, "stash");
    assert.equal(body.name, "Stash");
    assert.ok(Array.isArray(body.channels));
    assert.equal(body.channels[0].id, "stash");
  });

  it("POST /api/videos returns pageInfo + mapped items", async () => {
    const res = await fetch(`${baseUrl}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, pageSize: 36, sort: "date" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pageInfo.hasNextPage, false);
    // iOS PageInfo.parameters is [String: String] — numeric values break decode
    assert.equal(typeof body.pageInfo.parameters.totalResults, "string");
    assert.equal(typeof body.pageInfo.parameters.currentPage, "string");
    assert.equal(typeof body.pageInfo.parameters.pageSize, "string");
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, "stash-42");
    assert.equal(body.items[0].playbackMethod, "formats");
    assert.ok(body.items[0].formats[0].url.includes("192.168.1.10"));
    assert.equal(body.items[0].heatmap[0].label, "Intro");
    assert.equal(body.items[0].heatmap[1].label, "kiss");
    assert.equal(body.items[0].heatmap[1].end_seconds, 41);
  });

  it("GET /api/videos/:id returns a single video", async () => {
    const res = await fetch(`${baseUrl}/api/videos/stash-42`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, "stash-42");
    assert.equal(body.title, "Sample Scene Title");
    assert.equal(body.downloadable, true);
    assert.equal(body.heatmap.length, 2);
    assert.equal(body.heatmap[0].start_seconds, 5);
    assert.equal(body.heatmap[0].end_seconds, 20);
  });

  it("POST /api/videos/details refreshes by id and scene URL", async () => {
    const res = await fetch(`${baseUrl}/api/videos/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videos: [
          { id: "stash-42", url: "http://192.168.1.10:9999/scenes/42" },
          {
            id: "client-slot",
            url: "http://192.168.86.120:9999/scenes/42?x=1",
          },
          { id: "missing", url: "http://192.168.1.10:9999/scenes/999" },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 3);

    assert.equal(body[0].id, "stash-42");
    assert.equal(body[0].request_id, "stash-42");
    assert.equal(body[0].reconciled_id, "stash-42");
    assert.equal(body[0].downloadable, true);
    assert.equal(body[0].playbackMethod, "formats");
    assert.equal(body[0].heatmap[0].label, "Intro");
    assert.match(body[0].formats[0].url, /^http:\/\/192\.168\.1\.10:9999\//);

    assert.equal(body[1].id, "stash-42");
    assert.equal(body[1].request_id, "client-slot");
    assert.equal(body[1].canonical_url, "http://192.168.1.10:9999/scenes/42");

    assert.equal(body[2].error, "not_found");
    assert.equal(body[2].request_id, "missing");
  });

  it("POST /api/uploaders returns performer profile", async () => {
    const res = await fetch(`${baseUrl}/api/uploaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploaderId: "performer-9", profileContent: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, "performer-9");
    assert.equal(body.name, "Alex Example");
    assert.ok(Array.isArray(body.videos));
    assert.equal(body.videos[0].id, "stash-42");
  });

  it("POST /api/uploaders returns studio profile", async () => {
    const res = await fetch(`${baseUrl}/api/uploaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploaderId: "studio-7" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.type, "studio");
    assert.equal(body.id, "studio-7");
  });
});
