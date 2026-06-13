import { loadDashboardData } from "../../src/dashboard/data.js";
import { readUsageRecords } from "../../src/notifications/usage-tracker.js";

const cwd = process.argv[2] || process.cwd();
const data = await loadDashboardData({ cwd });
console.log(JSON.stringify(data));
