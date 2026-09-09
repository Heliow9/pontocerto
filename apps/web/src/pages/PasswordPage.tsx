import { useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
import { AsyncForm } from "../components/AsyncForm";
import { PageHeader } from "../components/Ui";

export function PasswordPage() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return (
    <>
      <PageHeader
        title="Alterar senha"
        subtitle="Atualize a senha da sua própria conta."
      />
      <section className="panel" style={{ maxWidth: 560 }}>
        <p>
          Informe sua senha atual e escolha uma nova com pelo menos 8
          caracteres. Evite reutilizar senhas de outros serviços.
        </p>
        <AsyncForm
          className="form-grid"
          onSubmit={async () => {
            setError("");
            setSuccess("");
            if (newPassword !== confirmPassword) {
              setError("A confirmação não corresponde à nova senha.");
              return;
            }
            if (newPassword === currentPassword) {
              setError("A nova senha deve ser diferente da atual.");
              return;
            }
            try {
              await api.post("/auth/password", {
                currentPassword,
                newPassword,
                confirmPassword,
              });
              setCurrent("");
              setNew("");
              setConfirm("");
              setVisible(false);
              setSuccess(
                "Senha alterada com sucesso. Use a nova senha no próximo acesso.",
              );
            } catch (error) {
              setError(apiMessage(error));
            }
          }}
        >
          <label className="span-2">
            Senha atual
            <input
              required
              autoComplete="current-password"
              type={visible ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className="span-2">
            Nova senha
            <input
              required
              minLength={8}
              autoComplete="new-password"
              type={visible ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </label>
          <label className="span-2">
            Confirmar nova senha
            <input
              required
              minLength={8}
              autoComplete="new-password"
              type={visible ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            className="ghost span-2"
            type="button"
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "Ocultar senhas" : "Mostrar senhas"}
          </button>
          {error && (
            <p role="alert" className="form-error span-2">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="span-2">
              {success}
            </p>
          )}
          <button type="submit" className="primary span-2">
            Salvar nova senha
          </button>
        </AsyncForm>
      </section>
    </>
  );
}
