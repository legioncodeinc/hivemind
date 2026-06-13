import { readUsageRecords } from "../../src/notifications/usage-tracker.js";

const cwd = process.argv[2] || process.cwd();
const records = readUsageRecords().slice(-20).reverse();
console.log(JSON.stringify(records.map((r) => ({
  sessionId: r.sessionId,
  endedAt: r.endedAt,
  memorySearchCount: r.memorySearchCount,
}))));
