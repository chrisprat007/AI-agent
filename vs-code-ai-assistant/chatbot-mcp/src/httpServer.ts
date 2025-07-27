import * as vscode from 'vscode';
import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { McpServerManager } from './mcpServer';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ChatRequest {
    message: string;
    context?: {
        filePath?: string;
        selectedText?: string;
        workspaceInfo?: any;
    };
}

export interface ChatResponse {
    success: boolean;
    response?: string;
    error?: string;
    metadata?: {
        toolsUsed?: string[];
        resourcesAccessed?: string[];
    };
}

export class HttpServerManager {
    private app: express.Application;
    private server: Server | null = null;
    private port: number;
    private context: vscode.ExtensionContext;
    private mcpServerManager: McpServerManager;
    private chatHistory: ChatMessage[] = [];

    constructor(context: vscode.ExtensionContext, mcpServerManager: McpServerManager) {
        this.context = context;
        this.mcpServerManager = mcpServerManager;
        this.port = vscode.workspace.getConfiguration('codingChatbot').get('httpPort', 3001);
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        this.app.use(cors({
            origin: '*', // Configure for your frontend domain in production
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
    }

    private setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: Date.now(),
                mcpPort: vscode.workspace.getConfiguration('codingChatbot').get('mcpPort', 3002)
            });
        });

        // Chat endpoint - main interface for frontend
        this.app.post('/chat', async (req, res) => {
            try {
                const { message, context }: ChatRequest = req.body;
                
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message is required'
                    });
                }

                // Add user message to history
                const userMessage: ChatMessage = {
                    id: this.generateId(),
                    role: 'user',
                    content: message,
                    timestamp: Date.now()
                };
                this.chatHistory.push(userMessage);

                // Process the message (this would integrate with your MCP client)
                const response = await this.processMessage(message, context);

                // Add assistant response to history
                const assistantMessage: ChatMessage = {
                    id: this.generateId(),
                    role: 'assistant',
                    content: response.response || 'No response generated',
                    timestamp: Date.now()
                };
                this.chatHistory.push(assistantMessage);

                res.json(response);
            } catch (error) {
                console.error('Chat endpoint error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Get chat history
        this.app.get('/chat/history', (req, res) => {
            res.json({
                success: true,
                history: this.chatHistory
            });
        });

        // Clear chat history
        this.app.delete('/chat/history', (req, res) => {
            this.chatHistory = [];
            res.json({
                success: true,
                message: 'Chat history cleared'
            });
        });

        // Get workspace info
        this.app.get('/workspace', (req, res) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            res.json({
                success: true,
                workspace: workspaceFolders ? {
                    name: workspaceFolders[0].name,
                    path: workspaceFolders[0].uri.fsPath,
                    folders: workspaceFolders.map(folder => ({
                        name: folder.name,
                        path: folder.uri.fsPath
                    }))
                } : null
            });
        });

        // Get current file content
        this.app.get('/editor/current', (req, res) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                res.json({
                    success: true,
                    file: {
                        path: activeEditor.document.fileName,
                        language: activeEditor.document.languageId,
                        content: activeEditor.document.getText(),
                        selection: activeEditor.selection ? {
                            start: {
                                line: activeEditor.selection.start.line,
                                character: activeEditor.selection.start.character
                            },
                            end: {
                                line: activeEditor.selection.end.line,
                                character: activeEditor.selection.end.character
                            },
                            text: activeEditor.document.getText(activeEditor.selection)
                        } : null
                    }
                });
            } else {
                res.json({
                    success: false,
                    error: 'No active editor'
                });
            }
        });

        // MCP Server status
        this.app.get('/mcp/status', (req, res) => {
            res.json({
                success: true,
                mcp: {
                    port: this.port,
                    running: true // You can add actual status checking here
                }
            });
        });
    }

    private async processMessage(message: string, context?: any): Promise<ChatResponse> {
        // This is where you would integrate with your MCP client
        // For now, returning a mock response
        
        // You can add logic here to:
        // 1. Analyze the message to determine what MCP tools/resources to use
        // 2. Call the appropriate MCP endpoints via your deployed MCP client
        // 3. Process the responses and format them for the frontend
        
        return {
            success: true,
            response: `Processed message: "${message}". Context: ${JSON.stringify(context || {})}`,
            metadata: {
                toolsUsed: ['analyze-code'],
                resourcesAccessed: ['workspace-structure']
            }
        };
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`HTTP Server listening on port ${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async stop(): Promise<void> {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}