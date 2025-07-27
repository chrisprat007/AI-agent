import * as vscode from 'vscode';
import { McpServerManager } from './mcpServer';
import { HttpServerManager } from './httpServer';

let mcpServerManager: McpServerManager;
let httpServerManager: HttpServerManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Coding Chatbot MCP extension is now active!');

    // Initialize managers
    mcpServerManager = new McpServerManager(context);
    httpServerManager = new HttpServerManager(context, mcpServerManager);

    // Register commands
    const startCommand = vscode.commands.registerCommand('codingChatbot.start', async () => {
        try {
            await mcpServerManager.start();
            await httpServerManager.start();
            vscode.window.showInformationMessage('Coding Chatbot MCP started successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start Coding Chatbot MCP: ${error}`);
        }
    });

    const stopCommand = vscode.commands.registerCommand('codingChatbot.stop', async () => {
        try {
            await mcpServerManager.stop();
            await httpServerManager.stop();
            vscode.window.showInformationMessage('Coding Chatbot MCP stopped successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stop Coding Chatbot MCP: ${error}`);
        }
    });

    context.subscriptions.push(startCommand, stopCommand);

    // Auto-start on extension activation
    vscode.commands.executeCommand('codingChatbot.start');
}

export function deactivate() {
    if (mcpServerManager) {
        mcpServerManager.stop();
    }
    if (httpServerManager) {
        httpServerManager.stop();
    }
}