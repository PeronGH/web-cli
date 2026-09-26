# @peron_js/web-cli

[![npm](https://img.shields.io/npm/v/@peron_js/web-cli)](https://www.npmjs.com/package/@peron_js/web-cli)

A CLI to search and fetch the web.

## Install

```bash
bun install -g @peron_js/web-cli
```

## Usage

```bash
web search <query>           # search the web for a query (20 results)
web search --pages 6 <query> # fetch 6 pages of 20, i.e. all 120 results
web fetch <url>              # fetch a URL and print its main content as Markdown
web fetch --render <url>     # render it in a headless browser (slow; for JavaScript-only pages)
```

`fetch` requests the URL directly with browser navigation headers. Pass
`--render` to load the page through [Kitesurf](https://kitesurf.dev),
a headless browser on Cloudflare Workers, so client-side rendered pages work —
the fetched URL is sent to that service. See
[docs/kitesurf-api.md](../../docs/kitesurf-api.md) for the rendering API.

`search` talks to Google's Custom Search Engine endpoint directly, so it needs
no API key and no third-party search instance in between.

`search` and `fetch` honor the `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables.

Run `web --help` or `web <command> --help` for details.

## Library

```ts
import { fetchAsMarkdown, formatSearchResults, search } from "@peron_js/web-cli";

const results = await search("bun workspaces", { pages: 2 });
console.log(formatSearchResults(results));
console.log(await fetchAsMarkdown(results[0].url));
console.log(await fetchAsMarkdown(results[0].url, { render: true }));
```

Both functions return strings instead of printing, so they can be embedded in
other tools — see [`@peron_js/web-pi`](../web-pi). Every request function takes
an optional last argument with an `AbortSignal` and a `fetch` implementation;
without one it uses the global `fetch`. For example, to honor proxy variables:

```ts
import { EnvHttpProxyAgent, fetch } from "undici";

const dispatcher = new EnvHttpProxyAgent();
await search("bun workspaces", { pages: 2 }, {
  fetch: (url, init) => fetch(url, { ...init, dispatcher }),
  signal: AbortSignal.timeout(10_000),
});
```
