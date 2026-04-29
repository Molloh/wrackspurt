import { execa } from "execa";

export interface NotebookLmPyCliRunnerOptions {
  binary?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}

/**
 * Thin wrapper around the `notebooklm` CLI command provided by the
 * `notebooklm-py` Python package. This class only spawns the process and
 * returns stdout/stderr — all parsing logic lives in the adapter.
 */
export class NotebookLmPyCliRunner {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly env: Record<string, string | undefined>;

  constructor(options: NotebookLmPyCliRunnerOptions = {}) {
    this.binary = options.binary ?? "notebooklm";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.env = { ...process.env, PYTHONUTF8: "1", ...options.env };
  }

  async json<T = unknown>(args: string[]): Promise<T> {
    const result = await execa(this.binary, args, {
      timeout: this.timeoutMs,
      env: this.env,
    });

    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new NotebookLmCliError(
        `NotebookLM CLI returned non-JSON output for args: ${args.join(" ")}`,
        { stdout: result.stdout, stderr: result.stderr },
      );
    }
  }

  async text(args: string[]): Promise<string> {
    const result = await execa(this.binary, args, {
      timeout: this.timeoutMs,
      env: this.env,
    });
    return result.stdout;
  }
}

export class NotebookLmCliError extends Error {
  readonly stdout: string | undefined;
  readonly stderr: string | undefined;

  constructor(message: string, details?: { stdout?: string; stderr?: string }) {
    super(message);
    this.name = "NotebookLmCliError";
    this.stdout = details?.stdout;
    this.stderr = details?.stderr;
  }
}
