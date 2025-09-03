import * as vscode from "vscode";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger";
import * as fs from "fs";

export type FileListingResult = Array<{
  path: string;
  type: "file" | "directory";
}>;

const DEFAULT_MAX_CHARACTERS = 100000;
const DEFAULT_IGNORED_DIRS = new Set([
  // Node.js / frontend
  "node_modules", "bower_components", ".yarn", ".pnpm-store", ".pnp", ".pnp.js",

  // IDE / editor
  ".idea", ".vscode", ".vscodespaces", ".history",

  // Python / virtualenv / caches
  ".venv", "venv", "ENV", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".cache", ".pdm-cache", ".tox",

  // Java / JVM / Gradle / Maven
  "build", "target", ".gradle", ".m2", ".ivy2", "*.class",

  // Ruby / gems
  "vendor", ".bundle", "*.gem", "*.lock", "*.egg-info",

  // C / C++ build
  "bin", "obj", "*.o", "*.obj", "*.exe", "*.out", "*.dll", "*.so",

  // Frontend / framework build
  "dist", "out", ".next", ".nuxt", ".serverless", ".parcel-cache", ".cache-loader",

  // Containers / infra / terraform
  ".terraform", ".vagrant",

  // Misc caches & temporary files
  ".cache", "coverage", ".sass-cache", ".DS_Store", "Thumbs.db", "*.log", "*.tmp", "*.swp", "*.swo",

  // Version control
  ".git", ".gitignore", ".svn", ".hg", "CVS",

  // System / platform folders
  "Program Files", "Program Files (x86)", "ProgramData", "Windows",

  // Others
  ".history", "*.bak", "*.old", "*.backup"
]);

function workspaceRootUri(): vscode.Uri {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    throw new Error("No workspace folder is open");
  }
  return vscode.workspace.workspaceFolders[0].uri;
}

/**
 * Wait for workspace to be properly initialized
 */
async function waitForWorkspace(timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      logger.info(`Workspace is ready: ${vscode.workspace.workspaceFolders[0].uri.fsPath}`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Opens workspace for a file and waits for it to be ready
 */
async function openWorkspaceForFile(filePath: string): Promise<void> {
  let folder: string;

  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        folder = path.dirname(filePath);
      } else {
        folder = filePath;
      }
    } else {
      // If file doesn't exist, try to determine if it's a filename or directory
      if (path.extname(filePath)) {
        // Has extension, treat as file
        folder = path.dirname(filePath);
      } else {
        // No extension, treat as directory
        folder = filePath;
      }
    }
  } catch (error) {
    logger.warn(`Error checking file path ${filePath}: ${error}. Using current working directory.`);
    folder = process.cwd();
  }

  // Ensure folder exists
  if (!fs.existsSync(folder)) {
    logger.warn(`Folder ${folder} doesn't exist. Using current working directory.`);
    folder = process.cwd();
  }

  const uri = vscode.Uri.file(folder);
  logger.info(`Opening workspace at: ${folder}`);

  // Open folder as workspace (false = replace current workspace)
  await vscode.commands.executeCommand("vscode.openFolder", uri, false);

  // Wait for workspace to be ready
  const isReady = await waitForWorkspace();
  if (!isReady) {
    throw new Error(`Workspace failed to initialize within timeout at ${folder}`);
  }

  logger.info(`Workspace successfully opened at: ${folder}`);
  await focusWorkspaceWindow();

}

/**
 * List files in workspace
 */
export async function listWorkspaceFiles(
  workspacePath: string,
  recursive: boolean = false,
  ignored: Set<string> = DEFAULT_IGNORED_DIRS
): Promise<FileListingResult> {
  const root = workspaceRootUri();
  const targetUri = vscode.Uri.joinPath(root, workspacePath);

  async function processDirectory(dirUri: vscode.Uri, currentPath = ""): Promise<FileListingResult> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch (error) {
      logger.warn(`Failed to read directory ${dirUri.fsPath}: ${error}`);
      return [];
    }

    const result: FileListingResult = [];
    for (const [name, type] of entries) {
      if (ignored.has(name)) continue;
      const entryPath = currentPath ? path.join(currentPath, name) : name;
      const itemType: "file" | "directory" = type & vscode.FileType.Directory ? "directory" : "file";
      result.push({ path: entryPath, type: itemType });

      if (recursive && itemType === "directory") {
        const subDirUri = vscode.Uri.joinPath(dirUri, name);
        const subEntries = await processDirectory(subDirUri, entryPath);
        result.push(...subEntries);
      }
    }
    return result;
  }

  return await processDirectory(targetUri);
}

