import { spawn } from "node:child_process";

export const HIMALAYA_MAIL_TOOL_NAME = "himalaya_mail";

const ACCOUNT = "ovgu";
const DEFAULT_MAILBOX = "INBOX";
const MAX_OUTPUT_CHARS = 200_000;
const TIMEOUT_MS = 30_000;

type MailAction = "list" | "search" | "read";

type MailArgs = {
  action?: MailAction;
  mailbox?: string;
  query?: string;
  id?: string;
  page?: number;
  pageSize?: number;
};

export type HimalayaRunResult = {
  code: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
};

type HimalayaRunner = (args: string[], signal?: AbortSignal) => Promise<HimalayaRunResult>;

function appendOutput(current: string, chunk: Buffer | string): string {
  if (current.length >= MAX_OUTPUT_CHARS) return current;
  return `${current}${chunk.toString()}`.slice(0, MAX_OUTPUT_CHARS);
}

export function runHimalaya(args: string[], signal?: AbortSignal): Promise<HimalayaRunResult> {
  return new Promise((resolve) => {
    const child = spawn("himalaya", args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (result: HimalayaRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      child.kill();
      finish({ code: null, stdout, stderr: `${stderr}\nHimalaya command aborted.`.trim() });
    };

    child.stdout?.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });
    child.once("error", (error) => {
      finish({ code: null, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.once("close", (code, childSignal) => {
      finish({ code, signal: childSignal ?? undefined, stdout, stderr });
    });

    timer = setTimeout(() => {
      child.kill();
      finish({ code: null, stdout, stderr: `${stderr}\nHimalaya command timed out.`.trim() });
    }, TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function validText(value: unknown, name: string, maxLength = 200): string | null {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return `${name} must be a non-empty text value without control characters.`;
  }
  if (value.trimStart().startsWith("-")) return `${name} cannot start with '-'.`;
  return null;
}

function buildArgs(args: MailArgs): { args?: string[]; error?: string } {
  const action = args.action;
  if (action !== "list" && action !== "search" && action !== "read") {
    return { error: "action must be one of: list, search, read." };
  }

  const mailbox = args.mailbox?.trim() || DEFAULT_MAILBOX;
  const mailboxError = validText(mailbox, "mailbox");
  if (mailboxError) return { error: mailboxError };

  const command = ["--account", ACCOUNT, "--json", "--log-level", "off", "envelope"];
  if (action === "list") {
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      return { error: "page must be an integer from 1 to 10000." };
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return { error: "pageSize must be an integer from 1 to 100." };
    }
    return {
      args: [
        ...command,
        "list",
        "--mailbox",
        mailbox,
        "--page",
        String(page),
        "--page-size",
        String(pageSize),
      ],
    };
  }

  if (action === "search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const queryError = validText(query, "query", 500);
    if (queryError) return { error: queryError };
    return {
      args: [...command, "search", "--mailbox", mailbox, "--", ...query.split(/\s+/)],
    };
  }

  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!/^\d{1,20}$/.test(id)) return { error: "id must be a numeric message ID." };
  return {
    args: [
      "--account",
      ACCOUNT,
      "--json",
      "--log-level",
      "off",
      "message",
      "read",
      "--mailbox",
      mailbox,
      id,
    ],
  };
}

export function createHimalayaMailTool(options: { run?: HimalayaRunner } = {}) {
  const run = options.run ?? runHimalaya;
  return {
    name: HIMALAYA_MAIL_TOOL_NAME,
    description: "Read and search the OVGU student mailbox through Himalaya. Read-only.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "search", "read"] },
        mailbox: { type: "string", description: "Mailbox name. Defaults to INBOX." },
        query: { type: "string", description: "Himalaya envelope search query. Required for search." },
        id: { type: "string", description: "Numeric message ID. Required for read." },
        page: { type: "integer", minimum: 1, maximum: 10000 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["action"],
    },
    execute: async (_toolCallId: string, input: MailArgs, signal?: AbortSignal) => {
      const built = buildArgs(input ?? {});
      if (built.error) return textResult(built.error, { error: "invalid_arguments" });

      const result = await run(built.args!, signal);
      if (result.code !== 0) {
        const error = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
        return textResult(error || "Himalaya command failed.", {
          action: input.action,
          error: "himalaya_failed",
          exitCode: result.code,
        });
      }

      let data: unknown = result.stdout.trim();
      try {
        data = JSON.parse(result.stdout);
      } catch {
        data = result.stdout.trim();
      }
      const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return textResult(text, { action: input.action, account: ACCOUNT, data });
    },
  };
}

export function registerHimalayaMailTool(api: any, logger: { warn: (message: string) => void }): void {
  if (typeof api?.registerTool !== "function") {
    logger.warn("[mail-runtime] registerTool unavailable; Himalaya mail tool not registered.");
    return;
  }
  api.registerTool(createHimalayaMailTool());
}
