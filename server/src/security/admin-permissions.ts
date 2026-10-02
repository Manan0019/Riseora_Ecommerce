export type AdminRoleName = "OWNER" | "OPERATIONS" | "CATALOG" | "MARKETING" | "SUPPORT";
export type AdminPermission = "DASHBOARD" | "CATALOG" | "OPERATIONS" | "CUSTOMERS" | "MARKETING" | "CONTENT" | "SETTINGS" | "ERP" | "SYSTEM" | "SECURITY";

const allPermissions: AdminPermission[] = ["DASHBOARD", "CATALOG", "OPERATIONS", "CUSTOMERS", "MARKETING", "CONTENT", "SETTINGS", "ERP", "SYSTEM", "SECURITY"];

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRoleName, AdminPermission[]> = {
  OWNER: allPermissions,
  OPERATIONS: ["DASHBOARD", "OPERATIONS", "CUSTOMERS"],
  CATALOG: ["DASHBOARD", "CATALOG", "CONTENT"],
  MARKETING: ["DASHBOARD", "MARKETING", "CONTENT"],
  SUPPORT: ["DASHBOARD", "OPERATIONS", "CUSTOMERS", "CONTENT"],
};

export function normalizedAdminRole(value: unknown): AdminRoleName {
  return (["OWNER", "OPERATIONS", "CATALOG", "MARKETING", "SUPPORT"] as const).includes(value as AdminRoleName)
    ? (value as AdminRoleName)
    : "OWNER";
}

export function permissionsForAdminRole(value: unknown): AdminPermission[] {
  return ADMIN_ROLE_PERMISSIONS[normalizedAdminRole(value)];
}

export function adminHasPermission(role: unknown, permission: AdminPermission): boolean {
  return permissionsForAdminRole(role).includes(permission);
}

export function permissionForAdminPath(originalUrl: string): AdminPermission {
  const pathname = String(originalUrl || "").split("?")[0].replace(/^\/api\/admin/, "") || "/";
  if (pathname === "/" || pathname.startsWith("/dashboard") || pathname.startsWith("/reports")) return "DASHBOARD";
  if (pathname.startsWith("/security")) return "SECURITY";
  if (pathname.startsWith("/settings")) return "SETTINGS";
  if (pathname.startsWith("/erp-sync")) return "ERP";
  if (pathname.startsWith("/system")) return "SYSTEM";
  if (["/orders", "/dispatch", "/invoices", "/returns", "/cancellations", "/shipping-zones", "/shipping-partners"].some((prefix) => pathname.startsWith(prefix))) return "OPERATIONS";
  if (pathname.startsWith("/customers")) return "CUSTOMERS";
  if (["/categories", "/products", "/inventory", "/suitability-options", "/uploads"].some((prefix) => pathname.startsWith(prefix))) return "CATALOG";
  if (["/reviews", "/product-questions"].some((prefix) => pathname.startsWith(prefix))) return "CONTENT";
  if (["/coupons", "/offers", "/banners", "/deals", "/audience", "/contact-messages", "/newsletter", "/cart-recoveries", "/stock-alerts", "/price-alerts", "/retention", "/lifecycle", "/growth"].some((prefix) => pathname.startsWith(prefix))) return "MARKETING";
  return "SYSTEM";
}
