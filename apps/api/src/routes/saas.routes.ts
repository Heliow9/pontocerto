import { Router } from "express";
import { createTenantInTransaction } from "../services/tenant-provisioning.service.js";
import { commercialRouter,safe } from "./saas-commercial.routes.js";
import { auditList } from "./team.routes.js";
import { proposalsRouter } from "./proposals.routes.js";
import { contractsRouter } from "./contracts.routes.js";
import { writeAudit } from "../utils/audit.js";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { authMiddleware } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { saasFinanceRouter } from "./saas-finance.routes.js";
import { commercialCustomersRouter } from "./commercial-customers.routes.js";
import { commercialProductsRouter,productSubscriptionsRouter } from "./commercial-products.routes.js";
import { commercialDocumentsRouter } from "./commercial-documents.routes.js";
import { movyoIntegrationRouter } from "./movyo-integration.routes.js";
import { isValidBrazilDocument } from "../utils/brazil-document.js";

export const saasRouter = Router();
saasRouter.use(authMiddleware, requireRole("SUPER_ADMIN"));
saasRouter.use(commercialRouter);
saasRouter.use("/finance",saasFinanceRouter);
saasRouter.use("/commercial-customers",commercialCustomersRouter);
saasRouter.use("/products",commercialProductsRouter);
saasRouter.use("/product-subscriptions",productSubscriptionsRouter);
saasRouter.use("/commercial",commercialDocumentsRouter);
saasRouter.use("/integrations/movyo",movyoIntegrationRouter);
saasRouter.use("/proposals",proposalsRouter);
saasRouter.use("/contracts",contractsRouter);
saasRouter.get("/audit",safe((req,res)=>auditList(req,res,true)));

saasRouter.get("/plans", async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    "SELECT id, name, code, max_employees, price_monthly, active FROM plans WHERE active=1 ORDER BY price_monthly"
  );
  res.json(rows);
});

