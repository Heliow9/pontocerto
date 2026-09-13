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

export const formatMoney=(value:unknown)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
export const formatDateBr=(value:unknown)=>String(value||"").slice(0,10).split("-").reverse().join("/");

export function formatFeatureLines(features:Partial<Features>={}, mode:"included"|"contracted"="included"){
  return Object.entries(featureLabels)
    .map(([key,label])=>`${label}: ${features[key as keyof Features]?(mode==="included"?"incluído":"contratado"):(mode==="included"?"não contratado":"não contratado")}`)
    .join("\n");
}

export function formatBranchLimit(features:Partial<Features>={}, maxBranches:unknown){
  if(!features.branches) return "Não contratadas";
  return maxBranches==null || maxBranches==="" ? "Sem limite específico" : String(maxBranches);
}

export function formatTermMonths(value:unknown){
  const total=Number(value||0);
  if(!total) return "prazo indeterminado";
  return `${total} ${total===1?"mês":"meses"}`;
}

export async function loadCommercialTemplate(filename:string){
  const base=path.dirname(fileURLToPath(import.meta.url));
  for(const relative of [`../../templates/${filename}`,`../../../templates/${filename}`]){
    try{return await fs.readFile(path.resolve(base,relative));}
    catch(error:any){if(error.code!=="ENOENT") throw error;}
  }
  throw new Error(`Modelo ${filename} não encontrado.`);
}
