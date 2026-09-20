import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

export const sessionHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const isSessionToken = (value: string) =>
  /^pc_session_[a-f0-9]{64}$/.test(value);
export async function createSession(user: any) {
  const token = `pc_session_${randomBytes(32).toString("hex")}`;
  await pool.query(
    "INSERT INTO persistent_sessions (token_hash,user_id,tenant_id,password_fingerprint) VALUES (?,?,?,?)",
    [
      sessionHash(token),
      user.id,
      user.tenant_id,
      sessionHash(user.password_hash),
    ],
  );
  return token;
}

export async function readSession(token: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT u.*, s.password_fingerprint FROM persistent_sessions s
     JOIN users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id
     JOIN tenants t ON t.id=u.tenant_id AND t.status='ACTIVE'
     JOIN employees e ON e.id=u.employee_id AND e.tenant_id=u.tenant_id AND e.active=1
     JOIN companies c ON c.id=e.company_id AND c.tenant_id=e.tenant_id AND c.active=1
     WHERE s.token_hash=? AND u.active=1 AND u.role='FUNCIONARIO' LIMIT 1`,
    [sessionHash(token)],
  );
  const user = rows[0];
  if (!user || user.password_fingerprint !== sessionHash(user.password_hash))
    return null;
  return {
    userId: Number(user.id),
    tenantId: Number(user.tenant_id),
    companyId: user.company_id ? Number(user.company_id) : null,
    employeeId: Number(user.employee_id),
    role: user.role,
    name: user.name,
    email: user.email,
  };
}
