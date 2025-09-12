import { windowManager } from "node-window-manager";
import { logger } from "../utils/logger";

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
  logger.info(`Found window: ${target.getTitle()}`);

  // Minimize the current active window (if it's not already the target)
  const activeWin = windowManager.getActiveWindow();
  if (activeWin && activeWin.getTitle() === target.getTitle()) {
    //console.log("✅ Extension Development Host is already focused.");
    return;
  }

  // if (activeWin && activeWin !== target) {
  //   activeWin.minimize();
  // }

  // Always try to restore first (safe, even if not minimized)
  target.restore();
  target.maximize();
  target.bringToTop();
  // target.focus();

  console.log(`✅ Popped up: ${target.getTitle()}`);
}
