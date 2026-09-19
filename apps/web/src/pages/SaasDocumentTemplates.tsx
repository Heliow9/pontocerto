import {useEffect,useState} from 'react';
import {api} from '../api';
import {PageHeader,Badge,Empty} from '../components/Ui';
import {DataTable} from '../components/DataTable';
import {Modal} from '../components/Modal';
import {apiMessage} from '../utils';

const previewContext={
  seller:{legal_name:'Ponto Certo',trade_name:'Ponto Certo',cnpj:'00.000.000/0000-00',email:'comercial@exemplo.com',financial_email:'financeiro@exemplo.com',phone:'(81) 0000-0000',address:'Endereço da empresa vendedora',representative_name:'Representante Legal',representative_document:'000.000.000-00',representative_role:'Representante'},
  customer:{legal_name:'Cliente Exemplo LTDA',trade_name:'Cliente Exemplo',document:'00.000.000/0000-00',email:'cliente@exemplo.com',phone:'(81) 99999-0000',address:'Endereço do cliente',financial_contact_name:'Responsável Financeiro',financial_contact_email:'financeiro@cliente.com'},
  product:{code:'MOVYO',name:'Movyo',description:'Plataforma Movyo'},
  plan:{code:'professional',name:'Professional'},
  proposal:{number:'PROP-0001',created_at:'19/09/2026',valid_until:'29/09/2026',implementation_days:'conforme proposta',notes:'—'},
  contract:{number:'CONT-0001',date:'19/09/2026',start_date:'19/09/2026',term_months:'12',due_day:'10',payment_method:'BolePix / Boleto',adjustment_rule:'conforme contrato',forum:'conforme contrato',notes:'—'},
  subscription:{monthly_price:'R$ 179,90',discount_percent:'0%',effective_price:'R$ 179,90',due_day:'10'},
  billing:{provider:'Efí',method:'BolePix',fine_percent:'conforme contrato',interest_daily_percent:'conforme contrato',grace_days:'3',auto_block:'sim'},
};

export function SaasDocumentTemplates(){
  const [rows,setRows]=useState<any[]>([]),[editing,setEditing]=useState<any|null>(null),[preview,setPreview]=useState<any|null>(null),[error,setError]=useState('');
  const load=()=>api.get('/saas/commercial/document-templates').then(r=>setRows(r.data));
  useEffect(()=>{void load();},[]);
  async function activate(id:number){setError('');try{await api.post(`/saas/commercial/document-templates/${id}/activate`);await load();}catch(e){setError(apiMessage(e));}}
  async function archive(id:number){setError('');try{await api.post(`/saas/commercial/document-templates/${id}/archive`);await load();}catch(e){setError(apiMessage(e));}}
  async function duplicate(row:any){setError('');try{await api.post('/saas/commercial/document-templates',{productId:Number(row.product_id),documentType:row.document_type,title:`${row.title} · nova versão`,templateContent:row.template_content});await load();}catch(e){setError(apiMessage(e));}}
  async function showPreview(row:any){setError('');try{const r=await api.post(`/saas/commercial/document-templates/${row.id}/preview`,{context:previewContext});setPreview({title:`Pré-visualizar · ${row.title} · v${row.version}`,content:r.data.content||'Modelo legado gerenciado pelo gerador DOCX atual.'});}catch(e){setError(apiMessage(e));}}
  async function save(e:React.FormEvent){e.preventDefault();if(!editing)return;setError('');try{await api.put(`/saas/commercial/document-templates/${editing.id}`,{title:editing.title,templateContent:editing.template_content});setEditing(null);await load();}catch(e){setError(apiMessage(e));}}
  return <>
    <PageHeader title="Modelos de documentos" subtitle="Propostas e contratos independentes, versionados por produto."/>
    {error&&<div className="commercial-toast error">{error}</div>}
    <div className="panel table-panel">{rows.length===0?<Empty>Nenhum modelo cadastrado.</Empty>:<div className="table-wrap"><DataTable><thead><tr><th>Produto</th><th>Documento</th><th>Versão</th><th>Título</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.product_name}</td><td>{r.document_type==='PROPOSAL'?'Proposta':'Contrato'}</td><td>v{r.version}</td><td>{r.title}</td><td><Badge tone={r.status==='ACTIVE'?'success':r.status==='DRAFT'?'warning':'neutral'}>{r.status}</Badge></td><td><div className="row-actions">
      {r.status==='DRAFT'&&!String(r.template_content).startsWith('__LEGACY_DOCX__:')&&<button onClick={()=>setEditing(r)}>Editar</button>}
      <button onClick={()=>void showPreview(r)}>Pré-visualizar</button>
      {!String(r.template_content).startsWith('__LEGACY_DOCX__:')&&<button onClick={()=>void duplicate(r)}>Duplicar versão</button>}
      {r.status==='DRAFT'&&<button className="primary" onClick={()=>void activate(r.id)}>Ativar</button>}
      {r.status!=='ARCHIVED'&&<button onClick={()=>void archive(r.id)}>Arquivar</button>}
    </div></td></tr>)}</tbody></DataTable></div>}</div>
    {editing&&<Modal title={`${editing.title} · v${editing.version}`} onClose={()=>setEditing(null)} wide><form onSubmit={save}><label>Nome do modelo<input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Conteúdo<textarea rows={24} value={editing.template_content} onChange={e=>setEditing({...editing,template_content:e.target.value})}/></label><p className="muted">Somente rascunhos podem ser editados. Para alterar um modelo ativo, use “Duplicar versão”, revise o novo rascunho e depois ative-o.</p><div className="form-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" type="submit">Salvar rascunho</button></div></form></Modal>}
    {preview&&<Modal title={preview.title} onClose={()=>setPreview(null)} wide><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{preview.content}</pre><div className="form-actions"><button onClick={()=>setPreview(null)}>Fechar</button></div></Modal>}
  </>;
}
