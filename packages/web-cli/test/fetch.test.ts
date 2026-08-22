import { afterAll, beforeAll, expect, test } from "bun:test";
import { fetchAsMarkdown } from "../src/core/fetch.ts";

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let requestHeaders: Headers | undefined;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/html") {
        requestHeaders = request.headers;
        return new Response("<main>direct page</main>", {
          headers: { "Content-Type": "text/html" },
        });
      }
      if (pathname === "/text") {
        return new Response("`literal`", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (pathname === "/binary") {
        return new Response(new Uint8Array([0, 1, 2]), {
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  baseUrl = server.url.toString();
});

afterAll(() => {
  server.stop(true);
});

test("direct fetch requests the target with browser navigation headers", async () => {
  const markdown = await fetchAsMarkdown(`${baseUrl}html`, {
    direct: true,
    raw: true,
  });

  expect(markdown).toBe("direct page");
  expect(requestHeaders?.get("user-agent")).toStartWith("Mozilla/5.0");
  expect(requestHeaders?.get("accept")).toContain("text/html");
  expect(requestHeaders?.get("sec-fetch-mode")).toBe("navigate");
});

test("direct fetch returns textual non-HTML responses verbatim", async () => {
  expect(await fetchAsMarkdown(`${baseUrl}text`, { direct: true })).toBe(
    "`literal`",
  );
});

test("direct fetch rejects binary responses", async () => {
  expect(fetchAsMarkdown(`${baseUrl}binary`, { direct: true })).rejects.toThrow(
    "content is binary (application/octet-stream)",
  );
});
