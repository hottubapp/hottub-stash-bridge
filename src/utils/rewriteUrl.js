"use strict";

const { URL } = require("node:url");

function isLoopbackHost(host) {
  const h = String(host || "").toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0"
  );
}

/**
 * Rewrite Stash media URLs so phones can reach them.
 * Rewrites loopback AND the internal Stash host (e.g. Docker DNS `stash`)
 * to STASH_PUBLIC_URL when set.
 */
function rewriteStashUrl(rawUrl, stashUrl, publicBase) {
  if (!rawUrl || !publicBase) {
    return rawUrl;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl, stashUrl);
  } catch {
    return rawUrl;
  }

  let stashHost = "";
  try {
    stashHost = new URL(stashUrl).hostname.toLowerCase();
  } catch {
    stashHost = "";
  }

  let publicParsed;
  try {
    publicParsed = new URL(publicBase);
  } catch {
    return parsed.toString();
  }

  const host = parsed.hostname.toLowerCase();
  const isInternalStashHost =
    isLoopbackHost(host) || (stashHost && host === stashHost);

  if (!isInternalStashHost) {
    return parsed.toString();
  }

  parsed.protocol = publicParsed.protocol;
  parsed.host = publicParsed.host;
  return parsed.toString();
}

/**
 * Append apikey query param when Stash paths need it and the URL lacks one.
 */
function ensureApiKeyQuery(rawUrl, apiKey) {
  if (!rawUrl || !apiKey) {
    return rawUrl;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", apiKey);
  }
  return parsed.toString();
}

module.exports = { rewriteStashUrl, ensureApiKeyQuery, isLoopbackHost };
