import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import {
  calculateBlockAt,
  dueDateForCompetence,
  normalizedMoney,
  todayInBrasilia,
  validateDueDay,
  type ChargeStatus,
  type ChargeType,
} from "./financial-rules.js";
import { monthlyDescription, providerYourNumber, reconciliationDecision } from "./financial-service-core.js";
import {
  cancelInterCharge,
  findInterChargeByYourNumber,
  getInterCharge,
  getInterChargePdf,
  issueInterCharge,
  InterApiError,
} from "./inter-billing.service.js";
import type { NormalizedInterCharge } from "./inter-billing-core.js";

const financeError = (message: string, status = 400, code = "FINANCE_ERROR") => Object.assign(new Error(message), { status, code });

function json(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

export async function recordFinancialEvent(input: {
  tenantId: number;
  chargeId?: number | null;
  eventType: string;
  actorUserId?: number | null;
  details?: unknown;
}, db: any = pool) {
  await db.query(
    `INSERT INTO financial_events(tenant_id,charge_id,event_type,actor_user_id,details_json,created_at)
     VALUES(?,?,?,?,?,${BRASILIA_NOW_SQL})`,
    [input.tenantId, input.chargeId || null, input.eventType, input.actorUserId || null, json(input.details)],
  );
}

export async function ensureBillingProfile(tenantId: number, db: any = pool) {
  await db.query(
    `INSERT IGNORE INTO saas_billing_profiles
     (tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,inter_cancel_days,created_at,updated_at)
     VALUES(?,10,3,1,1,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
    [tenantId, env.INTER_BILLING_CANCEL_DAYS],
  );
  return getBillingProfile(tenantId, db);
}

export async function getBillingProfile(tenantId: number, db: any = pool) {
  const [rows] = await db.query(
    `SELECT bp.tenant_id,bp.due_day,bp.grace_days,bp.auto_block_enabled,bp.auto_monthly_enabled,bp.inter_cancel_days,
            t.name AS tenant_name,t.status AS tenant_status,
            COALESCE(tc.price_monthly,p.price_monthly) AS price_monthly,
            s.status AS subscription_status
       FROM tenants t
       LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=t.id
       LEFT JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id)
       LEFT JOIN plans p ON p.id=s.plan_id
       LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id
      WHERE t.id=? LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) throw financeError("Cliente não encontrado.", 404, "TENANT_NOT_FOUND");
  if (!row.tenant_id) {
    await db.query(
      `INSERT IGNORE INTO saas_billing_profiles(tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,inter_cancel_days,created_at,updated_at)
       VALUES(?,10,3,1,1,?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
      [tenantId, env.INTER_BILLING_CANCEL_DAYS],
    );
    return getBillingProfile(tenantId, db);
  }
  return {
    tenantId: Number(row.tenant_id),
    tenantName: row.tenant_name,
    tenantStatus: row.tenant_status,
    dueDay: Number(row.due_day),
    graceDays: Number(row.grace_days),
    autoBlockEnabled: Boolean(row.auto_block_enabled),
    autoMonthlyEnabled: Boolean(row.auto_monthly_enabled),
    interCancelDays: Number(row.inter_cancel_days),
    priceMonthly: row.price_monthly == null ? null : Number(row.price_monthly),
    subscriptionStatus: row.subscription_status || null,
  };
}

export async function updateBillingProfile(tenantId: number, input: {
  dueDay: number;
  autoBlockEnabled: boolean;
  autoMonthlyEnabled: boolean;
  interCancelDays: number;
}, actorUserId: number) {
  const dueDay = validateDueDay(input.dueDay);
  if (!Number.isInteger(input.interCancelDays) || input.interCancelDays < 0 || input.interCancelDays > 60)
    throw financeError("O prazo bancário deve ficar entre 0 e 60 dias.");
  await ensureBillingProfile(tenantId);
  await pool.query(
    `UPDATE saas_billing_profiles
        SET due_day=?,grace_days=3,auto_block_enabled=?,auto_monthly_enabled=?,inter_cancel_days=?,updated_at=${BRASILIA_NOW_SQL}
      WHERE tenant_id=?`,
    [dueDay, input.autoBlockEnabled ? 1 : 0, input.autoMonthlyEnabled ? 1 : 0, input.interCancelDays, tenantId],
  );
  await recordFinancialEvent({ tenantId, eventType: "BILLING_PROFILE_UPDATED", actorUserId, details: { ...input, dueDay, graceDays: 3 } });
  return getBillingProfile(tenantId);
}

async function tenantMonthlyAmount(tenantId: number, db: any = pool) {
  const [rows] = await db.query(
    `SELECT COALESCE(tc.price_monthly,p.price_monthly) AS amount,s.status AS subscription_status,t.status AS tenant_status
       FROM tenants t
       LEFT JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id)
       LEFT JOIN plans p ON p.id=s.plan_id
       LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id
      WHERE t.id=? LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) throw financeError("Cliente não encontrado.", 404, "TENANT_NOT_FOUND");
  if (row.tenant_status === "CANCELED") throw financeError("Cliente cancelado não pode receber nova cobrança.", 409, "TENANT_CANCELED");
  const amount = Number(row.amount || 0);
  if (!(amount > 0)) throw financeError("O cliente não possui mensalidade contratada válida.", 409, "MONTHLY_PRICE_MISSING");
  return normalizedMoney(amount);
}

