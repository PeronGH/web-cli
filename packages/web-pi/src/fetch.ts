import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
  type Theme,
  type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { fetchAsMarkdown } from "@peron_js/web-cli";
import { Type } from "typebox";
import { prepareFetchOutput, stripTruncationNotice } from "./output.ts";
import { expandHint, resultText } from "./render.ts";

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
  notice?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

/** The bracketed status line shown below the result, mirroring pi's own tools. */
function statusLine(
  { truncation, fullOutputPath }: FetchDetails,
  theme: Theme,
): string | undefined {
  const parts: string[] = [];
  if (fullOutputPath) parts.push(`Full output: ${fullOutputPath}`);
  if (truncation) {
    const limit = formatSize(truncation.maxBytes);
    if (truncation.firstLineExceedsLimit) {
      parts.push(`First line exceeds ${limit} limit`);
    } else if (truncation.truncatedBy === "lines") {
      parts.push(
        `Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`,
      );
    } else {
      parts.push(
        `Truncated: ${truncation.outputLines} lines shown (${limit} limit)`,
      );
    }
  }
  if (parts.length === 0) return undefined;
  return theme.fg("warning", `[${parts.join(". ")}]`);
}

export const webFetchTool = defineTool<typeof Params, FetchDetails>({
  name: "web_fetch",
  label: "Web Fetch",
  description: `Fetch a URL and return its content as Markdown. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file.`,
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
    const { text, notice, truncation, fullOutputPath } =
      await prepareFetchOutput(markdown);
    return {
      content: [{ type: "text", text }],
      details: {
        url: params.url,
        lines: truncation.outputLines,
        bytes: truncation.outputBytes,
        notice,
        truncation: truncation.truncated ? truncation : undefined,
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

    const { lines, bytes, notice } = result.details;
    let text = theme.fg(
      "success",
      `${lines} line${lines === 1 ? "" : "s"} · ${formatSize(bytes)}`,
    );
    if (!expanded) text += expandHint(theme);

    const body = expanded
      ? stripTruncationNotice(resultText(result), notice)
      : "";
    if (body) {
      for (const line of body.split("\n")) {
        text += `\n${theme.fg("toolOutput", line)}`;
      }
    }

    const status = statusLine(result.details, theme);
    if (status) text += `\n${status}`;
    return new Text(text, 0, 0);
  },
});
