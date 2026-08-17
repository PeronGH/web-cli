import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import { DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { prepareFetchOutput } from "../src/output.ts";

describe("prepareFetchOutput", () => {
  test("returns short output without creating a file", async () => {
    const result = await prepareFetchOutput("# Small page\n\nContent");

    expect(result.text).toBe("# Small page\n\nContent");
    expect(result.truncation.truncated).toBe(false);
    expect(result.fullOutputPath).toBeUndefined();
  });

  test("saves the full output when truncating", async () => {
    const markdown = Array.from(
      { length: DEFAULT_MAX_LINES + 1 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");
    const result = await prepareFetchOutput(markdown);
    const fullOutputPath = result.fullOutputPath;

    expect(result.truncation.truncated).toBe(true);
    expect(fullOutputPath).toBeDefined();
    if (!fullOutputPath) throw new Error("Missing full output path");

    try {
      expect(basename(fullOutputPath)).toMatch(
        /^pi-web-fetch-[0-9a-f]{16}\.md$/,
      );
      expect(await Bun.file(fullOutputPath).text()).toBe(markdown);
      expect(result.text).toContain(`Full output: ${fullOutputPath}`);
    } finally {
      await Bun.file(fullOutputPath).delete();
    }
  });
});
