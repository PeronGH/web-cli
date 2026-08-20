import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@earendil-works/pi-coding-agent";
import { prepareFetchOutput, stripTruncationNotice } from "../src/output.ts";

async function withFullOutput(
  markdown: string,
  assert: (
    result: Awaited<ReturnType<typeof prepareFetchOutput>>,
    fullOutputPath: string,
  ) => Promise<void> | void,
): Promise<void> {
  const result = await prepareFetchOutput(markdown);
  const fullOutputPath = result.fullOutputPath;
  expect(result.truncation.truncated).toBe(true);
  if (!fullOutputPath) throw new Error("Missing full output path");

  try {
    expect(basename(fullOutputPath)).toMatch(/^pi-web-fetch-[0-9a-f]{16}\.md$/);
    expect(await Bun.file(fullOutputPath).text()).toBe(markdown);
    await assert(result, fullOutputPath);
  } finally {
    await Bun.file(fullOutputPath).delete();
  }
}

describe("prepareFetchOutput", () => {
  test("returns short output without creating a file", async () => {
    const result = await prepareFetchOutput("# Small page\n\nContent");

    expect(result.text).toBe("# Small page\n\nContent");
    expect(result.notice).toBeUndefined();
    expect(result.truncation.truncated).toBe(false);
    expect(result.fullOutputPath).toBeUndefined();
  });

  test("reports the kept line range when the line limit is hit", async () => {
    const markdown = Array.from(
      { length: DEFAULT_MAX_LINES + 1 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");

    await withFullOutput(markdown, (result, fullOutputPath) => {
      expect(result.notice).toBe(
        `[Showing lines 1-${DEFAULT_MAX_LINES} of ${DEFAULT_MAX_LINES + 1}. Full output: ${fullOutputPath}. Continue with read(offset=${DEFAULT_MAX_LINES + 1})]`,
      );
      expect(result.text.endsWith(`\n\n${result.notice}`)).toBe(true);
    });
  });

  test("names the byte limit when bytes run out first", async () => {
    const markdown = Array.from({ length: 100 }, () => "x".repeat(1024)).join(
      "\n",
    );

    await withFullOutput(markdown, (result, fullOutputPath) => {
      expect(result.truncation.truncatedBy).toBe("bytes");
      expect(result.notice).toBe(
        `[Showing lines 1-${result.truncation.outputLines} of 100 (50.0KB limit). Full output: ${fullOutputPath}. Continue with read(offset=${result.truncation.outputLines + 1})]`,
      );
    });
  });

  test("replaces the output when the first line exceeds the byte limit", async () => {
    const markdown = `${"x".repeat(DEFAULT_MAX_BYTES + 1)}\nsecond line`;

    await withFullOutput(markdown, (result, fullOutputPath) => {
      const notice = `[Line 1 is ${((DEFAULT_MAX_BYTES + 1) / 1024).toFixed(1)}KB, exceeds 50.0KB limit. Full output: ${fullOutputPath}]`;
      expect(result.notice).toBe(notice);
      expect(result.text).toBe(notice);
    });
  });
});

describe("stripTruncationNotice", () => {
  test("removes an appended notice", () => {
    expect(stripTruncationNotice("body\n\n[notice]", "[notice]")).toBe("body");
  });

  test("keeps text that does not end with the notice", () => {
    expect(stripTruncationNotice("body", "[notice]")).toBe("body");
    expect(stripTruncationNotice("body")).toBe("body");
  });
});
