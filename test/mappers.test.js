"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { mapSceneToVideo } = require("../src/mappers/video");
const { buildStatus, resolveSort } = require("../src/mappers/status");
const {
  mapPerformerToUploader,
  mapStudioToUploader,
  parseUploaderId,
} = require("../src/mappers/uploader");
const { rewriteStashUrl, ensureApiKeyQuery } = require("../src/utils/rewriteUrl");
const {
  buildSceneFilter,
  resolveSceneIdFromDetailsSlot,
} = require("../src/routes/videos");

const scene = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/scene.json"), "utf8")
);
const performer = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/performer.json"), "utf8")
);

const mediaOpts = {
  stashUrl: "http://127.0.0.1:9999",
  stashPublicUrl: "http://192.168.1.10:9999",
  stashApiKey: "test-key",
  channelId: "stash",
};

describe("mapSceneToVideo", () => {
  it("maps required Hot Tub video fields with formats playback", () => {
    const video = mapSceneToVideo(scene, mediaOpts);

    assert.equal(video.id, "stash-42");
    assert.equal(video.title, "Sample Scene Title");
    assert.equal(video.channel, "stash");
    assert.equal(video.duration, 125);
    assert.equal(video.playbackMethod, "formats");
    assert.equal(video.downloadable, true);
    assert.ok(video.url.includes("/scenes/42"));
    assert.ok(!video.url.includes("/stream"));
    assert.equal(video.uploader, "Demo Studio");
    assert.equal(video.uploaderId, "studio-7");
    assert.deepEqual(video.tags, ["outdoor", "interview"]);
    assert.equal(video.formats.length, 1);
    assert.equal(video.formats[0].height, 1080);
    assert.equal(video.formats[0].formatId, "mp4-1080");
    assert.match(video.formats[0].url, /^http:\/\/192\.168\.1\.10:9999\/scene\/42\/stream/);
    assert.match(video.thumb, /^http:\/\/192\.168\.1\.10:9999\/scene\/42\/screenshot/);
    assert.deepEqual(video.heatmap, [
      { start_seconds: 5, end_seconds: 20, label: "Intro" },
      { start_seconds: 40, end_seconds: 41, label: "kiss" },
    ]);
  });

  it("omits heatmap when the scene has no markers", () => {
    const unmarked = { ...scene, scene_markers: [] };
    const video = mapSceneToVideo(unmarked, mediaOpts);
    assert.equal(video.heatmap, undefined);
  });

  it("clamps a point marker at EOF backward so the span still paints", () => {
    const eof = {
      ...scene,
      scene_markers: [
        {
          id: "9",
          title: "End",
          seconds: 125.4,
          end_seconds: null,
          primary_tag: { id: "1", name: "end" },
        },
      ],
    };
    const video = mapSceneToVideo(eof, mediaOpts);
    assert.deepEqual(video.heatmap, [
      { start_seconds: 124.4, end_seconds: 125.4, label: "End" },
    ]);
  });

  it("falls back to basename when title is missing", () => {
    const untitled = { ...scene, title: null };
    const video = mapSceneToVideo(untitled, mediaOpts);
    assert.equal(video.title, "sample.mp4");
  });
});

describe("buildStatus", () => {
  it("returns stable source identity and stash channel with sort options", () => {
    const status = buildStatus({
      source: {
        id: "stash",
        name: "Stash",
        subtitle: "Local",
        description: "Desc",
        color: "#c41e3a",
      },
      channelId: "stash",
      tags: [{ id: "1", name: "outdoor", scene_count: 3 }],
    });

    assert.equal(status.id, "stash");
    assert.equal(status.name, "Stash");
    assert.equal(status.channels.length, 1);
    assert.equal(status.channels[0].id, "stash");
    const sortOpt = status.channels[0].options.find((o) => o.id === "sort");
    assert.ok(sortOpt);
    assert.ok(sortOpt.options.some((o) => o.id === "date"));
    const tagOpt = status.channels[0].options.find((o) => o.id === "tag");
    assert.ok(tagOpt.options.some((o) => o.id === "1"));
  });
});