/**
 * Read a workspace file
 */
export async function readWorkspaceFile(
  workspacePath: string,
  encoding: string = "utf-8",
  maxCharacters: number = DEFAULT_MAX_CHARACTERS,
  startLine: number = -1,
  endLine: number = -1
): Promise<string> {
  const root = workspaceRootUri();
  const fileUri = vscode.Uri.joinPath(root, workspacePath);

  const fileContent = await vscode.workspace.fs.readFile(fileUri);
  const textContent = encoding === "base64"
    ? Buffer.from(fileContent).toString("base64")
    : new TextDecoder(encoding).decode(fileContent);

  if (textContent.length > maxCharacters) {
    throw new Error(`File content exceeds ${maxCharacters} characters`);
  }

  if (startLine >= 0 || endLine >= 0) {
    const lines = textContent.split("\n");
    const s = startLine >= 0 ? startLine : 0;
    const e = endLine >= 0 ? Math.min(endLine, lines.length - 1) : lines.length - 1;
    return lines.slice(s, e + 1).join("\n");
  }

  return textContent;
}

/**
 * Recursively find files by name across the entire filesystem (starting from common locations)
 */
async function findFilesInFileSystem(targetName: string): Promise<string[]> {
  const found: string[] = [];

  // Common search locations
  const searchPaths = [
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(process.cwd(), '../..'),
  ];

  // Add user home directory and desktop if available
  if (process.env.HOME) {
    searchPaths.push(process.env.HOME);
    searchPaths.push(path.join(process.env.HOME, 'Desktop'));
    searchPaths.push(path.join(process.env.HOME, 'Documents'));
  }
  if (process.env.USERPROFILE) {
    searchPaths.push(process.env.USERPROFILE);
    searchPaths.push(path.join(process.env.USERPROFILE, 'Desktop'));
    searchPaths.push(path.join(process.env.USERPROFILE, 'Documents'));
  }

  async function walkDirectory(dirPath: string, depth: number = 0): Promise<void> {
    // Limit search depth to avoid infinite recursion
    if (depth > 3) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && (entry.name === targetName || entry.name.includes(targetName))) {
          found.push(fullPath);
        } else if (entry.isDirectory() && !DEFAULT_IGNORED_DIRS.has(entry.name)) {
          await walkDirectory(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // Silently ignore permission errors and continue
    }
  }

  // Search in parallel across different root paths
  await Promise.all(
    searchPaths.map(async (searchPath) => {
      if (fs.existsSync(searchPath)) {
        await walkDirectory(searchPath);
      }
    })
  );

  // Remove duplicates and sort
  return [...new Set(found)].sort();
}

/**
 * Recursively find files by name
 */
export async function findFilesRecursively(
  startPath: string,
  targetName: string,
  ignored: Set<string> = DEFAULT_IGNORED_DIRS
): Promise<string[]> {
  // First try to search within workspace if available
  let found: string[] = [];

  try {
    const root = workspaceRootUri();
    const startUri = vscode.Uri.joinPath(root, startPath);

    async function walk(dirUri: vscode.Uri, relPrefix = ""): Promise<void> {
      let entries: [string, vscode.FileType][];
      try {
        entries = await vscode.workspace.fs.readDirectory(dirUri);
      } catch {
        return;
      }

      for (const [name, type] of entries) {
        if (ignored.has(name)) continue;
        const entryRel = relPrefix ? path.join(relPrefix, name) : name;
        const entryUri = vscode.Uri.joinPath(dirUri, name);

        if (type & vscode.FileType.Directory) {
          await walk(entryUri, entryRel);
        } else if (name === targetName || entryRel.includes(targetName)) {
          found.push(entryRel);
        }
      }
    }

    await walk(startUri, startPath === "." ? "" : startPath);
  } catch (error) {
    logger.info(`Workspace search failed: ${error}. Falling back to filesystem search.`);
  }

  // If no files found in workspace, search the filesystem
  if (found.length === 0) {
    logger.info(`No files found in workspace, searching filesystem for: ${targetName}`);
    found = await findFilesInFileSystem(targetName);
  }

  return found;
}

