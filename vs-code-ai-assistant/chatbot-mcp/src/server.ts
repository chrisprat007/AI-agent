import express from "express";
import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from 'http';
import { Request, Response } from 'express';
import { registerFileTools } from './tools/file-tools';
import { registerEditTools } from './tools/edit-tools';
import { registerShellTools } from './tools/shell-tools';
import { registerDiagnosticsTools } from './tools/diagnostics-tools';
import { registerSymbolTools } from './tools/symbol-tools';
import { logger } from './utils/logger';

export interface ToolConfiguration {
    file: boolean;
    edit: boolean;
    shell: boolean;
    diagnostics: boolean;
    symbol: boolean;
}

export class MCPServer {
    private server: McpServer;
    private transport: StreamableHTTPServerTransport;
    private app: express.Application;
    private httpServer?: Server;
    private port: number;
    private fileListingCallback?: any; // kept optional for backward compatibility
    private terminal?: vscode.Terminal;
    private toolConfig: ToolConfiguration;
    private toolsRegistered: boolean = false;

    // keep this method for backward compatibility (optional)
    public setFileListingCallback(callback: any) {
        this.fileListingCallback = callback;
    }

    constructor(port: number = 3000, terminal?: vscode.Terminal, toolConfig?: ToolConfiguration) {
        this.port = port;
        this.terminal = terminal;
        this.toolConfig = toolConfig || {
            file: true,
            edit: true,
            shell: true,
            diagnostics: true,
            symbol: true
        };
        this.app = express();
        this.app.use(express.json());

        // Initialize MCP Server
        this.server = new McpServer({
            name: "vscode-mcp-server",
            version: "1.0.0",
        }, {
            capabilities: {
                logging: {},
                tools: {
                    listChanged: false
                }
            }
        });

        // Initialize transport
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        // Setup routes and event handlers
        this.setupRoutes();
        this.setupEventHandlers();
    }
    