describe("resolveSort", () => {
  it("maps Hot Tub sort ids to Stash sort fields", () => {
    assert.equal(resolveSort("title").stashSort, "title");
    assert.equal(resolveSort("unknown").stashSort, "date");
  });
});

describe("uploaders", () => {
  it("parses performer and studio uploader ids", () => {
    assert.deepEqual(parseUploaderId("performer-9"), {
      kind: "performer",
      id: "9",
    });
    assert.deepEqual(parseUploaderId("studio-7"), { kind: "studio", id: "7" });
    assert.equal(parseUploaderId("bad"), null);
  });

  it("maps performer to Hot Tub uploader shape", () => {
    const uploader = mapPerformerToUploader(performer, mediaOpts);
    assert.equal(uploader.id, "performer-9");
    assert.equal(uploader.name, "Alex Example");
    assert.equal(uploader.type, "performer");
    assert.equal(uploader.videoCount, 5);
    assert.match(uploader.avatar, /192\.168\.1\.10/);
  });

  it("maps studio with type studio", () => {
    const uploader = mapStudioToUploader(scene.studio, mediaOpts);
    assert.equal(uploader.id, "studio-7");
    assert.equal(uploader.type, "studio");
    assert.equal(uploader.name, "Demo Studio");
  });
});

describe("resolveSceneIdFromDetailsSlot", () => {
  it("accepts stash-prefixed ids, bare ids, and /scenes/{id} URLs", () => {
    assert.equal(resolveSceneIdFromDetailsSlot({ id: "stash-42" }), "42");
    assert.equal(resolveSceneIdFromDetailsSlot({ id: "42" }), "42");
    assert.equal(
      resolveSceneIdFromDetailsSlot({
        id: "stale-client-id",
        url: "http://192.168.1.10:9999/scenes/42",
      }),
      "42"
    );
    assert.equal(resolveSceneIdFromDetailsSlot({ id: "nope", url: "https://example.com/x" }), null);
  });
});

describe("rewriteStashUrl", () => {
  it("rewrites loopback hosts to public base", () => {
    const out = rewriteStashUrl(
      "http://127.0.0.1:9999/scene/1/stream",
      "http://127.0.0.1:9999",
      "http://192.168.1.10:9999"
    );
    assert.equal(out, "http://192.168.1.10:9999/scene/1/stream");
  });

  it("rewrites docker service host to public base", () => {
    const out = rewriteStashUrl(
      "http://stash:9999/scene/1/stream",
      "http://stash:9999",
      "http://192.168.86.120:9999"
    );
    assert.equal(out, "http://192.168.86.120:9999/scene/1/stream");
  });

  it("leaves already-public URLs alone", () => {
    const out = rewriteStashUrl(
      "http://192.168.86.120:9999/scene/1/stream",
      "http://stash:9999",
      "http://192.168.86.120:9999"
    );
    assert.equal(out, "http://192.168.86.120:9999/scene/1/stream");
  });

  it("leaves unrelated hosts alone", () => {
    const out = rewriteStashUrl(
      "http://cdn.example.com/video.mp4",
      "http://stash:9999",
      "http://192.168.86.120:9999"
    );
    assert.equal(out, "http://cdn.example.com/video.mp4");
  });
});

describe("ensureApiKeyQuery", () => {
  it("appends apikey when missing", () => {
    assert.equal(
      ensureApiKeyQuery("http://host/scene/1/stream", "abc"),
      "http://host/scene/1/stream?apikey=abc"
    );
  });

  it("does not duplicate apikey", () => {
    assert.equal(
      ensureApiKeyQuery("http://host/scene/1/stream?apikey=abc", "xyz"),
      "http://host/scene/1/stream?apikey=abc"
    );
  });
});

describe("buildSceneFilter", () => {
  it("builds tag and studio filters from request body options", () => {
    assert.deepEqual(buildSceneFilter({ tag: "3" }), {
      tags: { value: ["3"], modifier: "INCLUDES" },
    });
    assert.deepEqual(buildSceneFilter({ studio_only: "yes" }), {
      studios: { modifier: "NOT_NULL" },
    });
    assert.equal(buildSceneFilter({ tag: "any" }), undefined);
  });
});
