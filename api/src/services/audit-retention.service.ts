import {pool} from "../db/pool.js";
let timer:ReturnType<typeof setInterval>|undefined;
export async function cleanupAdministrativeAudit(){await pool.query("DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 12 MONTH)");}
export function startAuditRetentionWorker(){if(timer)return;void cleanupAdministrativeAudit().catch(e=>console.error("Falha ao limpar auditoria",e));timer=setInterval(()=>void cleanupAdministrativeAudit().catch(e=>console.error("Falha ao limpar auditoria",e)),6*60*60*1000);timer.unref?.();}
