"use strict";

class StashClient {
  /**
   * @param {{ stashUrl: string, stashApiKey?: string, fetchImpl?: typeof fetch }} opts
   */
  constructor({ stashUrl, stashApiKey = "", fetchImpl = fetch }) {
    this.stashUrl = stashUrl.replace(/\/+$/, "");
    this.stashApiKey = stashApiKey;
    this.fetchImpl = fetchImpl;
  }

  async graphql(query, variables = {}) {
    const headers = {
      "Content-Type": "application/json",
    };
    if (this.stashApiKey) {
      headers.ApiKey = this.stashApiKey;
    }

    const response = await this.fetchImpl(`${this.stashUrl}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `Stash GraphQL returned non-JSON (${response.status}): ${text.slice(0, 200)}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Stash GraphQL HTTP ${response.status}: ${payload.errors?.[0]?.message || text.slice(0, 200)}`
      );
    }

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    return payload.data;
  }
}

module.exports = { StashClient };
