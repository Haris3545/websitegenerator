"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  createLocationPin,
  deleteLocationPin,
  createLocationPinTag,
  updateLocationPinTag,
  deleteLocationPinTag,
} from "@/app/s/[slug]/actions";
import { useClosableOverlay } from "@/hooks/useClosableOverlay";
import { PoofEffectProvider, useTriggerPoof } from "@/hooks/usePoofEffect";
import { TourGlobe, type TourGlobePoint } from "@/components/site/TourGlobe";
import type { LocationPin, LocationPinTag } from "@/lib/database.types";

const MINI_GLOBE_SIZE = 190;

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

// A high z-index (above Leaflet's own panes/controls, which otherwise run
// up to ~1000) so dropdowns/overlays anchored above the map always paint
// on top of it instead of disappearing behind its tiles.
const ABOVE_MAP_Z = 2000;

// Leaflet's built-in panes (tilePane 200 ... markerPane 600 ... popupPane
// 700) aren't isolated into their own stacking context — .leaflet-container
// only sets position:relative, no z-index — so a plain z-index on the
// globe overlay sibling below genuinely interleaves with them: above the
// tiles, below the markers/popups, letting oversized pins visually poke out
// over the globe wherever the two overlap instead of being hidden by it.
const GLOBE_OVERLAY_Z = 550;

// The pin-form/manage-tags backdrops used to be one single "dim + blur +
// catch outside clicks" div at ABOVE_MAP_Z, which meant it painted over the
// globe overlay (z 550) too, muddying it every time either modal opened.
// Splitting the dim into its own layer below the globe (but still above the
// map tiles) keeps the globe crisp and undimmed, while a separate
// transparent click-catcher above everything still closes the modal on an
// outside click exactly as before.
const BACKDROP_DIM_Z = 400;

