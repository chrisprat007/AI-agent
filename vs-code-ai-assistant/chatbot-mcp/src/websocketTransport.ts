import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';

export class WebSocketTransport implements Transport {
    private ws: WebSocket;

    constructor(ws: WebSocket) {
        this.ws = ws;
    }

    async start(): Promise<void> {
        // WebSocket is already connected
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            throw new Error('WebSocket is not open');
        }
    }

    async close(): Promise<void> {
        this.ws.close();
    }

    onMessage(callback: (message: JSONRPCMessage) => void): void {
        this.ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                callback(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        });
    }

    onClose(callback: () => void): void {
        this.ws.on('close', callback);
    }

    onError(callback: (error: Error) => void): void {
        this.ws.on('error', callback);
    }
}