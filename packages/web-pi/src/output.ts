import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

export interface PreparedFetchOutput {
  text: string;
  truncation: TruncationResult;
  fullOutputPath?: string;
}

function tempFilePath(): string {
  const id = randomBytes(8).toString("hex");
  return join(tmpdir(), `pi-web-fetch-${id}.md`);
}

export async function prepareFetchOutput(
  markdown: string,
): Promise<PreparedFetchOutput> {
  const truncation = truncateHead(markdown, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!truncation.truncated) {
    return { text: truncation.content, truncation };
  }

  const fullOutputPath = tempFilePath();
  await writeFile(fullOutputPath, markdown, "utf8");

  const notice = `[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output: ${fullOutputPath}. Continue reading from line ${truncation.outputLines + 1}.]`;
  return {
    text: truncation.content ? `${truncation.content}\n\n${notice}` : notice,
    truncation,
    fullOutputPath,
  };
}
