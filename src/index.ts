#!/usr/bin/env node
import { type ArgsDef, type CommandDef, defineCommand, runMain } from "citty";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { description, version } from "../package.json";
import { fetchCommand } from "./commands/fetch.ts";
import { searchCommand } from "./commands/search.ts";

// Route fetch through HTTP_PROXY / HTTPS_PROXY, honoring NO_PROXY.
setGlobalDispatcher(new EnvHttpProxyAgent());

// citty renders a runtime error thrown from `run` as the whole Error object,
// stack trace and all. Print just the message and exit non-zero instead;
// argument errors keep citty's own usage-and-message rendering.
function withErrorHandling<T extends ArgsDef>(
  command: CommandDef<T>,
): CommandDef<T> {
  const { run } = command;
  if (!run) return command;
  return {
    ...command,
    run: async (context) => {
      try {
        return await run(context);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    },
  };
}

export const main = defineCommand({
  meta: { name: "web", version, description },
  subCommands: {
    search: withErrorHandling(searchCommand),
    fetch: withErrorHandling(fetchCommand),
  },
});

runMain(main);
