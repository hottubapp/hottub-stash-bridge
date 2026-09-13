#!/usr/bin/env node
/**
 * Bootstrap a fresh Stash instance for bridge testing:
 * setup → API key → scan → tags/performers/studios → scene metadata.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STASH_URL = (process.env.STASH_URL || "http://127.0.0.1:9999").replace(
  /\/+$/,
  ""
);
const ROOT = path.join(__dirname, "..");
const ENV_LOCAL = path.join(ROOT, ".env.local");

function isLoopbackHost(host) {
  const h = String(host || "").toLowerCase();
  return (
    !h ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1"
  );
}

function detectLanIp() {
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      if (String(entry.address).startsWith("169.254.")) continue;
      if (!isLoopbackHost(entry.address)) return entry.address;
    }
  }
  return "";
}
async function gql(query, variables = {}, apiKey = "") {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.ApiKey = apiKey;

  const res = await fetch(`${STASH_URL}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON from Stash (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${payload.errors?.[0]?.message || text.slice(0, 200)}`
    );
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }
  return payload.data;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForStash(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await gql(`query { systemStatus { status } }`);
      if (data?.systemStatus?.status) {
        return data.systemStatus.status;
      }
    } catch {
      // still booting
    }
    await sleep(1500);
  }
  throw new Error(`Stash not ready at ${STASH_URL} after ${timeoutMs}ms`);
}

async function waitForIdleJobs(apiKey, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await gql(
      `query { jobQueue { id status description } }`,
      {},
      apiKey
    );
    const queue = data?.jobQueue || [];
    const busy = queue.filter(
      (j) => j.status === "RUNNING" || j.status === "READY"
    );
    if (busy.length === 0) return;
    process.stdout.write(
      `  jobs: ${busy.map((j) => j.description || j.id).join(", ")}\n`
    );
    await sleep(2000);
  }
  throw new Error("Timed out waiting for Stash jobs");
}

function writeEnvLocal(apiKey) {
  const lanIp = detectLanIp();
  const publicBase = lanIp
    ? `http://${lanIp}:9999`
    : "http://127.0.0.1:9999";
  const bridgeBase = lanIp
    ? `http://${lanIp}:3099`
    : "http://127.0.0.1:3099";
  const lines = [
    `STASH_URL=http://127.0.0.1:9999`,
    `STASH_PUBLIC_URL=${publicBase}`,
    `STASH_API_KEY=${apiKey}`,
    `BRIDGE_PORT=3099`,
    `SOURCE_NAME="Stash Dev"`,
    `HOTTUB_BRIDGE_URL=${bridgeBase}`,
    "",
  ];
  fs.writeFileSync(ENV_LOCAL, lines.join("\n"));
  console.log(`wrote ${ENV_LOCAL} (public=${publicBase}, bridge=${bridgeBase})`);
  return { lanIp, publicBase, bridgeBase };
}

async function ensureSetup() {
  const status = await waitForStash();
  console.log(`stash status: ${status}`);

  if (status === "SETUP") {
    console.log("running setup mutation…");
    await gql(
      `mutation Setup($input: SetupInput!) { setup(input: $input) }`,
      {
        input: {
          configLocation: "",
          stashes: [{ path: "/data", excludeVideo: false, excludeImage: true }],
          databaseFile: "",
          generatedLocation: "/generated",
          cacheLocation: "/cache",
          storeBlobsInDatabase: false,
          blobsLocation: "/blobs",
        },
      }
    );
    await sleep(2000);
    await waitForStash();
  }
}

async function ensureApiKey() {
  const cfg = await gql(`query { configuration { general { apiKey } } }`);
  let apiKey = cfg?.configuration?.general?.apiKey || "";
  if (!apiKey) {
    console.log("generating API key…");
    const data = await gql(`mutation { generateAPIKey(input: {}) }`);
    apiKey = data.generateAPIKey || "";
  }
  // Fresh local Stash with no username/password often returns "" from
  // generateAPIKey — GraphQL stays open without ApiKey. That is fine for
  // bridge smoke tests; set auth in the UI later if you want a key.
  if (!apiKey) {
    console.warn(
      "no API key (Stash auth disabled) — bridge will call GraphQL without ApiKey"
    );
  }
  const urls = writeEnvLocal(apiKey);
  return { apiKey, ...urls };
}

async function scanLibrary(apiKey) {
  console.log("scanning /data…");
  await gql(
    `mutation MetadataScan($input: ScanMetadataInput!) {
      metadataScan(input: $input)
    }`,
    {
      input: {
        paths: ["/data"],
        rescan: true,
        scanGenerateCovers: true,
        scanGeneratePreviews: true,
        scanGenerateSprites: false,
        scanGeneratePhashes: false,
        scanGenerateThumbnails: true,
      },
    },
    apiKey
  );
  await waitForIdleJobs(apiKey);
}

async function createOrFind(apiKey, createMutation, findQuery, name, createVars) {
  const found = await gql(findQuery, { filter: { q: name, per_page: 25 } }, apiKey);
  const listKey = Object.keys(found)[0];
  const items =
    found[listKey]?.performers ||
    found[listKey]?.studios ||
    found[listKey]?.tags ||
    [];
  const exact = items.find((i) => i.name === name);
  if (exact) return exact.id;

  const created = await gql(createMutation, createVars, apiKey);
  const createKey = Object.keys(created)[0];
  return created[createKey].id;
}

async function seedCatalog(apiKey) {
  console.log("seeding tags / performers / studios…");

  const outdoor = await createOrFind(
    apiKey,
    `mutation ($input: TagCreateInput!) { tagCreate(input: $input) { id name } }`,
    `query ($filter: FindFilterType) { findTags(filter: $filter) { tags { id name } } }`,
    "outdoor",
    { input: { name: "outdoor" } }
  );
  const interview = await createOrFind(
    apiKey,
    `mutation ($input: TagCreateInput!) { tagCreate(input: $input) { id name } }`,
    `query ($filter: FindFilterType) { findTags(filter: $filter) { tags { id name } } }`,
    "interview",
    { input: { name: "interview" } }
  );

  const performerId = await createOrFind(
    apiKey,
    `mutation ($input: PerformerCreateInput!) { performerCreate(input: $input) { id name } }`,
    `query ($filter: FindFilterType) { findPerformers(filter: $filter) { performers { id name } } }`,
    "Alex Example",
    {
      input: {
        name: "Alex Example",
        details: "Seed performer for Hot Tub bridge tests.",
      },
    }
  );

  const studioId = await createOrFind(
    apiKey,
    `mutation ($input: StudioCreateInput!) { studioCreate(input: $input) { id name } }`,
    `query ($filter: FindFilterType) { findStudios(filter: $filter) { studios { id name } } }`,
    "Demo Studio",
    {
      input: {
        name: "Demo Studio",
        details: "Seed studio for Hot Tub bridge tests.",
        url: "https://example.com/demo-studio",
      },
    }
  );

  const scenesData = await gql(
    `query {
      findScenes(filter: { per_page: 50, sort: "path" }) {
        count
        scenes {
          id
          title
          files { path basename }
        }
      }
    }`,
    {},
    apiKey
  );

  const scenes = scenesData?.findScenes?.scenes || [];
  console.log(`found ${scenes.length} scenes — applying metadata`);

  for (const scene of scenes) {
    const base = scene.files?.[0]?.basename || "";
    const input = { id: scene.id };

    if (base.includes("demo_studio")) {
      input.title = base.replace(/\.mp4$/i, "").replace(/_/g, " ");
      input.studio_id = studioId;
      input.tag_ids = [outdoor, interview];
      input.details = "Seeded Demo Studio scene.";
      input.date = "2024-06-15";
      input.rating100 = 80;
    } else if (base.includes("alex_example")) {
      input.title = base.replace(/\.mp4$/i, "").replace(/_/g, " ");
      input.performer_ids = [performerId];
      input.tag_ids = [interview];
      input.details = "Seeded Alex Example scene.";
      input.date = "2024-07-01";
      input.rating100 = 70;
    } else {
      input.title =
        base.replace(/\.mp4$/i, "").replace(/_/g, " ") || `Scene ${scene.id}`;
      input.details = "Untagged seed clip.";
      input.date = "2024-08-01";
    }

    await gql(
      `mutation ($input: SceneUpdateInput!) {
        sceneUpdate(input: $input) { id title }
      }`,
      { input },
      apiKey
    );
  }

  return { sceneCount: scenes.length, outdoor, interview, performerId, studioId };
}

async function reloadPlugins(apiKey) {
  try {
    await gql(`mutation { reloadPlugins }`, {}, apiKey);
    console.log("reloaded plugins");
  } catch (err) {
    console.warn(`reloadPlugins skipped: ${err.message}`);
  }
}

async function configureBridgePlugin(apiKey, bridgeBase) {
  try {
    await gql(
      `mutation ($plugin_id: ID!, $input: Map!) {
        configurePlugin(plugin_id: $plugin_id, input: $input)
      }`,
      {
        plugin_id: "hottub-bridge",
        input: {
          bridgeBaseUrl: bridgeBase,
          sourceDisplayName: "Stash Dev",
        },
      },
      apiKey
    );
    console.log(`plugin bridgeBaseUrl → ${bridgeBase}`);
  } catch (err) {
    console.warn(`configurePlugin skipped: ${err.message}`);
  }
}

async function main() {
  console.log(`bootstrap → ${STASH_URL}`);
  await ensureSetup();
  const { apiKey, bridgeBase, publicBase, lanIp } = await ensureApiKey();
  await scanLibrary(apiKey);
  const seeded = await seedCatalog(apiKey);
  await reloadPlugins(apiKey);
  await configureBridgePlugin(apiKey, bridgeBase);

  const check = await gql(
    `query {
      findScenes(filter: { per_page: 5 }) {
        count
        scenes { id title paths { stream screenshot } }
      }
    }`,
    {},
    apiKey
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiKeySet: Boolean(apiKey),
        lanIp,
        stashPublicUrl: publicBase,
        bridgeBaseUrl: bridgeBase,
        sceneCount: check.findScenes.count,
        sample: check.findScenes.scenes.map((s) => ({
          id: s.id,
          title: s.title,
          hasStream: Boolean(s.paths?.stream),
        })),
        seeded,
        next: [
          `Open Stash UI via LAN: ${publicBase}`,
          `Bridge: ${bridgeBase}`,
          `Hot Tub deep link: hottub://source?url=${bridgeBase}`,
        ],
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
