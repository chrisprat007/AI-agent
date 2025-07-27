import asyncio
import json
import uuid
from typing import Dict, Any
from fastapi import WebSocket
class MCPProtocolHandler:
    def __init__(self):
        self.pending_requests: Dict[str, asyncio.Future] = {}
    
    async def send_request(self, websocket: WebSocket, method: str, params: dict = None) -> dict:
        """Send MCP request and wait for response"""
        request_id = str(uuid.uuid4())
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method
        }
        if params:
            request["params"] = params
        
        # Create future for response
        future = asyncio.Future()
        self.pending_requests[request_id] = future
        
        # Send request
        await websocket.send_text(json.dumps(request))
        
        # Wait for response with timeout
        try:
            response = await asyncio.wait_for(future, timeout=30.0)
            return response
        except asyncio.TimeoutError:
            del self.pending_requests[request_id]
            raise Exception(f"MCP request {method} timed out")
        finally:
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]
    
    def handle_response(self, message: dict):
        """Handle incoming MCP response"""
        request_id = message.get("id")
        if request_id and request_id in self.pending_requests:
            future = self.pending_requests[request_id]
            if "error" in message:
                future.set_exception(Exception(f"MCP Error: {message['error']}"))
            else:
                future.set_result(message.get("result", {}))

# Global protocol handler instance
mcp_handler = MCPProtocolHandler()