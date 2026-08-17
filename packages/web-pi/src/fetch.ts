import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { fetchAsMarkdown } from "@peron_js/web-cli";
import { Type } from "typebox";
import { prepareFetchOutput } from "./output.ts";
import { expandHint, resultText } from "./render.ts";

// This only limits the expanded TUI preview; it does not further truncate the
// model-visible tool output.
const PREVIEW_LINES = 40;

const Params = Type.Object({
  url: Type.String({ description: "The URL to fetch" }),
  raw: Type.Optional(
    Type.Boolean({
      description:
        "Convert the whole page instead of extracting the main content",
    }),
  ),
});

interface FetchDetails {
  url: string;
  lines: number;
  bytes: number;
  truncated: boolean;
  fullOutputPath?: string;
}

export const webFetchTool = defineTool<typeof Params, FetchDetails>({
  name: "web_fetch",
  label: "Web Fetch",
  description: `Fetch a URL and return its content as Markdown, truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}. If truncated, full output is saved to a temporary file.`,
  promptSnippet: "Fetch a URL and read its content as Markdown",
  promptGuidelines: [
    "Use web_fetch instead of curl to read a web page, because it returns readable Markdown instead of raw HTML.",
  ],
  parameters: Params,

  async execute(_toolCallId, params, signal) {
    const markdown = await fetchAsMarkdown(params.url, {
      raw: params.raw,
      signal,
    });
    const { text, truncation, fullOutputPath } =
      await prepareFetchOutput(markdown);
    return {
      content: [{ type: "text", text }],
      details: {
        url: params.url,
        lines: truncation.outputLines,
        bytes: truncation.outputBytes,
        truncated: truncation.truncated,
        fullOutputPath,
      },
    };
  },

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("web_fetch "));
    text += theme.fg("mdLinkUrl", args.url);
    if (args.raw) text += theme.fg("dim", " --raw");
    return new Text(text, 0, 0);
  },

  renderResult(result, { expanded, isPartial }, theme, context) {
    if (isPartial) return new Text(theme.fg("muted", "Fetching…"), 0, 0);
    if (context.isError) {
      return new Text(theme.fg("error", resultText(result)), 0, 0);
    }

    const { lines, bytes, truncated, fullOutputPath } = result.details;
    let text = theme.fg(
      "success",
      `${lines} line${lines === 1 ? "" : "s"} · ${formatSize(bytes)}`,
    );
    if (truncated) text += theme.fg("warning", " (truncated)");
    if (!expanded) return new Text(text + expandHint(theme), 0, 0);

    const markdown = resultText(result).split("\n");
    for (const line of markdown.slice(0, PREVIEW_LINES)) {
      text += `\n${theme.fg("toolOutput", line)}`;
    }
    const hidden = markdown.length - PREVIEW_LINES;
    if (hidden > 0) {
      text += `\n${theme.fg("dim", `… ${hidden} more lines`)}`;
    }
    if (fullOutputPath) {
      text += `\n${theme.fg("dim", `Full output: ${fullOutputPath}`)}`;
    }
    return new Text(text, 0, 0);
  },
});
