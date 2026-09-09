import { createContext, useContext, ReactNode } from "react";
const Access = createContext("SUPERVISOR");
export function AccessProvider({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  return <Access.Provider value={role}>{children}</Access.Provider>;
}
export function useAccess() {
  const role = useContext(Access);
  return {
    role,
    canManage: ["SUPER_ADMIN", "TENANT_ADMIN", "RH"].includes(role),
    canAdjust: ["SUPER_ADMIN", "TENANT_ADMIN", "RH", "GESTOR"].includes(role),
  };
}
