import { readUsageRecords } from "../../../../src/notifications/usage-tracker.js";

const records = readUsageRecords().slice(-20).reverse();
console.log(JSON.stringify(records.map((r) => ({
  sessionId: r.sessionId,
  endedAt: r.endedAt,
  memorySearchCount: r.memorySearchCount,
  project: r.project ?? null,
  hadRecall: (r.memorySearchCount ?? 0) > 0,
}))));
