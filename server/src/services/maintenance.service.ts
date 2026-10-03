import { getStoreSettings } from "./store.service";

export type MaintenanceSnapshot = {
  configured: boolean;
  active: boolean;
  message: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function evaluateMaintenance(input: {
  maintenanceEnabled?: boolean | null;
  maintenanceMessage?: string | null;
  maintenanceStartsAt?: Date | string | null;
  maintenanceEndsAt?: Date | string | null;
}, now = new Date()): MaintenanceSnapshot {
  const startsAt = input.maintenanceStartsAt ? new Date(input.maintenanceStartsAt) : null;
  const endsAt = input.maintenanceEndsAt ? new Date(input.maintenanceEndsAt) : null;
  const configured = Boolean(input.maintenanceEnabled);
  const afterStart = !startsAt || startsAt <= now;
  const beforeEnd = !endsAt || endsAt > now;
  return {
    configured,
    active: configured && afterStart && beforeEnd,
    message: input.maintenanceMessage?.trim() || null,
    startsAt,
    endsAt,
  };
}

export async function currentMaintenance() {
  return evaluateMaintenance(await getStoreSettings());
}
