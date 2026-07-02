"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl"
import { LocateFixed, MapPin, Search } from "lucide-react"
import type { BirthLocation } from "@/lib/birth-location"

const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty"

const CITY_PRESETS: BirthLocation[] = [
  { name: "上海", latitude: 31.2304, longitude: 121.4737 },
  { name: "北京", latitude: 39.9042, longitude: 116.4074 },
  { name: "广州", latitude: 23.1291, longitude: 113.2644 },
  { name: "深圳", latitude: 22.5431, longitude: 114.0579 },
  { name: "杭州", latitude: 30.2741, longitude: 120.1551 },
  { name: "成都", latitude: 30.5728, longitude: 104.0668 },
]

interface SearchResult {
  display_name: string
  lat: string
  lon: string
}

function createMarkerElement() {
  const element = document.createElement("div")
  element.className = "bubu-map-marker"
  const dot = document.createElement("span")
  element.appendChild(dot)
  return element
}

export default function BirthMap({
  value,
  onChange,
}: {
  value: BirthLocation | null
  onChange: (location: BirthLocation) => void
}) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return
    const initialValue = initialValueRef.current

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE,
      center: initialValue ? [initialValue.longitude, initialValue.latitude] : [121.4737, 31.2304],
      zoom: initialValue ? 8 : 3.4,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left")
    map.on("load", () => setMapReady(true))
    map.on("click", event => {
      onChangeRef.current({
        name: "地图落点",
        latitude: Number(event.lngLat.lat.toFixed(6)),
        longitude: Number(event.lngLat.lng.toFixed(6)),
      })
    })

    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !value) return

    const lngLat: [number, number] = [value.longitude, value.latitude]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        element: createMarkerElement(),
        anchor: "center",
      }).setLngLat(lngLat).addTo(map)
    } else {
      markerRef.current.setLngLat(lngLat)
    }

    map.flyTo({
      center: lngLat,
      zoom: 8,
      duration: 650,
      essential: true,
    })
  }, [value])

  async function searchPlace() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=zh-CN&q=${encodeURIComponent(query.trim())}`,
      )
      const payload = await response.json()
      setResults(Array.isArray(payload) ? payload : [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function chooseResult(result: SearchResult) {
    onChange({
      name: result.display_name.split(",").slice(0, 3).join(", "),
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    })
    setResults([])
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
        <div className="relative mb-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") searchPlace()
              }}
              className="h-10 w-full rounded-lg border border-border bg-background/80 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/60"
              placeholder="搜索出生地点"
            />
          </div>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
            onClick={searchPlace}
            disabled={searching}
            type="button"
          >
            <LocateFixed className="h-4 w-4" />
            {searching ? "搜索中" : "搜索"}
          </button>

          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-10 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
              {results.map(result => (
                <button
                  key={`${result.lat}-${result.lon}`}
                  type="button"
                  onClick={() => chooseResult(result)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-popover-foreground hover:bg-muted"
                >
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30">
          {!mapReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 text-sm text-muted-foreground">
              山河正在展开...
            </div>
          )}
          <div ref={mapNodeRef} className="h-[min(52dvh,420px)] min-h-[300px] w-full" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CITY_PRESETS.map(city => (
          <button
            className={`h-8 flex-shrink-0 rounded-full border px-3 text-xs transition-colors ${
              value?.name === city.name
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
            key={city.name}
            type="button"
            onClick={() => onChange(city)}
          >
            {city.name}
          </button>
        ))}
      </div>

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <span className="text-xs text-muted-foreground">方位已入盘</span>
        </div>
      )}
    </div>
  )
}
