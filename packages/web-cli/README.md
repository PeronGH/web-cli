# @peron_js/web-cli

> [!WARNING]
> **This project is archived and no longer maintained.** Pi now supports MCP servers officially, so use [workers-webtools](https://github.com/PeronGH/workers-webtools) instead: a stateless MCP server on Cloudflare Workers that lets agents search and fetch the web.

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
import { fetchContent, formatSearchResults, search } from "@peron_js/web-cli";

const results = await search("bun workspaces", { pages: 2 });
console.log(formatSearchResults(results));
const page = await fetchContent(results[0].url, { render: true });
if (page.type === "text") console.log(page.text);
```

`fetchContent()` returns web pages as Markdown, other text as is, and images as
`{ type: "image", data, mimeType }`. Neither function prints, so they can be
embedded in other tools — see [`@peron_js/web-pi`](../web-pi). Every request
function takes an optional last argument with an `AbortSignal` and a `fetch` implementation;
without one it uses the global `fetch`. For example, to honor proxy variables:

```ts
import { EnvHttpProxyAgent, fetch } from "undici";

const dispatcher = new EnvHttpProxyAgent();
await search("bun workspaces", { pages: 2 }, {
  fetch: (url, init) => fetch(url, { ...init, dispatcher }),
  signal: AbortSignal.timeout(10_000),
});
```

`fetchContent()` also takes `htmlToMarkdown` and `pdfToMarkdown` converters in that
argument. Web pages default to the exported built-in `htmlToMarkdown`; PDFs are
rejected unless `pdfToMarkdown` is given. For example, on Cloudflare Workers with an
AI binding:

```ts
const toMarkdown = async (name: string, blob: Blob) => {
  const result = await env.AI.toMarkdown({ name, blob });
  if (result.format === "error") throw new Error(result.error);
  return result.data;
};

await fetchContent(url, {}, {
  htmlToMarkdown: (html) => toMarkdown("page.html", new Blob([html], { type: "text/html" })),
  pdfToMarkdown: (pdf) => toMarkdown("doc.pdf", new Blob([pdf], { type: "application/pdf" })),
});
```