// A simple, highly-visible flat circle marker — the oversized "3D" pin
// look now lives on the globe overlay instead (see TourGlobe.tsx), planted
// on the globe's surface at each point; this map keeps the plainer circle
// it had before that moved.
function pinIcon(color: string, justAdded: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${justAdded ? "animate-pin-drop-in" : ""}" style="width:26px;height:26px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.35),0 3px 8px rgba(0,0,0,0.6);"></div>`,
    // A fixed pixel size — Leaflet never scales a divIcon with zoom (only
    // its screen position updates), so this is already the same size at
    // every zoom level.
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function ColorSwatchRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          className={`h-6 w-6 rounded-full transition-transform duration-150 ease-out hover:scale-110 ${
            value === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-neutral-950" : ""
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/** One row in the "Manage tags" panel — a tag's own name/colour can be
 * edited or the tag deleted entirely (which strips it from every pin that
 * had it, see deleteLocationPinTag). */
function TagManageRow({
  tag,
  slug,
  onUpdated,
  onDeleted,
}: {
  tag: LocationPinTag;
  slug: string;
  onUpdated: (id: string, patch: { name: string; color: string }) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const triggerPoof = useTriggerPoof();

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setEditing(false);
    onUpdated(tag.id, { name: trimmed, color });
    await updateLocationPinTag(tag.id, slug, { name: trimmed, color });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2.5">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left text-sm text-white/80 hover:text-white"
          >
            {tag.name}
          </button>
        )}
        {editing ? (
          <button
            type="button"
            onClick={save}
            className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-black"
          >
            Save
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              triggerPoof(e.clientX, e.clientY);
              onDeleted(tag.id);
              deleteLocationPinTag(tag.id, slug);
            }}
            aria-label={`Delete tag ${tag.name}`}
            className="shrink-0 text-xs font-medium text-red-400/70 transition-colors hover:text-red-400"
          >
            ✕
          </button>
        )}
      </div>
      {editing && <ColorSwatchRow value={color} onChange={setColor} />}
    </div>
  );
}

const PinGlyph = ({ color = "var(--accent)" }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" style={{ color }} aria-hidden>
    <path
      d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" strokeWidth={1.8} />
  </svg>
);

const TagGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} aria-hidden>
    <path
      d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v5c0 .53.21 1.04.59 1.41l8.5 8.5a2 2 0 0 0 2.82 0l5-5a2 2 0 0 0 0-2.82l-8.5-8.5A2 2 0 0 0 11.5 4Z"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
  </svg>
);

/** The custom-pin half of the Locations tab's 2D map — a real pan/zoomable
 * colour map (Leaflet + free CartoDB Voyager tiles) with a small spinning
 * 3D globe overlaid in the corner (the same globe that used to sit as its
 * own full-size section below — folded in here so the map and globe read
 * as one system). "Pin" arms a single map click to drop a new pin,
 * prompting for a name, colour, and any tags; the UK-cities dropdown just
 * re-centers the view to help find a spot; the top filter row lists every
 * tag and narrows the map (and the corner globe) to pins carrying
 * whichever ones are clicked on. */
function LocationPinMapInner({
  artistId,
  slug,
  initialPins,
  initialTags,
  tourPoints,
}: {
  artistId: string;
  slug: string;
  initialPins: LocationPin[];
  initialTags: LocationPinTag[];
  tourPoints: TourGlobePoint[];
}) {
  const [pins, setPins] = useState(initialPins);
  const [tags, setTags] = useState(initialTags);
  const [placing, setPlacing] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [inlineTagName, setInlineTagName] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [cityClosing, setCityClosing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());
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
  const { closing: manageClosing, requestClose: closeManage } = useClosableOverlay(() => setManageOpen(false));

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
    // CartoDB Voyager — free, keyless, and far less cluttered than raw OSM
    // (fewer POI icons/labels), with blue water and light land closer to
    // the 3D globe's vivid blue-sea/green-land palette than a plain grey
    // basemap; the saturate/contrast boost below pushes it further toward
    // that same vividness.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: "abcd",
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
      const visible = activeTagIds.size === 0 || pin.tag_ids.some((id) => activeTagIds.has(id));
      if (!visible) continue;
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.color, pin.id === lastAddedIdRef.current) });
      marker.bindPopup(() => {
        const el = document.createElement("div");
        el.style.minWidth = "130px";
        const title = document.createElement("p");
        title.style.cssText = "margin:0 0 8px;font-weight:600;font-size:13px;";
        title.textContent = pin.name;
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
  }, [pins, activeTagIds, slug, triggerPoof]);

  function flyToCity(city: { lat: number; lng: number }) {
    mapRef.current?.flyTo([city.lat, city.lng], 11, { duration: 0.8 });
  }

  function toggleActiveTag(id: string) {
    setActiveTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectedTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddInlineTag() {
    const name = inlineTagName.trim();
    if (!name) return;
    setInlineTagName("");
    const result = await createLocationPinTag(artistId, slug, { name, color: newColor });
    if (result.ok) {
      setTags((prev) => [...prev, result.tag]);
      setSelectedTagIds((prev) => new Set(prev).add(result.tag.id));
    }
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingCoords || !newName.trim()) return;
    const name = newName.trim();
    const color = newColor;
    const tagIds = Array.from(selectedTagIds);
    const { lat, lng } = pendingCoords;
    closeForm();
    setNewName("");
    setSelectedTagIds(new Set());
    const result = await createLocationPin(artistId, slug, { name, color, lat, lng, tagIds });
    if (result.ok) {
      lastAddedIdRef.current = result.pin.id;
      setPins((prev) => [...prev, result.pin]);
    }
  }

  // The corner globe mirrors whatever's currently visible on the 2D map —
  // same pins, same colours, same tag filter — plus the tour-date points
  // that used to live in their own separate globe below the map, so
  // dropping a new pin (or toggling a filter) updates it live without a
  // second, disconnected globe.
  const globePoints: TourGlobePoint[] = [
    ...tourPoints,
    ...pins
      .filter((pin) => activeTagIds.size === 0 || pin.tag_ids.some((id) => activeTagIds.has(id)))
      .map((pin) => ({ lat: pin.lat, lng: pin.lng, label: pin.name, color: pin.color })),
  ];

  return (
    <div className="location-pin-map">
      {/* Extra bottom margin (vs. a plain mb-3) deliberately leaves room
          above the map for the corner globe to poke up into without
          overlapping these controls. */}
      <div className="mb-14 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlacing((v) => !v)}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 ease-out ${
            placing
              ? "animate-hint-pulse bg-[var(--accent)] text-black"
              : "border border-white/20 text-white/80 hover:-translate-y-0.5 hover:border-white/40"
          }`}
        >
          <PinGlyph color={placing ? "black" : "var(--accent)"} />
          {placing ? "Tap the map…" : "Pin"}
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
              <div className="fixed inset-0" style={{ zIndex: ABOVE_MAP_Z - 1 }} onClick={closeCityDropdown} />
              <div
                className={`custom-scrollbar absolute left-0 top-full mt-2 max-h-64 w-48 overflow-y-auto rounded-xl border border-white/15 bg-neutral-900 p-1.5 shadow-2xl shadow-black/50 ${
                  cityClosing ? "animate-dropdown-furl" : "animate-dropdown-unfurl"
                }`}
                style={{ zIndex: ABOVE_MAP_Z }}
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

        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white"
          aria-label="Manage tags"
        >
          <TagGlyph /> Manage
        </button>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-l border-white/10 pl-2">
            {tags.map((tag) => {
              const active = activeTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleActiveTag(tag.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                    active
                      ? "bg-[var(--accent)] text-black"
                      : "border border-white/15 text-white/60 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The outer wrapper deliberately has no overflow-hidden of its own —
          that lives on the inner map div below instead — so the corner
          globe can genuinely overlap/spill outside the card's rounded edge
          rather than being clipped by it. */}
      <div className="relative">
        <div
          ref={mapDivRef}
          className="overflow-hidden shadow-lg shadow-black/30"
          style={{
            height: MAP_HEIGHT,
            width: "100%",
            borderRadius: "var(--card-radius, 12px)",
            border: "1px solid rgba(255,255,255,var(--card-border-opacity, 0.15))",
            // A faint accent-coloured glow around the edge, echoing the
            // globe's own atmosphere halo, so the two read as one system
            // rather than two unrelated views.
            boxShadow: "inset 0 0 40px rgba(0,0,0,0.25), 0 0 24px -4px var(--accent)",
          }}
        />

        {/* A spinning globe overlaid at the top-right, deliberately
            overlapping the card's edge — same pins/colours (plus the
            tour-date points a separate, full-size globe used to show
            below), updating live as pins are added or filtered. Sits above
            the tile layer but below Leaflet's marker pane (see
            GLOBE_OVERLAY_Z) so oversized pins that land in this corner
            visually poke out over the globe instead of being hidden by
            it — and it's still fully interactive, so a visitor can drag to
            spin it same as the old standalone globe. */}
        <div
          className="absolute -right-6 -top-14 overflow-hidden rounded-full"
          style={{ height: MINI_GLOBE_SIZE, width: MINI_GLOBE_SIZE, zIndex: GLOBE_OVERLAY_Z }}
        >
          <TourGlobe points={globePoints} height={MINI_GLOBE_SIZE} />
        </div>

        {pendingCoords && (
          <>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" style={{ zIndex: BACKDROP_DIM_Z }} />
            <div
              className="absolute inset-0 flex items-end justify-center p-4 sm:items-center"
              style={{ zIndex: ABOVE_MAP_Z }}
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
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Merch pop-up"
                className="mb-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
              />
              <ColorSwatchRow value={newColor} onChange={setNewColor} />

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const selected = selectedTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleSelectedTag(tag.id)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                          selected
                            ? "bg-[var(--accent)] text-black"
                            : "border border-white/15 text-white/60 hover:border-white/30"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex gap-1.5">
                <input
                  value={inlineTagName}
                  onChange={(e) => setInlineTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddInlineTag();
                    }
                  }}
                  placeholder="+ new tag"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white focus:border-[var(--accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddInlineTag}
                  disabled={!inlineTagName.trim()}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black transition-transform duration-150 ease-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                >
                  Add pin
                </button>
              </div>
            </form>
            </div>
          </>
        )}

        {manageOpen && (
          <>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" style={{ zIndex: BACKDROP_DIM_Z }} />
            <div
              className="absolute inset-0 flex items-end justify-center p-4 sm:items-center"
              style={{ zIndex: ABOVE_MAP_Z }}
              onClick={closeManage}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className={`flex max-h-[70%] w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl shadow-black/50 ${
                  manageClosing ? "animate-modal-out" : "animate-modal-in"
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Manage tags</p>
                  <button
                    type="button"
                    onClick={closeManage}
                    aria-label="Close"
                    className="text-lg text-white/40 hover:text-white"
                  >
                    ×
                  </button>
                </div>
                <div className="custom-scrollbar flex flex-col gap-2 overflow-y-auto p-3">
                  {tags.length === 0 && <p className="text-xs text-white/40">No tags yet.</p>}
                  {tags.map((tag) => (
                    <TagManageRow
                      key={tag.id}
                      tag={tag}
                      slug={slug}
                      onUpdated={(id, patch) =>
                        setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
                      }
                      onDeleted={(id) => {
                        setTags((prev) => prev.filter((t) => t.id !== id));
                        setActiveTagIds((prev) => {
                          const next = new Set(prev);
                          next.delete(id);
                          return next;
                        });
                        setPins((prev) => prev.map((p) => ({ ...p, tag_ids: p.tag_ids.filter((t) => t !== id) })));
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function LocationPinMap(props: {
  artistId: string;
  slug: string;
  initialPins: LocationPin[];
  initialTags: LocationPinTag[];
  tourPoints: TourGlobePoint[];
}) {
  return (
    <PoofEffectProvider>
      <LocationPinMapInner {...props} />
    </PoofEffectProvider>
  );
}