saasRouter.get("/tenants", async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT t.id, t.name, t.slug, t.status, t.created_at,
            COUNT(DISTINCT c.id) AS company_count,
            COUNT(DISTINCT e.id) AS employee_count,
            p.name AS plan_name, s.status AS subscription_status,
            s.trial_ends_at, s.current_period_end, bp.due_day,
            MAX(bp.financial_contact_email) AS financial_contact_email,
            CASE WHEN
              MAX(COALESCE(bp.billing_legal_name,''))<>'' AND
              MAX(COALESCE(bp.billing_document,''))<>'' AND
              MAX(COALESCE(bp.financial_contact_name,''))<>'' AND
              MAX(COALESCE(bp.financial_contact_email,''))<>'' AND
              MAX(COALESCE(bp.billing_zip_code,''))<>'' AND
              MAX(COALESCE(bp.billing_street,''))<>'' AND
              MAX(COALESCE(bp.billing_number,''))<>'' AND
              MAX(COALESCE(bp.billing_district,''))<>'' AND
              MAX(COALESCE(bp.billing_city,''))<>'' AND
              MAX(COALESCE(bp.billing_state,''))<>''
            THEN 1 ELSE 0 END AS financial_profile_complete,
            (SELECT COALESCE(SUM(fc.amount),0) FROM financial_charges fc WHERE fc.tenant_id=t.id AND fc.status='OVERDUE') AS overdue_amount,
            (SELECT COUNT(*) FROM financial_charges fc WHERE fc.tenant_id=t.id AND fc.status IN ('OPEN','OVERDUE') AND fc.block_at<=DATE(${BRASILIA_NOW_SQL}) AND NOT EXISTS(SELECT 1 FROM financial_access_exceptions fe WHERE fe.tenant_id=t.id AND fe.revoked_at IS NULL AND ${BRASILIA_NOW_SQL} BETWEEN fe.starts_at AND fe.ends_at AND (fe.charge_id IS NULL OR fe.charge_id=fc.id))) AS blocking_charges
       FROM tenants t
       LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=t.id
       LEFT JOIN companies c ON c.tenant_id=t.id AND c.active=1
       LEFT JOIN employees e ON e.tenant_id=t.id AND e.active=1
       LEFT JOIN subscriptions s ON s.tenant_id=t.id AND s.id=(
         SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id
       )
       LEFT JOIN plans p ON p.id=s.plan_id
      WHERE NOT EXISTS (SELECT 1 FROM users su WHERE su.tenant_id=t.id AND su.role='SUPER_ADMIN')
      GROUP BY t.id, t.name, t.slug, t.status, t.created_at, p.name, s.status, s.trial_ends_at, s.current_period_end, bp.due_day
      ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

const optionalText = (max=190) => z.string().trim().max(max).optional().nullable();
const optionalEmail = z.union([z.string().trim().email(), z.literal(""), z.null()]).optional();
const tenantSchema = z.object({
  tenantName: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  companyName: z.string().min(2),
  cnpj: z.string().optional().nullable(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  planId: z.number().int().positive().optional().nullable(),
  trialDays: z.number().int().min(0).max(365).default(14),
  billingLegalName: optionalText(),
  billingTradeName: optionalText(),
  billingDocument: optionalText(20),
  billingEmail: optionalEmail,
  billingPhone: optionalText(30),
  financialContactName: optionalText(),
  financialContactDocument: optionalText(20),
  financialContactEmail: optionalEmail,
  financialContactPhone: optionalText(30),
  billingZipCode: optionalText(12),
  billingStreet: optionalText(),
  billingNumber: optionalText(30),
  billingComplement: optionalText(120),
  billingDistrict: optionalText(120),
  billingCity: optionalText(120),
  billingState: optionalText(2),
  autoEmailCharges: z.boolean().optional().default(true)
});

saasRouter.post("/tenants", async (req, res) => {
  const parsed = tenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.flatten() });
  const digits=(value:unknown)=>String(value??"").replace(/\D/g,"");
  const cnpj=digits(parsed.data.cnpj)||null;
  const billingDocument=digits(parsed.data.billingDocument||parsed.data.cnpj)||null;
  const financialContactDocument=digits(parsed.data.financialContactDocument)||null;
  if(cnpj&&!isValidBrazilDocument(cnpj,'PJ'))return res.status(400).json({message:'CNPJ da empresa inválido.'});
  if(billingDocument&&!isValidBrazilDocument(billingDocument))return res.status(400).json({message:'CPF/CNPJ de faturamento inválido.'});
  if(financialContactDocument&&!isValidBrazilDocument(financialContactDocument,'PF'))return res.status(400).json({message:'CPF do responsável financeiro inválido.'});
  const d = {
    ...parsed.data,
    cnpj,
    billingDocument,
    billingPhone: digits(parsed.data.billingPhone)||null,
    financialContactDocument,
    financialContactPhone: digits(parsed.data.financialContactPhone)||null,
    billingZipCode: digits(parsed.data.billingZipCode)||null,
    billingState: parsed.data.billingState?.trim().toUpperCase()||null,
    billingEmail: parsed.data.billingEmail?.trim().toLowerCase()||null,
    financialContactEmail: parsed.data.financialContactEmail?.trim().toLowerCase()||null,
  };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {tenantId,companyId} = await createTenantInTransaction(conn,d);
    await conn.commit();
    await writeAudit(req,"CREATE","tenant",tenantId,undefined,{companyId,planId:d.planId});
    res.status(201).json({ tenantId, companyId });
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Slug, CNPJ ou e-mail já cadastrado." });
    throw error;
  } finally {
    conn.release();
  }
});

saasRouter.patch("/tenants/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CANCELED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Status inválido." });
  const [result] = await pool.query<any>(
    `UPDATE tenants SET status=?, updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
    [parsed.data.status, id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Tenant não encontrado." });
  await writeAudit(req,"UPDATE_STATUS","tenant",id,undefined,parsed.data);
  res.json({ ok: true });
});
