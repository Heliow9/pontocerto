import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {Features} from "./commercial-rules.js";

export const featureLabels:Record<keyof Features,string>={
  whatsapp:"WhatsApp",
  branches:"Filiais",
  offline:"Ponto Offline",
  pwa:"PWA iPhone",
  android:"Aplicativo Android",
  erp:"Exportação para ERP",
  logs:"Logs do Sistema",
  audit:"Auditoria de Usuários",
  overtime:"Horas Extras"
};

const optionalFeatureDescriptions:Record<keyof Features,string>={
  whatsapp:"WhatsApp - alertas preventivos de marcação e horas extras, múltiplos destinatários, fila de envio, controle antiflood, retentativas e acompanhamento de status das mensagens.",
  branches:"Filiais - administração de unidades adicionais dentro do mesmo tenant, respeitando o limite comercial contratado e a segregação por empresa.",
  offline:"Ponto Offline - captura local de marcações sem conexão, preservação do horário original, fila local e sincronização automática após o restabelecimento da internet, com proteção contra duplicidade.",
  pwa:"PWA iPhone - acesso por aplicação web progressiva instalável na tela inicial do iPhone/iOS, com câmera, geolocalização, selfie, registro de ponto e sincronização conforme os recursos liberados.",
  android:"Aplicativo Android - aplicativo dedicado para smartphones/tablets Android, com câmera, localização, vínculo de dispositivo, biometria nativa quando exigida e registro online/offline conforme a contratação.",
  erp:"Exportação para ERP/folha - geração de arquivos estruturados para rotinas de Departamento Pessoal, folha e contabilidade, com arquitetura preparada para layouts como Domínio, Sage, Questor e outros formatos parametrizáveis.",
  logs:"Logs do Sistema - consulta de eventos técnicos e operacionais segregados por empresa, com filtros por período, módulo e severidade, observada a política de retenção configurada.",
  audit:"Auditoria de Usuários - trilha administrativa de ações relevantes, com identificação do executor, módulo, ação, resultado, dados anteriores/posteriores quando aplicável e proteção de informações sensíveis.",
  overtime:"Horas Extras - acompanhamento mensal, referências por grupo ou funcionário, faixas de 50% e 100%, ultrapassagem, alertas e integração com notificações quando o recurso correspondente estiver contratado."
};

const baseFeatureDescriptions=[
  "Gestão web administrativa - cadastro e administração de funcionários, jornadas, escalas, locais de trabalho, marcações, ocorrências, ajustes e relatórios conforme o perfil de acesso.",
  "Registro de ponto - marcação de entrada, saída, intervalos e demais eventos de jornada, com controle de consistência e proteção contra duplicidade.",
  "Registro fotográfico - captura de selfie no momento da marcação, com visualização da câmera, pré-visualização e possibilidade de refazer antes da confirmação quando configurado.",
  "Geolocalização e geofencing - captura de latitude, longitude e precisão, validação de distância em relação ao local cadastrado e aplicação do raio permitido quando exigido pela empresa.",
  "Biometria do dispositivo - validação biométrica nativa do aparelho quando habilitada, com possibilidade de liberação individual pelo Master da Empresa.",
  "Vinculação de dispositivo - associação do aparelho ao funcionário e controles de uso conforme as regras administrativas configuradas.",
  "Jornadas e escalas - cadastro de horários, intervalos, tolerâncias, jornada noturna, virada de dia, folgas e regras necessárias ao cálculo de jornada.",
  "Tratamento de ocorrências e ajustes - identificação de inconsistências, solicitação/correção de marcações e fluxo administrativo conforme permissões atribuídas.",
  "Relatórios de ponto - consultas por funcionário, empresa e período, com visualização de marcações, atrasos, ausências, horas trabalhadas e demais informações disponíveis no sistema.",
  "Controle de perfis e permissões - separação entre Master da Empresa, Supervisores e Funcionários, com validações obrigatórias no backend e restrição de acesso por tenant."
];

export const formatMoney=(value:unknown)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
export const formatDateBr=(value:unknown)=>String(value||"").slice(0,10).split("-").reverse().join("/");

export function formatFeatureLines(features:Partial<Features>={},mode:"included"|"contracted"="included"){
  return Object.entries(featureLabels).map(([key,label])=>`${label}: ${features[key as keyof Features]?(mode==="included"?"incluído":"contratado"):"não contratado"}`).join("; ");
}

export function formatContractedFunctionalities(features:Partial<Features>={}){
  const enabled=Object.entries(optionalFeatureDescriptions)
    .filter(([key])=>Boolean(features[key as keyof Features]))
    .map(([,description])=>description);
  return [...baseFeatureDescriptions,...enabled].map((text,index)=>`${index+1}. ${text}`).join("\n");
}

export function formatUncontractedFeatures(features:Partial<Features>={}){
  const labels=Object.entries(featureLabels).filter(([key])=>!features[key as keyof Features]).map(([,label])=>label);
  return labels.length?labels.join(", "):"nenhum recurso adicional listado nesta contratação";
}

export function formatBranchLimit(features:Partial<Features>={},maxBranches:unknown){
  if(!features.branches)return "Não contratadas";
  return maxBranches==null||maxBranches===""?"Sem limite específico":String(maxBranches);
}

export function formatTermMonths(value:unknown){
  const total=Number(value||0);
  if(!total)return "prazo indeterminado";
  return `${total} ${total===1?"mês":"meses"}`;
}

export async function loadCommercialTemplate(filename:string){
  const base=path.dirname(fileURLToPath(import.meta.url));
  for(const relative of [`../../templates/${filename}`,`../../../templates/${filename}`]){
    try{return await fs.readFile(path.resolve(base,relative));}
    catch(error:any){if(error.code!=="ENOENT")throw error;}
  }
  throw new Error(`Modelo ${filename} não encontrado.`);
}
