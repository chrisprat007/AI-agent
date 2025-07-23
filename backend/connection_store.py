from typing import Dict, List, Optional
from fastapi import WebSocket
import json
import uuid
from dataclasses import dataclass

@dataclass
class MCPConnection:
    websocket: WebSocket
    user_id: str
    available_tools: List[dict] = None
    session_initialized: bool = False

# user_id -> MCPConnection
active_connections: Dict[str, MCPConnection] = {}

def add_connection(user_id: str, websocket: WebSocket):
    active_connections[user_id] = MCPConnection(
        websocket=websocket,
        user_id=user_id,
        available_tools=[],
        session_initialized=False
    )

def get_connection(user_id: str) -> Optional[MCPConnection]:
    return active_connections.get(user_id)

def remove_connection(user_id: str):
    if user_id in active_connections:
        del active_connections[user_id]

def update_tools(user_id: str, tools: List[dict]):
    if user_id in active_connections:
        active_connections[user_id].available_tools = tools

def mark_initialized(user_id: str):
    if user_id in active_connections:
        active_connections[user_id].session_initialized = True