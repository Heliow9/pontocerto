import {createHash,randomBytes} from "node:crypto";
import type {Request} from "express";
import {pool} from "../db/pool.js";
import {revealSecret} from "./saas-secrets.js";
import {buildCommercialEmailHtml,buildReadReceiptHeaders,sanitizeSmtpError,smtpTransportOptions,type EmailSecurity,type SmtpCredentials} from "./commercial-email-core.js";
export {buildCommercialEmailHtml,buildReadReceiptHeaders,sanitizeSmtpError,smtpTransportOptions,smtpConnectionIdentity} from "./commercial-email-core.js";

export type SmtpConnectionStatus="NOT_TESTED"|"SUCCESS"|"ERROR";
export type StoredProtocol={host?:string;port?:number;username?:string;security?:EmailSecurity;tls?:boolean;secret?:string|null};
export type StoredSmtp=StoredProtocol&{senderName?:string;senderEmail?:string;connection?:{status:SmtpConnectionStatus;lastTestAt:string|null;message:string}};
export type StoredEmailSettings={smtp?:StoredSmtp;pop3?:StoredProtocol};

export const notTestedConnection=()=>({status:"NOT_TESTED" as const,lastTestAt:null,message:"Conexão SMTP ainda não testada."});
export function parseStoredEmailSettings(value:unknown):StoredEmailSettings{if(!value)return {};try{return typeof value==="string"?JSON.parse(value):value as StoredEmailSettings;}catch{return {};}}
export async function loadEmailSettings(){const [rows]=await pool.query<any[]>("SELECT setting_value FROM saas_settings WHERE setting_key='email'");return parseStoredEmailSettings(rows[0]?.setting_value);}
export function smtpConnectionView(smtp:StoredSmtp|undefined){return smtp?.connection||notTestedConnection();}

function configuredSmtp(settings:StoredEmailSettings){const smtp=settings.smtp||{};if(!smtp.host||!smtp.port||!smtp.username)throw Object.assign(new Error("Complete servidor, porta e usuário SMTP antes de continuar."),{status:409});if(!smtp.senderEmail)throw Object.assign(new Error("Informe o e-mail remetente SMTP."),{status:409});if(!smtp.secret)throw Object.assign(new Error("Configure a senha SMTP antes de testar ou enviar e-mails."),{status:409});return smtp;}
function credentials(smtp:StoredSmtp):SmtpCredentials{return {host:smtp.host||"",port:Number(smtp.port||587),username:smtp.username||"",password:revealSecret(smtp.secret||""),security:smtp.security||(smtp.tls===false?"NONE":"STARTTLS")};}

async function nodemailer(){const dynamicImport=new Function("moduleName","return import(moduleName)") as (name:string)=>Promise<any>;const mod=await dynamicImport("nodemailer");return mod.default??mod;}
async function saveConnection(settings:StoredEmailSettings,connection:any){settings.smtp={...(settings.smtp||{}),connection};await pool.query("INSERT INTO saas_settings(setting_key,setting_value,updated_at) VALUES('email',?,NOW()) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()",[JSON.stringify(settings)]);}
export async function verifyPersistedSmtp(){const settings=await loadEmailSettings(),smtp=configuredSmtp(settings),mailer=await nodemailer(),transport=mailer.createTransport(smtpTransportOptions(credentials(smtp)));try{await transport.verify();const connection={status:"SUCCESS" as const,lastTestAt:new Date().toISOString(),message:"Conexão SMTP validada com sucesso."};await saveConnection(settings,connection);return connection;}catch(error){const connection={status:"ERROR" as const,lastTestAt:new Date().toISOString(),message:sanitizeSmtpError(error)};await saveConnection(settings,connection);throw Object.assign(new Error(connection.message),{status:502});}finally{transport.close?.();}}
export async function assertSmtpReady(){const smtp=configuredSmtp(await loadEmailSettings());if(smtpConnectionView(smtp).status!=="SUCCESS")throw Object.assign(new Error("Teste e valide a conexão SMTP antes de enviar documentos."),{status:409});return true;}

export function trackingHash(token:string){return createHash("sha256").update(token).digest("hex");}
export function createTrackingToken(){return randomBytes(32).toString("hex");}
export function buildPublicBaseUrl(req:Request){const fp=String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim(),fh=String(req.headers["x-forwarded-host"]||"").split(",")[0].trim(),proto=fp||req.protocol||"https",host=fh||req.get("host");if(!host)throw Object.assign(new Error("Não foi possível determinar a URL pública da API para rastreamento."),{status:500});return `${proto}://${host}`;}

export async function sendCommercialEmail(input:{to:string;subject:string;message:string;filename:string;pdf:Buffer;trackingUrl:string;recipientName?:string|null;documentLabel?:string}){const smtp=configuredSmtp(await loadEmailSettings());if(smtpConnectionView(smtp).status!=="SUCCESS")throw Object.assign(new Error("Teste e valide a conexão SMTP antes de enviar documentos."),{status:409});const mailer=await nodemailer(),transport=mailer.createTransport(smtpTransportOptions(credentials(smtp)));try{const result=await transport.sendMail({from:{name:smtp.senderName||"PONTO CERTO",address:smtp.senderEmail},to:input.to,subject:input.subject,text:input.message,html:buildCommercialEmailHtml({recipientName:input.recipientName,message:input.message,trackingUrl:input.trackingUrl,documentLabel:input.documentLabel||input.filename}),attachments:[{filename:input.filename,content:input.pdf,contentType:"application/pdf"}],headers:buildReadReceiptHeaders(smtp.senderEmail!)});return {messageId:String(result?.messageId||""),accepted:Array.isArray(result?.accepted)?result.accepted.map(String):[]};}catch(error){throw Object.assign(new Error(sanitizeSmtpError(error)),{status:502});}finally{transport.close?.();}}
