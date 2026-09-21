import {useEffect,useState} from 'react';
import {api} from '../api';
import {PageHeader,Badge,Empty} from '../components/Ui';
import {DataTable} from '../components/DataTable';
import {Modal} from '../components/Modal';
import {MaskedInput} from '../components/MaskedInput';
import {apiMessage} from '../utils';

const empty={legalName:'',tradeName:'',document:'',email:'',phone:'',financialContactName:'',financialContactDocument:'',financialContactEmail:'',financialContactPhone:'',zipCode:'',street:'',number:'',complement:'',district:'',city:'',state:'',status:'ACTIVE'};
const toForm=(row:any)=>({
  legalName:row?.legal_name??'',tradeName:row?.trade_name??'',document:row?.document??'',email:row?.email??'',phone:row?.phone??'',
  financialContactName:row?.financial_contact_name??'',financialContactDocument:String(row?.financial_contact_document??'').replace(/\D/g,'').length===11?String(row?.financial_contact_document??''):'',financialContactEmail:row?.financial_contact_email??'',financialContactPhone:row?.financial_contact_phone??'',
  zipCode:row?.zip_code??'',street:row?.street??'',number:row?.number??'',complement:row?.complement??'',district:row?.district??'',city:row?.city??'',state:row?.state??'',status:row?.status??'ACTIVE'
});

export function SaasCommercialCustomers(){
  const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[editingId,setEditingId]=useState<number|null>(null),[form,setForm]=useState<any>(empty),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const load=()=>api.get('/saas/commercial-customers').then(r=>setRows(r.data));
  useEffect(()=>{void load();},[]);

  function openNew(){setEditingId(null);setForm({...empty});setError('');setOpen(true);}
  function openEdit(row:any){setEditingId(Number(row.id));setForm(toForm(row));setError('');setOpen(true);}
  function close(){if(saving)return;setOpen(false);setEditingId(null);setForm({...empty});setError('');}

  async function save(e:React.FormEvent){
    e.preventDefault();setError('');setSaving(true);
    try{
      const payload={...form,personType:String(form.document).replace(/\D/g,'').length===11?'PF':'PJ'};
      if(editingId)await api.put(`/saas/commercial-customers/${editingId}`,payload);
      else await api.post('/saas/commercial-customers',payload);
      setOpen(false);setEditingId(null);setForm({...empty});setError('');await load();
    }catch(err){setError(apiMessage(err));}
    finally{setSaving(false);}
  }

  return <><PageHeader title="Clientes Comerciais" subtitle="Cadastro único para clientes que podem contratar Ponto Certo, Movyo e outros produtos." action={<button className="primary" onClick={openNew}>+ Novo cliente comercial</button>}/>
  <div className="panel table-panel">{rows.length===0?<Empty>Nenhum cliente comercial cadastrado.</Empty>:<div className="table-wrap"><DataTable><thead><tr><th>Cliente</th><th>Documento</th><th>Financeiro</th><th>Produtos</th><th>MRR</th><th>Status</th><th>Ações</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.legal_name}</strong><div className="muted">{r.trade_name||r.email||''}</div></td><td>{r.document||'—'}</td><td>{r.financial_contact_email||r.email||'—'}</td><td>{r.subscriptions_count}</td><td>{Number(r.mrr||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td><Badge tone={r.status==='ACTIVE'?'success':'warning'}>{r.status}</Badge></td><td><button type="button" onClick={()=>openEdit(r)}>Editar</button></td></tr>)}</tbody></DataTable></div>}</div>
  {open&&<Modal title={editingId?'Editar cliente comercial':'Novo cliente comercial'} onClose={close} wide><form className="form-grid" onSubmit={save}>{error&&<div className="error span-2">{error}</div>}
    <label>Razão social / Nome<input required value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/></label>
    <label>Nome fantasia<input value={form.tradeName} onChange={e=>setForm({...form,tradeName:e.target.value})}/></label>
    <label>CPF/CNPJ<MaskedInput mask="cpfCnpj" value={form.document} onChange={document=>setForm({...form,document})}/></label>
    <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></label>
    <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>Telefone<MaskedInput mask="phone" value={form.phone} onChange={phone=>setForm({...form,phone})}/></label>
    <label>Responsável financeiro<input value={form.financialContactName} onChange={e=>setForm({...form,financialContactName:e.target.value})}/></label>
    <label>CPF do responsável financeiro<MaskedInput mask="cpf" placeholder="000.000.000-00" value={form.financialContactDocument} onChange={financialContactDocument=>setForm({...form,financialContactDocument})}/></label>
    <label>E-mail financeiro<input type="email" value={form.financialContactEmail} onChange={e=>setForm({...form,financialContactEmail:e.target.value})}/></label>
    <label>Telefone financeiro<MaskedInput mask="phone" value={form.financialContactPhone} onChange={financialContactPhone=>setForm({...form,financialContactPhone})}/></label>
    <label>CEP<MaskedInput mask="cep" value={form.zipCode} onChange={zipCode=>setForm({...form,zipCode})}/></label>
    <label>Logradouro<input value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label>
    <label>Número<input value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/></label>
    <label>Complemento<input value={form.complement} onChange={e=>setForm({...form,complement:e.target.value})}/></label>
    <label>Bairro<input value={form.district} onChange={e=>setForm({...form,district:e.target.value})}/></label>
    <label>Cidade<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
    <label>UF<input maxLength={2} value={form.state} onChange={e=>setForm({...form,state:e.target.value.toUpperCase()})}/></label>
    <div className="form-actions span-2"><button type="button" disabled={saving} onClick={close}>Cancelar</button><button className="primary" type="submit" disabled={saving}>{saving?'Salvando...':editingId?'Salvar alterações':'Salvar'}</button></div>
  </form></Modal>}</>;
}
