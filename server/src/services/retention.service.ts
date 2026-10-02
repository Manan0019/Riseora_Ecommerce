import { prisma } from "../config/prisma";

export const RETENTION_SEGMENTS = ["ALL_ACTIVE", "NEW_30D", "REPEAT_BUYERS", "HIGH_VALUE", "DORMANT_90D", "NO_PURCHASE"] as const;
export type RetentionSegment = (typeof RETENTION_SEGMENTS)[number];

export const RETENTION_SEGMENT_META: Record<RetentionSegment, { label: string; description: string }> = {
  ALL_ACTIVE: { label: "All active customers", description: "Every active customer account." },
  NEW_30D: { label: "New customers", description: "Accounts created in the last 30 days." },
  REPEAT_BUYERS: { label: "Repeat buyers", description: "Customers with at least two delivered orders." },
  HIGH_VALUE: { label: "High value", description: "Customers with ₹3,000+ delivered lifetime value." },
  DORMANT_90D: { label: "Dormant 90+ days", description: "Previous buyers whose latest order is more than 90 days old." },
  NO_PURCHASE: { label: "No purchase yet", description: "Registered customers who have not completed an order." },
};

type CustomerRow = {
  id: string; firstName: string; lastName: string | null; email: string; createdAt: Date;
  orders: Array<{ id: string; status: string; totalAmount: unknown; createdAt: Date }>;
};

function customerMetrics(customer: CustomerRow) {
  const validOrders = customer.orders.filter((o) => o.status !== "CANCELLED");
  const delivered = validOrders.filter((o) => o.status === "DELIVERED");
  const lifetimeValue = delivered.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const lastOrderAt = validOrders.length ? validOrders.reduce((latest, order) => order.createdAt > latest ? order.createdAt : latest, validOrders[0].createdAt) : null;
  return { validOrders, delivered, lifetimeValue, lastOrderAt };
}

function matchesSegment(customer: CustomerRow, segment: RetentionSegment, now = new Date()) {
  const metrics = customerMetrics(customer);
  const day = 24 * 60 * 60 * 1000;
  if (segment === "ALL_ACTIVE") return true;
  if (segment === "NEW_30D") return customer.createdAt >= new Date(now.getTime() - 30 * day);
  if (segment === "REPEAT_BUYERS") return metrics.delivered.length >= 2;
  if (segment === "HIGH_VALUE") return metrics.lifetimeValue >= 3000;
  if (segment === "DORMANT_90D") return Boolean(metrics.lastOrderAt && metrics.lastOrderAt < new Date(now.getTime() - 90 * day));
  if (segment === "NO_PURCHASE") return metrics.validOrders.length === 0;
  return false;
}

async function loadCustomers(): Promise<CustomerRow[]> {
  return prisma.user.findMany({
    where: { role: "CUSTOMER", isActive: true },
    select: {
      id: true, firstName: true, lastName: true, email: true, createdAt: true,
      orders: { select: { id: true, status: true, totalAmount: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  }) as unknown as Promise<CustomerRow[]>;
}

export async function getSegmentSummaries() {
  const customers = await loadCustomers();
  return RETENTION_SEGMENTS.map((key) => ({
    key, ...RETENTION_SEGMENT_META[key], count: customers.filter((customer) => matchesSegment(customer, key)).length,
  }));
}

export async function getSegmentCustomers(segment: RetentionSegment) {
  const customers = await loadCustomers();
  return customers.filter((customer) => matchesSegment(customer, segment)).map((customer) => {
    const metrics = customerMetrics(customer);
    return {
      id: customer.id, name: `${customer.firstName} ${customer.lastName || ""}`.trim(), email: customer.email, createdAt: customer.createdAt,
      orderCount: metrics.validOrders.length, deliveredOrders: metrics.delivered.length, lifetimeValue: Number(metrics.lifetimeValue.toFixed(2)), lastOrderAt: metrics.lastOrderAt,
    };
  });
}
