declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        tenantId: number;
        companyId: number | null;
        employeeId: number | null;
        role: string;
        name: string;
        email: string;
      };
    }
  }
}
export {};
