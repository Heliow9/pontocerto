export type ControlIdDiagnosticInput = {
  employeeId: number;
  name: string;
  registration: string | null;
  active: boolean;
  hasFace: boolean;
  mappingStatus: string | null;
  jobType: string | null;
  jobStatus: string | null;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  jobError: string | null;
  updatedAt: string | Date | null;
};

export type ControlIdEmployeeDiagnostic = {
  employeeId: number;
  name: string;
  registration: string | null;
  status: "READY" | "PROCESSING" | "SYNCED" | "ACTION_REQUIRED" | "REMOVING";
  code: string;
  stage: string;
  summary: string;
  technicalMessage: string | null;
  action: string;
  attempts: number;
  updatedAt: string | Date | null;
};

const stages: Record<string, string> = {
  UPSERT_USER: "Envio do cadastro",
  UPSERT_FACE: "Envio da foto facial",
  DELETE_FACE: "Remoção da foto facial",
  DELETE_USER: "Remoção do cadastro",
};

function correctionFor(input: ControlIdDiagnosticInput) {
  if (input.jobType === "UPSERT_FACE")
    return "Em Funcionários, envie uma foto frontal, bem iluminada e com apenas um rosto; clique em Salvar foto e depois em Sincronizar funcionários.";
  if (input.jobType === "UPSERT_USER")
    return "Em Funcionários, confira nome, matrícula e vínculo com a empresa; salve o cadastro e clique em Sincronizar funcionários.";
  if (input.jobType === "DELETE_FACE" || input.jobType === "DELETE_USER")
    return "Confirme que o equipamento está online e clique em Sincronizar funcionários para repetir a remoção.";
  return "Confira o cadastro do funcionário e se o equipamento está online; depois clique em Sincronizar funcionários.";
}

export function buildControlIdEmployeeDiagnostic(
  input: ControlIdDiagnosticInput,
): ControlIdEmployeeDiagnostic {
  const common = {
    employeeId: input.employeeId,
    name: input.name,
    registration: input.registration,
    attempts: Number(input.attempts || 0),
    updatedAt: input.updatedAt,
  };
  if (!input.active)
    return {
      ...common,
      status: "ACTION_REQUIRED",
      code: "EMPLOYEE_INACTIVE",
      stage: "Validação do cadastro",
      summary: "Funcionário inativo; não foi enviado ao equipamento.",
      technicalMessage: null,
      action: "Abra Funcionários, edite o cadastro, marque Ativo e salve antes de sincronizar novamente.",
    };
  if (!input.hasFace)
    return {
      ...common,
      status: "ACTION_REQUIRED",
      code: "FACE_REQUIRED",
      stage: "Validação da foto",
      summary: "Foto facial não cadastrada; funcionário não enviado.",
      technicalMessage: null,
      action: "Abra Funcionários, edite o cadastro, selecione a imagem e clique em Salvar foto; depois sincronize novamente.",
    };

  const stage = stages[input.jobType || ""] || "Preparação da sincronização";
  if (!input.mappingStatus)
    return {
      ...common,
      status: "READY",
      code: "READY_TO_SYNC",
      stage,
      summary: "Cadastro pronto, ainda não colocado na fila.",
      technicalMessage: null,
      action: "Clique em Sincronizar funcionários.",
    };
  if (input.mappingStatus === "SYNCED")
    return {
      ...common,
      status: "SYNCED",
      code: "SYNCED",
      stage,
      summary: "Funcionário e foto sincronizados.",
      technicalMessage: null,
      action: "Nenhuma ação necessária.",
    };
  if (["REMOVAL_PENDING", "REMOVED"].includes(input.mappingStatus))
    return {
      ...common,
      status: "REMOVING",
      code: input.mappingStatus,
      stage,
      summary: input.mappingStatus === "REMOVED" ? "Cadastro removido do equipamento." : "Remoção aguardando o equipamento.",
      technicalMessage: input.lastErrorMessage || input.jobError,
      action: input.mappingStatus === "REMOVED" ? "Nenhuma ação necessária." : "Mantenha o equipamento online; a operação será processada automaticamente.",
    };
  if (input.mappingStatus === "ERROR" && input.jobStatus !== "FAILED")
    return {
      ...common,
      status: "ACTION_REQUIRED",
      code: input.lastErrorCode || "PUSH_FAILED",
      stage,
      summary: "O iDFace rejeitou a sincronização.",
      technicalMessage: input.lastErrorMessage || input.jobError || "O equipamento não informou detalhes adicionais.",
      action: correctionFor(input),
    };
  return {
    ...common,
    status: "PROCESSING",
    code: input.jobStatus || input.mappingStatus,
    stage,
    summary: input.jobStatus === "FAILED" ? "Falhou temporariamente; nova tentativa será feita automaticamente." : "Aguardando o próximo contato do equipamento.",
    technicalMessage: input.jobError,
    action: "Mantenha o equipamento online. Use Atualizar agora para acompanhar.",
  };
}
