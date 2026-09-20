const ALLOWED=new Set([
  'seller.legal_name','seller.trade_name','seller.cnpj','seller.email','seller.financial_email','seller.phone','seller.address','seller.representative_name','seller.representative_document','seller.representative_role',
  'customer.legal_name','customer.trade_name','customer.document','customer.email','customer.phone','customer.address','customer.financial_contact_name','customer.financial_contact_email',
  'product.code','product.name','product.description','plan.code','plan.name',
  'proposal.number','proposal.created_at','proposal.valid_until','proposal.implementation_days','proposal.notes',
  'contract.number','contract.date','contract.start_date','contract.term_months','contract.due_day','contract.payment_method','contract.adjustment_rule','contract.forum','contract.notes',
  'subscription.monthly_price','subscription.discount_percent','subscription.effective_price','subscription.due_day',
  'billing.provider','billing.method','billing.fine_percent','billing.interest_daily_percent','billing.grace_days','billing.auto_block',
]);
const PLACEHOLDER=/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
export function templatePlaceholders(template:string){return [...template.matchAll(PLACEHOLDER)].map(m=>m[1]);}
export function assertAllowedPlaceholders(template:string){const unknown=[...new Set(templatePlaceholders(template).filter(k=>!ALLOWED.has(k)))];if(unknown.length)throw Object.assign(new Error(`Placeholders não permitidos: ${unknown.join(', ')}`),{status:400,code:'TEMPLATE_PLACEHOLDER_INVALID',placeholders:unknown});return true;}
function getPath(context:any,path:string){return path.split('.').reduce((v,k)=>v==null?undefined:v[k],context);}
export function renderCommercialTemplate(template:string,context:any){assertAllowedPlaceholders(template);const missing:string[]=[];const rendered=template.replace(PLACEHOLDER,(_all,key)=>{const value=getPath(context,key);if(value===undefined||value===null){missing.push(key);return '';}return String(value);});if(missing.length)throw Object.assign(new Error(`Dados ausentes para renderizar o documento: ${[...new Set(missing)].join(', ')}`),{status:409,code:'TEMPLATE_CONTEXT_INCOMPLETE',placeholders:[...new Set(missing)]});return rendered;}
export function escapeXml(value:unknown){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
export function assertTemplateEditable(status:unknown){const normalized=String(status||'').toUpperCase();if(normalized!=='DRAFT')throw Object.assign(new Error('Modelo ativo ou arquivado é imutável. Crie uma nova versão para alterar o conteúdo.'),{status:409,code:'TEMPLATE_VERSION_IMMUTABLE'});return true;}
