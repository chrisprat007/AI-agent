import * as vscode from "vscode";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebSocket } from "ws";
import { WebSocketTransport } from "./websocketTransport";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

export class McpServerManager {
  private mcpServer: McpServer;
  private webSocket: WebSocket | null = null;
  private userId: string;
  private context: vscode.ExtensionContext;
  private backendUrl: string;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;

  constructor(context: vscode.ExtensionContext, userId: string) {
    this.context = context;
    this.userId = userId;
    
    // Get backend URL from configuration
    this.backendUrl = vscode.workspace
      .getConfiguration("codingChatbot")
      .get("backendUrl", "ws://localhost:8000");
    
    this.mcpServer = new McpServer({
      name: "vscode-coding-assistant",
      version: "1.0.0",
    });
    this.setupMcpServer();
  }

  private setupMcpServer() {
    // Resource registrations
    this.mcpServer.registerResource(
      "workspace-file",
      new ResourceTemplate("file://{filePath}", { list: undefined }),
      {
        title: "Workspace File",
        description: "Access files in the current workspace",
        mimeType: "text/plain",
      },
      async (uri, { filePath }) => {
        try {
          if (Array.isArray(filePath)) {
            throw new Error("filePath should be a string, not an array.");
          }

          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            throw new Error("No workspace folder open");
          }

          const fullPath = path.resolve(
            workspaceFolders[0].uri.fsPath,
            filePath
          );
          const content = fs.readFileSync(fullPath, "utf8");

          return {
            contents: [
              {
                uri: uri.href,
                text: content,
                mimeType: this.getMimeType(fullPath),
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to read file: ${error}`);
        }
      }
    );

    this.mcpServer.registerResource(
      "workspace-structure",
      "workspace://structure",
      {
        title: "Workspace Structure",
        description: "Get the structure of the current workspace",
        mimeType: "application/json",
      },
      async (uri) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          throw new Error("No workspace folder open");
        }

        const structure = await this.getWorkspaceStructure(
          workspaceFolders[0].uri.fsPath
        );
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(structure, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      }
    );

    // Tool registrations
    this.mcpServer.registerTool(
      "create-file",
      {
        title: "Create File",
        description: "Create a new file in the workspace",
        inputSchema: {
          filePath: z.string().describe("Relative path of the file to create"),
          content: z.string().describe("Content of the file"),
          overwrite: z
            .boolean()
            .optional()
            .describe("Whether to overwrite if file exists"),
        },
      },
      async ({ filePath, content, overwrite = false }) => {
        try {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            throw new Error("No workspace folder open");
          }

          const fullPath = path.resolve(
            workspaceFolders[0].uri.fsPath,
            filePath
          );

          if (fs.existsSync(fullPath) && !overwrite) {
            throw new Error("File already exists and overwrite is false");
          }

          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, "utf8");

          return {
            content: [
              {
                type: "text",
                text: `File created successfully at: ${filePath}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create file: ${error}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.mcpServer.registerTool(
      "modify-file",
      {
        title: "Modify File",
        description: "Modify an existing file in the workspace",
        inputSchema: {
          filePath: z.string().describe("Relative path of the file to modify"),
          content: z.string().describe("New content of the file"),
          operation: z
            .enum(["replace", "append", "prepend"])
            .describe("How to modify the file"),
        },
      },
      async ({ filePath, content, operation }) => {
        try {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            throw new Error("No workspace folder open");
          }

          const fullPath = path.resolve(
            workspaceFolders[0].uri.fsPath,
            filePath
          );

          if (!fs.existsSync(fullPath)) {
            throw new Error("File does not exist");
          }

          let newContent: string;
          if (operation === "replace") {
            newContent = content;
          } else {
            const existingContent = fs.readFileSync(fullPath, "utf8");
            newContent =
              operation === "append"
                ? existingContent + content
                : content + existingContent;
          }

          fs.writeFileSync(fullPath, newContent, "utf8");

          return {
            content: [
              {
                type: "text",
                text: `File modified successfully: ${filePath}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to modify file: ${error}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.mcpServer.registerTool(
      "execute-vscode-command",
      {
        title: "Execute VS Code Command",
        description: "Execute a VS Code command",
        inputSchema: {
          command: z.string().describe("VS Code command to execute"),
          args: z
            .array(z.any())
            .optional()
            .describe("Arguments for the command"),
        },
      },
      async ({ command, args = [] }) => {
        try {
          await vscode.commands.executeCommand(command, ...args);
          return {
            content: [
              {
                type: "text",
                text: `Command executed successfully: ${command}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to execute command: ${error}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.mcpServer.registerPrompt(
      "analyze-code",
      {
        title: "Analyze Code",
        description: "Analyze code for potential issues and improvements",
        argsSchema: {
          filePath: z.string().describe("Path to the file to analyze"),
          analysisType: z
            .enum(["bugs", "performance", "style", "security"])
            .describe("Type of analysis to perform"),
        },
      },
      ({ filePath, analysisType }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze the code in ${filePath} for ${analysisType} issues. Provide specific recommendations for improvement.`,
            },
          },
        ],
      })
    );
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".js": "text/javascript",
      ".ts": "text/typescript",
      ".json": "application/json",
      ".html": "text/html",
      ".css": "text/css",
      ".py": "text/x-python",
      ".java": "text/x-java",
      ".cpp": "text/x-c++src",
      ".c": "text/x-csrc",
      ".md": "text/markdown",
      ".txt": "text/plain",
    };
    return mimeTypes[ext] || "text/plain";
  }

  private async getWorkspaceStructure(rootPath: string): Promise<any> {
    const structure: any = {};

    const traverseDirectory = (dirPath: string, currentStructure: any) => {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        if (item.startsWith(".")) continue;

        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          currentStructure[item] = { type: "directory", children: {} };
          traverseDirectory(itemPath, currentStructure[item].children);
        } else {
          currentStructure[item] = {
            type: "file",
            size: stat.size,
            extension: path.extname(item),
          };
        }
      }
    };

    traverseDirectory(rootPath, structure);
    return structure;
  }

  private async connectToBackend(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        
        this.webSocket = new WebSocket(`${this.backendUrl}/ws/${this.userId}`);

        this.webSocket.on("open", async () => {
          console.log("Connected to FastAPI backend");
          
          try {
            // Establish MCP transport immediately after connection
            console.log(`Connecting to backend at: ${this.backendUrl}/ws/${this.userId}`);
        
            const transport = new WebSocketTransport(this.webSocket!);
            await this.mcpServer.connect(transport);
            
            this.isConnected = true;
            vscode.window.showInformationMessage("MCP Server connected to backend!");
            resolve();
          } catch (error) {
            console.error("Failed to establish MCP transport:", error);
            reject(error);
          }
        });

        this.webSocket.on("message", async (data: Buffer | string) => {
          try {
            const message = JSON.parse(data.toString());
            console.log("Received message from backend:", message);
          } catch (error) {
            console.error("Error processing message:", error);
          }
        });

        this.webSocket.on("error", (err) => {
          console.error("WebSocket connection error:", err);
          this.isConnected = false;
          vscode.window.showErrorMessage(`MCP connection error: ${err.message}`);
          reject(err);
        });

        this.webSocket.on("close", (code, reason) => {
          console.log(`WebSocket connection closed: ${code} - ${reason}`);
          this.isConnected = false;
          vscode.window.showWarningMessage("MCP Server disconnected from backend");
          
          // Attempt to reconnect after a delay
          this.scheduleReconnect();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
    }

    this.reconnectInterval = setTimeout(async () => {
      console.log("Attempting to reconnect...");
      try {
        await this.connectToBackend();
      } catch (error) {
        console.error("Reconnection failed:", error);
        this.scheduleReconnect(); // Try again
      }
    }, 5000); // Reconnect after 5 seconds
  }

  async start(): Promise<void> {
    try {
      await this.connectToBackend();
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    
    this.isConnected = false;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
}