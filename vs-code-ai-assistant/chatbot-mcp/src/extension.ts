import * as vscode from 'vscode';
import { McpServerManager } from './mcpServer';
import { WebSocketServer } from 'ws';

let mcpServerManager: McpServerManager;

export function activate(context: vscode.ExtensionContext) {
  const wsServer = new WebSocketServer({ port: 4001 });

  wsServer.on('connection', async (socket, request) => {
    const url = new URL(request.url ?? '', 'ws://localhost');
    const userId = url.searchParams.get('userId');

    if (!userId) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Missing userId in connection URL',
      }));
      socket.close(1008, 'Missing userId');
      return;
    }

    console.log(`Frontend connected with userId: ${userId}`);

    // Start the MCP server after receiving userId from frontend
    const mcpServerManager = new McpServerManager(context, userId);
    await mcpServerManager.start();

    // ✅ Notify frontend that the extension is ready
    socket.send(JSON.stringify({
      type: 'ready',
      message: 'Extension ready',
    }));
  });
}
