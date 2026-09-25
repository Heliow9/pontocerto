import {useEffect,useMemo,useState} from "react";
import {api} from "../api";
import {CurrencyInput} from "../components/CurrencyInput";
import {apiMessage,brDate} from "../utils";

const methodLabels:Record<string,string>={HYBRID:"Boleto + Pix",PIX:"Pix",BOLETO:"Boleto"};
export const providerLabels:Record<string,string>={CORA:"Cora",EFI:"Efí Bank",MERCADO_PAGO:"Mercado Pago",LEGACY:"Provedor legado"};

type CoraTerms={discountAmount:number;fineAmount:number;interestRate:number};
const emptyCoraTerms:CoraTerms={discountAmount:0,fineAmount:0,interestRate:0};

export function SaasFinanceProviders(){
  const [data,setData]=useState<any>(null),[provider,setProvider]=useState(""),[method,setMethod]=useState(""),[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [coraTerms,setCoraTerms]=useState<CoraTerms>(emptyCoraTerms);
  async function load(){
    setError("");
    try{
      const d=(await api.get("/saas/finance/providers")).data;
      setData(d);setProvider(d.defaultProvider||"");setMethod(d.defaultMethod||"");
      const cora=d.providers?.find((p:any)=>p.code==="CORA");
      setCoraTerms({discountAmount:Number(cora?.paymentTerms?.discountAmount||0),fineAmount:Number(cora?.paymentTerms?.fineAmount||0),interestRate:Number(cora?.paymentTerms?.interestRate||0)});
    }catch(e){setError(apiMessage(e));}
  }
  useEffect(()=>{void load();},[]);
  const selected=useMemo(()=>data?.providers?.find((p:any)=>p.code===provider),[data,provider]);
  useEffect(()=>{if(provider&&method==="HYBRID"&&!selected?.capabilities?.hybridBoletoPix)setMethod("PIX");},[provider,selected]);
  async function save(){if(!provider||!method)return;setBusy("save");setError("");setMessage("");try{await api.put("/saas/finance/providers/default",{provider,method});setMessage("Provedor e método padrão atualizados. As cobranças já existentes não foram alteradas.");await load();}catch(e){setError(apiMessage(e));}finally{setBusy("");}}
  async function saveCoraTerms(){setBusy("CORA:terms");setError("");setMessage("");try{await api.put("/saas/finance/providers/CORA/payment-terms",coraTerms);setMessage("Condições de desconto, multa e juros da Cora atualizadas para as próximas emissões.");await load();}catch(e){setError(apiMessage(e));}finally{setBusy("");}}
  async function action(code:string,type:"test"|"webhook"){setBusy(`${code}:${type}`);setError("");setMessage("");try{if(type==="test")await api.post(`/saas/finance/providers/${code}/test`);else await api.put(`/saas/finance/providers/${code}/webhook`,{});setMessage(type==="test"?`Conexão com ${providerLabels[code]} validada.`:`Configuração de webhook de ${providerLabels[code]} processada.`);await load();}catch(e){setError(apiMessage(e));}finally{setBusy("");}}
  return <>
    <div className="commercial-heading"><div><span className="commercial-kicker">Financeiro · Configuração</span><h1>Provedores de pagamento</h1><p>Defina um provedor e um método padrão para Mensalidades e Implantações. Cobranças avulsas podem sobrescrever os dois.</p></div></div>
    {error&&<div className="error-card" role="alert">{error}</div>}{message&&<div className="commercial-toast success">{message}</div>}
    {!data?<div className="panel">Carregando provedores…</div>:<>
      <section className="panel"><div className="commercial-section-head"><div><h2>Padrão global do SaaS</h2><p>Afeta somente cobranças criadas depois da alteração.</p></div></div><div className="commercial-form-grid"><label>Provedor padrão<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="">Selecione</option>{data.providers.map((p:any)=><option key={p.code} value={p.code} disabled={!p.enabledByEnvironment||!p.configured}>{p.label}{!p.enabledByEnvironment||!p.configured?" · indisponível":""}</option>)}</select></label><label>Método padrão<select value={method} onChange={e=>setMethod(e.target.value)} disabled={!provider}><option value="">Selecione</option>{["HYBRID","PIX","BOLETO"].map(m=><option key={m} value={m} disabled={m==="HYBRID"&&!selected?.capabilities?.hybridBoletoPix}>{methodLabels[m]}</option>)}</select></label></div><button className="primary" disabled={busy==="save"||!provider||!method} onClick={save}>{busy==="save"?"Salvando…":"Salvar padrão global"}</button></section>
      <div className="commercial-grid-2 finance-provider-grid">{data.providers.map((p:any)=><section className="panel finance-provider-card" key={p.code}>
        <div className="commercial-section-head"><div><h2>{p.label}</h2><p>{p.selected?"Provedor padrão atual":"Disponível como alternativa"}</p></div><span className={`commercial-status ${p.configured&&p.enabledByEnvironment?"status-active":"status-suspended"}`}>{p.configured&&p.enabledByEnvironment?"Disponível":"Não configurado"}</span></div>
        <dl><div><dt>Ambiente</dt><dd>{p.environment}</dd></div><div><dt>Servidor</dt><dd>{p.enabledByEnvironment?"Habilitado":"Desabilitado"}</dd></div><div><dt>Credenciais</dt><dd>{p.configured?"Configuradas":p.missing?.join(", ")||"Pendentes"}</dd></div><div><dt>Boleto + Pix</dt><dd>{p.capabilities.hybridBoletoPix?"Sim":"Não"}</dd></div><div><dt>Pix</dt><dd>{p.capabilities.pix?"Sim":"Não"}</dd></div><div><dt>Boleto</dt><dd>{p.capabilities.boleto?"Sim":"Não"}</dd></div><div><dt>Último teste</dt><dd>{p.lastTestAt?`${p.lastTestStatus} · ${brDate(p.lastTestAt)}`:p.lastTestStatus}</dd></div><div><dt>Webhook</dt><dd className="finance-break">{p.webhookUrl||"Não configurado no servidor"}</dd></div></dl>
        {p.code==="CORA"&&<div className="finance-provider-terms">
          <div className="finance-provider-terms-head"><strong>Condições da cobrança Cora</strong><span>Aplicadas somente às novas emissões. Valores zerados desativam a respectiva condição.</span></div>
          <div className="finance-terms-group"><b>Antes do vencimento</b><label>Desconto (R$)<CurrencyInput min={0} value={coraTerms.discountAmount} onChange={discountAmount=>setCoraTerms({...coraTerms,discountAmount:Number(discountAmount||0)})}/></label><small>Na Cora, o desconto é válido até o dia anterior ao vencimento.</small></div>
          <div className="finance-terms-group"><b>Após o vencimento</b><div className="finance-terms-grid"><label>Multa (R$)<CurrencyInput min={0} value={coraTerms.fineAmount} onChange={fineAmount=>setCoraTerms({...coraTerms,fineAmount:Number(fineAmount||0)})}/></label><label>Juros (%)<input type="number" min={0} max={100} step="0.01" value={coraTerms.interestRate} onChange={e=>setCoraTerms({...coraTerms,interestRate:Number(e.target.value||0)})}/></label></div><small>A Cora passa a aplicar multa e juros após o vencimento conforme as regras da própria cobrança.</small></div>
          <button className="ghost" disabled={Boolean(busy)} onClick={()=>void saveCoraTerms()}>{busy==="CORA:terms"?"Salvando condições…":"Salvar condições Cora"}</button>
        </div>}
        <div className="finance-actions"><button className="primary" disabled={Boolean(busy)||!p.enabledByEnvironment||!p.configured} onClick={()=>action(p.code,"test")}>{busy===`${p.code}:test`?"Testando…":"Testar conexão"}</button><button className="ghost" disabled={Boolean(busy)||!p.enabledByEnvironment||!p.configured||!p.webhookUrl} onClick={()=>action(p.code,"webhook")}>{busy===`${p.code}:webhook`?"Configurando…":"Configurar webhook"}</button></div>{p.lastTestMessage&&<small className="muted">{p.lastTestMessage}</small>}
      </section>)}</div>
    </>}
  </>;
}
