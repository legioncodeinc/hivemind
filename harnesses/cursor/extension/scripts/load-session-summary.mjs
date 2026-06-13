import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadCredentials } from "../../../../src/commands/auth-creds.js";
import { loadConfig } from "../../../../src/config.js";
import { DeeplakeApi } from "../../../../src/deeplake-api.js";
import { sqlStr, sqlIdent } from "../../../../src/utils/sql.js";

const sessionId = process.argv[2];
const userArg = process.argv[3] ?? "";

if (!sessionId || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
  console.log(JSON.stringify({ text: null, source: "invalid", message: "Invalid session id." }));
  process.exit(0);
}

function localSummaryPath(userName) {
  if (!userName || userName.includes("/") || userName.includes("\\") || userName.includes("..")) {
    return null;
  }
  return join(homedir(), ".deeplake", "memory", "summaries", userName, `${sessionId}.md`);
}

function readLocal(userName) {
  const path = localSummaryPath(userName);
  if (!path || !existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

async function readRemote(creds) {
  if (!creds?.token || !creds.userName || !creds.orgId) return { text: null, unreachable: false };
  const cfg = loadConfig();
  let table;
  try {
    table = sqlIdent(cfg?.tableName ?? "memory");
  } catch {
    return { text: null, unreachable: false };
  }
  const api = new DeeplakeApi(
    creds.token,
    creds.apiUrl ?? "https://api.deeplake.ai",
    creds.orgId,
    creds.workspaceId ?? "default",
    table,
  );
  const vpath = `/summaries/${creds.userName}/${sessionId}.md`;
  try {
    const rows = await Promise.race([
      api.query(
        `SELECT summary FROM "${table}" WHERE path = '${sqlStr(vpath)}' AND author = '${sqlStr(creds.userName)}' ` +
          `AND summary <> '' ORDER BY last_update_date DESC LIMIT 1`,
      ),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    if (!rows || rows.length === 0) return { text: null, unreachable: false };
    const summary = rows[0]?.summary;
    return { text: typeof summary === "string" && summary.trim() ? summary : null, unreachable: false };
  } catch {
    return { text: null, unreachable: true };
  }
}

const creds = loadCredentials();
const userName = userArg || creds?.userName || "unknown";

const remote = await readRemote(creds);
if (remote.text) {
  console.log(JSON.stringify({ text: remote.text, source: "remote", message: null }));
  process.exit(0);
}

const local = readLocal(userName);
if (local) {
  console.log(JSON.stringify({ text: local, source: "local", message: null }));
  process.exit(0);
}

if (remote.unreachable) {
  console.log(
    JSON.stringify({
      text: null,
      source: "unreachable",
      message: "Memory table unreachable. Showing no summary until connectivity returns.",
    }),
  );
  process.exit(0);
}

console.log(
  JSON.stringify({
    text: null,
    source: "missing",
    message: `No summary found for session ${sessionId}.`,
  }),
);
