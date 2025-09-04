import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { focusExtensionDevHost } from './focus.js';

/**
 * Create a new file in the workspace and open it in the editor (non-preview).
 * @param workspacePath path relative to workspace root
 * @param content file content
 * @param overwrite whether to overwrite existing file
 * @param ignoreIfExists whether to ignore if file exists
 */
export async function createWorkspaceFile(
  workspacePath: string,
  content: string,
  overwrite: boolean = false,
  ignoreIfExists: boolean = false
): Promise<void> {
  if (!vscode.workspace.workspaceFolders) {
    throw new Error('No workspace folder is open');
  }
  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, workspacePath);

  const workspaceEdit = new vscode.WorkspaceEdit();
  const contentBuffer = new TextEncoder().encode(content);
  workspaceEdit.createFile(fileUri, { contents: contentBuffer, overwrite, ignoreIfExists });

  const success = await vscode.workspace.applyEdit(workspaceEdit);
  if (!success) {
    throw new Error(`Failed to create file: ${fileUri.fsPath}`);
  }

  const document = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false, viewColumn: vscode.ViewColumn.Active });
  // ...existing code...

}

/**
 * Replace specific lines in a file after validating original content.
 * startLine and endLine are 0-based in this function. (MCP tool exposes 1-based.)
 * @param workspacePath relative path to file
 * @param startLine 0-based inclusive
 * @param endLine 0-based inclusive
 * @param content replacement content
 * @param originalCode the exact current content of the region to validate
 */
export async function replaceWorkspaceFileLines(
  workspacePath: string,
  startLine: number,
  endLine: number,
  content: string,
  originalCode: string
): Promise<void> {
  if (!vscode.workspace.workspaceFolders) {
    throw new Error('No workspace folder is open');
  }
  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, workspacePath);

  const document = await vscode.workspace.openTextDocument(fileUri);

  if (startLine < 0 || startLine >= document.lineCount) {
    throw new Error(`Start line ${startLine + 1} is out of range (1-${document.lineCount})`);
  }
  if (endLine < startLine || endLine >= document.lineCount) {
    throw new Error(`End line ${endLine + 1} is out of range (${startLine + 1}-${document.lineCount})`);
  }

  // Gather current lines for exact match validation
  const currentLines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    currentLines.push(document.lineAt(i).text);
  }
  const currentContent = currentLines.join('\n');
  if (currentContent !== originalCode) {
    throw new Error('Original code validation failed. The current content does not match the provided original code.');
  }

  // Ensure the file is open in the editor
  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false, viewColumn: vscode.ViewColumn.Active });

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
  const range = new vscode.Range(startPos, endPos);

  const applied = await editor.edit(editBuilder => {
    editBuilder.replace(range, content);
  });

  if (!applied) {
    throw new Error(`Failed to replace lines in file: ${fileUri.fsPath}`);
  }

  await document.save();
}

/**
 * Type text character-by-character into an open editor at a specified speed.
 * insertAtLine and insertAtColumn are 0-based. If null, types at end of file.
 * Saves the document after typing finishes.
 */
export async function typeIntoWorkspaceFile(
  workspacePath: string,
  content: string,
  speedMsPerChar: number = 50,
  insertAtLine: number | null = null,
  insertAtColumn: number | null = null
): Promise<void> {
  if (!vscode.workspace.workspaceFolders) {
    throw new Error('No workspace folder is open');
  }
  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, workspacePath);

  const document = await vscode.workspace.openTextDocument(fileUri);
  const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false, viewColumn: vscode.ViewColumn.Active });
  await focusExtensionDevHost();

  // Determine starting position
  let position: vscode.Position;
  if (insertAtLine !== null && insertAtColumn !== null) {
    // Clamp to valid range
    const line = Math.max(0, Math.min(insertAtLine, document.lineCount - 1));
    const col = Math.max(0, Math.min(insertAtColumn, document.lineAt(line).text.length));
    position = new vscode.Position(line, col);
  } else {
    const lastLine = document.lineCount - 1;
    position = new vscode.Position(lastLine, document.lineAt(lastLine).text.length);
  }

  // Insert characters one by one
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const ok = await editor.edit(editBuilder => {
      editBuilder.insert(position, ch);
    });
    if (!ok) {
      throw new Error('Failed to insert character');
    }

    // Update position
    if (ch === '\n') {
      position = new vscode.Position(position.line + 1, 0);
    } else {
      position = new vscode.Position(position.line, position.character + 1);
    }

    // Delay between characters
    await new Promise(resolve => setTimeout(resolve, speedMsPerChar));
  }

  await document.save();
}

