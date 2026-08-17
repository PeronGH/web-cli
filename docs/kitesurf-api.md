# Kitesurf API

[Kitesurf](https://kitesurf.cloudflare.app) is Cloudflare's headless browser
running on Workers. `fetchHtml()` in
[`core/http.ts`](../packages/web-cli/src/core/http.ts) sends every page fetch
through its `/html` endpoint, which returns the serialized post-JavaScript DOM.

Undocumented beyond [the announcement](https://blog.cloudflare.com/kitesurf);
everything below was verified against the live service on 2026-08-17. The request
schema is Cloudflare's
[Browser Rendering `/content`](https://developers.cloudflare.com/browser-rendering/rest-api/content-endpoint/).

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /html?url=<encoded>` | Serialized DOM after JavaScript runs |
| `GET /screenshot?url=<encoded>` | PNG of the rendered page |
| `GET /pdf?url=<encoded>` | PDF of the rendered page |
| `GET /?url=<encoded>` | 302 to the bundled Chrome DevTools frontend |
| `GET /json/version`, `GET /json/list` | CDP discovery documents |
| `wss://…/devtools/browser` | CDP browser target |
| `wss://…/devtools/page/kitesurf` | CDP page target, accepts `?initialUrl=` |

`http:` and `https:` both work — the https-only rule is the playground form's
client-side check. Other schemes give `400 unsupported protocol <scheme>: (only
http(s) allowed)`. `/json/version` reports `Kitesurf/0.0.1`, CDP
1.3, V8 12.0, Chrome/145, so any CDP client attaches without a local Chrome:

```bash
npx -y chrome-devtools-mcp@latest --wsEndpoint=wss://kitesurf.cloudflare.app/devtools/browser
```

## Request schema

`GET` reads only `url`. `POST` with `content-type: application/json` takes the
schema below, validated strictly — an unknown key fails the request:

```json
{ "error": "invalid_body", "message": "Request body failed schema validation.",
  "issues": [{ "path": "(root)", "message": "Unrecognized key: \"timeout\"",
               "code": "unrecognized_keys" }] }
```

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | One of `url` or `html` is required |
| `html` | string | Markup to render instead of navigating; `POST` only |
| `userAgent` | string | Replaces the User-Agent seen by the origin |
| `setExtraHTTPHeaders` | record | Added to the origin request |
| `authenticate` | object | |
| `cookies` | array | |
| `viewport` | object | |
| `gotoOptions` | object | Holds `waitUntil` and `timeout` |
| `waitForSelector` | object | |
| `addScriptTag`, `addStyleTag` | array | |
| `emulateMediaType` | string | |
| `rejectResourceTypes`, `allowResourceTypes` | array | |
| `rejectRequestPattern`, `allowRequestPattern` | array | |
| `bestAttempt` | boolean | |

## Responses

`/html` answers `200 text/html` whenever a page loaded, whatever the origin
returned, so **upstream status codes are invisible**: a 404 arrives as the 404
page, a DNS failure as Cloudflare's `error code: 1016` page. Non-HTML targets
arrive through the browser's plaintext viewer, wrapped in `<pre>`.

Kitesurf's own failures are `400 text/plain` for a malformed or missing `url`,
`400 application/json` for a body that fails validation, and `429 text/plain`
(`Whoa, you're overpowered! 🪁 …`) with `Retry-After: 10` when renders come too
fast — 30 concurrent renders trip it, 14 concurrent validation failures do not.
The playground allows 20s CPU and 60s wall-clock per navigation.

## Headers seen by the origin

Fixed `Accept`, `Accept-Language: en-US,en;q=0.9`, a self-referential `Referer`,
no `Sec-Fetch-*` or `sec-ch-ua`, plus Cloudflare's `Cf-Worker:
kitesurf.cloudflare.app`, `Cdn-Loop`, `Cf-Ew-Via`, `Cf-Visitor` and a
[Web Bot Auth](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/)
signature naming `cloudflare-browser-rendering-085.workers.dev`.
`setExtraHTTPHeaders` cannot overwrite the Cloudflare-injected ones.

`Cf-Worker` alone makes Anubis serve its challenge: on `git.kernel.org`, curl
headers pass, and adding that one header to the same request gets challenged.
`Signature-Agent`, `Cdn-Loop`, `Cf-Ew-Via` and `Cf-Visitor` each pass. No
combination of API fields avoids it, which is why the Anubis retry in
`fetchHtmlAsCurl()` bypasses Kitesurf entirely.

Waiting it out does not work either: Kitesurf is stateless, so Anubis renders
`Missing feature Cookies` and never runs the proof-of-work. `cookies` supplies
cookies to send, not storage to write, and does not change that verdict.
