import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";

export function EmployeeFacePhoto({ employeeId }: { employeeId: number }) {
  const [enrolled, setEnrolled] = useState(false);
  const [current, setCurrent] = useState<Blob | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const camera = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setSelected(null);
    setCurrent(null);
    api
      .get(`/face/employee/${employeeId}/status`)
      .then(async ({ data }) => {
        if (!live) return;
        setEnrolled(data.enrolled);
        if (data.enrolled) {
          const response = await api.get(`/face/employee/${employeeId}/photo`, {
            responseType: "blob",
          });
          if (live) setCurrent(response.data);
        }
      })
      .catch((err) => {
        if (live) setError(apiMessage(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [employeeId, retry]);
  useEffect(() => {
    const blob = selected || current;
    if (!blob) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected, current]);
  function choose(image?: File) {
    if (!image) return;
    setMessage("");
    if (
      !["image/jpeg", "image/png"].includes(image.type) ||
      image.size > 5 * 1024 * 1024
    ) {
      setError("Selecione uma foto JPG ou PNG de até 5 MB.");
      return;
    }
    setError("");
    setSelected(image);
  }
  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = new FormData();
      data.append("photo", selected);
      await api.post(`/face/employee/${employeeId}/photo`, data);
      setCurrent(selected);
      setSelected(null);
      setEnrolled(true);
      setMessage("Foto salva. As próximas marcações serão validadas pela AWS.");
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !confirm(
        "Remover a foto? As próximas marcações seguirão sem comparação facial.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.delete(`/face/employee/${employeeId}/photo`);
      setCurrent(null);
      setSelected(null);
      setEnrolled(false);
      setMessage(
        "Foto removida. O fluxo de ponto sem comparação facial foi mantido.",
      );
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="employee-face-photo span-2"
      aria-label="Foto para validação facial"
      aria-busy={busy}
    >
      <p>
        Com foto cadastrada, a selfie do ponto será comparada pela AWS com esta
        imagem. Sem foto, o funcionário mantém o fluxo atual.
      </p>
      <p className="muted">
        A foto e as selfies serão enviadas à AWS para comparação facial.
        Cadastre apenas a foto do funcionário, com sua ciência.
      </p>
      {loading ? (
        <p role="status">Carregando foto…</p>
      ) : (
        <>
          <div className="employee-face-photo-content">
            {preview ? (
              <img src={preview} alt="Foto de referência do funcionário" />
            ) : (
              <div className="employee-face-photo-empty">
                Sem foto cadastrada
              </div>
            )}
            <div>
              <strong>
                {selected
                  ? "Prévia — ainda não salva"
                  : enrolled
                    ? "Validação facial ativa"
                    : "Validação facial não exigida"}
              </strong>
              <p>
                Use uma foto frontal, bem iluminada, com somente um rosto. JPG
                ou PNG, até 5 MB.
              </p>
              <div className="employee-face-photo-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => camera.current?.click()}
                >
                  Tirar foto
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  Selecionar imagem
                </button>
                {selected && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={save}
                    >
                      {busy ? "Salvando foto…" : "Salvar foto"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => setSelected(null)}
                    >
                      Descartar foto selecionada
                    </button>
                  </>
                )}
                {enrolled && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={remove}
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png"
        capture="user"
        hidden
        aria-label="Capturar foto do funcionário"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        aria-label="Selecionar foto do funcionário"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            Recarregar foto
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <small>
        A foto é salva separadamente. Use “Salvar foto” antes de fechar o
        cadastro.
      </small>
    </section>
  );
}
