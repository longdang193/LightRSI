import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type SkillBridgeStyle = "claude" | "codex";

type InstallCommandSkillBridgeParams = {
  adapterRoot: string;
  skillsDir: string;
  host: "codex" | "claude-code";
  style: SkillBridgeStyle;
};

type SkillSpec = {
  name: string;
  description: string;
  commandArgs: string[];
};

const READ_ONLY_SKILLS: SkillSpec[] = [
  {
    name: "lightrsi-status",
    description: "Show the current LightRSI runtime status for this host. Only use when explicitly invoked.",
    commandArgs: ["status"],
  },
  {
    name: "lightrsi-report",
    description: "Show the current LightRSI savings report for this host. Only use when explicitly invoked.",
    commandArgs: ["report"],
  },
  {
    name: "lightrsi-doctor",
    description: "Run the LightRSI doctor for this host and report installation or runtime drift. Only use when explicitly invoked.",
    commandArgs: ["doctor"],
  },
  {
    name: "lightrsi-visual",
    description: "Show the current LightRSI text-mode session visual for this host. Only use when explicitly invoked.",
    commandArgs: ["visual"],
  },
];

const LEGACY_SKILL_NAMES = [
  "lightmem2-status",
  "lightmem2-report",
  "lightmem2-doctor",
  "lightmem2-visual",
];

function cliDistPathFromAdapterRoot(adapterRoot: string): string {
  const bundledPath = resolve(adapterRoot, "dist", "lightrsi.js");
  if (existsSync(bundledPath)) return bundledPath;
  return resolve(adapterRoot, "..", "..", "products", "cli", "dist", "cli.js");
}

function shellCommand(cliPath: string, host: string, commandArgs: string[]): string {
  const argv = [process.execPath, cliPath, host, ...commandArgs];
  return argv.map((value) => JSON.stringify(value)).join(" ");
}

function skillMarkdown(params: {
  style: SkillBridgeStyle;
  spec: SkillSpec;
  host: "codex" | "claude-code";
  cliCommand: string;
}): string {
  const commandText = `lightrsi ${params.host} ${params.spec.commandArgs.join(" ")}`;
  const body = [
    `Run the local LightRSI command surface for ${params.host} and return the output.`,
    "",
    "Execution rules:",
    "1. Prefer the installed CLI command if it exists:",
    `   ${commandText}`,
    "2. If `lightrsi` is unavailable in PATH, run this exact fallback command instead:",
    `   ${params.cliCommand}`,
    "3. Return the command output in a fenced code block.",
    "4. If the command fails, briefly explain the failure and include the stderr text.",
    "",
    "Do not modify configuration in this skill. This bridge is read-only.",
  ].join("\n");

  if (params.style === "claude") {
    return [
      "---",
      `name: ${params.spec.name}`,
      `description: ${params.spec.description}`,
      "disable-model-invocation: true",
      "allowed-tools: Bash(lightrsi *) Bash(node *)",
      "---",
      "",
      body,
      "",
    ].join("\n");
  }

  return [
    "---",
    `name: ${params.spec.name}`,
    `description: ${params.spec.description}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

function codexSkillPolicyYaml(): string {
  return [
    "policy:",
    "  allow_implicit_invocation: false",
    "",
  ].join("\n");
}

export async function installCommandSkillBridge(
  params: InstallCommandSkillBridgeParams,
): Promise<{ skillsDir: string; skillNames: string[] }> {
  const cliPath = cliDistPathFromAdapterRoot(params.adapterRoot);
  await mkdir(params.skillsDir, { recursive: true });

  for (const legacySkillName of LEGACY_SKILL_NAMES) {
    await rm(join(params.skillsDir, legacySkillName), { recursive: true, force: true });
  }

  for (const spec of READ_ONLY_SKILLS) {
    await rm(join(params.skillsDir, spec.name.replace(/^lightrsi-/, "lightmem2-")), {
      recursive: true,
      force: true,
    });
    const skillDir = join(params.skillsDir, spec.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), skillMarkdown({
      style: params.style,
      spec,
      host: params.host,
      cliCommand: shellCommand(cliPath, params.host, spec.commandArgs),
    }), "utf8");

    if (params.style === "codex") {
      const agentsDir = join(skillDir, "agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(join(agentsDir, "openai.yaml"), codexSkillPolicyYaml(), "utf8");
    }
  }

  return {
    skillsDir: params.skillsDir,
    skillNames: READ_ONLY_SKILLS.map((spec) => spec.name),
  };
}

export function defaultCodexSkillBridgeDir(codexHomeDir: string): string {
  return join(codexHomeDir, "skills");
}

export function defaultClaudeCodeSkillBridgeDir(settingsPath: string): string {
  return join(dirname(settingsPath), "skills");
}
