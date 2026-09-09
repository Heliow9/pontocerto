import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand
} from "@aws-sdk/client-rekognition";
import { env } from "../config/env.js";

function client(){
  if(env.FACE_PROVIDER!=="AWS_REKOGNITION") throw new Error("Reconhecimento facial desativado na API.");
  const credentials=env.AWS_ACCESS_KEY_ID&&env.AWS_SECRET_ACCESS_KEY?{accessKeyId:env.AWS_ACCESS_KEY_ID,secretAccessKey:env.AWS_SECRET_ACCESS_KEY}:undefined;
  return new RekognitionClient({region:env.AWS_REGION,credentials});
}

export function collectionId(tenantId:number){ return `ponto-certo-tenant-${tenantId}`; }
export function externalImageId(tenantId:number,employeeId:number){ return `tenant-${tenantId}-employee-${employeeId}`; }

async function ensureCollection(tenantId:number){
  const c=client(), id=collectionId(tenantId);
  try{await c.send(new DescribeCollectionCommand({CollectionId:id}));}
  catch(error:any){
    if(error?.name!=="ResourceNotFoundException") throw error;
    await c.send(new CreateCollectionCommand({CollectionId:id}));
  }
  return id;
}

export async function enrollFace(args:{tenantId:number;employeeId:number;image:Buffer;oldFaceId?:string|null}){
  const c=client(), collection=await ensureCollection(args.tenantId);
  if(args.oldFaceId){try{await c.send(new DeleteFacesCommand({CollectionId:collection,FaceIds:[args.oldFaceId]}));}catch{/* perfil antigo pode já não existir */}}
  const result=await c.send(new IndexFacesCommand({CollectionId:collection,Image:{Bytes:args.image},ExternalImageId:externalImageId(args.tenantId,args.employeeId),MaxFaces:1,QualityFilter:"AUTO"}));
  const face=result.FaceRecords?.[0]?.Face;
  if(!face?.FaceId) throw new Error("Não foi possível detectar um rosto com qualidade suficiente. Centralize o rosto e tente novamente.");
  return {provider:"AWS_REKOGNITION",collectionId:collection,faceId:face.FaceId,externalImageId:face.ExternalImageId||externalImageId(args.tenantId,args.employeeId)};
}

export async function verifyFace(args:{tenantId:number;employeeId:number;image:Buffer}){
  const c=client(), collection=await ensureCollection(args.tenantId), expected=externalImageId(args.tenantId,args.employeeId);
  try{
    const result=await c.send(new SearchFacesByImageCommand({CollectionId:collection,Image:{Bytes:args.image},FaceMatchThreshold:Math.max(1,env.FACE_MATCH_THRESHOLD-15),MaxFaces:20,QualityFilter:"AUTO"}));
    const expectedMatches=(result.FaceMatches||[]).filter(m=>m.Face?.ExternalImageId===expected);
    const similarity=Math.max(0,...expectedMatches.map(m=>Number(m.Similarity||0)));
    return {verified:similarity>=env.FACE_MATCH_THRESHOLD,similarity,threshold:env.FACE_MATCH_THRESHOLD,provider:"AWS_REKOGNITION",collectionId:collection};
  }catch(error:any){
    if(error?.name==="InvalidParameterException") return {verified:false,similarity:0,threshold:env.FACE_MATCH_THRESHOLD,provider:"AWS_REKOGNITION",collectionId:collection};
    throw error;
  }
}

export async function revokeFace(tenantId:number,faceId:string|null|undefined){
  if(!faceId || env.FACE_PROVIDER!=="AWS_REKOGNITION") return;
  try{await client().send(new DeleteFacesCommand({CollectionId:collectionId(tenantId),FaceIds:[faceId]}));}catch{/* revogação local continua */}
}