export async function getImplementationSuggestion(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT implementation_fee,contract_number,status
       FROM commercial_contracts
      WHERE tenant_id=?
      ORDER BY id DESC LIMIT 1`,
    [tenantId],
  );
  return rows[0] ? { amount: Number(rows[0].implementation_fee || 0), contractNumber: rows[0].contract_number, contractStatus: rows[0].status } : { amount: 0, contractNumber: null, contractStatus: null };
}

async function insertCharge(db: any, input: {
  tenantId: number;
  type: ChargeType;
  competence?: string | null;
  description: string;
  amount: number;
  dueDate: string;
  blockAt: string;
  actorUserId?: number | null;
}) {
  const [result] = await db.query(
    `INSERT INTO financial_charges
     (tenant_id,type,competence,description,amount,due_date,block_at,status,provider,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,'DRAFT','INTER',?,${BRASILIA_NOW_SQL},${BRASILIA_NOW_SQL})`,
    [input.tenantId, input.type, input.competence || null, input.description, normalizedMoney(input.amount), input.dueDate, input.blockAt, input.actorUserId || null],
  );
  return Number(result.insertId);
}

export async function createMonthlyCharge(tenantId: number, competence: string, actorUserId?: number | null, options: { issue?: boolean } = {}) {
  if (!/^\d{4}-\d{2}$/.test(competence)) throw financeError("Competência deve estar no formato AAAA-MM.");
  const profile = await ensureBillingProfile(tenantId);
  const amount = await tenantMonthlyAmount(tenantId);
  const dueDate = dueDateForCompetence(competence, profile.dueDay);
  const blockAt = calculateBlockAt(dueDate, profile.graceDays);
  let id: number;
  let alreadyExists = false;
  try {
    id = await insertCharge(pool, { tenantId, type: "MONTHLY", competence, description: monthlyDescription(competence), amount, dueDate, blockAt, actorUserId });
    await recordFinancialEvent({ tenantId, chargeId: id, eventType: "CHARGE_CREATED", actorUserId, details: { type: "MONTHLY", competence, amount, dueDate } });
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const [rows] = await pool.query<any[]>("SELECT id FROM financial_charges WHERE tenant_id=? AND type='MONTHLY' AND competence=? LIMIT 1", [tenantId, competence]);
    if (!rows[0]) throw error;
    id = Number(rows[0].id);
    alreadyExists = true;
  }
  if (options.issue && !alreadyExists) await issueCharge(id, actorUserId || null);
  return { ...(await getCharge(id)), alreadyExists };
}

export async function createImplementationCharge(input: {
  tenantId: number;
  amount: number;
  dueDate: string;
  description?: string;
  actorUserId?: number | null;
  issue?: boolean;
}) {
  const profile = await ensureBillingProfile(input.tenantId);
  const amount = normalizedMoney(input.amount);
  if (!(amount > 0)) throw financeError("Informe um valor de implantação maior que zero.");
  const id = await insertCharge(pool, {
    tenantId: input.tenantId,
    type: "IMPLEMENTATION",
    description: input.description?.trim() || "Implantação Ponto Certo",
    amount,
    dueDate: input.dueDate,
    blockAt: calculateBlockAt(input.dueDate, profile.graceDays),
    actorUserId: input.actorUserId,
  });
  await recordFinancialEvent({ tenantId: input.tenantId, chargeId: id, eventType: "CHARGE_CREATED", actorUserId: input.actorUserId, details: { type: "IMPLEMENTATION", amount, dueDate: input.dueDate } });
  if (input.issue) await issueCharge(id, input.actorUserId || null);
  return getCharge(id);
}

export async function createAdHocCharge(input: {
  tenantId: number;
  amount: number;
  dueDate: string;
  description: string;
  actorUserId?: number | null;
  issue?: boolean;
}) {
  const profile = await ensureBillingProfile(input.tenantId);
  const amount = normalizedMoney(input.amount);
  if (!(amount > 0)) throw financeError("Informe um valor maior que zero.");
  if (!input.description?.trim()) throw financeError("Informe a descrição da cobrança avulsa.");
  const id = await insertCharge(pool, {
    tenantId: input.tenantId,
    type: "AD_HOC",
    description: input.description.trim(),
    amount,
    dueDate: input.dueDate,
    blockAt: calculateBlockAt(input.dueDate, profile.graceDays),
    actorUserId: input.actorUserId,
  });
  await recordFinancialEvent({ tenantId: input.tenantId, chargeId: id, eventType: "CHARGE_CREATED", actorUserId: input.actorUserId, details: { type: "AD_HOC", amount, dueDate: input.dueDate } });
  if (input.issue) await issueCharge(id, input.actorUserId || null);
  return getCharge(id);
}

async function payerForTenant(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT c.legal_name,c.cnpj,p.email,p.phone,p.address,p.street,p.address_number,p.complement,p.district,p.city,p.state,p.zip_code
       FROM companies c
       LEFT JOIN company_profiles p ON p.company_id=c.id AND p.tenant_id=c.tenant_id
      WHERE c.tenant_id=? AND c.company_type='MATRIX'
      ORDER BY c.id LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) throw financeError("Empresa matriz do cliente não encontrada.", 409, "PAYER_NOT_FOUND");
  return {
    document: row.cnpj || "",
    name: row.legal_name || "",
    address: row.street || row.address || "",
    number: row.address_number || null,
    complement: row.complement || null,
    district: row.district || null,
    city: row.city || "",
    state: row.state || "",
    zipCode: row.zip_code || "",
    email: row.email || null,
    phone: row.phone || null,
  };
}

export async function getCharge(id: number, db: any = pool) {
  const [rows] = await db.query(
    `SELECT c.*,t.name AS tenant_name,bp.due_day,bp.grace_days,bp.auto_block_enabled,bp.auto_monthly_enabled,bp.inter_cancel_days
       FROM financial_charges c
       JOIN tenants t ON t.id=c.tenant_id
       LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=c.tenant_id
      WHERE c.id=? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw financeError("Cobrança não encontrada.", 404, "CHARGE_NOT_FOUND");
  const row = rows[0];
  return {
    ...row,
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    amount: Number(row.amount),
    due_day: row.due_day == null ? null : Number(row.due_day),
    grace_days: row.grace_days == null ? 3 : Number(row.grace_days),
    auto_block_enabled: Boolean(row.auto_block_enabled),
    auto_monthly_enabled: Boolean(row.auto_monthly_enabled),
    inter_cancel_days: Number(row.inter_cancel_days ?? env.INTER_BILLING_CANCEL_DAYS),
  };
}

