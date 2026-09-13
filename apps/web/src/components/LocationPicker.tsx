import { lazy, Suspense, useState } from "react";
const RadiusMap = lazy(() => import("./RadiusMap"));
import { api } from "../api";
import { apiMessage } from "../utils";
export function LocationPicker({
  latitude,
  longitude,
  radius,
  address,
  onChange,
}: {
  latitude: any;
  longitude: any;
  radius: number;
  address: string;
  onChange: (value: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
}) {
  const [query, setQuery] = useState(address || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [map, setMap] = useState(false);
  const valid =
    latitude !== "" &&
    longitude !== "" &&
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));
  async function search() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/companies/geocode", {
        address: query,
        country: "BR",
      });
      onChange({
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.formattedAddress,
      });
      setMap(true);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function current() {
    setBusy(true);
    setError("");
    if (!navigator.geolocation) {
      setError("Localização indisponível neste navegador.");
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
        setMap(true);
        setBusy(false);
      },
      () => {
        setError(
          "Não foi possível obter o GPS. Permita a localização ou informe as coordenadas.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }
  const lat = Number(latitude),
    lng = Number(longitude),
    delta = Math.max(radius / 111000, 0.002);
  return (
    <div className="span-2 location-picker">
      <label>
        Buscar endereço
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rua, número, cidade e estado"
        />
      </label>
      <div className="schedule-tools">
        <button
          type="button"
          className="ghost"
          disabled={busy || !query.trim()}
          onClick={search}
        >
          Localizar endereço
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={current}
        >
          Usar minha localização
        </button>
        {valid && (
          <button type="button" className="ghost" onClick={() => setMap(!map)}>
            {map ? "Ocultar mapa" : "Visualizar mapa"}
          </button>
        )}
      </div>
      {busy && <p role="status">Localizando…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {valid && (
        <p className="info-box">
          Centro: {lat.toFixed(6)}, {lng.toFixed(6)} · Raio permitido: {radius}{" "}
          m. Confirme as coordenadas antes de salvar.
        </p>
      )}
      {valid && map && (
        <>
          <Suspense
            fallback={
              <div className="map-preview loading-caption" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                Carregando mapa…
              </div>
            }
          >
            <RadiusMap latitude={lat} longitude={lng} radius={radius} />
          </Suspense>
          <p className="muted">
            O círculo representa o raio permitido. Use os campos de coordenadas
            para ajustar o centro.
          </p>
        </>
      )}
    </div>
  );
}
