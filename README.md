# web-cli

[![npm](https://img.shields.io/npm/v/@peron_js/web-cli)](https://www.npmjs.com/package/@peron_js/web-cli)

A CLI to search and fetch the web.

## Install

```bash
bun install -g @peron_js/web-cli
```

## Usage

```bash
web search <query>   # search the web for a query
web fetch <url>      # fetch a URL and print its main content as Markdown
```

`fetch` honors the `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables.

Run `web --help` or `web <command> --help` for details.
