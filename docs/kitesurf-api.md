# Kitesurf API

[Kitesurf](https://kitesurf.cloudflare.app) is Cloudflare's stateless headless
browser running on Workers. `fetchHtml()` in
[`core/http.ts`](../packages/web-cli/src/core/http.ts) sends every page fetch
through its `/html` endpoint, so we get the serialized post-JavaScript DOM
instead of the transferred bytes.

The playground is undocumented beyond
[the announcement](https://blog.cloudflare.com/kitesurf); what follows was
verified against the live service on 2026-08-17. Its request schema is the one
documented for Cloudflare's
[Browser Rendering REST API](https://developers.cloudflare.com/browser-rendering/rest-api/content-endpoint/),
whose `/content` endpoint `/html` mirrors.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /html?url=<encoded>` | Serialized DOM after JavaScript runs |
| `GET /screenshot?url=<encoded>` | PNG of the rendered page |
| `GET /pdf?url=<encoded>` | PDF of the rendered page |
| `GET /?url=<encoded>` | 302 to the bundled Chrome DevTools frontend |
| `GET /json/version`, `GET /json/list` | Standard CDP discovery documents |
| `wss://…/devtools/browser` | CDP browser target |
| `wss://…/devtools/page/kitesurf` | CDP page target, accepts `?initialUrl=` |

Only `https:` URLs are accepted; `http:`, `data:`, `file:` and `javascript:` are
rejected.

## Request schema

`GET` reads a single `url` query parameter and ignores everything else. `POST`
with `content-type: application/json` takes the full schema below. The body is
validated strictly — an unknown key fails the request rather than being ignored:

```json
{ "error": "invalid_body", "message": "Request body failed schema validation.",
  "issues": [{ "path": "(root)", "message": "Unrecognized key: \"timeout\"",
               "code": "unrecognized_keys" }] }
```

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | One of `url` or `html` is required |
| `html` | string | Markup to render instead of navigating; only read on `POST` |
| `userAgent` | string | Replaces the browser's own User-Agent at the origin |
| `setExtraHTTPHeaders` | record | Extra request headers, sent to the origin |
| `authenticate` | object | HTTP basic credentials |
| `cookies` | array | Cookies to seed before navigating |
| `viewport` | object | Viewport dimensions and scale |
| `gotoOptions` | object | Navigation options, including `waitUntil` and `timeout` |
| `waitForSelector` | object | Wait for a selector before serializing |
| `addScriptTag` | array | Scripts injected into the page |
| `addStyleTag` | array | Stylesheets injected into the page |
| `emulateMediaType` | string | e.g. `print` |
| `rejectResourceTypes` | array | Skip loading e.g. `image`, `font`, `media` |
| `allowResourceTypes` | array | Inverse of `rejectResourceTypes` |
| `rejectRequestPattern` | array | Skip requests matching patterns |
| `allowRequestPattern` | array | Inverse of `rejectRequestPattern` |
| `bestAttempt` | boolean | Serialize what loaded instead of failing |

Verifying that JavaScript really runs, and that the header fields reach the
origin:

```bash
curl -X POST -H 'content-type: application/json' \
  -d '{"html":"<p id=x>before</p><script>x.textContent=\"after\"</script>"}' \
  https://kitesurf.cloudflare.app/html
# → <html><head></head><body><p id="x">after</p>…

curl -X POST -H 'content-type: application/json' \
  -d '{"url":"https://httpbingo.org/headers","userAgent":"curl/8.7.1"}' \
  https://kitesurf.cloudflare.app/html
# → "User-Agent": ["curl/8.7.1"]
```

## Responses

`/html` answers `200 text/html` whenever it managed to load a page, whatever the
origin returned, so **upstream status codes are invisible**: a 404 comes back as
the markdown of the 404 page, and a DNS failure as Cloudflare's error page
(`error code: 1016`). Non-HTML targets come back through the browser's plaintext
viewer, wrapped in `<pre>` — a fetched `.md` file arrives intact but framed as a
code block.

Kitesurf's own failures are `400 text/plain` for a malformed or missing `url`,
`400 application/json` for a body that fails validation, and a plaintext
rate-limit notice (`Whoa, you're overpowered! 🪁 …`) when requests come too
fast. The playground allows 20s of CPU and 60s of wall-clock per navigation.

## Identity at the origin

Kitesurf announces itself: requests carry `Cf-Worker: kitesurf.cloudflare.app`
and a [Web Bot Auth](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/)
ed25519 signature in `Signature` / `Signature-Agent`. Origins can therefore
allowlist it cryptographically — or block it as a declared bot.

## Driving it as a browser

`/json/version` reports `Kitesurf/0.0.1`, CDP 1.3, V8 12.0 and a Chrome/145
User-Agent, so any CDP client works without a local Chrome or an API token:

```bash
npx -y chrome-devtools-mcp@latest --wsEndpoint=wss://kitesurf.cloudflare.app/devtools/browser
```

## What web-cli uses

`fetchHtml()` sends `GET /html?url=…` and nothing else. Fields worth reaching
for later: `userAgent` would fold the Anubis curl retry back into Kitesurf
instead of a second, direct fetch; `rejectResourceTypes` would cut wall-clock on
image-heavy pages; `waitForSelector` and `gotoOptions.waitUntil` would make
slow-hydrating pages deterministic.
