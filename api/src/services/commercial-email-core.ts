export type EmailSecurity="NONE"|"STARTTLS"|"SSL_TLS";
export type SmtpCredentials={host:string;port:number;username:string;password:string;security:EmailSecurity};

export function smtpTransportOptions(config:SmtpCredentials){
  const auth=config.username&&config.password?{user:config.username,pass:config.password}:undefined;
  return {host:config.host,port:config.port,secure:config.security==="SSL_TLS",requireTLS:config.security==="STARTTLS",ignoreTLS:config.security==="NONE",auth,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000};
}

export function buildReadReceiptHeaders(senderEmail:string){
  return {"Disposition-Notification-To":senderEmail,"Return-Receipt-To":senderEmail,"X-Confirm-Reading-To":senderEmail};
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));}

export function buildCommercialEmailHtml(input:{recipientName?:string|null;message:string;trackingUrl:string;documentLabel:string}){
  const recipient=input.recipientName?.trim()?`Olá, <strong>${escapeHtml(input.recipientName.trim())}</strong>.`:"Olá.";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#17304a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #e4eaf1;border-radius:14px;overflow:hidden"><tr><td style="background:#102e4c;color:#fff;padding:20px 26px"><strong style="font-size:20px">PONTO CERTO</strong><div style="font-size:12px;color:#bcd0e1;margin-top:4px">Gestão de ponto e jornada</div></td></tr><tr><td style="padding:28px 26px;font-size:14px;line-height:1.65"><p>${recipient}</p><p>${escapeHtml(input.message.trim()).replace(/\r?\n/g,"<br>")}</p><div style="background:#eef7f7;border:1px solid #d5ebeb;border-radius:10px;padding:14px 16px"><strong>${escapeHtml(input.documentLabel)}</strong><br><span style="font-size:12px;color:#60758a">O documento segue anexado em PDF.</span></div><p style="color:#617286;font-size:12px">Este e-mail foi enviado pelo módulo comercial do PONTO CERTO.</p></td></tr></table></td></tr></table><img src="${escapeHtml(input.trackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden" /></body></html>`;
}

export function sanitizeSmtpError(error:any){
  const code=String(error?.code||"");
  if(code==="EAUTH")return "Autenticação recusada pelo servidor SMTP. Confira usuário e senha de app.";
  if(["ETIMEDOUT","ECONNECTION","ECONNREFUSED","ENOTFOUND"].includes(code))return "Não foi possível conectar ao servidor SMTP. Confira servidor, porta e rede.";
  if(["ESOCKET","ETLS"].includes(code))return "Falha na negociação TLS/SSL com o servidor SMTP.";
  return "Falha ao validar ou utilizar a conexão SMTP.";
}

export function smtpConnectionIdentity(value:any){
  const security=value?.security||(value?.tls===false?"NONE":"STARTTLS");
  return JSON.stringify([value?.host||"",Number(value?.port||587),value?.username||"",security,value?.senderEmail||"",value?.secret||null]);
}
