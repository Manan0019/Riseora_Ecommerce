export const ADMIN_ROLE_LABELS = {
  OWNER: "Owner",
  OPERATIONS: "Operations",
  CATALOG: "Catalog",
  MARKETING: "Marketing",
  SUPPORT: "Support",
};

export const ADMIN_ROLE_PERMISSIONS = {
  OWNER: ["DASHBOARD", "CATALOG", "OPERATIONS", "CUSTOMERS", "MARKETING", "CONTENT", "SETTINGS", "ERP", "SYSTEM", "SECURITY", "SUPPORT", "FINANCE"],
  OPERATIONS: ["DASHBOARD", "OPERATIONS", "CUSTOMERS", "SUPPORT", "FINANCE"],
  CATALOG: ["DASHBOARD", "CATALOG", "CONTENT"],
  MARKETING: ["DASHBOARD", "MARKETING", "CONTENT"],
  SUPPORT: ["DASHBOARD", "OPERATIONS", "CUSTOMERS", "CONTENT", "SUPPORT"],
};

export function normalizedAdminRole(value) {
  return Object.prototype.hasOwnProperty.call(ADMIN_ROLE_PERMISSIONS, value) ? value : "OWNER";
}

export function adminHasPermission(role, permission) {
  return ADMIN_ROLE_PERMISSIONS[normalizedAdminRole(role)].includes(permission);
}
