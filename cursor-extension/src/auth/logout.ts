import { unlinkSync } from "node:fs";
import * as vscode from "vscode";
import { credentialsPath } from "../utils/paths";
import { logSafe } from "../utils/output";

export async function logout(): Promise<void> {
  let removed = false;
  try {
    unlinkSync(credentialsPath());
    removed = true;
  } catch {
    removed = false;
  }

  const message = removed
    ? "Hivemind credentials cleared from ~/.deeplake/credentials.json. Hooks remain installed; shared memory is inactive until you log in again."
    : "No credentials file found to remove. Hooks remain installed.";

  logSafe(message);
  await vscode.window.showInformationMessage(message);
}
