"use strict";

const { buildStatus } = require("../mappers/status");
const { FIND_TAGS } = require("../stash/queries");

function createStatusHandler({ config, stash }) {
  return async function getStatus(_request, reply) {
    let tags = [];
    try {
      const data = await stash.graphql(FIND_TAGS, {
        filter: { per_page: 80, sort: "scenes_count", direction: "DESC" },
      });
      tags = data?.findTags?.tags || [];
    } catch (err) {
      // Tags are optional enrichment for filter UI; status still works without them.
      requestLog(reply, err);
    }

    return buildStatus({
      source: config.source,
      channelId: config.channelId,
      tags,
    });
  };
}

function requestLog(reply, err) {
  if (reply?.log) {
    reply.log.warn({ err }, "Failed to load Stash tags for status filters");
  }
}

module.exports = { createStatusHandler };
