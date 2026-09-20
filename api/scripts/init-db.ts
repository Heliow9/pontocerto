import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { MYSQL_HOST, MYSQL_PORT = "3306", MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD } = process.env;
if (!MYSQL_HOST || !MYSQL_DATABASE || !MYSQL_USER || MYSQL_PASSWORD === undefined) throw new Error("Configure o .env da API.");

const connection = await mysql.createConnection({host:MYSQL_HOST,port:Number(MYSQL_PORT),database:MYSQL_DATABASE,user:MYSQL_USER,password:MYSQL_PASSWORD,multipleStatements:true});
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(190) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const sqlDir=path.resolve(__dirname,"../sql");
  const files=fs.readdirSync(sqlDir).filter(f=>f.endsWith(".sql")).sort();
  for(const file of files){
    const [done]=await connection.query<any[]>("SELECT filename FROM schema_migrations WHERE filename=? LIMIT 1",[file]);
    if(done[0]){console.log(`Já aplicado: ${file}`);continue;}
    const sql=fs.readFileSync(path.join(sqlDir,file),"utf8");
    await connection.query(sql);
    await connection.query("INSERT INTO schema_migrations (filename,applied_at) VALUES (?,NOW())",[file]);
    console.log(`Aplicado: ${file}`);
  }

  const passwordHash=await bcrypt.hash("Admin@123",10);
  await connection.query(`INSERT IGNORE INTO tenants (id,name,slug,status,created_at,updated_at) VALUES (1,'Ponto Certo Demo','ponto-certo-demo','ACTIVE',NOW(),NOW())`);
  await connection.query(`INSERT IGNORE INTO companies (id,tenant_id,legal_name,trade_name,cnpj,active,created_at,updated_at) VALUES (1,1,'Empresa Demo','Empresa Demo',NULL,1,NOW(),NOW())`);
  await connection.query(`INSERT IGNORE INTO company_profiles (id,tenant_id,company_id,phone,email,address,city,state,created_at,updated_at) VALUES (1,1,1,NULL,NULL,NULL,NULL,NULL,NOW(),NOW())`);
  await connection.query(`INSERT IGNORE INTO tenant_settings (tenant_id,report_title,report_footer,timezone,created_at,updated_at) VALUES (1,'Relatório de Pontos','Ponto Certo SaaS - Sistema de gestão de jornada','America/Sao_Paulo',NOW(),NOW())`);
  await connection.query(`INSERT IGNORE INTO work_schedules (id,tenant_id,company_id,name,weekly_minutes,tolerance_late_minutes,tolerance_overtime_minutes,active,created_at,updated_at) VALUES (1,1,1,'Segunda a Sexta - 08:00 às 13:00',1500,10,10,1,NOW(),NOW())`);
  const scheduleDays=[[0,1,null,null,null,null,0],[1,0,'08:00','13:00',null,null,300],[2,0,'08:00','13:00',null,null,300],[3,0,'08:00','13:00',null,null,300],[4,0,'08:00','13:00',null,null,300],[5,0,'08:00','13:00',null,null,300],[6,1,null,null,null,null,0]];
  for(const d of scheduleDays) await connection.query(`INSERT IGNORE INTO work_schedule_days (tenant_id,work_schedule_id,weekday,is_day_off,entry_1,exit_1,entry_2,exit_2,expected_minutes) VALUES (1,1,?,?,?,?,?,?,?)`,d);
  await connection.query(`INSERT IGNORE INTO employees (id,tenant_id,company_id,name,cpf,pis,registration_number,admission_date,ctps,position_name,department_name,work_schedule_id,active,created_at,updated_at) VALUES (1,1,1,'Funcionário Demo','000.000.000-00','000000000000','0001',CURDATE(),'DEMO','Colaborador','Operacional',1,1,NOW(),NOW())`);
  await connection.query("UPDATE employees SET work_schedule_id=1 WHERE id=1 AND tenant_id=1 AND work_schedule_id IS NULL");
  await connection.query(`INSERT IGNORE INTO users (id,tenant_id,company_id,employee_id,name,email,password_hash,role,active,created_at,updated_at) VALUES (1,1,1,NULL,'Administrador','admin@pontocerto.local',?,'TENANT_ADMIN',1,NOW(),NOW())`,[passwordHash]);
  await connection.query(`INSERT IGNORE INTO users (id,tenant_id,company_id,employee_id,name,email,password_hash,role,active,created_at,updated_at) VALUES (2,1,1,1,'Funcionário Demo','funcionario@pontocerto.local',?,'FUNCIONARIO',1,NOW(),NOW())`,[passwordHash]);
  await connection.query(`INSERT IGNORE INTO users (id,tenant_id,company_id,employee_id,name,email,password_hash,role,active,created_at,updated_at) VALUES (3,1,1,NULL,'Administrador SaaS','saas@pontocerto.local',?,'SUPER_ADMIN',1,NOW(),NOW())`,[passwordHash]);
  await connection.query(`INSERT IGNORE INTO plans (id,name,code,max_employees,price_monthly,active) VALUES (1,'Starter','starter',30,99.90,1),(2,'Profissional','professional',150,249.90,1),(3,'Enterprise','enterprise',NULL,499.90,1)`);
  console.log("Banco inicializado/atualizado com sucesso.");
  console.log("Admin: admin@pontocerto.local / Admin@123");
  console.log("Funcionário: funcionario@pontocerto.local / Admin@123");
  console.log("SaaS: saas@pontocerto.local / Admin@123");
} finally { await connection.end(); }
