"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createLocationPin, deleteLocationPin } from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { PoofEffectProvider, useTriggerPoof } from "@/hooks/usePoofEffect";
import type { LocationPin } from "@/lib/database.types";

const MAP_HEIGHT = 340;
const UK_CENTER: [number, number] = [54.5, -3.2];

const UK_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "London", lat: 51.5074, lng: -0.1278 },
  { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
  { name: "Manchester", lat: 53.4808, lng: -2.2426 },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518 },
  { name: "Liverpool", lat: 53.4084, lng: -2.9916 },
  { name: "Leeds", lat: 53.8008, lng: -1.5491 },
  { name: "Sheffield", lat: 53.3811, lng: -1.4701 },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
  { name: "Bristol", lat: 51.4545, lng: -2.5879 },
  { name: "Cardiff", lat: 51.4816, lng: -3.1791 },
  { name: "Belfast", lat: 54.5973, lng: -5.9301 },
  { name: "Leicester", lat: 52.6369, lng: -1.1398 },
  { name: "Newcastle upon Tyne", lat: 54.9783, lng: -1.6178 },
  { name: "Nottingham", lat: 52.9548, lng: -1.1581 },
  { name: "Southampton", lat: 50.9097, lng: -1.4044 },
  { name: "Portsmouth", lat: 50.8198, lng: -1.088 },
  { name: "Brighton", lat: 50.8225, lng: -0.1372 },
  { name: "Plymouth", lat: 50.3755, lng: -4.1427 },
  { name: "Oxford", lat: 51.752, lng: -1.2577 },
  { name: "Cambridge", lat: 52.2053, lng: 0.1218 },
  { name: "York", lat: 53.96, lng: -1.0873 },
  { name: "Bath", lat: 51.3811, lng: -2.359 },
  { name: "Coventry", lat: 52.4068, lng: -1.5197 },
  { name: "Aberdeen", lat: 57.1497, lng: -2.0943 },
  { name: "Dundee", lat: 56.462, lng: -2.9707 },
  { name: "Swansea", lat: 51.6214, lng: -3.9436 },
  { name: "Reading", lat: 51.4543, lng: -0.9781 },
  { name: "Milton Keynes", lat: 52.0406, lng: -0.7594 },
  { name: "Sunderland", lat: 54.9061, lng: -1.3813 },
];

