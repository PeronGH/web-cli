import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { parse } from "jsonc-parser";

const script = join(import.meta.dir, "bump.ts");

test("bump synchronizes versions used by Bun's packed workspace dependency", async () => {
  const directory = await mkdtemp(join(tmpdir(), "web-cli-bump-"));
  try {
    await Bun.write(
      join(directory, "package.json"),
      JSON.stringify({ private: true, workspaces: ["packages/*"] }),
    );
    for (const name of ["cli", "plugin"]) {
      await Bun.write(
        join(directory, `packages/${name}/package.json`),
        JSON.stringify({
          name,
          version: "0.10.4",
          ...(name === "plugin" && { dependencies: { cli: "workspace:*" } }),
        }),
      );
    }
    await $`bun install`.cwd(directory).quiet();
    await $`bun ${script}`.cwd(directory).quiet();
    const lock = parse(await Bun.file(join(directory, "bun.lock")).text());
    for (const name of ["cli", "plugin"]) {
      expect(lock.workspaces[`packages/${name}`].version).toBe("0.10.5");
    }
    await $`bun install --frozen-lockfile`.cwd(directory).quiet();
    await $`bun pm pack --filename ${join(directory, "plugin.tgz")}`
      .cwd(join(directory, "packages/plugin"))
      .quiet();
    const packed =
      await $`tar -xOf ${join(directory, "plugin.tgz")} package/package.json`.json();
    expect(packed.version).toBe("0.10.5");
    expect(packed.dependencies.cli).toBe("0.10.5");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
