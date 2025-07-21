const vscode = require("vscode");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

function activate(context) {
  const app = express();
  const port = 3001;

  app.use(cors());
  app.use(express.json());

  app.get("/status", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/create-file", async (req, res) => {
    const { filename, content } = req.body;

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return res.status(400).json({ error: "No workspace open in VS Code." });
    }

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const filePath = path.join(workspacePath, filename);

    fs.writeFile(filePath, content, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, path: filePath });
    });
  });

  app.listen(port, () => {
    console.log(`🚀 MCP server running at http://localhost:${port}`);
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};