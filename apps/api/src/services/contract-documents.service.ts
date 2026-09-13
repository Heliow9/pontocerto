import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {proposalPdf} from "./proposal-documents.service.js";
import {readJson,type Features} from "./commercial-rules.js";
import {formatBranchLimit,formatDateBr,formatFeatureLines,formatMoney,formatTermMonths,loadCommercialTemplate} from "./commercial-document-utils.js";

export async function contractDocx(contract:any){
  const template=await loadCommercialTemplate("contrato-ponto-certo.docx");
  const features=readJson<Partial<Features>>(contract.features_json,{});
  const planName=contract.plan_name || contract.plan_name_snapshot || "Plano contratado";
  const doc=new Docxtemplater(new PizZip(template),{paragraphLoop:true,linebreaks:true,delimiters:{start:"{{",end:"}}"},nullGetter:()=>""});
  doc.render({
    numero_contrato:contract.contract_number,
    numero_proposta:contract.proposal_number || contract.proposal_id,
    empresa_nome:contract.company_name,
    empresa_cnpj:contract.cnpj,
    representante_cliente:contract.client_representative || contract.responsible_name,
    representante_ponto_certo:contract.ponto_certo_representative || "Representante autorizado",
    plano_nome:planName,
    recursos:formatFeatureLines(features,"contracted"),
    limite_funcionarios:contract.max_employees,
    limite_filiais:formatBranchLimit(features,contract.max_branches),
    valor_mensal:formatMoney(contract.price_monthly),
    valor_implantacao:formatMoney(contract.implementation_fee),
    data_contrato:formatDateBr(contract.contract_date),
    inicio_vigencia:formatDateBr(contract.start_date),
    prazo_contratual:formatTermMonths(contract.term_months),
    dia_vencimento:contract.due_day || "a definir",
    forma_pagamento:contract.payment_method || "forma de pagamento a definir",
    regra_reajuste:contract.adjustment_rule || "conforme negociação entre as partes",
    observacoes:contract.notes || "Sem observações adicionais.",
    foro:contract.forum || "a definir pelas partes",
    email:contract.email || "não informado",
    telefone:contract.phone || "não informado"
  });
  return doc.toBuffer();
}

export const contractPdf=proposalPdf;
