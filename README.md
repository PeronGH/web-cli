# web-cli

A CLI to search and fetch the web, plus the same tools for the [pi](https://pi.dev) coding agent.

| Package | Description |
| --- | --- |
| [`@peron_js/web-cli`](packages/web-cli) | The `web` CLI and the library it is built on |
| [`@peron_js/web-pi`](packages/web-pi) | Pi package exposing `web_search` and `web_fetch` tools |

The CLI owns argument parsing and printing; the library exports `search()` and
`fetchContent()`. The pi package is a thin adapter over that library, so
installing the CLI never pulls in pi, and installing the pi package never pulls
in the CLI's argument parser.

## Development

```bash
bun install
bun run build       # bundles the CLI bin and the library entry
bun run lint
bun run typecheck
bun run bump        # bump both packages and sync lockfile versions; defaults to patch
```

Pass `minor`, `major`, or an explicit version to `bun run bump` to override the patch bump. The script synchronizes lockfile versions so Bun packs `workspace:*` dependencies at the new version.

Try the pi tools from the checkout (requires `bun run build` first, because pi
resolves the library through its Node entry):

```bash
pi -e packages/web-pi/extensions/index.ts
```
