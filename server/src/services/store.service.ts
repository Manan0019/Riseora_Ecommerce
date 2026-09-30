import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

export const PRIMARY_STORE_SETTING_ID = "primary";

const defaultSettingData = {
  id: PRIMARY_STORE_SETTING_ID,
  storeName: "Riseora Herbals",
  country: "India",
  invoicePrefix: "RISE",
  invoiceNextNumber: 1,
  flatShippingFee: 0,
  codFee: 0,
  dispatchWithinDays: 2,
  deliveryMinDays: 3,
  deliveryMaxDays: 7,
  lowStockUrgencyThreshold: 5,
  returnsEnabled: true,
  returnWindowDays: 7,
} as const;

export async function getStoreSettings(client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.storeSetting.upsert({
    where: { id: PRIMARY_STORE_SETTING_ID },
    create: defaultSettingData,
    update: {},
  });
}

export function calculateShippingFee(input: {
  merchandiseAfterDiscount: number;
  paymentMethod: "COD" | "ONLINE";
  settings: {
    freeShippingThreshold: unknown;
    flatShippingFee: unknown;
    codFee: unknown;
  };
}) {
  const threshold = input.settings.freeShippingThreshold == null ? null : Number(input.settings.freeShippingThreshold);
  const flat = Math.max(0, Number(input.settings.flatShippingFee || 0));
  const codFee = input.paymentMethod === "COD" ? Math.max(0, Number(input.settings.codFee || 0)) : 0;
  const baseShipping = threshold !== null && input.merchandiseAfterDiscount >= threshold ? 0 : flat;
  return Number((baseShipping + codFee).toFixed(2));
}

export function sellerAddressSnapshot(settings: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  return {
    line1: settings.addressLine1 || "",
    line2: settings.addressLine2 || "",
    city: settings.city || "",
    state: settings.state || "",
    postalCode: settings.postalCode || "",
    country: settings.country || "India",
  };
}
