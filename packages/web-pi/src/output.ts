import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatSize,
  type TruncationResult,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

export interface PreparedFetchOutput {
  /** Model-visible output: the kept Markdown followed by the truncation notice. */
  text: string;
  /** The notice appended to `text`, absent when nothing was truncated. */
  notice?: string;
  truncation: TruncationResult;
  fullOutputPath?: string;
}

function tempFilePath(): string {
  const id = randomBytes(8).toString("hex");
  return join(tmpdir(), `pi-web-fetch-${id}.md`);
}

function firstLineOf(markdown: string): string {
  const end = markdown.indexOf("\n");
  return end === -1 ? markdown : markdown.slice(0, end);
}

function truncationNotice(
  truncation: TruncationResult,
  markdown: string,
  fullOutputPath: string,
): string {
  const limit = formatSize(truncation.maxBytes);
  if (truncation.firstLineExceedsLimit) {
    const lineSize = formatSize(
      Buffer.byteLength(firstLineOf(markdown), "utf-8"),
    );
    return `[Line 1 is ${lineSize}, exceeds ${limit} limit. Full output: ${fullOutputPath}]`;
  }
  const byteLimit =
    truncation.truncatedBy === "bytes" ? ` (${limit} limit)` : "";
  return `[Showing lines 1-${truncation.outputLines} of ${truncation.totalLines}${byteLimit}. Full output: ${fullOutputPath}]`;
}

/** Remove the trailing notice from model-visible text, for display in the TUI. */
export function stripTruncationNotice(text: string, notice?: string): string {
  if (!notice || !text.endsWith(notice)) return text;
  return text.slice(0, -notice.length).trimEnd();
}

export async function prepareFetchOutput(
  markdown: string,
): Promise<PreparedFetchOutput> {
  const truncation = truncateHead(markdown);
  if (!truncation.truncated) {
    return { text: truncation.content, truncation };
  }

  const fullOutputPath = tempFilePath();
  await writeFile(fullOutputPath, markdown, "utf8");

  const notice = truncationNotice(truncation, markdown, fullOutputPath);
  return {
    text: truncation.content ? `${truncation.content}\n\n${notice}` : notice,
    notice,
    truncation,
    fullOutputPath,
  };
}
