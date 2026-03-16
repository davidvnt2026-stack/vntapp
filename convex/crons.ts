import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync delivery statuses every 1 hour for all users
// Only syncs orders with AWB that are not yet delivered
crons.interval(
  "sync-delivery-statuses",
  { hours: 1 },
  // @ts-ignore TS2589 from large generated api type graph
  internal.sameday.syncAllDeliveryStatusesCron
);


crons.daily(
  "create-daily-picking-lists",
  { hourUTC: 1, minuteUTC: 0 }, // 1:00 AM UTC (3:00 AM Romania)
  internal.pickingLists.createDailyPickingListsCron
);

export default crons;
