import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import say from "say";

/**
 * Voice Assistant Tool
 * Speaks the provided text using the system's TTS engine.
 */
export function registerVoiceAssistantTool(server: McpServer): void {
  server.tool(
    "voice_assistant_code",
    "Speaks the provided code explanation or description using system TTS (npm 'say' package).",
    {
      text: z.string().describe("The text to speak aloud (code explanation, description, etc.)"),
      rate: z.number().optional().default(1).describe("Speech rate multiplier (1 = normal speed)")
    },
    async ({ text, rate = 1 }): Promise<CallToolResult> => {
      try {
        await new Promise((resolve, reject) => {
          say.speak(text, undefined, rate, (err) => {
            if (err) reject(err);
            else resolve(undefined);
          });
        });
        return {
          content: [
            { type: "text", text: `Voice assistant spoke: ${text}` }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Voice assistant failed: ${error}` }
          ]
        };
      }
    }
  );
}
