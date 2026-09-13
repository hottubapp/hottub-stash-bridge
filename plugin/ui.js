(function () {
  "use strict";

  const PLUGIN_ID = "hottub-bridge";
  const BRIDGE_PORT = 3099;

  function isLoopbackHost(host) {
    const h = String(host || "").toLowerCase();
    return (
      !h ||
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h === "[::1]"
    );
  }

  function deepLink(baseUrl) {
    const url = String(baseUrl || "").replace(/\/+$/, "");
    // Hot Tub accepts a raw URL query value; do not percent-encode.
    return `hottub://source?url=${url}`;
  }

  function normalizeBaseUrl(raw) {
    const value = String(raw || "").trim().replace(/\/+$/, "");
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return `http://${value}`;
  }

  async function readPluginSettingBridgeUrl() {
    try {
      const res = await fetch("/graphql", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "query { configuration { plugins(include: [\"" +
            PLUGIN_ID +
            "\"]) } }",
        }),
      });
      const json = await res.json();
      const plugins = json?.data?.configuration?.plugins || {};
      const settings = plugins[PLUGIN_ID] || {};
      return normalizeBaseUrl(settings.bridgeBaseUrl);
    } catch (_) {
      return "";
    }
  }

  function hostFromPage() {
    const host = window.location.hostname;
    if (isLoopbackHost(host)) return "";
    return host;
  }

  function discoverLanIpViaWebRtc() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        try {
          pc.close();
        } catch (_) {
          /* ignore */
        }
        resolve(value || "");
      };

      let pc;
      try {
        pc = new RTCPeerConnection({ iceServers: [] });
      } catch (_) {
        resolve("");
        return;
      }

      pc.createDataChannel("hottub");
      pc.onicecandidate = (event) => {
        if (!event || !event.candidate || !event.candidate.candidate) {
          if (event && !event.candidate) finish("");
          return;
        }
        const match = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(
          event.candidate.candidate
        );
        if (!match) return;
        const ip = match[1];
        if (isLoopbackHost(ip)) return;
        // Skip link-local / obvious non-LAN ranges used by some ICE paths
        if (ip.startsWith("169.254.")) return;
        finish(ip);
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish(""));

      setTimeout(() => finish(""), 1500);
    });
  }

  async function resolveBridgeBaseUrl() {
    const fromSettings = await readPluginSettingBridgeUrl();
    if (fromSettings && !isLoopbackHost(new URL(fromSettings).hostname)) {
      return fromSettings;
    }
    if (fromSettings && !isLoopbackHost(hostFromPage())) {
      // Setting was localhost but page is opened on LAN — rewrite host.
      const u = new URL(fromSettings);
      u.hostname = hostFromPage();
      return u.origin;
    }

    const pageHost = hostFromPage();
    if (pageHost) {
      return `http://${pageHost}:${BRIDGE_PORT}`;
    }

    const lanIp = await discoverLanIpViaWebRtc();
    if (lanIp) {
      return `http://${lanIp}:${BRIDGE_PORT}`;
    }

    // Last resort — phone cannot use this; UI will warn.
    return fromSettings || `http://127.0.0.1:${BRIDGE_PORT}`;
  }

  async function ensurePanel() {
    if (document.getElementById("hottub-bridge-panel")) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = "hottub-bridge-panel";
    panel.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:9999;max-width:360px;" +
      "background:#1a1a1a;color:#f5f5f5;border:1px solid #444;border-radius:8px;" +
      "padding:12px 14px;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.45);";

    panel.innerHTML =
      "<strong style='display:block;margin-bottom:6px;'>Hot Tub Bridge</strong>" +
      "<div style='opacity:.85;margin-bottom:8px;'>Sidecar must be running. Copy this deep link into Hot Tub:</div>" +
      "<code id='hottub-bridge-link' style='display:block;word-break:break-all;font-size:11px;" +
      "background:#111;padding:8px;border-radius:4px;margin-bottom:8px;'>Resolving LAN URL…</code>" +
      "<div id='hottub-bridge-base' style='opacity:.75;font-size:11px;margin-bottom:8px;'></div>" +
      "<div style='display:flex;gap:8px;flex-wrap:wrap;'>" +
      "<button id='hottub-bridge-copy' type='button' style='cursor:pointer;padding:6px 10px;'>Copy link</button>" +
      "<button id='hottub-bridge-hide' type='button' style='cursor:pointer;padding:6px 10px;'>Hide</button>" +
      "</div>" +
      "<div id='hottub-bridge-note' style='margin-top:8px;opacity:.7;font-size:11px;'></div>";

    document.body.appendChild(panel);

    const baseUrl = await resolveBridgeBaseUrl();
    const link = deepLink(baseUrl);
    const loopback = isLoopbackHost(new URL(baseUrl).hostname);

    panel.querySelector("#hottub-bridge-link").textContent = link;
    panel.querySelector("#hottub-bridge-base").textContent = "Bridge: " + baseUrl;
    panel.querySelector("#hottub-bridge-note").textContent = loopback
      ? "Still on localhost — open Stash via your LAN IP (http://<lan-ip>:9999) or set plugin setting Bridge base URL to http://<lan-ip>:3099, then reload."
      : "Plugin ID: " +
        PLUGIN_ID +
        ". Override anytime in Settings → Plugins → Bridge base URL.";

    panel.querySelector("#hottub-bridge-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        panel.querySelector("#hottub-bridge-copy").textContent = "Copied";
      } catch (_) {
        window.prompt("Copy Hot Tub source URL", link);
      }
    });

    panel.querySelector("#hottub-bridge-hide").addEventListener("click", () => {
      panel.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensurePanel();
    });
  } else {
    ensurePanel();
  }
})();
