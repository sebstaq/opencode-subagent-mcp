// Fails when the version in package.json drifts from the plugin manifest,
// server.json, or the pinned npx commands. Pass a tag (v1.2.3) to also check it.
import { readFileSync } from "node:fs";

const read = (path: string): string => readFileSync(path, "utf8");
const json = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

const version = json("package.json").version as string;
const errors: string[] = [];
const expect = (label: string, actual: unknown): void => {
  if (actual !== version) errors.push(`${label}: expected ${version}, found ${String(actual)}`);
};

const plugin = json(".claude-plugin/plugin.json") as {
  version: string;
  mcpServers: Record<string, { args: string[] }>;
};
expect(".claude-plugin/plugin.json version", plugin.version);
for (const [name, server] of Object.entries(plugin.mcpServers)) {
  const pin = server.args.find((arg) => arg.startsWith("opencode-subagent-mcp@"));
  expect(`.claude-plugin/plugin.json mcpServers.${name} pin`, pin?.split("@")[1]);
}

const server = json("server.json") as { version: string; packages: { version: string }[] };
expect("server.json version", server.version);
server.packages.forEach((pkg, i) => expect(`server.json packages[${i}].version`, pkg.version));

const pins = [...read("README.md").matchAll(/opencode-subagent-mcp@(\d+\.\d+\.\d+)/g)];
if (pins.length === 0) errors.push("README.md: no pinned npx command found");
pins.forEach((match) => expect("README.md npx pin", match[1]));

const tag = process.argv[2];
if (tag !== undefined) expect("git tag", tag.replace(/^v/, ""));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`versions consistent: ${version}`);