    public setupTools(): void {
        if (this.toolsRegistered) {
            logger.info('MCP tools already registered, skipping...');
            return;
        }

        logger.info(`Setting up MCP tools with configuration: ${JSON.stringify(this.toolConfig)}`);

        try {
            // Register file tools if enabled
            if (this.toolConfig.file) {
                registerFileTools(this.server);
                logger.info('MCP file tools registered successfully');
            } else {
                logger.info('MCP file tools disabled by configuration');
            }
            
            // Register edit tools if enabled
            if (this.toolConfig.edit) {
                registerEditTools(this.server);
                logger.info('MCP edit tools registered successfully');
            } else {
                logger.info('MCP edit tools disabled by configuration');
            }
            
            // Register shell tools if enabled
            if (this.toolConfig.shell) {
                registerShellTools(this.server, this.terminal);
                logger.info('MCP shell tools registered successfully');
            } else {
                logger.info('MCP shell tools disabled by configuration');
            }
            
            // Register diagnostics tools if enabled
            if (this.toolConfig.diagnostics) {
                registerDiagnosticsTools(this.server);
                logger.info('MCP diagnostics tools registered successfully');
            } else {
                logger.info('MCP diagnostics tools disabled by configuration');
            }
            
            // Register symbol tools if enabled
            if (this.toolConfig.symbol) {
                registerSymbolTools(this.server);
                logger.info('MCP symbol tools registered successfully');
            } else {
                logger.info('MCP symbol tools disabled by configuration');
            }

            this.toolsRegistered = true;
            logger.info('All MCP tools setup completed successfully');
        } catch (error) {
            logger.error(`Error during tools setup: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private setupRoutes(): void {
        // Handle POST requests for client-to-server communication
        this.app.post('/mcp', async (req: Request, res: Response) => {
            logger.info(`Request received: ${req.method} ${req.url} ${JSON.stringify(req.body)}`);
            
            // Ensure tools are registered before handling requests
            if (!this.toolsRegistered) {
                try {
                    this.setupTools();
                } catch (error) {
                    logger.error(`Failed to setup tools during request handling: ${error}`);
                    if (!res.headersSent) {
                        res.status(500).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32603,
                                message: 'Failed to initialize server tools',
                            },
                            id: req.body?.id || null,
                        });
                    }
                    return;
                }
            }

            try {
                await this.transport.handleRequest(req, res, req.body);
            } catch (error) {
                logger.error(`Error handling MCP request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: req.body?.id || null,
                    });
                }
            }
        });

        // Handle SSE endpoint for server-to-client streaming
        this.app.get('/mcp/sse', async (req: Request, res: Response) => {
            logger.info('Received SSE connection request');
            
            // Ensure tools are registered
            if (!this.toolsRegistered) {
                try {
                    this.setupTools();
                } catch (error) {
                    logger.error(`Failed to setup tools during SSE handling: ${error}`);
                    if (!res.headersSent) {
                        res.status(500).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32603,
                                message: 'Failed to initialize server tools',
                            },
                            id: null,
                        });
                    }
                    return;
                }
            }

            try {
                await this.transport.handleRequest(req, res, undefined);
            } catch (error) {
                logger.error(`Error handling SSE request: ${error instanceof Error ? error.message : String(error)}`);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: null,
                    });
                }
            }
        });

        // Handle unsupported methods
        this.app.get('/mcp', async (req: Request, res: Response) => {
            logger.info('Received GET MCP request');
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed."
                },
                id: null
            }));
        });

        this.app.delete('/mcp', async (req: Request, res: Response) => {
            logger.info('Received DELETE MCP request');
            res.writeHead(405).end(JSON.stringify({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed."
                },
                id: null
            }));
        });

        // Handle OPTIONS requests for CORS
        this.app.options('/mcp', (req: Request, res: Response) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
            res.status(204).end();
        });

        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ 
                status: 'healthy', 
                toolsRegistered: this.toolsRegistered,
                timestamp: new Date().toISOString()
            });
        });
    }

    private setupEventHandlers(): void {
        // Log HTTP server events
        if (this.httpServer) {
            this.httpServer.on('error', (error: Error) => {
                logger.error(`[Server] HTTP Server Error: ${error.message}`);
            });

            this.httpServer.on('listening', () => {
                logger.info(`[Server] HTTP Server ready`);
            });

            this.httpServer.on('close', () => {
                logger.info(`[Server] HTTP Server closed`);
            });
        }
    }

    public async start(): Promise<void> {
        try {
            logger.info('[MCPServer.start] Starting MCP server');
            const startTime = Date.now();

            // Connect transport before starting server
            logger.info('[MCPServer.start] Connecting transport');
            const transportConnectStart = Date.now();
            await this.server.connect(this.transport);
            const transportConnectTime = Date.now() - transportConnectStart;
            logger.info(`[MCPServer.start] Transport connected (took ${transportConnectTime}ms)`);

            // Register tools after transport is connected
            try {
                logger.info('[MCPServer.start] Setting up tools');
                this.setupTools();
            } catch (toolErr) {
                logger.error(`[MCPServer.start] Error during tools setup: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`);
                // Don't fail startup completely, but log the error
            }

            // Start HTTP server
            logger.info('[MCPServer.start] Starting HTTP server');
            const httpServerStartTime = Date.now();
            
            return new Promise((resolve, reject) => {
                // Bind to localhost only for security
                this.httpServer = this.app.listen(this.port, '127.0.0.1', () => {
                    const httpStartTime = Date.now() - httpServerStartTime;
                    logger.info(`[MCPServer.start] HTTP Server started (took ${httpStartTime}ms)`);
                    logger.info(`MCP Server listening on localhost:${this.port}`);
                    
                    const totalTime = Date.now() - startTime;
                    logger.info(`[MCPServer.start] Server startup complete (total: ${totalTime}ms)`);
                    
                    resolve();
                });

                this.httpServer!.on('error', (error) => {
                    logger.error(`[MCPServer.start] HTTP Server error during startup: ${error.message}`);
                    reject(error);
                });

                // Add event handlers after server is created
                this.setupEventHandlers();
            });
        } catch (error) {
            logger.error(`[MCPServer.start] Failed to start MCP Server: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async stop(forceTimeout: number = 5000): Promise<void> {
        logger.info('[MCPServer.stop] Starting server shutdown process');
        const stopStartTime = Date.now();
        
        try {
            // Close HTTP server with timeout
            if (this.httpServer) {
                logger.info('[MCPServer.stop] Closing HTTP server (with timeout)');
                const httpServerCloseStart = Date.now();
                
                await Promise.race([
                    // Normal close operation
                    new Promise<void>((resolve, reject) => {
                        this.httpServer!.close((err) => {
                            const httpCloseTime = Date.now() - httpServerCloseStart;
                            if (err) {
                                logger.error(`[MCPServer.stop] HTTP server closed with error: ${err.message} (took ${httpCloseTime}ms)`);
                                reject(err);
                            } else {
                                logger.info(`[MCPServer.stop] HTTP server closed successfully (took ${httpCloseTime}ms)`);
                                resolve();
                            }
                        });
                    }),
                    
                    // Timeout fallback
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            logger.warn(`[MCPServer.stop] HTTP server close timed out after ${forceTimeout}ms - forcing close`);
                            // We resolve anyway to continue with the shutdown process
                            resolve();
                        }, forceTimeout);
                    })
                ]);
            }

            // Rest of the shutdown process...
            logger.info('[MCPServer.stop] Closing transport');
            const transportCloseStart = Date.now();
            await this.transport.close();
            const transportCloseTime = Date.now() - transportCloseStart;
            logger.info(`[MCPServer.stop] Transport closed (took ${transportCloseTime}ms)`);
            
            logger.info('[MCPServer.stop] Closing MCP server');
            const serverCloseStart = Date.now();
            await this.server.close();
            const serverCloseTime = Date.now() - serverCloseStart;
            logger.info(`[MCPServer.stop] MCP server closed (took ${serverCloseTime}ms)`);
            
            // Reset tools registration state
            this.toolsRegistered = false;
            
            const totalStopTime = Date.now() - stopStartTime;
            logger.info(`[MCPServer.stop] MCP Server shutdown complete (total: ${totalStopTime}ms)`);
        } catch (error) {
            logger.error(`[MCPServer.stop] Error during server shutdown: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}