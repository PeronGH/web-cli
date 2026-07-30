# @peron_js/web-pi

[![npm](https://img.shields.io/npm/v/@peron_js/web-pi)](https://www.npmjs.com/package/@peron_js/web-pi)

Web search and fetch tools for the [pi](https://pi.dev) coding agent, backed by
[`@peron_js/web-cli`](../web-cli).

## Install

```bash
pi install npm:@peron_js/web-pi
```

## Tools

- `web_search` — search the web, returning a numbered Markdown list of results
- `web_fetch` — fetch a URL and return its main content as Markdown, truncated
  to 2000 lines or 50KB

Both honor the `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables
and support cancellation. In the TUI each result collapses to a one-line summary;
expand it to preview the titles or the fetched Markdown.
