const vscode = require("vscode");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

let output;
let fileIndex = new Map();
let scanCount = 0;

// Utility to sleep
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Type code char‑by‑char in the given editor
async function typeCharByChar(editor, code, wpm) {
  const cps = (wpm * 5) / 60;
  const delay = 1000 / cps;

  // wipe existing
  await editor.edit((edit) => {
    const endLine = editor.document.lineCount - 1;
    const endChar = editor.document.lineAt(endLine).text.length;
    edit.delete(new vscode.Range(0, 0, endLine, endChar));
  });

  for (const ch of code) {
    await editor.edit((edit) => {
      edit.insert(editor.selection.active, ch);
    });
    await sleep(delay);
  }
}

// Open terminal and run a command
async function runInTerminal(cmd, cwd) {
  const term = vscode.window.createTerminal({
    name: "CharWriter",
    cwd,
  });
  term.show();
  await sleep(300);
  term.sendText(cmd);
}

// Directories to skip during scan
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "venv",
  "__pycache__",
  ".vscode",
  "dist",
  "build",
  "out",
  "bin",
  "obj",
  ".env",
  ".venv",
  ".cache",
  "AppData",
  "Program Files",
  "Program Files (x86)",
  "$Recycle.Bin",
  "System Volume Information",
  "Recovery",
  "Python312",
]);

function buildFileIndex(baseDirs) {
  output.appendLine("⏳ Starting recursive file indexing...");
  for (const base of baseDirs) {
    scanDir(base);
  }
  output.appendLine(`✅ Indexed ${scanCount} files`);
}

function scanDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        scanDir(path.join(dir, entry.name));
      } else {
        const fullPath = path.join(dir, entry.name);
        const name = entry.name.toLowerCase();
        if (!fileIndex.has(name)) fileIndex.set(name, []);
        fileIndex.get(name).push(fullPath);
        scanCount++;
        if (scanCount % 5000 === 0) {
          output.appendLine(`📦 Indexed ${scanCount} files...`);
        }
      }
    }
  } catch (e) {
    // Ignore permission errors or broken symlinks
  }
}

function activate(context) {
  output = vscode.window.createOutputChannel("CharWriter Logs");
  output.show(true);
  output.appendLine("🚀 Extension activated via URI");

  const projectDirs = ["C:\\"];

  output.appendLine(`ℹ️ Scanning: ${projectDirs.join(", ")}`);
  buildFileIndex(projectDirs);

  // URI handler
  const handler = {
    handleUri(uri) {
      output.appendLine(`🔗 URI Activated: ${uri.toString()}`);
      vscode.window.showInformationMessage(`CharWriter activated via URI: ${uri.toString()}`);
    }
  };

  context.subscriptions.push(vscode.window.registerUriHandler(handler));

  // Optional HTTP server (if you still want to allow local triggering)
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "POST" && req.url === "/trigger") {
      output.appendLine("📬 /trigger received");
      let body = "";
      output.appendLine(req);
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { filename, code, language } = JSON.parse(body);
          const name = filename.toLowerCase();
          const matches = fileIndex.get(name) || [];

          if (!matches.length) {
            output.appendLine(`❌ File not found: ${filename}`);
            vscode.window.showErrorMessage(`File not found: ${filename}`);
            res.writeHead(404);
            return res.end("Not found");
          }

          const filePath = matches[0];
          output.appendLine(`✅ Found: ${filePath}`);

          const doc = await vscode.workspace.openTextDocument(filePath);
          const editor = await vscode.window.showTextDocument(doc);
          await typeCharByChar(editor, code, 40);

          const cmd =
            language === "js"
              ? `node "${filePath}"`
              : language === "py"
              ? `python "${filePath}"`
              : null;

          if (cmd) {
            output.appendLine(`▶️ Running: ${cmd}`);
            await runInTerminal(cmd, path.dirname(filePath));
          }

          res.writeHead(200);
          res.end("OK");
        } catch (err) {
          output.appendLine(`⚠️ Error: ${err.message}`);
          console.error(err);
          res.writeHead(500);
          res.end("Error");
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(5055, "127.0.0.1", () => {
    output.appendLine("📡 Server listening at http://127.0.0.1:5055/trigger");
  });

  context.subscriptions.push({ dispose: () => server.close() });
}

function deactivate() {
  if (output) output.dispose();
}

module.exports = { activate, deactivate };
