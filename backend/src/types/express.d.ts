declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        roleId: string;
        roleCode: string;
        dataScope: "SELF" | "DEPARTMENT" | "SUB_DEPARTMENT" | "ALL";
        permissions: ReadonlySet<string>;
        organizationId: string | null;
        organizationIds: readonly string[];
        organizationType: string | null;
      };
    }
  }
}

export {};
