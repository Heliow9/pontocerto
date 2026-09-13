import { z } from "zod";
export const featureNames = ["whatsapp","branches","offline","pwa","android","erp","logs"] as const;
export type Features = Record<typeof featureNames[number], boolean>;
export const legacyFeatures: Features = { whatsapp:true,branches:true,offline:true,pwa:true,android:true,erp:true,logs:true };
export const featuresSchema = z.object(Object.fromEntries(featureNames.map(name => [name,z.boolean()])) as Record<typeof featureNames[number],z.ZodBoolean>);
export const featureOverridesSchema = featuresSchema.partial();
export function mergeFeatures(plan: Partial<Features> = {}, contract: Partial<Features> = {}, company: Partial<Features> = {}): Features {
  return { ...legacyFeatures, ...plan, ...contract, ...company };
}
export function readJson<T>(text: string | null | undefined, fallback: T): T { return text ? JSON.parse(text) : fallback; }
export const permissionModules = ["dashboard","companies","employees","schedules","locations","points","occurrences","adjustments","reports","logs"] as const;
export const permissionsSchema = z.object(Object.fromEntries(permissionModules.map(name => [name,z.enum(["none","read","write"])])) as Record<typeof permissionModules[number],z.ZodEnum<["none","read","write"]>>);
export type Permissions = z.infer<typeof permissionsSchema>;
export const defaultSupervisorPermissions = Object.fromEntries(permissionModules.map(name => [name,name === "logs" ? "none" : "read"])) as Permissions;
export function permissionModule(baseUrl: string): typeof permissionModules[number] | null {
  const path=baseUrl.split("/")[1];
  const mapping: Record<string,typeof permissionModules[number]>={dashboard:"dashboard",companies:"companies",employees:"employees",groups:"employees",schedules:"schedules",locations:"locations","time-entries":"points",calculations:"points",absences:"occurrences",adjustments:"adjustments",reports:"reports",logs:"logs",audit:"logs",automation:"companies"};
  return mapping[path] || null;
}
export function supervisorAllowed(permissions: Permissions, baseUrl: string, method: string, path = "") {
  const module=permissionModule(baseUrl); if (!module) return false;
  const level=permissions[module];
  const writes=!["GET","HEAD","OPTIONS"].includes(method) || (module === "reports" && path.includes("payroll"));
  return writes ? level === "write" : level === "read" || level === "write";
}
export const proposalSchema = z.object({
  companyName:z.string().trim().min(2).max(200),cnpj:z.string().trim().min(1).max(30),responsibleName:z.string().trim().min(2).max(160),
  email:z.string().email().max(190),phone:z.string().trim().max(30),planId:z.number().int().positive(),
  maxEmployees:z.number().int().min(1).max(1000000),priceMonthly:z.number().min(0.01).max(99999999),
  maxBranches:z.number().int().min(0).max(100000).nullable(),features:featuresSchema,
  implementationDays:z.number().int().min(0).max(365),implementationFee:z.number().min(0).max(99999999),
  validUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value),
  notes:z.string().max(6000),
});
export type ProposalInput = z.infer<typeof proposalSchema>;
export function proposalStatus(status:string,validUntil:string, today=new Date(Date.now()-3*3600000).toISOString().slice(0,10)) {
  return ["DRAFT","SENT"].includes(status) && validUntil.slice(0,10)<today ? "EXPIRED" : status;
}
export function csvCell(value: unknown) {
  let text=String(value??""); if (/^[=+\-@\t\r]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
