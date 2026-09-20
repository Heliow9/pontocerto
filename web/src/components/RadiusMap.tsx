import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export default function RadiusMap({
  latitude,
  longitude,
  radius,
}: {
  latitude: number;
  longitude: number;
  radius: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const circle = L.circle([latitude, longitude], {
      radius: Math.max(1, radius),
      color: "#244a7d",
      fillOpacity: 0.15,
    }).addTo(map);
    L.circleMarker([latitude, longitude], {
      radius: 5,
      color: "#172033",
    }).addTo(map);
    map.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: 18 });
    return () => {
      map.remove();
    };
  }, [latitude, longitude, radius]);
  return (
    <div
      ref={element}
      role="region"
      aria-label={`Mapa do local autorizado, raio de ${radius} metros`}
      className="map-preview"
    />
  );
}