const PRESET_COLORS = [
  "#eab308", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

function pinIcon(color: string, justAdded: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${justAdded ? "animate-pin-drop-in" : ""}" style="width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

/** The custom-pin half of the Locations tab's 2D map — a real pan/zoomable
 * OpenStreetMap view (Leaflet; free, keyless tiles) sitting above the
 * existing 3D globe, for freeform points a team wants to mark themselves
 * (distinct from the Ticketmaster/web-search tour dates the globe shows).
 * "Pin" arms a single map click to drop a new pin, prompting for a label
 * and colour; the UK-cities dropdown just re-centers the view to help find
 * a spot; the filter row toggles which labelled groups of pins are shown. */
function LocationPinMapInner({
  artistId,
  slug,
  initialPins,
}: {
  artistId: string;
  slug: string;
  initialPins: LocationPin[];
}) {
  const [pins, setPins] = useState(initialPins);
  const [placing, setPlacing] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityClosing, setCityClosing] = useState(false);
  const [excludedLabels, setExcludedLabels] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const lastAddedIdRef = useRef<string | null>(null);
  const triggerPoof = useTriggerPoof();

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const placingRef = useRef(placing);
  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  const { closing: formClosing, requestClose: closeForm } = useClosableOverlay(() => setPendingCoords(null));

  function closeCityDropdown() {
    if (cityClosing) return;
    setCityClosing(true);
    window.setTimeout(() => {
      setCityOpen(false);
      setCityClosing(false);
    }, 150);
  }

  // Mount the Leaflet map exactly once — the tile layer + click handler are
  // wired here; pins are synced in a separate effect below so re-renders
  // from typing in the form don't tear the map down.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { center: UK_CENTER, zoom: 6, scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!placingRef.current) return;
      setPlacing(false);
      setPendingCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cursor feedback for "waiting for a click" mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = placing ? "crosshair" : "";
  }, [placing]);

  // Re-syncs every marker to the current pins + filter state. Pin counts
  // here are small (tens, not thousands) so a full clear-and-rebuild each
  // time is simpler than diffing, and still instant.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const pin of pins) {
      if (excludedLabels.has(pin.label)) continue;
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.color, pin.id === lastAddedIdRef.current) });
      marker.bindPopup(() => {
        const el = document.createElement("div");
        el.style.minWidth = "130px";
        const title = document.createElement("p");
        title.style.cssText = "margin:0 0 8px;font-weight:600;font-size:13px;";
        title.textContent = pin.label;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Remove pin";
        btn.style.cssText =
          "font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#f87171;background:none;border:none;cursor:pointer;padding:0;";
        btn.addEventListener("click", (ev) => {
          const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          triggerPoof(rect.left, rect.top);
          map.closePopup();
          setPins((prev) => prev.filter((p) => p.id !== pin.id));
          startTransition(() => {
            deleteLocationPin(pin.id, slug);
          });
        });
        el.appendChild(title);
        el.appendChild(btn);
        return el;
      });
      marker.addTo(map);
      markersRef.current.set(pin.id, marker);
    }
    lastAddedIdRef.current = null;
  }, [pins, excludedLabels, slug, triggerPoof]);

  function flyToCity(city: { lat: number; lng: number }) {
    mapRef.current?.flyTo([city.lat, city.lng], 11, { duration: 0.8 });
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingCoords || !newLabel.trim()) return;
    const label = newLabel.trim();
    const color = newColor;
    const { lat, lng } = pendingCoords;
    closeForm();
    setNewLabel("");
    const result = await createLocationPin(artistId, slug, { label, color, lat, lng });
    if (result.ok) {
      lastAddedIdRef.current = result.pin.id;
      setPins((prev) => [...prev, result.pin]);
    }
  }

  const distinctLabels = Array.from(new Map(pins.map((p) => [p.label, p.color])).entries());

  return (
    <div className="location-pin-map">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlacing((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 ease-out ${
            placing
              ? "animate-hint-pulse bg-[var(--accent)] text-black"
              : "border border-white/20 text-white/80 hover:-translate-y-0.5 hover:border-white/40"
          }`}
        >
          📍 {placing ? "Tap the map…" : "Pin"}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => (cityOpen ? closeCityDropdown() : setCityOpen(true))}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            UK cities
            <span
              className="text-[9px] text-white/40 transition-transform duration-150"
              style={{ transform: cityOpen ? "rotate(180deg)" : "none" }}
            >
              ▾
            </span>
          </button>
          {cityOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeCityDropdown} />
              <div
                className={`custom-scrollbar absolute left-0 top-full z-50 mt-2 max-h-64 w-48 overflow-y-auto rounded-xl border border-white/15 bg-neutral-900 p-1.5 shadow-2xl shadow-black/50 ${
                  cityClosing ? "animate-dropdown-furl" : "animate-dropdown-unfurl"
                }`}
              >
                {UK_CITIES.map((city) => (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => {
                      flyToCity(city);
                      closeCityDropdown();
                    }}
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {distinctLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-l border-white/10 pl-2">
            {distinctLabels.map(([label, color]) => {
              const active = !excludedLabels.has(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setExcludedLabels((prev) => {
                      const next = new Set(prev);
                      if (next.has(label)) next.delete(label);
                      else next.add(label);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                    active ? "bg-white/10 text-white" : "bg-transparent text-white/30 line-through"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="relative overflow-hidden shadow-lg shadow-black/30"
        style={{
          borderRadius: "var(--card-radius, 12px)",
          border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
        }}
      >
        <div ref={mapDivRef} style={{ height: MAP_HEIGHT, width: "100%" }} />

        {pendingCoords && (
          <div
            className="absolute inset-0 z-[1000] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
            onClick={closeForm}
          >
            <form
              onSubmit={handleCreatePin}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-xs rounded-2xl border border-white/15 bg-neutral-950 p-4 shadow-2xl shadow-black/50 ${
                formClosing ? "animate-modal-out" : "animate-modal-in"
              }`}
            >
              <p className="mb-3 text-sm font-semibold text-white">Name this pin</p>
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Merch pop-up"
                className="mb-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="mb-4 flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={`Colour ${c}`}
                    className={`h-7 w-7 rounded-full transition-transform duration-150 ease-out hover:scale-110 ${
                      newColor === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-neutral-950" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newLabel.trim()}
                  className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                >
                  Add pin
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export function LocationPinMap(props: { artistId: string; slug: string; initialPins: LocationPin[] }) {
  return (
    <PoofEffectProvider>
      <LocationPinMapInner {...props} />
    </PoofEffectProvider>
  );
}
