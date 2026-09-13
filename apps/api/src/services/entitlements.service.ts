import { pool } from "../db/pool.js";
import { legacyFeatures, mergeFeatures, readJson, type Features } from "./commercial-rules.js";

export async function entitlements(tenantId:number,companyId?:number|null,db:any=pool) {
  const [rows] = await db.query(`SELECT p.id AS plan_id,p.name AS plan_name,p.max_employees,p.price_monthly,
    ps.features_json AS plan_features,ps.max_branches AS plan_branches,ps.is_custom,
    tc.max_employees AS contract_employees,tc.price_monthly AS contract_price,tc.max_branches AS contract_branches,tc.features_json AS contract_features,
    s.status AS subscription_status,s.current_period_end
    FROM tenants t LEFT JOIN subscriptions s ON s.id=(SELECT MAX(id) FROM subscriptions WHERE tenant_id=t.id)
    LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN saas_plan_settings ps ON ps.plan_id=p.id
    LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id WHERE t.id=?`,[tenantId]);
  const row=rows[0]; if(!row) throw Object.assign(new Error("Cliente não encontrado."),{status:404});
  let overrides:Partial<Features>={};
  if(companyId) { const [companies]=await db.query("SELECT ce.features_json FROM companies c LEFT JOIN company_entitlements ce ON ce.tenant_id=c.tenant_id AND ce.company_id=c.id WHERE c.tenant_id=? AND c.id=?",[tenantId,companyId]);
    if(!companies[0])throw Object.assign(new Error("Empresa não encontrada."),{status:404});
    overrides=readJson(companies[0].features_json,{});
  }
  return {planId:row.plan_id,planName:row.plan_name,isCustom:Boolean(row.is_custom),subscriptionStatus:row.subscription_status,
    maxEmployees:row.contract_employees??row.max_employees??null,priceMonthly:row.contract_price??row.price_monthly??null,
    maxBranches:row.contract_branches??row.plan_branches??null,
    currentPeriodEnd:row.current_period_end,contractOverrides:readJson(row.contract_features,{}),
    features:mergeFeatures(readJson(row.plan_features,legacyFeatures),readJson(row.contract_features,{}),overrides),overrides};
}
export async function checkEmployeeCapacity(tenantId:number,additional:number,db:any=pool) {
  const contract=await entitlements(tenantId,null,db);
  const [rows]=await db.query("SELECT COUNT(*) AS total FROM employees WHERE tenant_id=? AND active=1",[tenantId]);
  if(contract.maxEmployees!=null && Number(rows[0].total)+additional>Number(contract.maxEmployees))
    throw Object.assign(new Error(`Limite contratado de ${contract.maxEmployees} funcionários atingido.`),{status:403});
}
export async function checkBranchCapacity(tenantId:number,db:any=pool) {
  const [companies]=await db.query("SELECT id FROM companies WHERE tenant_id=? AND active=1 ORDER BY id",[tenantId]);
  if(!companies.length)return;
  const contract=await entitlements(tenantId,Number(companies[0].id),db);
  if(!contract.features.branches || (contract.maxBranches!=null && companies.length>=Number(contract.maxBranches)+1))
    throw Object.assign(new Error("Cadastro de filial não liberado ou limite de filiais atingido. Consulte o administrador SaaS."),{status:403});
}