/**
 * Registers MCP edit-related tools on the provided McpServer.
 * Tools:
 *  - create_file_code
 *  - replace_lines_code (MCP-facing API accepts 1-based line numbers)
 *  - type_into_file_code (MCP-facing API accepts 1-based insertAtLine)
 */
export function registerEditTools(server: McpServer): void {
  // create_file_code
  server.tool(
    'create_file_code',
    `Creates new files or completely rewrites existing files. Opens the file in editor when done.`,
    {
      path: z.string().describe('The path to the file to create'),
      content: z.string().describe('The content to write to the file'),
      overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if the file exists'),
      ignoreIfExists: z.boolean().optional().default(false).describe('Whether to ignore if the file exists')
    },
    async ({ path, content, overwrite = false, ignoreIfExists = false }): Promise<CallToolResult> => {
      try {
        await createWorkspaceFile(path, content, overwrite, ignoreIfExists);
        
        return {
          content: [
            { type: 'text', text: `File ${path} created and opened in editor` }
          ]
        };
      } catch (error) {
        console.error('[create_file] Error:', error);
        throw error;
      }
    }
  );

  // replace_lines_code — MCP boundary uses 1-based line numbers
  server.tool(
    'replace_lines_code',
    `Replaces specific lines in existing files with exact content validation. Use 1-based startLine/endLine values. Opens file before editing.`,
    {
      path: z.string().describe('The path to the file to modify'),
      startLine: z.number().describe('The start line number (1-based, inclusive)'),
      endLine: z.number().describe('The end line number (1-based, inclusive)'),
      content: z.string().describe('The new content to replace the lines with'),
      originalCode: z.string().describe('The original code for validation - must match exactly')
    },
    async ({ path, startLine, endLine, content, originalCode }): Promise<CallToolResult> => {
      try {
        const zeroStart = startLine > 0 ? startLine - 1 : startLine;
        const zeroEnd = endLine > 0 ? endLine - 1 : endLine;
        await replaceWorkspaceFileLines(path, zeroStart, zeroEnd, content, originalCode);
        
        return {
          content: [
            { type: 'text', text: `Lines ${startLine}-${endLine} in file ${path} replaced and file opened in editor` }
          ]
        };
      } catch (error) {
        console.error('[replace_lines_code] Error:', error);
        throw error;
      }
    }
  );

  // type_into_file_code — MCP accepts 1-based insertAtLine for convenience
  server.tool(
    'type_into_file_code',
    `Types text into the given file character-by-character at specified speed (ms per character). The file will be opened and saved when finished.`,
    {
      path: z.string().describe('The path to the file to type into'),
      content: z.string().describe('The text to type into the file'),
      speedMsPerChar: z.number().optional().default(50).describe('Milliseconds delay between each character'),
      insertAtLine: z.number().optional().default(-1).describe('1-based line number to insert at (default = end of file)'),
      insertAtColumn: z.number().optional().default(-1).describe('0-based column to insert at (default = end of line)')
    },
    async ({ path, content, speedMsPerChar = 50, insertAtLine = -1, insertAtColumn = -1 }): Promise<CallToolResult> => {
      try {
        const line = insertAtLine > 0 ? insertAtLine - 1 : null;
        const col = insertAtColumn >= 0 ? insertAtColumn : null;
        await typeIntoWorkspaceFile(path, content, speedMsPerChar, line, col);
        
        return {
          content: [
            { type: 'text', text: `Typed into ${path} at ${speedMsPerChar}ms/char and saved.` }
          ]
        };
      } catch (error) {
        console.error('[type_into_file_code] Error:', error);
        throw error;
      }
    }
  );
}
// focusWorkspaceWindow removed; focusExtensionDevHost is now only called in typeIntoWorkspaceFile

