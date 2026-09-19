# @peron_js/web-cli

[![npm](https://img.shields.io/npm/v/@peron_js/web-cli)](https://www.npmjs.com/package/@peron_js/web-cli)

A CLI to search and fetch the web.

## Install

```bash
bun install -g @peron_js/web-cli
```

## Usage

```bash
web search <query>          # search the web for a query
web fetch <url>             # fetch a URL and print its main content as Markdown
web fetch --render <url>    # render it in a headless browser (slow; for JavaScript-only pages)
```

`fetch` requests the URL directly with browser navigation headers. Pass
`--render` to load the page through [Kitesurf](https://kitesurf.cloudflare.app),
a headless browser on Cloudflare Workers, so client-side rendered pages work —
the fetched URL is sent to that service. See
[docs/kitesurf-api.md](../../docs/kitesurf-api.md) for the rendering API.

`search` talks to Google's Custom Search Engine endpoint directly, so it needs
no API key and no third-party search instance in between. Google rate-limits
that endpoint: a `403` answer means waiting a while before searching again.

`search` and `fetch` honor the `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables.

Run `web --help` or `web <command> --help` for details.

## Library

```ts
import { fetchAsMarkdown, formatSearchResults, search } from "@peron_js/web-cli";

const results = await search("bun workspaces", { limit: 3 });
console.log(formatSearchResults(results));
console.log(await fetchAsMarkdown(results[0].url));
console.log(await fetchAsMarkdown(results[0].url, { render: true }));
```

Both functions accept an `AbortSignal` and return strings instead of printing,
so they can be embedded in other tools — see [`@peron_js/web-pi`](../web-pi).
