import { windowManager } from "node-window-manager";

export async function focusExtensionDevHost() {
  const windows = windowManager.getWindows();

  // Find VS Code Extension Development Host window
  const target = windows.find((win: any) =>
    win.getTitle().includes("[Extension Development Host]")
  );

  if (!target) {
    console.log("❌ Extension Development Host window not found!");
    return;
  }

  // Minimize the current active window (if it's not already the target)
  const activeWin = windowManager.getActiveWindow();
  if (activeWin && activeWin !== target) {
    activeWin.minimize();
  }

  // Always try to restore first (safe, even if not minimized)
  target.restore();

  target.bringToTop();
  //target.focus();

  console.log(`✅ Popped up: ${target.getTitle()}`);
}
