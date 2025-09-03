import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Waits briefly for shell integration to become available on the provided terminal.
 */
export async function waitForShellIntegration(terminal: vscode.Terminal, timeout = 1000): Promise<boolean> {
  if ((terminal as any).shellIntegration) {
    return true;
  }

  return new Promise<boolean>(resolve => {
    const timeoutId = setTimeout(() => {
      disposable.dispose();
      resolve(false);
    }, timeout);

    const disposable = vscode.window.onDidChangeTerminalShellIntegration((e: any) => {
      if (e.terminal === terminal && (terminal as any).shellIntegration) {
        clearTimeout(timeoutId);
        disposable.dispose();
        resolve(true);
      }
    });
  });
}

/**
 * Executes a shell command using terminal shell integration (preferred).
 * Falls back to sending text to the terminal if shellIntegration is not available.
 *
 * Note: when using shell integration, we can read output stream. Fallback won't provide streamed output.
 */
export async function executeShellCommand(
  terminal: vscode.Terminal,
  command: string,
  cwd?: string,
  timeout: number = 10000
): Promise<{ output: string }> {
  terminal.show();

  // prepare full command (cd to cwd if provided)
  let fullCommand = command;
  if (cwd) {
    if (cwd === '.' || cwd === './') {
      fullCommand = `${command}`;
    } else {
      const quotedPath = cwd.includes(' ') ? `"${cwd}"` : cwd;
      fullCommand = `cd ${quotedPath} && ${command}`;
    }
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout);
  });

  const executionPromise = async (): Promise<{ output: string }> => {
    // If shellIntegration exists, use it to execute and read the output stream.
    if ((terminal as any).shellIntegration) {
      const execution = (terminal as any).shellIntegration!.executeCommand(fullCommand);
      let output = '';
      try {
        const outputStream = (execution as any).read();
        for await (const chunk of outputStream) {
          output += chunk;
        }
      } catch (err) {
        throw new Error(`Failed to read command output: ${err}`);
      }
      return { output };
    }

    // Fallback: send command text to terminal, but we cannot reliably capture output.
    return new Promise<{ output: string }>((resolve) => {
      terminal.sendText(fullCommand);
      // return a minimal message — the user can view full output in the terminal UI.
      resolve({ output: `Sent command to terminal: ${fullCommand}\n(terminal output not captured - view terminal panel)` });
    });
  };

  return Promise.race([executionPromise(), timeoutPromise]);
}

/**
 * Register shell tools for MCP
 */
export function registerShellTools(server: McpServer, terminal?: vscode.Terminal): void {
  server.tool(
    'execute_shell_command_code',
    `Executes shell commands in VS Code integrated terminal. Uses shell integration when available to capture output.`,
    {
      command: z.string().describe('The shell command to execute'),
      cwd: z.string().optional().default('.').describe('Optional working directory for the command'),
      timeout: z.number().optional().default(10000).describe('Command timeout in milliseconds (default 10s)')
    },
    async ({ command, cwd, timeout = 10000 }): Promise<CallToolResult> => {
      try {
        if (!terminal) {
          throw new Error('Terminal not available');
        }

        // ensure shell integration exists (wait a short amount)
        if (!(terminal as any).shellIntegration) {
          const available = await waitForShellIntegration(terminal);
          if (!available) {
            // we still support a fallback that sends the command to the terminal (no captured output)
            const fallback = `cd ${cwd} && ${command}`;
            terminal.sendText(fallback);
            return { content: [{ type: 'text', text: `Sent command to terminal (shell integration not available). Command: ${fallback}` }] };
          }
        }

        const { output } = await executeShellCommand(terminal, command, cwd, timeout);
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        return { content: [{ type: 'text', text: `Command: ${command}\n\nOutput:\n${output}` }] };
      } catch (err) {
        console.error('[mcp:execute_shell_command] error', err);
        throw err;
      }
    }
  );

  // Optional quick 'list directory' convenience tool
  server.tool(
    'shell_list_dir_code',
    `Lists files in a directory using the terminal or vsc API (best-effort).`,
    {
      dir: z.string().optional().default('.').describe('Directory to list (relative to workspace root)')
    },
    async ({ dir = '.' }): Promise<CallToolResult> => {
      try {
        const root = workspaceRootUri();
        const target = vscode.Uri.joinPath(root, dir);
        const items = await vscode.workspace.fs.readDirectory(target);
        const files = items.map(([name, type]) => ({ name, isDirectory: !!(type & vscode.FileType.Directory) }));
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Failed to list directory ${dir}: ${String(err)}` }] };
      }
    }
  );
}

/** helper used by shell_list_dir_code */
function workspaceRootUri(): vscode.Uri {
  if (!vscode.workspace.workspaceFolders) {
    throw new Error('No workspace folder is open');
  }
  return vscode.workspace.workspaceFolders[0].uri;
}
