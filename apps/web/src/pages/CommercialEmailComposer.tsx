import {useEffect,useState} from "react";
import {api} from "../api";
import {apiMessage} from "../utils";
import {Field} from "./CommercialUi";

type Props={kind:"proposals"|"contracts";id:number;defaultTo:string;defaultSubject:string;defaultMessage:string;onSent:()=>Promise<void>|void;onClose:()=>void};

export function CommercialEmailComposer({kind,id,defaultTo,defaultSubject,defaultMessage,onSent,onClose}:Props){
  const [form,setForm]=useState({to:defaultTo,subject:defaultSubject,message:defaultMessage}),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>setForm({to:defaultTo,subject:defaultSubject,message:defaultMessage}),[id,defaultTo,defaultSubject,defaultMessage]);
  return <section className="commercial-section-card commercial-email-composer">
    <div className="commercial-section-head"><div><h2>Enviar por e-mail</h2><p>O PONTO CERTO gera um novo PDF da revisão atual e envia como anexo.</p></div><button type="button" className="ghost compact" onClick={onClose}>Fechar envio</button></div>
    <div className="commercial-settings-intro"><strong>Confirmação de leitura:</strong> o e-mail solicita recibo ao cliente e inclui rastreamento de abertura. O sistema mostra <strong>Abertura detectada</strong>, pois Gmail, Outlook e outros clientes podem bloquear ou antecipar imagens.</div>
    <form className="commercial-form" aria-busy={busy} onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{await api.post(`/saas/${kind}/${id}/send-email`,form,{timeout:120000});await onSent();}catch(err){setError(apiMessage(err));}finally{setBusy(false);}}}>
      <fieldset disabled={busy} className="commercial-form-body"><div className="commercial-grid"><Field label="Destinatário"><input type="email" required value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></Field><Field label="Assunto"><input required maxLength={255} value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/></Field></div><Field label="Mensagem"><textarea required rows={7} maxLength={10000} value={form.message} onChange={e=>setForm({...form,message:e.target.value})}/></Field></fieldset>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="form-actions"><button className="primary" disabled={busy}>{busy?"Enviando…":"Enviar por e-mail"}</button><button type="button" className="ghost" disabled={busy} onClick={onClose}>Fechar envio</button></div>
    </form>
  </section>;
}

const when=(value:any)=>value?new Date(value).toLocaleString("pt-BR"):"—";
export function CommercialEmailHistory({deliveries}:{deliveries:any[]|undefined}){
  if(!deliveries?.length)return <div className="commercial-empty compact-empty"><p>Nenhum envio por e-mail registrado.</p></div>;
  return <ul className="commercial-email-history">{deliveries.map(d=><li key={d.id}><div className="commercial-email-history-main"><strong>{d.recipient_email}</strong><span>{d.subject}</span><small>Revisão {d.revision} · enviado em {when(d.sent_at)}</small></div><div className="commercial-email-history-status">{d.first_opened_at?<><span className="commercial-status status-active">Abertura detectada</span><small>Primeira: {when(d.first_opened_at)}</small><small>Última: {when(d.last_opened_at)} · {Number(d.open_count||0)} abertura(s)</small></>:<><span className="commercial-status status-sent">Enviado</span><small>Aguardando abertura detectável</small></>}</div></li>)}</ul>;
}
