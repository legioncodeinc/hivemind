import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { backfillCursorLinks, listLocalSkillsForPromoter, skillDirLabel, syncSkillsToCursor } from "../bridge/skill-sync";
import { detectAuthState, formatIdentity, loadStoredCredentials } from "../auth";
import { runHealthCheck } from "../health/checker";
import { computeImpactOverlay } from "../graph/impact-overlay";
import { openNodeInEditor, startEditorToGraphSync, type EditorGraphSyncHandle } from "../graph/editor-sync";
import { loadGraphSnapshotFromEnvelope, parseGraphSnapshot } from "../graph/snapshot-loader";
import type { GraphSnapshot } from "../graph/types";
import { logError } from "../utils/output";
import { getDashboardHtml } from "./html/dashboard-shell";
import { loadDashboardData, loadRecentSessions, runHivemindCli } from "./data-bridge";

type DashboardPane = "kpi" | "settings" | "sessions" | "graph" | "rules" | "skills";

const NEXT_STEPS_SECTION_RE = /^##\s+Next Steps\s*$/im;

interface WebviewInboundMessage {
  type: string;
  pane?: DashboardPane;
  sessionId?: string;
  text?: string;
  ruleId?: string;
  nodeId?: string;
  dirName?: string;
  orgName?: string;
}

interface ParsedRule {
  id: string;
  status: string;
  version: number;
  author: string;
  text: string;
}

