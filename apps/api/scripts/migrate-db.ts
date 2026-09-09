import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import "dotenv/config";
const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../sql",
);
const check = process.argv.includes("--check");
const {
  MYSQL_HOST,
  MYSQL_PORT = "3306",
  MYSQL_DATABASE,
  MYSQL_USER,
  MYSQL_PASSWORD,
} = process.env;
if (
  !MYSQL_HOST ||
  !MYSQL_DATABASE ||
  !MYSQL_USER ||
  MYSQL_PASSWORD === undefined
)
  throw new Error("Configure o .env da API antes de executar as migrações.");
const connection = await mysql.createConnection({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  database: MYSQL_DATABASE,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  multipleStatements: true,
  connectTimeout: 10000,
});
try {
  const [tables] = await connection.query<any[]>(
    "SHOW TABLES LIKE 'schema_migrations'",
  );
  const applied = tables.length
    ? (
        await connection.query<any[]>("SELECT filename FROM schema_migrations")
      )[0].map((row) => row.filename)
    : [];
  const pending = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".sql") && !applied.includes(file))
    .sort();
  console.log(`Migrações pendentes: ${pending.length}`);
  for (const name of pending) console.log(name);
  if (!check) {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(190) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    );
    for (const file of pending) {
      await connection.query(
        fs.readFileSync(path.join(directory, file), "utf8"),
      );
      await connection.query(
        "INSERT INTO schema_migrations (filename,applied_at) VALUES (?,NOW())",
        [file],
      );
      console.log(`Aplicada: ${file}`);
    }
  }
} finally {
  await connection.end();
}
