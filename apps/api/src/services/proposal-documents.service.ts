import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {fileURLToPath,pathToFileURL} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {readJson,type Features} from "./commercial-rules.js";
const exec=promisify(execFile);
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
const labels:Record<keyof Features,string>={whatsapp:"WhatsApp",branches:"Filiais",offline:"Ponto offline",pwa:"PWA iPhone",android:"Android",erp:"Exportação ERP",logs:"Logs"};
export async function proposalDocx(proposal:any){
  const base=path.dirname(fileURLToPath(import.meta.url));
  let template:Buffer|undefined;
  for(const relative of ["../../templates/proposta-ponto-certo.docx","../../../templates/proposta-ponto-certo.docx"]){try{template=await fs.readFile(path.resolve(base,relative));break;}catch(e:any){if(e.code!=="ENOENT")throw e;}}
  if(!template)throw new Error("Modelo de proposta não encontrado.");
  const features=readJson<Features>(proposal.features_json,{} as Features);
  const date=(v:string)=>v.slice(0,10).split("-").reverse().join("/");
  const doc=new Docxtemplater(new PizZip(template),{paragraphLoop:true,linebreaks:true,delimiters:{start:"{{",end:"}}"},nullGetter:()=>""});
  doc.render({empresa_nome:proposal.company_name,empresa_cnpj:proposal.cnpj,data_proposta:date(proposal.created_at),data_validade:date(proposal.valid_until),plano_nome:proposal.plan_name,
    limite_funcionarios:proposal.max_employees,valor_mensal:money(Number(proposal.price_monthly)),valor_implantacao:money(Number(proposal.implementation_fee)),
    responsavel:proposal.responsible_name,email:proposal.email,telefone:proposal.phone||"Não informado",prazo_implantacao:proposal.implementation_days,observacoes:proposal.notes||"",
    recursos:Object.entries(labels).map(([key,label])=>`${label}: ${features[key as keyof Features]?"incluído":"não contratado"}`).join("; "),
    limite_filiais:features.branches?(proposal.max_branches??"sem limite contratado"):"não contratadas"});
  return doc.toBuffer();
}
export async function proposalPdf(docx:Buffer){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"ponto-proposal-"));
  try{const source=path.join(directory,"proposta.docx");await fs.writeFile(source,docx);await exec(process.env.LIBREOFFICE_PATH||"libreoffice",[`-env:UserInstallation=${pathToFileURL(path.join(directory,"profile")).href}`,"--headless","--convert-to","pdf","--outdir",directory,source],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});return await fs.readFile(path.join(directory,"proposta.pdf"));}
  catch(e:any){throw Object.assign(new Error(e.code==="ENOENT"?"Conversor de PDF indisponível no servidor. O arquivo DOCX continua disponível.":"Não foi possível converter esta proposta em PDF. Tente novamente."),{status:503});}
  finally{await fs.rm(directory,{recursive:true,force:true});}
}
