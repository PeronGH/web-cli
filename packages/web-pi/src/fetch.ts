import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { fetchAsMarkdown } from "@peron_js/web-cli";
import { Type } from "typebox";
import { expandHint, resultText } from "./render.ts";

// Lines of Markdown shown when the user expands the result. The full document
// went to the model; the preview only has to make it recognizable.
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
}

export const webFetchTool = defineTool<typeof Params, FetchDetails>({
  name: "web_fetch",
  label: "Web Fetch",
  description: `Fetch a URL and return its main content as Markdown. Textual non-HTML content is returned verbatim; binary content is rejected. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
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
    const truncation = truncateHead(markdown, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    });
    const text = truncation.truncated
      ? `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`
      : truncation.content;
    return {
      content: [{ type: "text", text }],
      details: {
        url: params.url,
        lines: truncation.outputLines,
        bytes: truncation.outputBytes,
        truncated: truncation.truncated,
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

    const { lines, bytes, truncated } = result.details;
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
    return new Text(text, 0, 0);
  },
});
