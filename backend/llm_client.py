import os
import httpx
from dotenv import load_dotenv
from typing import List, Dict, Any

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

async def get_llm_response_with_tools(query: str, available_tools: List[dict], conversation_history: List[dict] = None, tool_results: List[dict] = None) -> dict:
    """Get LLM response with tool awareness"""
    
    # Prepare system message with available tools
    tools_description = "\n".join([
        f"- {tool['name']}: {tool.get('description', 'No description')}"
        for tool in available_tools
    ])
    
    system_prompt = f"""You are an AI assistant with access to the following tools:
{tools_description}

You can use multiple tools in sequence if needed. When you need to use tools, respond with a JSON object containing:
- "needs_tools": true
- "tool_calls": [
    {{
        "tool_name": "name_of_tool",
        "tool_args": {{arguments for the tool}},
        "reasoning": "why you need this tool"
    }}
]

If you don't need tools, respond normally with "needs_tools": false.
"""
    
    # Build conversation context
    messages = []
    if conversation_history:
        messages.extend(conversation_history)
    
    # Add tool results if available
    if tool_results:
        tool_results_text = "\n".join([
            f"Tool '{result['tool_name']}' result: {result['result']}"
            for result in tool_results
        ])
        messages.append({
            "role": "system",
            "content": f"Previous tool results:\n{tool_results_text}"
        })
    
    messages.append({
        "role": "user",
        "content": f"{system_prompt}\n\nUser query: {query}"
    })
    
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": msg["content"]}]} for msg in messages]
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(f"{url}?key={API_KEY}", json=payload, headers=headers)
        data = response.json()
        llm_text = data['candidates'][0]['content']['parts'][0]['text']
        
        # Try to parse as JSON for tool usage
        try:
            import json
            parsed = json.loads(llm_text)
            if parsed.get("needs_tools"):
                return {
                    "type": "tool_use",
                    "tool_calls": parsed["tool_calls"],
                    "raw_response": llm_text
                }
        except:
            pass
        
        return {
            "type": "text",
            "content": llm_text
        }