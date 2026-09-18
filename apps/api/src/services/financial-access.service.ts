import { pool } from "../db/pool.js";
import { BRASILIA_NOW_SQL } from "../utils/db-time.js";
import { ensureBillingProfile, recordFinancialEvent } from "./financial.service.js";

const error = (message: string, status = 400, code = "FINANCIAL_ACCESS_ERROR") => Object.assign(new Error(message), { status, code });

export async function getTenantFinancialAccess(tenantId: number) {
  const profile = await ensureBillingProfile(tenantId);
  const [globalRows] = await pool.query<any[]>(
    `SELECT id,ends_at,reason FROM financial_access_exceptions
      WHERE tenant_id=? AND charge_id IS NULL AND revoked_at IS NULL
        AND ${BRASILIA_NOW_SQL} BETWEEN starts_at AND ends_at
      ORDER BY ends_at DESC LIMIT 1`, [tenantId],
  );
  const globalException = globalRows[0] || null;
  const [rows] = await pool.query<any[]>(
    `SELECT c.id,c.type,c.description,c.amount,c.due_date,c.block_at,c.status,c.pix_copy_paste,c.digitable_line,c.barcode,c.provider_charge_id,
            EXISTS(SELECT 1 FROM financial_access_exceptions e
              WHERE e.tenant_id=c.tenant_id AND e.charge_id=c.id AND e.revoked_at IS NULL
                AND ${BRASILIA_NOW_SQL} BETWEEN e.starts_at AND e.ends_at) AS excepted
       FROM financial_charges c
      WHERE c.tenant_id=? AND c.status IN ('OPEN','OVERDUE')
      ORDER BY c.due_date ASC,c.id ASC`, [tenantId],
  );
  const todayRows = await pool.query<any[]>(`SELECT DATE(${BRASILIA_NOW_SQL}) AS today`);
  const today = String((todayRows[0] as any[])[0]?.today || "");
  const blocking = profile.autoBlockEnabled && !globalException
    ? rows.filter((r: any) => String(r.block_at) <= today && !Boolean(r.excepted))
    : [];
  return {
    tenantId,
    blocked: blocking.length > 0,
    autoBlockEnabled: profile.autoBlockEnabled,
    graceDays: profile.graceDays,
    dueDay: profile.dueDay,
    globalException: globalException ? { id: Number(globalException.id), endsAt: globalException.ends_at, reason: globalException.reason } : null,
    blockingCharges: blocking.map((r: any) => ({
      id: Number(r.id), type: r.type, description: r.description, amount: Number(r.amount), dueDate: r.due_date,
      blockAt: r.block_at, status: r.status, pixCopyPaste: r.pix_copy_paste, digitableLine: r.digitable_line,
      barcode: r.barcode, providerChargeId: r.provider_charge_id,
    })),
  };
}

export async function syncSubscriptionFinancialStatus(tenantId: number, blocked?: boolean) {
  const access = blocked == null ? await getTenantFinancialAccess(tenantId) : { blocked };
  if (access.blocked) {
    await pool.query(`UPDATE subscriptions SET status='PAST_DUE' WHERE tenant_id=? AND status='ACTIVE' AND id=(SELECT id FROM (SELECT MAX(id) AS id FROM subscriptions WHERE tenant_id=?) x)`, [tenantId, tenantId]);
  } else {
    await pool.query(`UPDATE subscriptions SET status='ACTIVE' WHERE tenant_id=? AND status='PAST_DUE' AND id=(SELECT id FROM (SELECT MAX(id) AS id FROM subscriptions WHERE tenant_id=?) x)`, [tenantId, tenantId]);
  }
}

export async function grantFinancialException(input: {
  tenantId: number;
  chargeId?: number | null;
  endsAt: string;
  reason: string;
  actorUserId: number;
}) {
  if (!input.reason?.trim()) throw error("Informe o motivo da liberação temporária.");
  const end = new Date(input.endsAt);
  if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) throw error("A data final da liberação deve estar no futuro.");
  if (input.chargeId) {
    const [charges] = await pool.query<any[]>("SELECT id FROM financial_charges WHERE id=? AND tenant_id=? LIMIT 1", [input.chargeId, input.tenantId]);
    if (!charges[0]) throw error("Cobrança não pertence ao cliente informado.", 404, "CHARGE_NOT_FOUND");
  }
  const [result] = await pool.query<any>(
    `INSERT INTO financial_access_exceptions(tenant_id,charge_id,starts_at,ends_at,reason,created_by,created_at)
     VALUES(?,?,${BRASILIA_NOW_SQL},?,?,?,${BRASILIA_NOW_SQL})`,
    [input.tenantId, input.chargeId || null, end, input.reason.trim(), input.actorUserId],
  );
  await recordFinancialEvent({ tenantId: input.tenantId, chargeId: input.chargeId || null, eventType: "FINANCIAL_ACCESS_EXCEPTION_GRANTED", actorUserId: input.actorUserId, details: { exceptionId: Number(result.insertId), endsAt: end.toISOString(), reason: input.reason.trim() } });
  await syncSubscriptionFinancialStatus(input.tenantId);
  return { id: Number(result.insertId), endsAt: end.toISOString() };
}

export async function revokeFinancialException(id: number, actorUserId: number) {
  const [rows] = await pool.query<any[]>("SELECT tenant_id,charge_id FROM financial_access_exceptions WHERE id=? AND revoked_at IS NULL LIMIT 1", [id]);
  const row = rows[0];
  if (!row) throw error("Liberação temporária não encontrada ou já revogada.", 404, "EXCEPTION_NOT_FOUND");
  await pool.query(`UPDATE financial_access_exceptions SET revoked_at=${BRASILIA_NOW_SQL},revoked_by=? WHERE id=?`, [actorUserId, id]);
  await recordFinancialEvent({ tenantId: Number(row.tenant_id), chargeId: row.charge_id ? Number(row.charge_id) : null, eventType: "FINANCIAL_ACCESS_EXCEPTION_REVOKED", actorUserId, details: { exceptionId: id } });
  await syncSubscriptionFinancialStatus(Number(row.tenant_id));
  return { ok: true };
}

export async function listFinancialExceptions(tenantId?: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT e.*,t.name AS tenant_name,c.description AS charge_description,u.name AS created_by_name,ru.name AS revoked_by_name
       FROM financial_access_exceptions e
       JOIN tenants t ON t.id=e.tenant_id
       LEFT JOIN financial_charges c ON c.id=e.charge_id
       JOIN users u ON u.id=e.created_by
       LEFT JOIN users ru ON ru.id=e.revoked_by
      WHERE (? IS NULL OR e.tenant_id=?) ORDER BY e.created_at DESC LIMIT 300`, [tenantId || null, tenantId || null],
  );
  return rows;
}
