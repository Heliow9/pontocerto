import { env } from "../config/env.js";

export type StructuredAddress = {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  mapboxPlaceId: string | null;
};

export async function geocodePermanent(address: StructuredAddress): Promise<GeocodeResult> {
  if (!env.MAPBOX_ACCESS_TOKEN) throw new Error("MAPBOX_ACCESS_TOKEN não configurado na API.");

  const structured = [
    address.street && address.number ? `${address.street}, ${address.number}` : address.street,
    address.district,
    address.city,
    address.state,
    address.zipCode,
    address.country || "BR"
  ].filter(Boolean);
  const parts = structured.length > 1 ? structured : [address.address, address.country || "BR"].filter(Boolean);

  const params = new URLSearchParams({
    q: parts.join(", "),
    access_token: env.MAPBOX_ACCESS_TOKEN,
    permanent: "true",
    autocomplete: "false",
    limit: "1",
    language: "pt",
    country: (address.country || "BR").toLowerCase()
  });

  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  if (!response.ok) throw new Error(`Mapbox retornou HTTP ${response.status}.`);
  const data: any = await response.json();
  const feature = data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!feature || !Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("Endereço não encontrado no Mapbox.");
  }

  return {
    longitude: Number(coordinates[0]),
    latitude: Number(coordinates[1]),
    formattedAddress: feature?.properties?.full_address || feature?.properties?.name || parts.join(", "),
    mapboxPlaceId: feature?.properties?.mapbox_id || feature?.id || null
  };
}
