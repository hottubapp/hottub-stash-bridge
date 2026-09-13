# Hot Tub Stash bridge

Small Node server you run next to [Stash](https://stashapp.cc). Hot Tub talks to this server; this server talks to Stash over GraphQL.

Docs: [docs.hottubapp.io/developers/stash-bridge](https://docs.hottubapp.io/developers/stash-bridge/)

## Quick start (you already have Stash)

```bash
cp .env.example .env
# set STASH_URL, STASH_API_KEY, STASH_PUBLIC_URL (your LAN Stash URL)
npm install
npm start
```

Check it: open `http://<lan-ip>:3099/` or:

```bash
curl -X POST http://<lan-ip>:3099/api/status -H 'content-type: application/json' -d '{}'
```

Add in Hot Tub (use a LAN IP, not `127.0.0.1`):

```
hottub://source?url=http://<lan-ip>:3099
```

### Docker (bridge only)

```bash
export STASH_API_KEY=your-key
export STASH_PUBLIC_URL=http://192.168.x.x:9999
docker compose up --build -d bridge
```

## Phone must reach Stash media too

Hot Tub plays Stash stream URLs directly. If Stash hands out `http://127.0.0.1:9999/.../stream`, the phone cannot open it.

1. Make Stash reachable on your LAN (or reverse-proxy it).
2. Set `STASH_PUBLIC_URL` to that base, e.g. `http://192.168.1.10:9999`.
3. Open a rewritten stream URL once in Safari/Chrome on the phone to confirm.

With Stash auth on, streams often include `?apikey=…`. The bridge can append that when missing. Treat those URLs like credentials on your network — keep this on LAN, or put TLS in front if you expose it further.

Keep `STASH_API_KEY` and `BRIDGE_BEARER_TOKEN` on the server only. Security reports: private GitHub advisory, or **support@hottubapp.io**.

## Environment

| Variable | Default | What it does |
|---|---|---|
| `STASH_URL` | `http://127.0.0.1:9999` | Stash URL the bridge calls for GraphQL |
| `STASH_API_KEY` | _(empty)_ | Stash `ApiKey` header |
| `STASH_PUBLIC_URL` | _(empty)_ | Rewrites loopback media URLs for phones |
| `BRIDGE_HOST` | `0.0.0.0` | Listen address |
| `BRIDGE_PORT` | `3099` | Listen port |
| `SOURCE_ID` / `SOURCE_NAME` | `stash` / `Stash` | Name shown in Hot Tub |
| `BRIDGE_BEARER_TOKEN` | _(empty)_ | If set, API routes need `Authorization: Bearer …` |

## Stash UI helper (optional)

Copy `plugin/` into Stash’s plugins folder if you want an on-screen deep-link panel. Reload plugins, set **Bridge base URL** to `http://<lan-ip>:3099` if needed, then use **Show Hot Tub source URL**.

## Never used Stash? Try the local stack

```bash
npm install
npm run dev:up
```

| | |
|---|---|
| Stash UI | http://127.0.0.1:9999 |
| Bridge | http://127.0.0.1:3099 |
| Deep link | `hottub://source?url=http://127.0.0.1:3099` |

Tear down: `npm run dev:down` (keeps `stash-data/`; delete that folder for a clean slate).

## Dev

```bash
npm test
npm run dev
```

## What this maps

| Stash | Hot Tub |
|---|---|
| Scene | Video (`stash-{id}`) |
| Stream / screenshot | `formats[].url` / `thumb` |
| Studio or performer | Uploader |
| Tags | Tags + filters |
| Markers | Heatmap (read-only) |

API details: [compatible source docs](https://docs.hottubapp.io/developers/server/). Example: [hottubapp/mock-api](https://github.com/hottubapp/mock-api).
