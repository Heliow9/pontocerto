import { useRef, useState } from "react";
import { api } from "../api";
import { apiMessage } from "../utils";
import { MaskedInput } from "./MaskedInput";

export type CepAddress = {
  zipCode: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

type Props = {
  value: string | null | undefined;
  onChange: (value: string) => void;
  onAddressFound: (address: CepAddress) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CepLookupInput({ value, onChange, onAddressFound, disabled, placeholder = "00000-000" }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [message, setMessage] = useState("");
  const lastLookup = useRef("");
  const requestId = useRef(0);

  async function lookup(next: string) {
    const cep = next.replace(/\D/g, "");
    onChange(next);
    if (cep.length !== 8) {
      lastLookup.current = "";
      setStatus("idle");
      setMessage("");
      return;
    }
    if (lastLookup.current === cep) return;
    lastLookup.current = cep;
    const id = ++requestId.current;
    setStatus("loading");
    setMessage("Buscando endereço…");
    try {
      const { data } = await api.get(`/postal-code/${cep}`);
      if (id !== requestId.current) return;
      onAddressFound({
        zipCode: data.zipCode || next,
        street: data.street || "",
        complement: data.complement || "",
        district: data.district || "",
        city: data.city || "",
        state: data.state || "",
      });
      setStatus("found");
      setMessage("Endereço preenchido automaticamente.");
    } catch (error) {
      if (id !== requestId.current) return;
      setStatus("error");
      setMessage(apiMessage(error));
    }
  }

  return <div className="cep-lookup">
    <MaskedInput mask="cep" value={value} onChange={lookup} disabled={disabled} placeholder={placeholder} autoComplete="postal-code" />
    {status !== "idle" && <small className={status === "error" ? "cep-lookup-error" : "muted"} aria-live="polite">{message}</small>}
  </div>;
}
