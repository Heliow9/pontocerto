import PizZip from "pizzip";
import {proposalPdf} from "./proposal-documents.service.js";
import {readJson,type Features} from "./commercial-rules.js";
const esc=(v:unknown)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"','&quot;');
const money=(v:unknown)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const date=(v:unknown)=>String(v||"").slice(0,10).split("-").reverse().join("/");
const labels:Record<keyof Features,string>={whatsapp:"WhatsApp",branches:"Filiais",offline:"Ponto Offline",pwa:"PWA iPhone",android:"Aplicativo Android",erp:"Exportação ERP",logs:"Logs do Sistema",audit:"Auditoria de Usuários",overtime:"Horas Extras"};
export async function contractDocx(c:any){
  const features=readJson<Partial<Features>>(c.features_json,{});
  const lines=[
    ["CONTRATO DE LICENÇA DE USO — PONTO CERTO",true],
    [`Contrato ${c.contract_number}`,true],
    ["PARTES",true],[`PONTO CERTO e ${c.company_name}, CNPJ ${c.cnpj}, neste ato representada por ${c.client_representative||c.responsible_name}.`,false],
    ["OBJETO",true],["Licença de uso da plataforma PONTO CERTO para gestão de jornada, marcações e recursos contratados.",false],
    ["SERVIÇOS E RECURSOS CONTRATADOS",true],[Object.entries(labels).map(([k,l])=>`${l}: ${features[k as keyof Features]?"contratado":"não contratado"}`).join("; "),false],
    ["USUÁRIOS E LIMITES",true],[`Funcionários: ${c.max_employees}. Filiais: ${c.max_branches??"sem limite específico"}.`,false],
    ["IMPLANTAÇÃO",true],[`Valor: ${money(c.implementation_fee)}. Condições conforme proposta ${c.proposal_number||c.proposal_id}.`,false],
    ["VALORES E PAGAMENTO",true],[`Mensalidade: ${money(c.price_monthly)}. Vencimento: dia ${c.due_day||"a definir"}. Forma: ${c.payment_method||"a definir"}.`,false],
    ["VIGÊNCIA E REAJUSTE",true],[`Início: ${date(c.start_date)}. Prazo: ${c.term_months||"indeterminado"}${c.term_months?" meses":""}. Reajuste: ${c.adjustment_rule||"conforme negociação entre as partes"}.`,false],
    ["SEGURANÇA, CONFIDENCIALIDADE E LGPD",true],["As partes comprometem-se com controles de acesso, proteção de credenciais, confidencialidade e tratamento de dados pessoais compatível com a finalidade da plataforma e a legislação aplicável.",false],
    ["SUPORTE E DISPONIBILIDADE",true],["A contratada manterá o serviço, suporte e atualizações, ressalvadas manutenções programadas, indisponibilidades de terceiros e eventos fora de seu controle razoável.",false],
    ["RESPONSABILIDADES E RESCISÃO",true],["A contratante responde pela veracidade dos dados, gestão de seus usuários e infraestrutura mínima. Regras de encerramento observarão as condições comerciais e legais pactuadas.",false],
    ["FORO",true],[c.forum||"A definir pelas partes.",false],
    ["OBSERVAÇÕES",true],[c.notes||"Sem observações adicionais.",false],
    ["ASSINATURAS",true],[`Contratante: ${c.client_representative||c.responsible_name}\nPONTO CERTO: ${c.ponto_certo_representative||"Representante autorizado"}\nData: ${date(c.contract_date)}`,false],
    ["Este modelo comercial deve ser submetido à revisão jurídica antes da utilização definitiva.",false]
  ] as [string,boolean][];
  const body=lines.map(([t,b])=>`<w:p><w:r>${b?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join("");
  const zip=new PizZip();
  zip.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels")!.file(".rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word")!.file("document.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  return zip.generate({type:"nodebuffer",compression:"DEFLATE"});
}
export const contractPdf=proposalPdf;
