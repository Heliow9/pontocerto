import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
import { Badge } from "./Ui";

export type FaceEnrollmentStatus = {
  companyRequired?: boolean;
  employeeBiometricExempt?: boolean;
  required?: boolean;
  enrolled?: boolean;
  provider?: string | null;
  status?: string | null;
  enrolledAt?: string | null;
  lastVerifiedAt?: string | null;
  providerStatus?: {
    provider?: string;
    enabled?: boolean;
    configured?: boolean;
    region?: string;
    threshold?: number;
  };
};

export async function enrollEmployeeFace(employeeId: number, file: File | Blob) {
  const data = new FormData();
  data.append("faceImage", file, file instanceof File ? file.name : "rosto.jpg");
  return api.post(`/faces/employee/${employeeId}/enroll`, data);
}

function toFaceFile(blob: Blob, name = "rosto.jpg") {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

export function EmployeeFaceEnrollment({
  employeeId,
  employeeName,
  editable,
  pendingFile,
  onPendingChange,
  onChanged,
  notify,
}: {
  employeeId?: number;
  employeeName: string;
  editable: boolean;
  pendingFile?: File | null;
  onPendingChange?: (file: File | null) => void;
  onChanged?: () => void;
  notify: (message: string, type?: "ok" | "error") => void;
}) {
  const [status, setStatus] = useState<FaceEnrollmentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selected, setSelected] = useState<File | null>(pendingFile || null);
  const [preview, setPreview] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    if (!employeeId) {
      setStatus(null);
      return;
    }
    try {
      const { data } = await api.get(`/faces/employee/${employeeId}/status`);
      setStatus(data);
    } catch (error) {
      notify(apiMessage(error), "error");
    }
  }

  useEffect(() => {
    refresh();
  }, [employeeId]);

  useEffect(() => {
    setSelected(pendingFile || null);
  }, [pendingFile]);

  useEffect(() => {
    if (!selected) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(selected);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  useEffect(() => () => stopCamera(), []);

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify(
        "A câmera não está disponível neste navegador. Use a opção Selecionar imagem.",
        "error",
      );
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      notify(
        "Não foi possível acessar a câmera. Autorize a câmera no navegador ou selecione uma imagem.",
        "error",
      );
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      notify("A câmera ainda não está pronta. Tente novamente.", "error");
      return;
    }
    const canvas = document.createElement("canvas");
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          notify("Não foi possível capturar a foto. Tente novamente.", "error");
          return;
        }
        const file = toFaceFile(blob);
        setSelected(file);
        if (!employeeId) onPendingChange?.(file);
        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  }

  function selectFile(file?: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      notify("Selecione uma imagem JPG ou PNG.", "error");
      return;
    }
    setSelected(file);
    if (!employeeId) onPendingChange?.(file);
  }

  function clearSelection() {
    setSelected(null);
    if (!employeeId) onPendingChange?.(null);
  }

  async function saveFace() {
    if (!employeeId || !selected) return;
    setLoading(true);
    try {
      const { data } = await enrollEmployeeFace(employeeId, selected);
      notify(data.message || "Rosto cadastrado com sucesso.");
      setSelected(null);
      await refresh();
      onChanged?.();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function removeFace() {
    if (!employeeId || !status?.enrolled) return;
    if (!confirm(`Remover o cadastro facial de ${employeeName || "este funcionário"}?`)) return;
    setLoading(true);
    try {
      const { data } = await api.delete(`/faces/employee/${employeeId}`);
      notify(data.message || "Cadastro facial removido.");
      await refresh();
      onChanged?.();
    } catch (error) {
      notify(apiMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }

  const providerReady = status?.providerStatus?.configured !== false;

  return (
    <div className="face-enrollment span-2">
      <div className="face-enrollment-head">
        <div>
          <strong>Reconhecimento facial</strong>
          <p className="muted">
            Cadastre uma foto frontal e nítida. Ela será usada pelo AWS Rekognition para validar a selfie no registro de ponto.
          </p>
        </div>
        {employeeId ? (
          <Badge tone={status?.enrolled ? "success" : "warning"}>
            {status?.enrolled ? "Rosto cadastrado" : "Rosto pendente"}
          </Badge>
        ) : selected ? (
          <Badge tone="success">Foto pronta</Badge>
        ) : (
          <Badge tone="warning">Foto opcional no cadastro</Badge>
        )}
      </div>

      {status && !providerReady && (
        <div className="form-error" role="alert">
          AWS Rekognition ainda não está configurado no servidor. O cadastro facial ficará indisponível até configurar as credenciais.
        </div>
      )}

      {status?.employeeBiometricExempt && (
        <div className="info-box">
          Este funcionário está dispensado de biometria. O rosto pode continuar cadastrado, mas a validação facial não será exigida enquanto a dispensa estiver ativa.
        </div>
      )}

      {cameraOpen && (
        <div className="face-camera-box">
          <video ref={videoRef} className="face-camera-video" playsInline muted />
          <p className="muted">Centralize apenas o rosto, olhando de frente e com boa iluminação.</p>
          <div className="face-actions">
            <button type="button" className="primary" onClick={capture}>Capturar foto</button>
            <button type="button" className="ghost" onClick={stopCamera}>Cancelar câmera</button>
          </div>
        </div>
      )}

      {preview && !cameraOpen && (
        <div className="face-preview-box">
          <img src={preview} alt={`Pré-visualização do rosto de ${employeeName || "funcionário"}`} />
          <div>
            <strong>Pré-visualização</strong>
            <p className="muted">Confirme se há somente uma pessoa e se o rosto está bem iluminado.</p>
          </div>
        </div>
      )}

      {editable && !cameraOpen && (
        <div className="face-actions">
          <button type="button" className="ghost" onClick={openCamera} disabled={loading || !providerReady}>
            Tirar foto pela câmera
          </button>
          <button type="button" className="ghost" onClick={() => inputRef.current?.click()} disabled={loading || !providerReady}>
            Selecionar imagem
          </button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          {selected && employeeId && (
            <button type="button" className="primary" onClick={saveFace} disabled={loading || !providerReady}>
              {loading ? "Validando rosto…" : status?.enrolled ? "Atualizar cadastro facial" : "Cadastrar rosto"}
            </button>
          )}
          {selected && (
            <button type="button" className="ghost" onClick={clearSelection} disabled={loading}>Descartar foto</button>
          )}
          {employeeId && status?.enrolled && (
            <button type="button" className="danger-link" onClick={removeFace} disabled={loading}>
              Remover cadastro facial
            </button>
          )}
        </div>
      )}

      {!employeeId && (
        <p className="muted face-pending-note">
          {selected
            ? "Esta foto será validada e cadastrada automaticamente logo após salvar o funcionário."
            : "Você pode cadastrar a foto agora ou salvar o funcionário e adicionar o rosto depois em Editar."}
        </p>
      )}

      {employeeId && status?.enrolled && (
        <div className="face-status-details muted">
          <span>Provedor: {status.provider || status.providerStatus?.provider || "AWS Rekognition"}</span>
          <span>Similaridade mínima: {status.providerStatus?.threshold ?? 90}%</span>
          {status.lastVerifiedAt && <span>Última validação: {new Date(status.lastVerifiedAt).toLocaleString("pt-BR")}</span>}
        </div>
      )}
    </div>
  );
}
