from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from connection_store import (
    add_connection, remove_connection, get_connection, 
    update_tools, mark_initialized, active_connections
)
from llm_client import get_llm_response_with_tools
from mcp_protocol import mcp_handler
import json
import asyncio

app = FastAPI()

# === WebSocket endpoint for MCP servers ===
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    add_connection(user_id, websocket)
    
    try:
        # Initialize MCP session
        await initialize_mcp_session(user_id)
        
        # Listen for incoming messages
        while True:
            message_text = await websocket.receive_text()
            try:
                message = json.loads(message_text)
                
                # Handle MCP responses
                if "id" in message:  # This is a response to our request
                    mcp_handler.handle_response(message)
                else:
                    print(f"Received notification from MCP[{user_id}]:", message)
                    
            except json.JSONDecodeError:
                print(f"Invalid JSON from MCP[{user_id}]:", message_text)
                
    except WebSocketDisconnect:
        remove_connection(user_id)
        print(f"MCP[{user_id}] disconnected")

async def initialize_mcp_session(user_id: str):
    """Initialize MCP session and get available tools"""
    connection = get_connection(user_id)
    if not connection:
        return
    
    try:
        # Send initialize request
        init_response = await mcp_handler.send_request(
            connection.websocket, 
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "clientInfo": {
                    "name": "backend-server",
                    "version": "1.0.0"
                }
            }
        )
        
        # Get available tools
        tools_response = await mcp_handler.send_request(
            connection.websocket,
            "tools/list"
        )
        
        tools = tools_response.get("tools", [])
        update_tools(user_id, tools)
        mark_initialized(user_id)
        
        print(f"MCP[{user_id}] initialized with {len(tools)} tools: {[t.get('name') for t in tools]}")
        
    except Exception as e:
        print(f"Failed to initialize MCP[{user_id}]: {str(e)}")

# === Enhanced Chat Endpoint ===
class ChatRequest(BaseModel):
    user_id: str
    query: str
    conversation_history: list = []

@app.post("/chat")
async def handle_chat(req: ChatRequest):
    user_id = req.user_id
    query = req.query
    
    # Get MCP connection
    connection = get_connection(user_id)
    if not connection:
        raise HTTPException(status_code=404, detail="MCP connection not found")
    
    if not connection.session_initialized:
        raise HTTPException(status_code=400, detail="MCP session not initialized")
    
    # Get LLM response with tool awareness
    try:
        llm_response = await get_llm_response_with_tools(
            query, 
            connection.available_tools,
            req.conversation_history
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")
    
    # Handle tool usage
    if llm_response["type"] == "tool_use":
        tool_results = []
        tool_calls = llm_response["tool_calls"]
        
        # Execute all tool calls in sequence
        for tool_call in tool_calls:
            try:
                tool_result = await execute_tool(
                    user_id,
                    tool_call["tool_name"], 
                    tool_call["tool_args"]
                )
                tool_results.append({
                    "tool_name": tool_call["tool_name"],
                    "result": tool_result,
                    "reasoning": tool_call.get("reasoning", "")
                })
            except Exception as e:
                tool_results.append({
                    "tool_name": tool_call["tool_name"],
                    "result": f"Error: {str(e)}",
                    "reasoning": tool_call.get("reasoning", "")
                })
        
        # Get final response from LLM with all tool results
        final_response = await get_llm_response_with_tools(
            f"All tools have been executed. Please provide a natural language response to the user based on the tool results.",
            connection.available_tools,
            req.conversation_history,
            tool_results
        )
        
        return {
            "response": final_response["content"],
            "tools_used": [result["tool_name"] for result in tool_results],
            "tool_results": tool_results,
            "tool_count": len(tool_results)
        }
    
    else:
        return {
            "response": llm_response["content"],
            "tools_used": None
        }

async def execute_tool(user_id: str, tool_name: str, tool_args: dict):
    """Execute a tool via MCP"""
    connection = get_connection(user_id)
    if not connection:
        raise Exception("MCP connection not found")
    
    try:
        result = await mcp_handler.send_request(
            connection.websocket,
            "tools/call",
            {
                "name": tool_name,
                "arguments": tool_args
            }
        )
        
        return result.get("content", [])
        
    except Exception as e:
        raise Exception(f"Tool execution failed: {str(e)}")

# === Health check endpoint ===
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_connections": len(active_connections),
        "connections": {
            user_id: {
                "initialized": conn.session_initialized,
                "tools_count": len(conn.available_tools)
            }
            for user_id, conn in active_connections.items()
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)