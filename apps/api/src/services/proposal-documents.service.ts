import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {readJson,type Features} from "./commercial-rules.js";
import {formatBranchLimit,formatDateBr,formatFeatureLines,formatMoney,loadCommercialTemplate} from "./commercial-document-utils.js";
const exec=promisify(execFile);

export async function proposalDocx(proposal:any){
  const template=await loadCommercialTemplate("proposta-ponto-certo.docx");
  const features=readJson<Features>(proposal.features_json,{} as Features);
  const planName=proposal.plan_name||proposal.plan_name_snapshot||"Plano contratado";
  const number=proposal.proposal_number||`PC-${String(proposal.created_at||"").slice(0,4)||new Date().getFullYear()}-${String(proposal.id||1).padStart(5,"0")}`;
  const doc=new Docxtemplater(new PizZip(template),{paragraphLoop:true,linebreaks:true,delimiters:{start:"{{",end:"}}"},nullGetter:()=>""});
  doc.render({
    numero_proposta:number,
    empresa_nome:proposal.company_name,
    empresa_cnpj:proposal.cnpj,
    data_proposta:formatDateBr(proposal.created_at),
    data_validade:formatDateBr(proposal.valid_until),
    plano_nome:planName,
    limite_funcionarios:proposal.max_employees,
    valor_mensal:formatMoney(proposal.price_monthly),
    valor_implantacao:formatMoney(proposal.implementation_fee),
    responsavel:proposal.responsible_name,
    email:proposal.email,
    telefone:proposal.phone||"Não informado",
    prazo_implantacao:proposal.implementation_days,
    observacoes:proposal.notes||"Sem observações adicionais.",
    recursos:formatFeatureLines(features,"included"),
    limite_filiais:formatBranchLimit(features,proposal.max_branches)
  });
  return doc.toBuffer();
}

export async function proposalPdf(docx:Buffer){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"ponto-proposal-"));
  try{
    const source=path.join(directory,"proposta.docx");
    await fs.writeFile(source,docx);
    await exec(process.env.LIBREOFFICE_PATH||"libreoffice",[`-env:UserInstallation=${pathToFileURL(path.join(directory,"profile")).href}`,"--headless","--convert-to","pdf","--outdir",directory,source],{timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});
    return await fs.readFile(path.join(directory,"proposta.pdf"));
  }catch(error:any){
    throw Object.assign(new Error(error.code==="ENOENT"?"Conversor de PDF indisponível no servidor. O arquivo DOCX continua disponível.":"Não foi possível converter esta proposta em PDF. Tente novamente."),{status:503});
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}
