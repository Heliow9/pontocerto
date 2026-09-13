import { createContext, useContext, ReactNode } from "react";
const Access = createContext<{role:string;permissions?:Record<string,string>;page?:string}>({role:"SUPERVISOR"});
export function AccessProvider({role,permissions,page,children}:{role:string;permissions?:Record<string,string>;page?:string;children:ReactNode}){return <Access.Provider value={{role,permissions,page}}>{children}</Access.Provider>;}
export function useAccess(){const {role,permissions,page}=useContext(Access);const writable=role==="SUPERVISOR"&&permissions?.[page||""]==="write";return {role,canManage:writable||["TENANT_ADMIN","RH"].includes(role),canAdjust:writable||["TENANT_ADMIN","RH","GESTOR"].includes(role)};}
