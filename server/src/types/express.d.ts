export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "CUSTOMER" | "ADMIN";
        adminRole?: "OWNER" | "OPERATIONS" | "CATALOG" | "MARKETING" | "SUPPORT" | null;
      };
    }
  }
}
