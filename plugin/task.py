#!/usr/bin/env python3
"""Stash plugin tasks for the Hot Tub bridge companion."""

from __future__ import annotations

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse, urlunparse


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def is_loopback_host(host: str) -> bool:
    h = (host or "").lower()
    return h in {"", "localhost", "127.0.0.1", "0.0.0.0", "::1"}


def detect_lan_ip() -> str:
    """Best-effort LAN IPv4 for deep links phones can reach."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.5)
        # No packets sent; OS picks the outbound interface for this route.
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        if ip and not is_loopback_host(ip):
            return ip
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not is_loopback_host(ip) and not ip.startswith("169.254."):
                return ip
    except OSError:
        pass
    return ""


def default_bridge_base_url() -> str:
    lan = detect_lan_ip()
    if lan:
        return f"http://{lan}:3099"
    return "http://127.0.0.1:3099"


def rewrite_loopback_to_lan(base_url: str) -> str:
    parsed = urlparse(base_url)
    if not is_loopback_host(parsed.hostname or ""):
        return base_url.rstrip("/")
    lan = detect_lan_ip()
    if not lan:
        return base_url.rstrip("/")
    port = parsed.port or 3099
    return urlunparse(
        (parsed.scheme or "http", f"{lan}:{port}", "", "", "", "")
    ).rstrip("/")


def plugin_settings(payload: dict) -> dict:
    args = payload.get("args") or {}
    configured = (
        args.get("bridgeBaseUrl")
        or os.environ.get("HOTTUB_BRIDGE_URL")
        or ""
    ).rstrip("/")
    if configured:
        base = rewrite_loopback_to_lan(configured)
    else:
        base = default_bridge_base_url()
    return {
        "bridgeBaseUrl": base,
        "action": args.get("action") or "show_source_url",
    }


def deep_link(base_url: str) -> str:
    # Hot Tub accepts a raw URL query value; do not percent-encode.
    return f"hottub://source?url={base_url}"


def post_status(base_url: str) -> tuple[bool, str]:
    # Health checks can use loopback inside the Stash host even when deep link is LAN.
    candidates = [base_url]
    parsed = urlparse(base_url)
    if not is_loopback_host(parsed.hostname or ""):
        port = parsed.port or 3099
        candidates.append(f"http://127.0.0.1:{port}")

    last_error = "Bridge unreachable"
    for candidate in candidates:
        req = urllib.request.Request(
            f"{candidate}/api/status",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                data = json.loads(body) if body else {}
                name = data.get("name") or data.get("id") or "ok"
                return True, f"Bridge healthy via {candidate}: status={resp.status} source={name}"
        except urllib.error.HTTPError as exc:
            last_error = f"Bridge HTTP {exc.code}: {exc.reason}"
        except Exception as exc:  # noqa: BLE001
            last_error = f"Bridge unreachable ({candidate}): {exc}"
    return False, last_error


def main() -> None:
    payload = read_input()
    settings = plugin_settings(payload)
    base = settings["bridgeBaseUrl"]
    action = settings["action"]
    link = deep_link(base)

    if action == "health_check":
        ok, message = post_status(base)
        print(
            json.dumps(
                {
                    "error": None if ok else message,
                    "output": {
                        "ok": ok,
                        "message": message,
                        "bridgeBaseUrl": base,
                        "hottubSourceUrl": link,
                        "lanIp": detect_lan_ip(),
                    },
                }
            )
        )
        return

    ok, message = post_status(base)
    print(
        json.dumps(
            {
                "error": None,
                "output": {
                    "bridgeBaseUrl": base,
                    "hottubSourceUrl": link,
                    "lanIp": detect_lan_ip(),
                    "health": message,
                    "healthy": ok,
                    "instructions": (
                        "Open hottubSourceUrl on a device with Hot Tub. "
                        "Use the LAN URL, not 127.0.0.1. "
                        "Override with plugin setting Bridge base URL if needed."
                    ),
                },
            }
        )
    )


if __name__ == "__main__":
    main()