function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
}

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function readSessionSummary(sessionId: string): string | null {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const creds = loadStoredCredentials();
  const user = creds?.userName ?? "unknown";
  if (user.includes("/") || user.includes("\\") || user.includes("..")) return null;
  const path = join(homedir(), ".deeplake", "memory", "summaries", user, `${sessionId}.md`);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function extractNextSteps(summary: string): string[] {
  const match = NEXT_STEPS_SECTION_RE.exec(summary);
  if (!match) return [];
  const after = summary.slice(match.index + match[0].length);
  const nextSection = after.search(/^##\s/m);
  const block = nextSection >= 0 ? after.slice(0, nextSection) : after;
  return block
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function parseRulesList(stdout: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\[(active|done)\]\s+(\S+)\s+v(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) continue;
    rules.push({
      status: m[1]!,
      id: m[2]!,
      version: parseInt(m[3]!, 10),
      author: m[4]!,
      text: m[5]!,
    });
  }
  return rules;
}

class DashboardController {
  private editorSync: EditorGraphSyncHandle | undefined;
  private snapshot: GraphSnapshot | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly disposables: vscode.Disposable[],
  ) {
    webview.options = { enableScripts: true };
    webview.html = getDashboardHtml(webview, vscode.Uri.file(__dirname));

    disposables.push(
      webview.onDidReceiveMessage((msg: WebviewInboundMessage) => {
        void this.handleMessage(msg);
      }),
    );
  }

  dispose(): void {
    this.editorSync?.dispose();
  }

  async refreshAll(): Promise<void> {
    await this.pushDashboardData();
    await this.pushSettings();
    await this.pushSessions();
    await this.pushRules();
    await this.pushSkills();
  }

  private post(message: Record<string, unknown>): void {
    void this.webview.postMessage(message);
  }

  private async handleMessage(msg: WebviewInboundMessage): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
        case "refresh":
          await this.refreshAll();
          break;
        case "setPane":
          if (msg.pane === "graph" && this.snapshot) this.ensureEditorSync();
          break;
        case "openSession":
          if (msg.sessionId) {
            const text = readSessionSummary(msg.sessionId);
            const nextSteps = text ? extractNextSteps(text) : [];
            this.post({
              type: "sessionSummary",
              text: text ?? `No summary file found for session ${msg.sessionId}.`,
              nextSteps,
            });
          }
          break;
        case "toggleEmbeddings": {
          const status = await runHivemindCli(["embeddings", "status"], workspaceRoot());
          const enabled = status.stdout.toLowerCase().includes("enabled: true");
          const cmd = enabled ? ["embeddings", "disable"] : ["embeddings", "enable"];
          const result = await runHivemindCli(cmd, workspaceRoot());
          await this.pushSettings();
          this.post({
            type: "actionResult",
            target: "embeddings",
            ok: result.ok,
            message: result.ok ? (enabled ? "Embeddings disabled." : "Embeddings enabled.") : result.stderr,
          });
          break;
        }
        case "buildGraph": {
          const result = await runHivemindCli(["graph", "build"], workspaceRoot());
          this.post({
            type: "actionResult",
            target: "graphBuild",
            ok: result.ok,
            message: result.ok ? "Graph build finished." : result.stderr || "Graph build failed.",
          });
          if (result.ok) await this.pushDashboardData();
          break;
        }
        case "syncSkills": {
          backfillCursorLinks(workspaceRoot());
          const state = syncSkillsToCursor(workspaceRoot());
          this.post({
            type: "actionResult",
            target: "skillSync",
            ok: state.erroredCount === 0,
            message: `${state.syncedCount} synced, ${state.skippedCount} partial, ${state.erroredCount} failed.`,
          });
          await this.pushSettings();
          await this.pushSkills();
          break;
        }
        case "rulesList":
          await this.pushRules();
          break;
        case "rulesAdd":
          if (msg.text) {
            const result = await runHivemindCli(["rules", "add", msg.text, "--scope", "team"], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule added." : result.stderr,
            });
          }
          break;
        case "rulesDone":
          if (msg.ruleId) {
            const result = await runHivemindCli(["rules", "done", msg.ruleId], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule completed." : result.stderr,
            });
          }
          break;
        case "rulesEdit":
          if (msg.ruleId && msg.text) {
            const result = await runHivemindCli(["rules", "edit", msg.ruleId, msg.text], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule updated." : result.stderr,
            });
          }
          break;
        case "promoteSkill":
          if (msg.dirName) {
            const skillName = msg.dirName.replace(/--[^/]+$/, "");
            const publishResult = await runHivemindCli(
              ["skillify", "promote", skillName, "--scope", "team"],
              workspaceRoot(),
            );
            this.post({
              type: "actionResult",
              target: "skillPromote",
              ok: publishResult.ok,
              message: publishResult.ok
                ? `Skill "${skillName}" promoted to team. Teammates will pull it on their next session.`
                : publishResult.stderr || "Promotion failed.",
            });
            await this.pushSkills();
          }
          break;
        case "nextStepsPromote":
          if (msg.text) {
            const result = await runHivemindCli(["goal", "add", msg.text], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "nextStepsGoal",
              ok: result.ok,
              message: result.ok ? `Goal created: "${msg.text}"` : result.stderr || "Failed to create goal.",
            });
          }
          break;
        case "switchOrg":
          if (msg.orgName) {
            const result = await runHivemindCli(["org", "switch", msg.orgName], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "orgSwitch",
              ok: result.ok,
              message: result.ok ? `Switched to org "${msg.orgName}".` : result.stderr || "Org switch failed.",
            });
            if (result.ok) await this.pushSettings();
          }
          break;
        case "computeImpact":
          if (this.snapshot) {
            const impact = computeImpactOverlay(this.snapshot, workspaceRoot());
            this.post({ type: "impact", impact });
          }
          break;
        case "graphNodeClick":
          if (msg.nodeId && this.snapshot) {
            const node = this.snapshot.nodes.find((n) => n.id === msg.nodeId);
            if (node) {
              const opened = await openNodeInEditor(node, workspaceRoot());
              if (opened.message) {
                void vscode.window.showInformationMessage(opened.message);
              }
            }
          }
          break;
        default:
          break;
      }
    } catch (err: unknown) {
      logError("Dashboard message handler failed", err);
      this.post({ type: "error", message: "Action failed." });
    }
  }

  private ensureEditorSync(): void {
    if (!this.snapshot || this.editorSync) return;
    this.editorSync = startEditorToGraphSync(this.snapshot, workspaceRoot(), (nodeIds) => {
      this.post({ type: "graphHighlight", nodeIds });
    });
    this.disposables.push({ dispose: () => this.editorSync?.dispose() });
  }

  private async pushDashboardData(): Promise<void> {
    const data = await loadDashboardData(workspaceRoot());
    this.snapshot = loadGraphSnapshotFromEnvelope(data);
    if (!this.snapshot && data.graph?.snapshot) {
      this.snapshot = parseGraphSnapshot(data.graph.snapshot);
    }
    this.post({ type: "dashboardData", data });
    if (this.snapshot) this.ensureEditorSync();
  }

  private async pushSettings(): Promise<void> {
    const auth = await detectAuthState();
    const health = await runHealthCheck();
    const emb = await runHivemindCli(["embeddings", "status"], workspaceRoot());
    const sync = syncSkillsToCursor(workspaceRoot());
    const healthSummary = health.dimensions.map((d) => `${d.label}: ${d.status}`).join(" · ");
    this.post({
      type: "settings",
      authLabel: formatIdentity(auth),
      healthSummary,
      embeddingsStatus: emb.ok ? emb.stdout.split("\n")[0] ?? "unknown" : "unavailable",
      skillSyncSummary: `Last sync: ${sync.syncedCount} ok, ${sync.erroredCount} failed`,
      graphBuildMessage: "",
    });
  }

  private async pushSessions(): Promise<void> {
    const sessions = await loadRecentSessions(workspaceRoot());
    this.post({ type: "sessions", sessions });
  }

  private async pushRules(): Promise<void> {
    const result = await runHivemindCli(["rules", "list", "--status", "active", "--limit", "25"], workspaceRoot());
    const rules = result.ok ? parseRulesList(result.stdout) : [];
    this.post({ type: "rules", rules });
  }

  private async pushSkills(): Promise<void> {
    const skills = listLocalSkillsForPromoter().map((s) => ({
      dirName: s.dirName,
      label: skillDirLabel(s.dirName),
      scope: s.scope,
      path: s.path,
    }));
    this.post({ type: "skills", skills });
  }
}

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  public static readonly viewType = "hivemind.dashboardPanel";

  private readonly panel: vscode.WebviewPanel;
  private readonly controller: DashboardController;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      void DashboardPanel.currentPanel.controller.refreshAll();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      "Hivemind Dashboard",
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
    this.panel = panel;
    this.controller = new DashboardController(panel.webview, this.disposables);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) void this.controller.refreshAll();
      },
      null,
      this.disposables,
    );

    void this.controller.refreshAll();
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.controller.dispose();
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

class DashboardViewProvider implements vscode.WebviewViewProvider {
  private controller: DashboardController | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const disposables: vscode.Disposable[] = [];
    this.context.subscriptions.push(...disposables);
    this.controller = new DashboardController(webviewView.webview, disposables);
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) void this.controller?.refreshAll();
    });
    void this.controller.refreshAll();
  }
}

export function registerDashboardWebview(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hivemind.dashboard", new DashboardViewProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}
