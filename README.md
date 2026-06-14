# web-cli

A CLI to search and fetch the web.

## Install

```bash
bun install -g web-cli
```

## Usage

```bash
web search <query>   # search the web for a query
web fetch <url>      # fetch a URL and print its main content as Markdown
```

`fetch` honors the `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables.

Run `web --help` or `web <command> --help` for details.
