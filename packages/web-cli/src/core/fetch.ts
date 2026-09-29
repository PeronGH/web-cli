import {
  fetchHtml,
  fetchPageAsCurl,
  fetchPageDirect,
  type Page,
  type RequestOptions,
} from "./http.ts";
import { htmlToMarkdown as builtinHtmlToMarkdown } from "./markdown.ts";
import { rewriteUrl } from "./rewrite.ts";

// A missing content type is treated as HTML, matching how browsers sniff pages.
function isHtml(contentType: string): boolean {
  return (
    contentType === "" ||
    contentType.startsWith("text/html") ||
    contentType.startsWith("application/xhtml+xml")
  );
}

// Servers often send PDFs as application/octet-stream, so trust the magic bytes
// too.
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function isPdf(page: Page): boolean {
  return (
    page.contentType.startsWith("application/pdf") ||
    PDF_MAGIC.every((byte, i) => page.body[i] === byte)
  );
}

// Detect binary content by inspecting the decoded bytes rather than maintaining
// a list of MIME types: NUL never occurs in text, and many replacement chars
// indicate that the response wasn't valid UTF-8.
function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;

  let replacements = 0;
  for (const char of text) {
    if (char === "\uFFFD") replacements++;
  }
  return replacements > text.length * 0.1;
}

// Outer bound on the network work, above Kitesurf's own render cap so a render
// that lands just under it still gets through.
const FETCH_TIMEOUT_MS = 60_000;

// Anubis serves a proof-of-work interstitial carrying a `<script
// id="anubis_challenge">` payload instead of the page. Matching the raw markup
// spares a DOM parse of a page that gets thrown away; requiring a real `<script`
// tag keeps escaped mentions in page text from matching.
const ANUBIS_CHALLENGE = /<script\b[^>]*\bid=["']?anubis_challenge["'\s>]/i;

function isAnubisChallenge(html: string): boolean {
  return ANUBIS_CHALLENGE.test(html);
}

/**
 * How a page is fetched: `default` fetches directly as a browser and retries as
 * curl past an Anubis challenge, `curl` fetches directly as curl only, and
 * `renderer` renders the page in a headless browser.
 */
export type FetchAs = "default" | "curl" | "renderer";

export interface FetchOptions {
  /** Render the page in a headless browser instead of fetching it directly. */
  render?: boolean;
  /** Convert the whole page instead of extracting the main content. */
  raw?: boolean;
}

/** What a converter learns about the document it converts. */
export interface ConvertContext {
  /** Final URL of the document after redirects. */
  url: string;
  /** Aborts when the fetch is cancelled or times out. */
  signal: AbortSignal;
}

/** Convert an HTML page to Markdown; `raw` asks for the whole page. */
export type HtmlToMarkdown = (
  html: string,
  context: ConvertContext & { raw?: boolean },
) => string | Promise<string>;

/** Convert a PDF document to Markdown. */
export type PdfToMarkdown = (
  pdf: Uint8Array,
  context: ConvertContext,
) => string | Promise<string>;

export interface FetchContentOptions extends RequestOptions {
  /** Converts web pages. Defaults to the built-in `htmlToMarkdown`. */
  htmlToMarkdown?: HtmlToMarkdown;
  /** Converts PDFs. Without it, PDFs are rejected as binary. */
  pdfToMarkdown?: PdfToMarkdown;
}

/**
 * What a fetch returns: text is Markdown for web pages and the body itself for
 * other text, and an image is the bytes as served.
 */
export type FetchedContent =
  | { type: "text"; text: string }
  | { type: "image"; data: Uint8Array; mimeType: string };

// SVG is XML, so it stays text.
function imageMimeType(contentType: string): string | undefined {
  const mimeType = contentType.split(";")[0]?.trim() ?? "";
  return mimeType.startsWith("image/") && mimeType !== "image/svg+xml"
    ? mimeType
    : undefined;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function nonHtmlContent(url: string, page: Page): FetchedContent {
  const mimeType = imageMimeType(page.contentType);
  if (mimeType) return { type: "image", data: page.body, mimeType };

  const text = decode(page.body);
  if (looksBinary(text)) {
    throw new Error(
      `Cannot fetch ${url}: content is binary (${page.contentType}). Download it with curl instead.`,
    );
  }
  return { type: "text", text };
}

/** Fetch a URL and return web pages as Markdown, other text as is, and images as bytes. */
export async function fetchContent(
  target: string,
  options: FetchOptions = {},
  {
    fetch,
    signal,
    htmlToMarkdown = builtinHtmlToMarkdown,
    pdfToMarkdown,
  }: FetchContentOptions = {},
): Promise<FetchedContent> {
  const { url, fetchAs = options.render ? "renderer" : "default" } =
    rewriteUrl(target);
  const { raw = false } = options;
  // One deadline for the whole fetch: the Anubis retry is a second round trip
  // and must not get a fresh budget.
  const deadline = AbortSignal.any([
    AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ]);

  let finalUrl = url;
  let html: string;
  if (fetchAs === "renderer") {
    html = await fetchHtml(url, { signal: deadline, fetch });
  } else {
    const fetchPage = fetchAs === "curl" ? fetchPageAsCurl : fetchPageDirect;
    const page = await fetchPage(url, { signal: deadline, fetch });
    if (isPdf(page)) {
      if (!pdfToMarkdown) return nonHtmlContent(url, page);
      const context = { url: page.url, signal: deadline };
      return { type: "text", text: await pdfToMarkdown(page.body, context) };
    }
    if (!isHtml(page.contentType)) return nonHtmlContent(url, page);
    finalUrl = page.url;
    html = decode(page.body);
  }

  // Anubis only challenges browser-like clients; refetch as curl to slip past.
  if (fetchAs === "default" && isAnubisChallenge(html)) {
    const page = await fetchPageAsCurl(url, { signal: deadline, fetch });
    finalUrl = page.url;
    html = decode(page.body);
  }

  const context = { url: finalUrl, raw, signal: deadline };
  return { type: "text", text: await htmlToMarkdown(html, context) };
}