/**
 * Register MCP file tools
 */
export function registerFileTools(server: McpServer): void {
  // list files
  server.tool(
    "list_files_code",
    "Lists files in workspace",
    { path: z.string(), recursive: z.boolean().optional().default(false) },
    async ({ path: workspacePath, recursive = false }) => {
      try {
        // Ensure workspace is ready
        const isReady = await waitForWorkspace();
        if (!isReady) {
          throw new Error("Workspace not initialized");
        }

        const files = await listWorkspaceFiles(workspacePath, recursive);
        await focusWorkspaceWindow();
        return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
      } catch (error) {
        logger.error(`Error listing files: ${error}`);
        throw error;
      }
    }
  );

  // read file
  server.tool(
    "read_file_code",
    "Reads file content",
    {
      path: z.string(),
      encoding: z.string().optional().default("utf-8"),
      maxCharacters: z.number().optional().default(DEFAULT_MAX_CHARACTERS)
    },
    async ({ path: p, encoding, maxCharacters }) => {
      try {
        // Ensure workspace is ready
        const isReady = await waitForWorkspace();
        if (!isReady) {
          throw new Error("Workspace not initialized");
        }

        const content = await readWorkspaceFile(p, encoding, maxCharacters);
        await focusWorkspaceWindow();
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        logger.error(`Error reading file ${p}: ${error}`);
        throw error;
      }
    }
  );

  // find file - Updated to handle your workflow
  server.tool(
    "find_file_code",
    "Search for files recursively and open workspace",
    {
      startPath: z.string().optional().default("."),
      targetName: z.string().describe("The filename to search for (e.g., '1543.cpp')"),
      openWorkspace: z.boolean().optional().default(true).describe("Whether to automatically open workspace")
    },
    async ({ startPath = ".", targetName, openWorkspace = true }) => {
      try {
        logger.info(`Searching for file: ${targetName}`);
        const matches = await findFilesRecursively(startPath, targetName);

        if (matches.length === 0) {
          logger.info(`File ${targetName} not found. Opening default workspace.`);
          if (openWorkspace) {
            await openWorkspaceForFile(process.cwd());
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                matches: [],
                message: `File '${targetName}' not found. Opened default workspace at: ${process.cwd()}`,
                workspaceOpened: process.cwd()
              }, null, 2)
            }]
          };
        } else if (matches.length === 1) {
          logger.info(`File found: ${matches[0]}`);
          if (openWorkspace) {
            await openWorkspaceForFile(matches[0]);
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                matches: matches,
                selectedFile: matches[0],
                message: `Found single file: ${matches[0]}. Workspace opened.`,
                workspaceOpened: path.dirname(matches[0])
              }, null, 2)
            }]
          };
        } else {
          logger.info(`Multiple matches found for ${targetName}: ${matches.join(", ")}`);
          await focusWorkspaceWindow();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                matches: matches,
                message: `Multiple files found with name '${targetName}'. Please select one:`,
                instruction: "Use 'open_workspace_for_file' tool with the specific path you want to work with."
              }, null, 2)
            }]
          };
        }
      } catch (error) {
        logger.error(`Error finding file ${targetName}: ${error}`);
        throw error;
      }
    }
  );

  // New tool to open workspace for a specific file path
  server.tool(
    "open_workspace_for_file",
    "Opens VS Code workspace for a specific file path",
    {
      filePath: z.string().describe("Full path to the file or directory to open workspace for")
    },
    async ({ filePath }) => {
      try {
        logger.info(`Opening workspace for file: ${filePath}`);
        await openWorkspaceForFile(filePath);
        const workspaceDir = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
          ? path.dirname(filePath)
          : filePath;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Workspace opened successfully`,
              workspacePath: workspaceDir,
              targetFile: filePath
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error(`Error opening workspace for ${filePath}: ${error}`);
        throw error;
      }
    }
  );
}
async function focusWorkspaceWindow() {
  try {
    await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  } catch (err) {
    logger.warn(`Failed to focus workspace window: ${err}`);
  }
}
