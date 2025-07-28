import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';

export class WebSocketTransport implements Transport {
    private ws: WebSocket;
    private messageCallback?: (message: JSONRPCMessage) => void;
    private closeCallback?: () => void;
    private errorCallback?: (error: Error) => void;

    constructor(ws: WebSocket) {
        this.ws = ws;
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                if (this.messageCallback) {
                    this.messageCallback(message);
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
                if (this.errorCallback) {
                    this.errorCallback(new Error(`Failed to parse message: ${error}`));
                }
            }
        });

        this.ws.on('close', () => {
            if (this.closeCallback) {
                this.closeCallback();
            }
        });

        this.ws.on('error', (error: Error) => {
            if (this.errorCallback) {
                this.errorCallback(error);
            }
        });
    }

    async start(): Promise<void> {
        // WebSocket is already connected, just ensure it's ready
        if (this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            throw new Error('WebSocket is not open');
        }
    }

    async close(): Promise<void> {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    onMessage(callback: (message: JSONRPCMessage) => void): void {
        this.messageCallback = callback;
    }

    onClose(callback: () => void): void {
        this.closeCallback = callback;
    }

    onError(callback: (error: Error) => void): void {
        this.errorCallback = callback;
    }
}