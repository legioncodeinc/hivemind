import { loadConfig } from "../../../../src/config.js";
import { DeeplakeApi } from "../../../../src/api/deeplake-api.js";
import { listRules } from "../../../../src/rules/read.js";

const status = process.argv[2] || "active";
const limit = parseInt(process.argv[3] || "10", 10);

const config = loadConfig();
if (!config) {
  console.log(JSON.stringify({
    loggedOut: true,
    rules: [],
    message: "Log in with `hivemind login` to manage team rules.",
  }));
  process.exit(0);
}

const api = new DeeplakeApi(
  config.token,
  config.apiUrl,
  config.orgId,
  config.workspaceId,
  config.skillsTableName,
);
const query = (sql) => api.query(sql);
const rows = await listRules(query, config.rulesTableName, { status, limit });
console.log(JSON.stringify({
  loggedOut: false,
  rules: rows.map((r) => ({
    id: r.rule_id,
    status: r.status,
    version: r.version,
    author: r.assigned_by,
    text: r.text,
  })),
}));
