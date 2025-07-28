import * as vscode from "vscode";
import { McpServerManager } from "./mcpServer";
import { WebSocketServer } from "ws";

let mcpServerManager: McpServerManager | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log("[Extension] Activated ✅");
  const outputChannel = vscode.window.createOutputChannel("MCP Agent");

  outputChannel.appendLine("🔌 MCP Extension activated.");
  outputChannel.show(true);
  vscode.window.showInformationMessage(
    "Coding Chatbot MCP Extension Activated"
  );
  const temp = async () => {
    const mcpServerManager = new McpServerManager(context, "1");
    await mcpServerManager.start();
  }
  temp();
  
/*
  const wsServer = new WebSocketServer({ port: 4001 });
  
  wsServer.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", "ws://localhost");
    const userId = url.searchParams.get("userId");
   

    if (!userId) {
      socket.send(
        JSON.stringify({
          type: "error",
          message: "Missing userId in connection URL",
        })
      );
      socket.close(1008, "Missing userId");
      return;
    }

    console.log(`Frontend connected with userId: ${userId}`);

    // Start the MCP server after receiving userId from frontend
    const mcpServerManager = new McpServerManager(context, userId);
    await mcpServerManager.start();

    // ✅ Notify frontend that the extension is ready
    socket.send(
      JSON.stringify({
        type: "ready",
        message: "Extension ready",
      })
    );
  });*/
}