async function applyProviderDetails(chargeId: number, details: NormalizedInterCharge, actorUserId?: number | null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>("SELECT * FROM financial_charges WHERE id=? FOR UPDATE", [chargeId]);
    const charge = rows[0];
    if (!charge) throw financeError("Cobrança não encontrada.", 404, "CHARGE_NOT_FOUND");
    const localYourNumber = charge.provider_your_number || providerYourNumber(chargeId);
    const decision = reconciliationDecision({
      localAmount: Number(charge.amount),
      localYourNumber,
      providerChargeId: details.providerChargeId || charge.provider_charge_id,
      providerYourNumber: details.yourNumber,
      providerStatus: details.localStatus,
      providerNominalAmount: details.nominalAmount,
      providerReceivedAmount: details.amountReceived,
    });
    if (decision.action === "HOLD") {
      await conn.query(
        `UPDATE financial_charges SET provider_charge_id=COALESCE(provider_charge_id,?),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),provider_payload_json=?,failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
        [details.providerChargeId, details.barcode, details.digitableLine, details.pixCopyPaste, json(details.raw), decision.reason, chargeId],
      );
      await recordFinancialEvent({ tenantId: Number(charge.tenant_id), chargeId, eventType: "RECONCILIATION_HELD", actorUserId, details: { reason: decision.reason, providerStatus: details.providerStatus } }, conn);
      await conn.commit();
      return { charge: await getCharge(chargeId), reconciled: false, reason: decision.reason };
    }

    if (decision.action === "PAY") {
      const paidAt = details.paidAt ? new Date(details.paidAt) : new Date();
      const paidDate = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;
      const paymentId = `INTER:${details.providerChargeId || charge.provider_charge_id}`;
      await conn.query(
        `INSERT IGNORE INTO financial_payments(charge_id,tenant_id,provider_payment_id,amount,paid_at,origin,payload_json,created_at)
         VALUES(?,?,?,?,?,?,?,${BRASILIA_NOW_SQL})`,
        [chargeId, charge.tenant_id, paymentId, Number(details.amountReceived), paidDate, details.origin || "BOLETO", json(details.raw)],
      );
      await conn.query(
        `UPDATE financial_charges SET status='PAID',provider_charge_id=COALESCE(?,provider_charge_id),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),provider_payload_json=?,failure_message=NULL,paid_at=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
        [details.providerChargeId, details.barcode, details.digitableLine, details.pixCopyPaste, json(details.raw), paidDate, chargeId],
      );
      await recordFinancialEvent({ tenantId: Number(charge.tenant_id), chargeId, eventType: "PAYMENT_CONFIRMED", actorUserId, details: { origin: details.origin, amount: details.amountReceived, providerPaymentId: paymentId } }, conn);
    } else {
      await conn.query(
        `UPDATE financial_charges SET status=?,provider_charge_id=COALESCE(?,provider_charge_id),barcode=COALESCE(?,barcode),digitable_line=COALESCE(?,digitable_line),pix_copy_paste=COALESCE(?,pix_copy_paste),provider_payload_json=?,failure_message=NULL,issued_at=COALESCE(issued_at,${BRASILIA_NOW_SQL}),canceled_at=IF(?='CANCELED',COALESCE(canceled_at,${BRASILIA_NOW_SQL}),canceled_at),updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
        [details.localStatus, details.providerChargeId, details.barcode, details.digitableLine, details.pixCopyPaste, json(details.raw), details.localStatus, chargeId],
      );
      await recordFinancialEvent({ tenantId: Number(charge.tenant_id), chargeId, eventType: "CHARGE_RECONCILED", actorUserId, details: { providerStatus: details.providerStatus, localStatus: details.localStatus } }, conn);
    }
    await conn.commit();
    return { charge: await getCharge(chargeId), reconciled: true, reason: null };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function issueCharge(chargeId: number, actorUserId?: number | null) {
  let charge = await getCharge(chargeId);
  if (charge.status === "PAID" || charge.status === "CANCELED") throw financeError("Esta cobrança não pode ser emitida novamente.", 409, "CHARGE_FINALIZED");
  if (charge.provider_charge_id) return reconcileCharge(chargeId, actorUserId);
  const yourNumber = charge.provider_your_number || providerYourNumber(chargeId);
  if (charge.status === "ISSUING") {
    const recovered = await findInterChargeByYourNumber(yourNumber, charge.due_date);
    if (recovered) {
      if (!charge.provider_charge_id && recovered.providerChargeId)
        await pool.query(`UPDATE financial_charges SET provider_charge_id=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [recovered.providerChargeId, chargeId]);
      return applyProviderDetails(chargeId, recovered, actorUserId);
    }
    throw financeError("A emissão anterior ainda está sem confirmação. Use reconciliar antes de tentar uma nova cobrança.", 409, "CHARGE_ISSUE_UNCERTAIN");
  }
  const payer = await payerForTenant(charge.tenant_id);
  const profile = await ensureBillingProfile(charge.tenant_id);
  await pool.query(`UPDATE financial_charges SET status='ISSUING',provider_your_number=?,failure_message=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [yourNumber, chargeId]);
  await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "CHARGE_ISSUE_STARTED", actorUserId, details: { yourNumber } });
  try {
    const issued = await issueInterCharge({
      yourNumber,
      amount: charge.amount,
      dueDate: charge.due_date,
      cancelDays: Number(profile.interCancelDays),
      payer,
      message: charge.description,
    });
    await pool.query(
      `UPDATE financial_charges SET provider_charge_id=?,provider_payload_json=?,issued_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`,
      [issued.providerChargeId, json({ issue: issued.response }), chargeId],
    );
    await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "CHARGE_ISSUED", actorUserId, details: { providerChargeId: issued.providerChargeId, yourNumber } });
    // A API Cobrança (Boleto com Pix) do Inter é assíncrona. O POST aceito já
    // identifica a cobrança; a consulta imediatamente seguinte pode ainda não
    // encontrá-la. Nesse caso mantemos ISSUING e o worker/webhook reconciliará.
    try {
      const details = await getInterCharge(issued.providerChargeId);
      return applyProviderDetails(chargeId, details, actorUserId);
    } catch (queryError: any) {
      const message = queryError instanceof Error ? queryError.message.slice(0, 500) : "Emissão aceita; aguardando processamento do Banco Inter.";
      await pool.query(`UPDATE financial_charges SET status='ISSUING',failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [message, chargeId]);
      await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "CHARGE_ISSUED_PENDING", actorUserId, details: { providerChargeId: issued.providerChargeId, message } });
      return getCharge(chargeId);
    }
  } catch (error: any) {
    // Só chegamos aqui quando a própria emissão não foi confirmada. Erros 4xx
    // determinísticos encerram a tentativa; timeout/409/429 ficam ambíguos para
    // reconciliação antes de qualquer nova emissão, evitando boleto duplicado.
    const deterministic = error instanceof InterApiError && error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
    const nextStatus: ChargeStatus = deterministic ? "FAILED" : "ISSUING";
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha ao emitir cobrança no Banco Inter.";
    await pool.query(`UPDATE financial_charges SET status=?,failure_message=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [nextStatus, message, chargeId]);
    await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: deterministic ? "CHARGE_ISSUE_FAILED" : "CHARGE_ISSUE_UNCERTAIN", actorUserId, details: { message, code: error?.code || null } });
    throw error;
  }
}

export async function reconcileCharge(chargeId: number, actorUserId?: number | null) {
  let charge = await getCharge(chargeId);
  let details: NormalizedInterCharge | null = null;
  if (charge.provider_charge_id) details = await getInterCharge(charge.provider_charge_id);
  else if (charge.provider_your_number) {
    details = await findInterChargeByYourNumber(charge.provider_your_number, charge.due_date);
    if (details?.providerChargeId) {
      await pool.query(`UPDATE financial_charges SET provider_charge_id=?,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [details.providerChargeId, chargeId]);
      charge = await getCharge(chargeId);
    }
  }
  if (!details) {
    await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "RECONCILIATION_NOT_FOUND", actorUserId });
    return { charge, reconciled: false, reason: "Cobrança ainda não localizada no Banco Inter." };
  }
  return applyProviderDetails(chargeId, details, actorUserId);
}

