declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; organizationId: string | null; organizationType: string | null };
    }
  }
}

export {};
