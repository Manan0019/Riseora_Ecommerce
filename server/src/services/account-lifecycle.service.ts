import { prisma } from "../config/prisma";
import { getRoutineForecast } from "./routine-intelligence.service";
import { getStoreSettings } from "./store.service";

const ACTIVE_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"] as const;
const OPEN_RETURN_STATUSES = ["REQUESTED", "APPROVED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "REFUNDING"] as const;
const OPEN_SUPPORT_STATUSES = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] as const;

function orderActionLabel(status: string) {
  if (status === "SHIPPED") return "Track delivery";
  if (status === "PROCESSING") return "Check order progress";
  if (status === "CONFIRMED") return "View confirmed order";
  return "View order";
}

function titleCase(value: string) {
  return String(value || "").toLowerCase().replace(/(^|_)([a-z])/g, (_m, prefix, letter) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
}

export async function getAccountLifecycleHub(userId: string) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, phone: true, email: true } });
  const accountEmail = user?.email || "";
  const [activeOrder, latestDelivered, openReturn, openSupport, unreadNotifications, wishlistCount, rewardAccount, activePriceAlerts, activeStockAlerts, addressCount, settings, routine] = await Promise.all([
    prisma.order.findFirst({
      where: { userId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: {
        orderNumber: true, status: true, totalAmount: true, createdAt: true,
        shipment: { select: { trackingNumber: true, estimatedDeliveryAt: true, carrier: true } },
      },
    }),
    prisma.order.findFirst({
      where: { userId, status: "DELIVERED" },
      orderBy: { updatedAt: "desc" },
      select: { orderNumber: true, totalAmount: true, createdAt: true, shipment: { select: { deliveredAt: true } } },
    }),
    prisma.returnRequest.findFirst({
      where: { userId, status: { in: [...OPEN_RETURN_STATUSES] } },
      orderBy: { requestedAt: "desc" },
      select: { id: true, returnNumber: true, status: true, requestedAt: true },
    }),
    prisma.contactMessage.findFirst({
      where: { userId, status: { in: [...OPEN_SUPPORT_STATUSES] } },
      orderBy: { lastActivityAt: "desc" },
      select: { ticketNumber: true, status: true, subject: true, lastActivityAt: true },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.wishlistItem.count({ where: { userId } }),
    prisma.rewardAccount.findUnique({ where: { userId }, select: { balance: true, lifetimeEarned: true } }),
    prisma.priceAlert.count({ where: { email: accountEmail, status: "PENDING" } }),
    prisma.stockAlert.count({ where: { email: accountEmail, status: "PENDING" } }),
    prisma.address.count({ where: { userId } }),
    getStoreSettings(),
    getRoutineForecast(userId),
  ]);

  const actions: any[] = [];
  const push = (action: any) => actions.push(action);

  if (activeOrder) {
    push({
      key: "active-order", priority: 100, icon: "package", tone: "order",
      eyebrow: "ORDER IN PROGRESS", title: `${titleCase(activeOrder.status)} · ${activeOrder.orderNumber}`,
      description: activeOrder.status === "SHIPPED" && activeOrder.shipment?.estimatedDeliveryAt
        ? `Estimated delivery ${activeOrder.shipment.estimatedDeliveryAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
        : "Your order is moving through the Riseora fulfilment journey.",
      ctaLabel: orderActionLabel(activeOrder.status), ctaUrl: `/orders/${activeOrder.orderNumber}`,
    });
  }

  if (openSupport?.status === "WAITING_CUSTOMER") {
    push({ key: "support-reply", priority: 97, icon: "mail", tone: "support", eyebrow: "SUPPORT NEEDS YOU", title: openSupport.subject || openSupport.ticketNumber, description: "A support request is waiting for your reply.", ctaLabel: "Reply now", ctaUrl: `/support/${openSupport.ticketNumber}` });
  } else if (openSupport) {
    push({ key: "support-open", priority: 72, icon: "mail", tone: "support", eyebrow: "SUPPORT IN PROGRESS", title: openSupport.subject || openSupport.ticketNumber, description: `Current status: ${titleCase(openSupport.status)}.`, ctaLabel: "View request", ctaUrl: `/support/${openSupport.ticketNumber}` });
  }

  if (openReturn) {
    push({ key: "return-open", priority: 92, icon: "truck", tone: "return", eyebrow: "RETURN IN PROGRESS", title: `${openReturn.returnNumber} · ${titleCase(openReturn.status)}`, description: "Follow the return and refund journey from one place.", ctaLabel: "View return", ctaUrl: `/returns/${openReturn.id}` });
  }

  const routineLead = routine.products?.find((item: any) => item.status === "DUE") || routine.products?.find((item: any) => item.status === "SOON");
  if (routineLead) {
    push({
      key: "routine", priority: routineLead.status === "DUE" ? 90 : 82, icon: "refresh", tone: "routine",
      eyebrow: routineLead.status === "DUE" ? "REFILL DUE" : "REFILL COMING UP",
      title: routineLead.product?.name || "Routine refill",
      description: routineLead.status === "DUE" ? "Your estimated refill window has arrived." : `Likely due in ${Math.max(0, Number(routineLead.daysUntil || 0))} days.`,
      ctaLabel: "Review routine", ctaUrl: "/refills",
    });
  }

  if (!addressCount) {
    push({ key: "address", priority: 84, icon: "location", tone: "account", eyebrow: "CHECKOUT READY", title: "Save your delivery address", description: "Make future checkout quicker by saving a delivery address now.", ctaLabel: "Add address", ctaUrl: "/account#delivery" });
  }
  if (!user?.phone) {
    push({ key: "phone", priority: 78, icon: "user", tone: "account", eyebrow: "ACCOUNT SETUP", title: "Add your phone number", description: "Keep delivery and account contact details complete.", ctaLabel: "Update profile", ctaUrl: "/account#profile" });
  }

  const rewardBalance = Number(rewardAccount?.balance || 0);
  const voucherPoints = Math.max(0, Number(settings.rewardVoucherPoints || 0));
  if (settings.rewardsEnabled && voucherPoints > 0 && rewardBalance >= voucherPoints) {
    push({ key: "reward-ready", priority: 88, icon: "sparkles", tone: "reward", eyebrow: "REWARD READY", title: "Your next voucher is ready", description: `${rewardBalance} points are available in Riseora Rewards.`, ctaLabel: "Open rewards", ctaUrl: "/rewards" });
  } else if (settings.rewardsEnabled && voucherPoints > 0 && rewardBalance >= Math.ceil(voucherPoints * 0.75)) {
    push({ key: "reward-near", priority: 64, icon: "sparkles", tone: "reward", eyebrow: "LOYALTY MOMENTUM", title: `${voucherPoints - rewardBalance} points to your next voucher`, description: "You're close to the next Riseora Rewards milestone.", ctaLabel: "See rewards", ctaUrl: "/rewards" });
  }

  if (unreadNotifications > 0) {
    push({ key: "notifications", priority: 58, icon: "bell", tone: "notice", eyebrow: "NEW UPDATES", title: `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}`, description: "Orders, rewards, refills and Riseora updates are waiting.", ctaLabel: "View updates", ctaUrl: "/notifications" });
  }

  const activeAlerts = activePriceAlerts + activeStockAlerts;
  if (activeAlerts > 0) {
    push({ key: "alerts", priority: 48, icon: "tag", tone: "notice", eyebrow: "SHOPPING WATCHES", title: `${activeAlerts} active alert${activeAlerts === 1 ? "" : "s"}`, description: "Riseora is watching price or stock changes for you.", ctaLabel: "Review alerts", ctaUrl: "/account#shopping-alerts" });
  }

  if (wishlistCount > 0) {
    push({ key: "wishlist", priority: 38, icon: "heart", tone: "wishlist", eyebrow: "SAVED FOR LATER", title: `${wishlistCount} product${wishlistCount === 1 ? "" : "s"} in your wishlist`, description: "Return to products you saved and compare them with today's availability.", ctaLabel: "Open wishlist", ctaUrl: "/wishlist" });
  }

  if (latestDelivered) {
    push({ key: "buy-again", priority: 32, icon: "refresh", tone: "routine", eyebrow: "BUY AGAIN", title: `Revisit ${latestDelivered.orderNumber}`, description: "Review today's price, stock and purchase limits before adding previous items again.", ctaLabel: "Review past orders", ctaUrl: "/orders" });
  }

  if (!actions.length) {
    push({ key: "discover", priority: 1, icon: "sparkles", tone: "discover", eyebrow: "YOU'RE ALL CAUGHT UP", title: "Explore what fits your routine", description: "There are no urgent account actions right now.", ctaLabel: "Explore Riseora", ctaUrl: "/shop" });
  }

  actions.sort((a, b) => b.priority - a.priority);

  return {
    generatedAt: now,
    greetingName: user?.firstName || "there",
    summary: {
      activeOrders: activeOrder ? 1 : 0,
      unreadNotifications,
      wishlistCount,
      rewardBalance,
      refillDue: Number(routine.summary?.dueNow || 0),
      refillSoon: Number(routine.summary?.dueSoon || 0),
      activeAlerts,
      openSupport: openSupport ? 1 : 0,
      openReturns: openReturn ? 1 : 0,
    },
    activeOrder,
    actions: actions.slice(0, 6),
  };
}

export async function getCustomerLifecyclePulse() {
  const now = new Date();
  const [activeOrderUsers, openReturnUsers, openSupportUsers, dueRefillUsers, unreadUsers, wishlistUsers] = await Promise.all([
    prisma.order.findMany({ where: { userId: { not: null }, status: { in: [...ACTIVE_ORDER_STATUSES] } }, distinct: ["userId"], select: { userId: true } }),
    prisma.returnRequest.findMany({ where: { userId: { not: null }, status: { in: [...OPEN_RETURN_STATUSES] } }, distinct: ["userId"], select: { userId: true } }),
    prisma.contactMessage.findMany({ where: { userId: { not: null }, status: { in: [...OPEN_SUPPORT_STATUSES] } }, distinct: ["userId"], select: { userId: true } }),
    prisma.refillReminder.findMany({ where: { status: "ACTIVE", nextReminderAt: { lte: now } }, distinct: ["userId"], select: { userId: true } }),
    prisma.notification.findMany({ where: { isRead: false }, distinct: ["userId"], select: { userId: true } }),
    prisma.wishlistItem.findMany({ distinct: ["userId"], select: { userId: true } }),
  ]);

  return {
    generatedAt: now,
    customersWithActiveOrders: activeOrderUsers.length,
    customersWithOpenReturns: openReturnUsers.length,
    customersWithOpenSupport: openSupportUsers.length,
    customersWithDueRefills: dueRefillUsers.length,
    customersWithUnreadUpdates: unreadUsers.length,
    customersWithWishlist: wishlistUsers.length,
  };
}
