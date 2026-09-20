import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const root = path.resolve(env.SELFIE_STORAGE_DIR);

function extForMime(mime:string){
  if(mime==="image/png") return ".png";
  return ".jpg";
}

export async function saveTimeEntrySelfie(args:{
  tenantId:number;
  employeeId:number;
  timeEntryId:number;
  buffer:Buffer;
  mimeType:string;
}){
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`;
  const dir = path.join(root, String(args.tenantId), String(args.employeeId), ym);
  await fs.mkdir(dir,{recursive:true});

  const fileName = `ponto-${args.timeEntryId}-${randomUUID()}${extForMime(args.mimeType)}`;
  const absolutePath = path.join(dir,fileName);
  await fs.writeFile(absolutePath,args.buffer);

  return {
    absolutePath,
    relativePath:path.relative(root,absolutePath).replaceAll("\\","/"),
    fileSize:args.buffer.length,
    sha256:createHash("sha256").update(args.buffer).digest("hex")
  };
}

export async function removeTimeEntrySelfie(relativePath?:string|null){
  if(!relativePath) return;
  const absolutePath = path.resolve(root,relativePath);
  if(!absolutePath.startsWith(root)) return;
  try{ await fs.unlink(absolutePath); }catch{}
}

export async function readTimeEntrySelfie(relativePath:string){
  const absolutePath = path.resolve(root,relativePath);
  if(!absolutePath.startsWith(root)) throw new Error("Caminho de selfie inválido.");
  return fs.readFile(absolutePath);
}
