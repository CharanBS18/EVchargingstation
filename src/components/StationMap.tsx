import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { distanceKm } from "@/lib/geo";

// Default icon paths break with bundlers — set explicit URLs.
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const stationIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:oklch(0.82 0.21 145);border:2px solid oklch(0.18 0.05 240);box-shadow:0 4px 12px rgba(0,0,0,.4);display:grid;place-items:center;"><span style="transform:rotate(45deg);font-size:14px;">⚡</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const meIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:oklch(0.78 0.16 210);border:3px solid white;box-shadow:0 0 0 4px oklch(0.78 0.16 210 / .3);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export type StationMarker = {
  id: string;
  name: string;
  operator: string;
  city: string;
  lat: number;
  lng: number;
  available: number;
  total: number;
};

function Recenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 0.6 });
  }, [center, map]);
  return null;
}

export function StationMap({
  stations,
  userLocation,
}: {
  stations: StationMarker[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const [center, setCenter] = useState<[number, number]>([20.5937, 78.9629]);

  useEffect(() => {
    if (userLocation) setCenter([userLocation.lat, userLocation.lng]);
    else if (stations[0]) setCenter([stations[0].lat, stations[0].lng]);
  }, [userLocation, stations]);

  const enriched = useMemo(() => {
    if (!userLocation) return stations.map((s) => ({ ...s, km: 0 }));
    return stations.map((s) => ({ ...s, km: distanceKm(userLocation, s) }));
  }, [stations, userLocation]);

  return (
    <MapContainer
      className="relative z-0"
      center={center}
      zoom={userLocation ? 12 : 5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <Recenter center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={meIcon} />}
      {enriched.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={stationIcon}>
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{s.name}</p>
              <p className="text-xs opacity-80">{s.operator} · {s.city}</p>
              <p className="text-xs">
                <span className="font-semibold text-[oklch(0.82_0.21_145)]">{s.available}</span> / {s.total} available
                {userLocation && <span className="opacity-80"> · {s.km.toFixed(1)} km</span>}
              </p>
              <Button asChild size="sm" className="mt-2 w-full">
                <Link to="/stations/$stationId" params={{ stationId: s.id }}>View</Link>
              </Button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
