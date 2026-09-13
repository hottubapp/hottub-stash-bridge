"use strict";

require("dotenv").config({ path: [".env.local", ".env"] });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function stripTrailingSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

const config = {
  stashUrl: stripTrailingSlash(required("STASH_URL", "http://127.0.0.1:9999")),
  stashApiKey: process.env.STASH_API_KEY || "",
  stashPublicUrl: stripTrailingSlash(process.env.STASH_PUBLIC_URL || ""),
  host: process.env.BRIDGE_HOST || "0.0.0.0",
  port: Number(process.env.BRIDGE_PORT || process.env.PORT || 3099),
  source: {
    id: process.env.SOURCE_ID || "stash",
    name: process.env.SOURCE_NAME || "Stash",
    subtitle: process.env.SOURCE_SUBTITLE || "Local Stash library",
    description:
      process.env.SOURCE_DESCRIPTION ||
      "Browse and play scenes from your Stash server in Hot Tub.",
    color: process.env.SOURCE_COLOR || "#c41e3a",
  },
  bridgeBearerToken: process.env.BRIDGE_BEARER_TOKEN || "",
  channelId: "stash",
};

module.exports = { config, stripTrailingSlash };
