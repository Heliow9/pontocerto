import { BRASILIA_NOW_SQL } from "../utils/db-time.js";

export type SaasDashboardAttention={
  kind:"OVERDUE"|"BLOCKED";
  tenantId:number;
  tenantName:string;
  chargeId:number;
  label:string;
  amount:number;
  date:string;
  href:string;
};

export type SaasDashboardFinance={
  receivedMonth:number;
  openAmount:number;
  openCount:number;
  overdueAmount:number;
  overdueCount:number;
  overdueTenants:number;
  blockedTenants:number;
  attention:SaasDashboardAttention[];
};

type SummaryLike=Partial<Record<Exclude<keyof SaasDashboardFinance,"attention">,unknown>>;
const n=(value:unknown)=>Number(value??0)||0;

export function normalizeFinanceSummary(row:SummaryLike){
  return {
    receivedMonth:n(row.receivedMonth),
    openAmount:n(row.openAmount),
    openCount:n(row.openCount),
    overdueAmount:n(row.overdueAmount),
    overdueCount:n(row.overdueCount),
    overdueTenants:n(row.overdueTenants),
    blockedTenants:n(row.blockedTenants),
  };
}

export async function loadSaasDashboardFinance(executor:{query:any}):Promise<SaasDashboardFinance>{
  const [summaryRows]=await executor.query(`
    SELECT
      (SELECT COALESCE(SUM(fp.amount),0)
         FROM financial_payments fp
        WHERE DATE_FORMAT(fp.paid_at,'%Y-%m')=DATE_FORMAT(${BRASILIA_NOW_SQL},'%Y-%m')) AS receivedMonth,
      COALESCE(SUM(CASE WHEN fc.status IN ('ISSUING','OPEN') AND fc.due_date>=DATE(${BRASILIA_NOW_SQL}) THEN fc.amount ELSE 0 END),0) AS openAmount,
      COALESCE(SUM(CASE WHEN fc.status IN ('ISSUING','OPEN') AND fc.due_date>=DATE(${BRASILIA_NOW_SQL}) THEN 1 ELSE 0 END),0) AS openCount,
      COALESCE(SUM(CASE WHEN fc.status='OVERDUE' THEN fc.amount ELSE 0 END),0) AS overdueAmount,
      COALESCE(SUM(CASE WHEN fc.status='OVERDUE' THEN 1 ELSE 0 END),0) AS overdueCount,
      COUNT(DISTINCT CASE WHEN fc.status='OVERDUE' THEN fc.tenant_id END) AS overdueTenants,
      COUNT(DISTINCT CASE WHEN bp.auto_block_enabled=1
        AND fc.status IN ('OPEN','OVERDUE')
        AND fc.block_at<=DATE(${BRASILIA_NOW_SQL})
        AND NOT EXISTS(
          SELECT 1 FROM financial_access_exceptions e
           WHERE e.tenant_id=fc.tenant_id AND e.revoked_at IS NULL
             AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at
             AND (e.charge_id IS NULL OR e.charge_id=fc.id)
        ) THEN fc.tenant_id END) AS blockedTenants
    FROM financial_charges fc
    LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=fc.tenant_id
  `);
  const summary=normalizeFinanceSummary(summaryRows[0]||{});
  const [attentionRows]=await executor.query(`
    SELECT fc.id AS charge_id,fc.tenant_id,t.name AS tenant_name,fc.description,fc.amount,fc.due_date,
      CASE WHEN bp.auto_block_enabled=1
        AND fc.status IN ('OPEN','OVERDUE')
        AND fc.block_at<=DATE(${BRASILIA_NOW_SQL})
        AND NOT EXISTS(
          SELECT 1 FROM financial_access_exceptions e
           WHERE e.tenant_id=fc.tenant_id AND e.revoked_at IS NULL
             AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at
             AND (e.charge_id IS NULL OR e.charge_id=fc.id)
        ) THEN 1 ELSE 0 END AS blocking
    FROM financial_charges fc
    JOIN tenants t ON t.id=fc.tenant_id
    LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=fc.tenant_id
    WHERE fc.status='OVERDUE' OR (
      bp.auto_block_enabled=1 AND fc.status IN ('OPEN','OVERDUE')
      AND fc.block_at<=DATE(${BRASILIA_NOW_SQL})
      AND NOT EXISTS(
        SELECT 1 FROM financial_access_exceptions e
         WHERE e.tenant_id=fc.tenant_id AND e.revoked_at IS NULL
           AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at
           AND (e.charge_id IS NULL OR e.charge_id=fc.id)
      )
    )
    ORDER BY blocking DESC,fc.due_date ASC,fc.id ASC
    LIMIT 8
  `);
  const attention:SaasDashboardAttention[]=attentionRows.map((row:any)=>({
    kind:Boolean(row.blocking)?"BLOCKED":"OVERDUE",
    tenantId:Number(row.tenant_id),
    tenantName:String(row.tenant_name||"Cliente"),
    chargeId:Number(row.charge_id),
    label:Boolean(row.blocking)?"Acesso bloqueado por inadimplência":String(row.description||"Cobrança vencida"),
    amount:Number(row.amount||0),
    date:String(row.due_date||""),
    href:`#saas/finance-charges?tenant=${Number(row.tenant_id)}`,
  }));
  return {...summary,attention};
}

