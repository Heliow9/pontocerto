export type MovyoRolloutSettings={movyoPilotApproved:boolean;bulkCutoverEnabled:boolean};
export const DEFAULT_MOVYO_ROLLOUT_SETTINGS:MovyoRolloutSettings={movyoPilotApproved:false,bulkCutoverEnabled:false};

const rolloutError=(message:string,status:number,code:string)=>Object.assign(new Error(message),{status,code});

export function normalizeMovyoRolloutSettings(value:unknown):MovyoRolloutSettings{
  const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
  const movyoPilotApproved=row.movyoPilotApproved===true;
  const bulkCutoverEnabled=movyoPilotApproved&&row.bulkCutoverEnabled===true;
  return{movyoPilotApproved,bulkCutoverEnabled};
}

export function nextMovyoRolloutSettings(current:MovyoRolloutSettings,input:Partial<MovyoRolloutSettings>):MovyoRolloutSettings{
  const movyoPilotApproved=input.movyoPilotApproved??current.movyoPilotApproved;
  const requestedBulk=input.bulkCutoverEnabled??current.bulkCutoverEnabled;
  if(input.bulkCutoverEnabled===true&&!movyoPilotApproved)throw rolloutError('A migração em lote só pode ser liberada depois que o piloto Movyo for aprovado.',409,'MOVYO_PILOT_NOT_APPROVED');
  return{movyoPilotApproved,bulkCutoverEnabled:movyoPilotApproved&&requestedBulk};
}

export function assertMovyoBulkCutoverEnabled(settings:MovyoRolloutSettings){
  if(!settings.movyoPilotApproved||!settings.bulkCutoverEnabled)throw rolloutError('Migração Movyo em lote bloqueada até aprovação explícita do piloto.',409,'MOVYO_BULK_CUTOVER_DISABLED');
  return true;
}
