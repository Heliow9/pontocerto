import { pool } from "../db/pool.js";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export async function employeeEmailSuggestions(
  tenantId: number,
  companyId: number,
  name: string,
  db: any = pool,
) {
  const [companies] = await db.query(
    "SELECT legal_name FROM companies WHERE id=? AND tenant_id=? AND active=1 LIMIT 1",
    [companyId, tenantId],
  );
  if (!companies[0])
    throw Object.assign(new Error("Empresa não encontrada."), { status: 404 });
  const words = normalize(name)
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const company = normalize(companies[0].legal_name)
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 63);
  if (words.length < 2 || !company) return [];
  const local = `${words[0].slice(0, 25)}.${words[words.length - 1].slice(0, 25)}`;
  const suggestions: string[] = [];
  // Small batches avoid one query per collision; only available addresses are returned.
  for (let start = 1; suggestions.length < 3; start += 50) {
    const candidates = Array.from(
      { length: 50 },
      (_, i) => `${local}${start + i === 1 ? "" : start + i}@${company}.com.br`,
    );
    const [rows] = await db.query(
      `SELECT email FROM users WHERE email IN (${candidates.map(() => "?").join(",")})`,
      candidates,
    );
    const occupied = new Set(
      rows.map((row: any) => normalize(row.email.trim())),
    );
    suggestions.push(
      ...candidates
        .filter((email) => !occupied.has(email))
        .slice(0, 3 - suggestions.length),
    );
  }
  return suggestions;
}

export async function employeeEmailTaken(
  email: string,
  tenantId: number,
  employeeId?: number,
  db: any = pool,
) {
  const [rows] = await db.query(
    "SELECT id FROM users WHERE email=? AND (? IS NULL OR tenant_id<>? OR employee_id IS NULL OR employee_id<>?) LIMIT 1",
    [email, employeeId ?? null, tenantId, employeeId ?? null],
  );
  return rows.length > 0;
}
