import { cleanupExpiredAuthSessions } from "./auth-security.service";
import { processCartRecoveryReminders } from "./cart-recovery.service";
import { releaseExpiredCheckoutSessions } from "./checkout.service";
import { notifyEligiblePriceAlerts } from "./price-alert.service";
import { processDueRefillReminders } from "./refill-reminder.service";
import { runSystemJob, type SystemJobKey } from "./system-job.service";

const handlers: Record<SystemJobKey, () => Promise<unknown>> = {
  CHECKOUT_CLEANUP: async () => {
    await releaseExpiredCheckoutSessions();
    return { completed: true };
  },
  CART_RECOVERY: () => processCartRecoveryReminders(),
  PRICE_ALERTS: () => notifyEligiblePriceAlerts(),
  REFILL_REMINDERS: () => processDueRefillReminders(),
  AUTH_SESSION_CLEANUP: () => cleanupExpiredAuthSessions(),
};

export async function runBackgroundJob(key: SystemJobKey) {
  return runSystemJob(key, handlers[key]);
}

export async function runLifecycleJobs() {
  return Promise.allSettled([
    runBackgroundJob("CART_RECOVERY"),
    runBackgroundJob("PRICE_ALERTS"),
    runBackgroundJob("REFILL_REMINDERS"),
  ]);
}
