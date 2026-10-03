export {};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        role: "CUSTOMER" | "ADMIN";
        adminRole?: "OWNER" | "OPERATIONS" | "CATALOG" | "MARKETING" | "SUPPORT" | null;
      };
    }
  }
}
