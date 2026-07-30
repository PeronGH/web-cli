import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";

/** The text the model sees, used as the fallback view for error results. */
export function resultText(result: AgentToolResult<unknown>): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

/** Suffix inviting the user to expand a collapsed summary. */
export function expandHint(theme: Theme): string {
  return theme.fg("dim", ` ${keyHint("app.tools.expand", "to expand")}`);
}
