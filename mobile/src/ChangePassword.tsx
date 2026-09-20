import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "./api";

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const locked = useRef(false);
  async function save() {
    if (locked.current) return;
    setError("");
    setSuccess("");
    if (!currentPassword || newPassword.length < 8) {
      setError(
        "Informe a senha atual e uma nova senha com pelo menos 8 caracteres.",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("A nova senha deve ser diferente da atual.");
      return;
    }
    locked.current = true;
    setBusy(true);
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
      setOpen(false);
      setSuccess(
        "Senha alterada com sucesso. Use a nova senha no próximo acesso.",
      );
    } catch (e: any) {
      setError(
        e.response?.status === 401
          ? "Sua sessão expirou. Saia da conta e entre novamente para alterar a senha."
          : e.response?.data?.message ||
              "Não foi possível confirmar a alteração. Verifique sua conexão e tente novamente.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>
        Segurança da conta
      </Text>
      <Text style={s.body}>
        Altere sua senha usando a senha atual para confirmar sua identidade.
      </Text>
      {success ? (
        <Text accessibilityLiveRegion="polite" style={s.success}>
          {success}
        </Text>
      ) : null}
      {!open ? (
        <Pressable
          accessibilityRole="button"
          style={s.button}
          onPress={() => {
            setOpen(true);
            setSuccess("");
          }}
        >
          <Text style={s.buttonText}>Alterar senha</Text>
        </Pressable>
      ) : (
        <>
          {[
            {
              label: "Senha atual",
              value: currentPassword,
              set: setCurrent,
              autocomplete: "current-password" as const,
            },
            {
              label: "Nova senha",
              value: newPassword,
              set: setNew,
              autocomplete: "new-password" as const,
            },
            {
              label: "Confirmar nova senha",
              value: confirmPassword,
              set: setConfirm,
              autocomplete: "new-password" as const,
            },
          ].map((field) => (
            <View key={field.label} style={s.field}>
              <Text style={s.label}>{field.label}</Text>
              <TextInput
                accessibilityLabel={field.label}
                style={s.input}
                value={field.value}
                onChangeText={field.set}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={field.autocomplete}
                editable={!busy}
              />
            </View>
          ))}
          <Text style={s.body}>
            Use pelo menos 8 caracteres e uma senha diferente da atual.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.secondary}
            onPress={() => setVisible(!visible)}
          >
            <Text style={s.link}>
              {visible ? "Ocultar senhas" : "Mostrar senhas"}
            </Text>
          </Pressable>
          {error ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={s.error}
            >
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={[s.button, busy && { opacity: 0.6 }]}
            onPress={() => void save()}
          >
            {busy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={s.buttonText}>Salvar nova senha</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={s.secondary}
            onPress={() => {
              setOpen(false);
              setCurrent("");
              setNew("");
              setConfirm("");
              setVisible(false);
              setError("");
            }}
          >
            <Text style={s.link}>Cancelar</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderColor: "#dce4ee",
    borderWidth: 1,
  },
  title: { fontSize: 19, fontWeight: "700", color: "#172033" },
  body: { fontSize: 15, lineHeight: 22, color: "#526176" },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: "600", color: "#263b56" },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#bccbdd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#172033",
  },
  button: {
    backgroundColor: "#007c88",
    minHeight: 50,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  link: { color: "#007c88", fontSize: 16, fontWeight: "600" },
  error: { color: "#a12b15", fontSize: 15, lineHeight: 22 },
  success: { color: "#166534", fontSize: 15, lineHeight: 22 },
});
