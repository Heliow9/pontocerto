import bcrypt from "bcryptjs";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
export async function createTenantInTransaction(conn:any,d:any) {
    const [tenantResult] = await conn.query(
      `INSERT INTO tenants (name, slug, status, created_at, updated_at)
       VALUES (?, ?, 'ACTIVE', ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [d.tenantName, d.slug]
    );
    const tenantId = Number(tenantResult.insertId);
    const [companyResult] = await conn.query(
      `INSERT INTO companies (tenant_id, company_type, legal_name, trade_name, cnpj, active, created_at, updated_at)
       VALUES (?, 'MATRIX', ?, ?, ?, 1, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, d.companyName, d.companyName, d.cnpj || null]
    );
    const companyId = Number(companyResult.insertId);
    await conn.query(
      `INSERT INTO company_profiles (tenant_id, company_id, created_at, updated_at)
       VALUES (?, ?, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, companyId]
    );
    await conn.query(
      `INSERT INTO tenant_settings (tenant_id, report_title, report_footer, timezone, created_at, updated_at)
       VALUES (?, 'Relatório de Pontos', 'Ponto Certo SaaS - Sistema de gestão de jornada',
               'America/Sao_Paulo', ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId]
    );
    const hash = await bcrypt.hash(d.adminPassword, 10);
    await conn.query(
      `INSERT INTO users
       (tenant_id, company_id, employee_id, name, email, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, 'TENANT_ADMIN', 1, ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
      [tenantId, companyId, d.adminName, d.adminEmail, hash]
    );
    const digits=(value:any)=>String(value??"").replace(/\D/g,"");
    await conn.query(
      `INSERT INTO saas_billing_profiles (tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,provider_expiration_days,billing_legal_name,billing_trade_name,billing_document,billing_email,billing_phone,financial_contact_name,financial_contact_document,financial_contact_email,financial_contact_phone,billing_zip_code,billing_street,billing_number,billing_complement,billing_district,billing_city,billing_state,auto_email_charges,created_at,updated_at)
       VALUES (?,10,3,1,1,30,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
      [tenantId,d.billingLegalName||d.companyName,d.billingTradeName||d.companyName,digits(d.billingDocument||d.cnpj)||null,d.billingEmail||null,digits(d.billingPhone)||null,d.financialContactName||null,digits(d.financialContactDocument)||null,d.financialContactEmail||null,digits(d.financialContactPhone)||null,digits(d.billingZipCode)||null,d.billingStreet||null,d.billingNumber||null,d.billingComplement||null,d.billingDistrict||null,d.billingCity||null,d.billingState?String(d.billingState).toUpperCase():null,d.autoEmailCharges===false?0:1]
    );
    if (d.planId) {
      await conn.query(
        `INSERT INTO subscriptions
         (tenant_id, plan_id, status, starts_at, trial_ends_at, current_period_end, created_at, updated_at)
         VALUES (?, ?, ?, ${BRASILIA_NOW_SQL}, DATE_ADD(${BRASILIA_NOW_SQL}, INTERVAL ? DAY),
                 DATE_ADD(${BRASILIA_NOW_SQL}, INTERVAL 1 MONTH), ${BRASILIA_NOW_SQL}, ${BRASILIA_NOW_SQL})`,
        [tenantId, d.planId, d.trialDays > 0 ? "TRIAL" : "ACTIVE", d.trialDays]
      );
    }
  return {tenantId,companyId};
}