export async function cancelCharge(chargeId: number, actorUserId?: number | null, reason = "APEDIDODOCLIENTE") {
  const charge = await getCharge(chargeId);
  if (charge.status === "PAID") throw financeError("Cobrança paga não pode ser cancelada.", 409, "PAID_CHARGE");
  if (charge.status === "CANCELED") return charge;
  if (charge.provider_charge_id) await cancelInterCharge(charge.provider_charge_id, reason);
  await pool.query(`UPDATE financial_charges SET status='CANCELED',canceled_at=${BRASILIA_NOW_SQL},updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [chargeId]);
  await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "CHARGE_CANCELED", actorUserId, details: { providerCancelRequested: Boolean(charge.provider_charge_id), reason } });
  return getCharge(chargeId);
}

export async function recordManualPayment(chargeId: number, actorUserId: number, paidAt?: string) {
  const charge = await getCharge(chargeId);
  if (charge.status === "PAID") return charge;
  if (charge.status === "CANCELED") throw financeError("Cobrança cancelada não pode receber baixa manual.", 409, "CANCELED_CHARGE");
  const when = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(when.getTime())) throw financeError("Data de pagamento inválida.");
  const providerPaymentId = `MANUAL:${chargeId}:${createHash("sha256").update(`${actorUserId}:${when.toISOString()}`).digest("hex").slice(0, 24)}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO financial_payments(charge_id,tenant_id,provider_payment_id,amount,paid_at,origin,payload_json,created_at)
       VALUES(?,?,?,?,?,'MANUAL',?,${BRASILIA_NOW_SQL})`,
      [chargeId, charge.tenant_id, providerPaymentId, charge.amount, when, json({ actorUserId })],
    );
    await conn.query(`UPDATE financial_charges SET status='PAID',paid_at=?,failure_message=NULL,updated_at=${BRASILIA_NOW_SQL} WHERE id=?`, [when, chargeId]);
    await recordFinancialEvent({ tenantId: charge.tenant_id, chargeId, eventType: "PAYMENT_CONFIRMED_MANUAL", actorUserId, details: { amount: charge.amount, paidAt: when.toISOString() } }, conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  return getCharge(chargeId);
}

export async function getChargePdf(chargeId: number) {
  const charge = await getCharge(chargeId);
  if (!charge.provider_charge_id) throw financeError("Boleto ainda não foi emitido no Banco Inter.", 409, "CHARGE_NOT_ISSUED");
  return getInterChargePdf(charge.provider_charge_id);
}

export async function listCharges(filters: {
  tenantId?: number;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (filters.tenantId) { where.push("c.tenant_id=?"); params.push(filters.tenantId); }
  if (filters.status) { where.push("c.status=?"); params.push(filters.status); }
  if (filters.type) { where.push("c.type=?"); params.push(filters.type); }
  if (filters.from) { where.push("c.due_date>=?"); params.push(filters.from); }
  if (filters.to) { where.push("c.due_date<=?"); params.push(filters.to); }
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 200)));
  const [rows] = await pool.query<any[]>(
    `SELECT c.*,t.name AS tenant_name,
            EXISTS(SELECT 1 FROM financial_access_exceptions e WHERE e.tenant_id=c.tenant_id AND e.revoked_at IS NULL AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at AND (e.charge_id IS NULL OR e.charge_id=c.id)) AS has_active_exception
       FROM financial_charges c JOIN tenants t ON t.id=c.tenant_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.due_date DESC,c.id DESC LIMIT ${limit}`,
    params,
  );
  return rows.map((r: any) => ({ ...r, id: Number(r.id), tenant_id: Number(r.tenant_id), amount: Number(r.amount), has_active_exception: Boolean(r.has_active_exception) }));
}

export async function listReceipts(filters: { tenantId?: number; from?: string; to?: string; limit?: number } = {}) {
  const where = ["1=1"];
  const params: any[] = [];
  if (filters.tenantId) { where.push("p.tenant_id=?"); params.push(filters.tenantId); }
  if (filters.from) { where.push("DATE(p.paid_at)>=?"); params.push(filters.from); }
  if (filters.to) { where.push("DATE(p.paid_at)<=?"); params.push(filters.to); }
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 200)));
  const [rows] = await pool.query<any[]>(
    `SELECT p.*,c.type,c.description,c.due_date,t.name AS tenant_name
       FROM financial_payments p JOIN financial_charges c ON c.id=p.charge_id JOIN tenants t ON t.id=p.tenant_id
      WHERE ${where.join(" AND ")} ORDER BY p.paid_at DESC,p.id DESC LIMIT ${limit}`,
    params,
  );
  return rows.map((r: any) => ({ ...r, id: Number(r.id), charge_id: Number(r.charge_id), tenant_id: Number(r.tenant_id), amount: Number(r.amount) }));
}

export async function listFinancialEvents(filters: { tenantId?: number; chargeId?: number; limit?: number } = {}) {
  const where = ["1=1"];
  const params: any[] = [];
  if (filters.tenantId) { where.push("e.tenant_id=?"); params.push(filters.tenantId); }
  if (filters.chargeId) { where.push("e.charge_id=?"); params.push(filters.chargeId); }
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 200)));
  const [rows] = await pool.query<any[]>(
    `SELECT e.*,t.name AS tenant_name,c.description AS charge_description,u.name AS actor_name
       FROM financial_events e
       JOIN tenants t ON t.id=e.tenant_id
       LEFT JOIN financial_charges c ON c.id=e.charge_id
       LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE ${where.join(" AND ")} ORDER BY e.created_at DESC,e.id DESC LIMIT ${limit}`,
    params,
  );
  return rows;
}

export async function getFinancialDashboard() {
  const today = todayInBrasilia();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [paymentRows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(amount),0) AS received_month FROM financial_payments WHERE DATE(paid_at)>=? AND DATE(paid_at)<=?`,
    [monthStart, today],
  );
  const [chargeRows] = await pool.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN fc.status IN ('OPEN','OVERDUE','ISSUING') THEN fc.amount ELSE 0 END),0) AS receivable,
       COALESCE(SUM(CASE WHEN fc.status='OVERDUE' THEN fc.amount ELSE 0 END),0) AS overdue,
       COUNT(DISTINCT CASE WHEN fc.status='OVERDUE' THEN fc.tenant_id END) AS delinquent,
       COUNT(DISTINCT CASE WHEN bp.auto_block_enabled=1 AND fc.status IN ('OPEN','OVERDUE') AND fc.block_at<=? AND NOT EXISTS(
         SELECT 1 FROM financial_access_exceptions e WHERE e.tenant_id=fc.tenant_id AND e.revoked_at IS NULL AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at AND (e.charge_id IS NULL OR e.charge_id=fc.id)
       ) THEN fc.tenant_id END) AS blocked
       FROM financial_charges fc
       LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=fc.tenant_id`,
    [today],
  );
  const [mrrRows] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(COALESCE(tc.price_monthly,p.price_monthly)),0) AS mrr
       FROM tenants t
       JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id)
       JOIN plans p ON p.id=s.plan_id
       LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id
      WHERE t.status='ACTIVE' AND s.status IN ('ACTIVE','PAST_DUE')`,
  );
  const receipts = await listReceipts({ limit: 8 });
  return {
    receivedMonth: Number(paymentRows[0]?.received_month || 0),
    receivable: Number(chargeRows[0]?.receivable || 0),
    overdue: Number(chargeRows[0]?.overdue || 0),
    delinquentTenants: Number(chargeRows[0]?.delinquent || 0),
    blockedTenants: Number(chargeRows[0]?.blocked || 0),
    mrr: Number(mrrRows[0]?.mrr || 0),
    recentReceipts: receipts,
  };
}

export async function markOverdueCharges() {
  const today = todayInBrasilia();
  const [result] = await pool.query<any>(
    `UPDATE financial_charges SET status='OVERDUE',updated_at=${BRASILIA_NOW_SQL}
      WHERE status='OPEN' AND due_date<?`,
    [today],
  );
  return Number(result.affectedRows || 0);
}

export async function listAmbiguousCharges(limit = 50) {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM financial_charges WHERE status='ISSUING' ORDER BY updated_at ASC LIMIT ${Math.min(200, Math.max(1, limit))}`,
  );
  return rows.map((r: any) => Number(r.id));
}
