const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const providerLabel=(provider:string)=>({CORA:'Cora',EFI:'Efí Bank',MERCADO_PAGO:'Mercado Pago',LEGACY:'Legado'} as Record<string,string>)[provider]||provider;
const methodLabel=(method:string)=>({HYBRID:'Boleto + Pix',PIX:'Pix',BOLETO:'Boleto'} as Record<string,string>)[method]||method;
const brl=(value:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));
const dateBR=(value:unknown)=>{const raw=String(value??'').slice(0,10);const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);return m?`${m[3]}/${m[2]}/${m[1]}`:raw;};
const safeHttps=(value:unknown)=>{const raw=String(value??'').trim();try{const u=new URL(raw);return u.protocol==='https:'?raw:null;}catch{return null;}};
const safeQrBase64=(value:unknown)=>{const raw=String(value??'').trim();return raw.length>=40&&raw.length<2_000_000&&/^[A-Za-z0-9+/=\r\n]+$/.test(raw)?raw.replace(/\s/g,''):null;};
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveChargeRecipient(charge:any,override?:string|null){
  const value=String(override||charge?.payer_email||'').trim().toLowerCase();
  if(!emailRe.test(value))throw Object.assign(new Error('A cobrança não possui um e-mail de destinatário válido.'),{status:400,code:'CHARGE_EMAIL_MISSING'});
  return value;
}

export function buildFinancialChargeEmailContent(charge:any){
  const due=dateBR(charge.due_date),amount=brl(charge.amount),provider=providerLabel(String(charge.provider||'')),method=methodLabel(String(charge.requested_payment_method||''));
  const subject=`Ponto Certo | Cobrança disponível - Vencimento ${due}`;
  const lines=[
    `Olá, ${charge.payer_name||'cliente'}.`,
    '',
    'Uma cobrança está disponível no Ponto Certo.',
    `Descrição: ${charge.description||''}`,
    `Valor: ${amount}`,
    `Vencimento: ${due}`,
    `Provedor: ${provider}`,
    `Forma de pagamento: ${method}`,
  ];
  const paymentUrl=safeHttps(charge.provider_payment_url);
  if(paymentUrl)lines.push(`Link para pagamento: ${paymentUrl}`);
  if(charge.digitable_line)lines.push(`Linha digitável: ${charge.digitable_line}`);
  if(charge.pix_copy_paste)lines.push(`Pix Copia e Cola: ${charge.pix_copy_paste}`);
  lines.push('','Atenciosamente,','Ponto Certo');
  const qr=safeQrBase64(charge.pix_qr_code);
  const artifacts=[
    paymentUrl?`<p><a href="${escapeHtml(paymentUrl)}" style="display:inline-block;background:#0b7a75;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px">Visualizar / pagar cobrança</a></p>`:'',
    charge.digitable_line?`<div style="margin-top:12px"><strong>Linha digitável</strong><br><code style="word-break:break-all">${escapeHtml(charge.digitable_line)}</code></div>`:'',
    charge.pix_copy_paste?`<div style="margin-top:12px"><strong>Pix Copia e Cola</strong><br><code style="word-break:break-all">${escapeHtml(charge.pix_copy_paste)}</code></div>`:'',
    qr?`<div style="margin-top:16px"><strong>QR Code Pix</strong><br><img alt="QR Code Pix" src="data:image/png;base64,${qr}" style="max-width:220px;height:auto" /></div>`:'',
  ].join('');
  const html=`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#17304a"><table width="100%" cellspacing="0" cellpadding="0" role="presentation"><tr><td align="center" style="padding:24px 12px"><table width="100%" cellspacing="0" cellpadding="0" role="presentation" style="max-width:680px;background:#fff;border:1px solid #e3e9ef;border-radius:14px;overflow:hidden"><tr><td style="background:#102e4c;color:#fff;padding:20px 26px"><strong style="font-size:20px">PONTO CERTO</strong><div style="font-size:12px;color:#bfd0df;margin-top:4px">Gestão de ponto e jornada</div></td></tr><tr><td style="padding:28px 26px;line-height:1.6"><p>Olá, <strong>${escapeHtml(charge.payer_name||'cliente')}</strong>.</p><p>Uma cobrança está disponível.</p><div style="background:#f7fafc;border:1px solid #e2e9ef;border-radius:10px;padding:16px"><div><strong>Descrição:</strong> ${escapeHtml(charge.description||'')}</div><div><strong>Valor:</strong> ${escapeHtml(amount)}</div><div><strong>Vencimento:</strong> ${escapeHtml(due)}</div><div><strong>Provedor:</strong> ${escapeHtml(provider)}</div><div><strong>Forma de pagamento:</strong> ${escapeHtml(method)}</div>${artifacts}</div><p style="font-size:12px;color:#60758a;margin-top:22px">Mensagem automática do módulo financeiro do Ponto Certo.</p></td></tr></table></td></tr></table></body></html>`;
  return{subject,text:lines.join('\n'),html};
}