export type SaasDashboardProductRow={
  productCode:string;
  productName:string;
  mrr:number;
  active:number;
  pastDue:number;
  blocked:number;
};

export type SaasDashboardProducts={
  mrrTotal:number;
  mrrPontoCerto:number;
  mrrMovyo:number;
  mrrPayHub:number;
  activeSubscriptions:number;
  pastDueSubscriptions:number;
  blockedSubscriptions:number;
  products:SaasDashboardProductRow[];
};

export function normalizeProductDashboardRows(rows:any[]):SaasDashboardProducts{
  const products:SaasDashboardProductRow[]=rows.map((row:any)=>({
    productCode:String(row.productCode||row.product_code||''),
    productName:String(row.productName||row.product_name||row.productCode||row.product_code||'Produto'),
    mrr:n(row.mrr),
    active:n(row.active),
    pastDue:n(row.pastDue??row.past_due),
    blocked:n(row.blocked),
  }));
  const byCode=(code:string)=>products.find(p=>p.productCode===code)?.mrr||0;
  return{
    mrrTotal:Math.round(products.reduce((sum,p)=>sum+p.mrr,0)*100)/100,
    mrrPontoCerto:byCode('PONTO_CERTO'),
    mrrMovyo:byCode('MOVYO'),
    mrrPayHub:byCode('PAYHUB'),
    activeSubscriptions:products.reduce((sum,p)=>sum+p.active,0),
    pastDueSubscriptions:products.reduce((sum,p)=>sum+p.pastDue,0),
    blockedSubscriptions:products.reduce((sum,p)=>sum+p.blocked,0),
    products,
  };
}

export async function loadSaasDashboardProducts(executor:{query:any}):Promise<SaasDashboardProducts>{
  const [rows]=await executor.query(`
    SELECT cp.code AS productCode,cp.name AS productName,
      COALESCE(SUM(CASE WHEN ps.status IN ('ACTIVE','GRACE','PAST_DUE','BLOCKED')
        THEN ROUND(ps.monthly_price*(1-(ps.discount_percent/100)),2) ELSE 0 END),0) AS mrr,
      COALESCE(SUM(CASE WHEN ps.status IN ('ACTIVE','GRACE') THEN 1 ELSE 0 END),0) AS active,
      COALESCE(SUM(CASE WHEN ps.status='PAST_DUE' THEN 1 ELSE 0 END),0) AS pastDue,
      COALESCE(SUM(CASE WHEN ps.status='BLOCKED' THEN 1 ELSE 0 END),0) AS blocked
    FROM commercial_products cp
    LEFT JOIN product_subscriptions ps ON ps.product_id=cp.id
    GROUP BY cp.id,cp.code,cp.name
    ORDER BY cp.name
  `);
  return normalizeProductDashboardRows(rows||[]);
}
