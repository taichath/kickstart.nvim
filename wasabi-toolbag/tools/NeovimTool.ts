// IMPORTANT: Only use node: prefixed imports for Node.js built-ins
import { exec } from "node:child_process";

interface ToolContext {
  readonly fs: typeof import("node:fs");
  readonly path: typeof import("node:path");
  readonly os: typeof import("node:os");
  readonly process: typeof import("node:process");
  readonly httpClient: {
    request<TInput = unknown, TOutput = unknown>(
      url: URL,
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD",
      options?: {
        timeout?: number;
        retryStrategy?: { maxAttempts: number; maxElapsedTime: number };
        body?: TInput;
        headers?: Record<string, string>;
        compression?: "gzip" | "br";
        doNotParse?: TOutput extends Buffer ? boolean : never;
      }
    ): Promise<{
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      body: TOutput;
    }>;
  };
  readonly rootDir: string;
  readonly validFileGlobs: string[];
  readonly excludedFileGlobs: string[];
  readonly bedrock: {
    prompt(promptParams: {
      inputs: BedrockMessage[];
      system?: { text: string }[];
      inferenceConfig?: {
        maxTokens?: number;
        temperature?: number;
        topP?: number;
      };
    }): Promise<{
      stopReason?: string;
      tokensUsed?: number;
      messages: BedrockMessage[];
    }>;
  };
}

type BedrockMessage = {
  role: "user" | "assistant" | string;
  content: Array<{
    text?: string;
    document?: {
      name: string;
      content: string;
    };
    toolUse?: {
      name: string;
      input: string;
    };
    toolResult?: {
      name: string;
      status: "success" | "error";
      content: Array<{
        text?: string;
        document?: {
          name: string;
          content: string;
        };
      }>;
    };
  }>;
};

interface NeovimToolParams {
  action: "health" | "plugins" | "format" | "lsp";
  subAction?: string;
  target?: string;
}

class NeovimTool {
  constructor(private readonly context: ToolContext) {}

  public readonly name = "NeovimTool";

  public readonly inputSchema = {
    json: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["health", "plugins", "format", "lsp"],
          description: "The action to perform:\n- health: Run health checks\n- plugins: Manage plugins\n- format: Run formatters\n- lsp: Manage LSP servers"
        },
        subAction: {
          type: "string",
          description: "Sub-action to perform:\n- For plugins: status, update, clean, install\n- For format: run, check\n- For lsp: info, install, uninstall"
        },
        target: {
          type: "string",
          description: "Target for the action (e.g., plugin name, file path, LSP server name)"
        }
      },
      required: ["action"],
      additionalProperties: false
    }
  } as const;

  public readonly description = `Manages Neovim operations including:
- Running health checks
- Managing plugins (status, update, clean, install)
- Running formatters
- Managing LSP servers

Examples:
- Check Neovim health: { action: "health" }
- Update plugins: { action: "plugins", subAction: "update" }
- Format a file: { action: "format", subAction: "run", target: "path/to/file" }
- Install LSP server: { action: "lsp", subAction: "install", target: "lua_ls" }`;

  private async runNeovimCommand(command: string): Promise<{ status: string; output: string }> {
    return new Promise((resolve) => {
      exec(`nvim --headless -c "${command}" -c "qa!"`, { cwd: this.context.rootDir }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            status: "error",
            output: stderr || stdout || error.message
          });
        } else {
          resolve({
            status: "success",
            output: stdout
          });
        }
      });
    });
  }

  public async execute(params: NeovimToolParams) {
    const { action, subAction, target } = params;

    switch (action) {
      case "health":
        return await this.runNeovimCommand("checkhealth");

      case "plugins":
        switch (subAction) {
          case "status":
            return await this.runNeovimCommand("Lazy");
          case "update":
            return await this.runNeovimCommand("Lazy update");
          case "clean":
            return await this.runNeovimCommand("Lazy clean");
          case "install":
            if (!target) {
              throw new Error("Plugin name is required for install action");
            }
            return await this.runNeovimCommand(`Lazy install ${target}`);
          default:
            return await this.runNeovimCommand("Lazy");
        }

      case "format":
        switch (subAction) {
          case "run":
            if (!target) {
              throw new Error("File path is required for format action");
            }
            return await this.runNeovimCommand(`ConformInfo ${target}`);
          case "check":
            return await this.runNeovimCommand("ConformInfo");
          default:
            return await this.runNeovimCommand("ConformInfo");
        }

      case "lsp":
        switch (subAction) {
          case "info":
            return await this.runNeovimCommand("Mason");
          case "install":
            if (!target) {
              throw new Error("LSP server name is required for install action");
            }
            return await this.runNeovimCommand(`MasonInstall ${target}`);
          case "uninstall":
            if (!target) {
              throw new Error("LSP server name is required for uninstall action");
            }
            return await this.runNeovimCommand(`MasonUninstall ${target}`);
          default:
            return await this.runNeovimCommand("Mason");
        }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

export default NeovimTool;
