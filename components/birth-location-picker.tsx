"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { Map, MapPin, X } from "lucide-react"
import { loadGeodata, type LocationData } from "@/lib/geodata-client"
import {
  coerceBirthLocation,
  formatBirthLocationName,
  type BirthLocation,
} from "@/lib/birth-location"
import { OptimizedSelect } from "@/components/optimized-select"

const BirthMap = dynamic(() => import("@/components/birth-map"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
      地图正在铺开...
    </div>
  ),
})

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function toBirthLocation(item: LocationData): BirthLocation {
  return {
    name: formatBirthLocationName(item.province, item.city),
    latitude: Number(item.lat),
    longitude: Number(item.lng),
  }
}

function sameStoredLocation(item: LocationData, value: BirthLocation) {
  const itemName = formatBirthLocationName(item.province, item.city)
  if (itemName && itemName === value.name) return true
  const lat = Number(item.lat)
  const lng = Number(item.lng)
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat - value.latitude) < 0.000001 &&
    Math.abs(lng - value.longitude) < 0.000001
  )
}

export function BirthLocationPicker({
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  value: BirthLocation | null
  onChange: (location: BirthLocation) => void
  disabled?: boolean
  className?: string
}) {
  const [locations, setLocations] = useState<LocationData[]>([])
  const [selectedProvince, setSelectedProvince] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [mapOpen, setMapOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let cancelled = false
    loadGeodata()
      .then(data => {
        if (cancelled) return
        setLocations(data)
        setLoading(false)
      })
      .catch(error => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : "出生地列表暂时没有展开。")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!value || locations.length === 0 || selectedProvince || selectedCity) return
    const matched = locations.find(item => sameStoredLocation(item, value))
    if (!matched) return
    setSelectedProvince(matched.province)
    setSelectedCity(matched.city)
  }, [locations, selectedCity, selectedProvince, value])

  const provinces = useMemo(() => unique(locations.map(item => item.province)), [locations])
  const cities = useMemo(() => {
    if (!selectedProvince) return []
    return unique(locations.filter(item => item.province === selectedProvince).map(item => item.city))
  }, [locations, selectedProvince])

  function chooseProvince(province: string) {
    setSelectedProvince(province)
    setSelectedCity("")
  }

  function chooseCity(city: string) {
    setSelectedCity(city)
    const location = locations.find(item => item.province === selectedProvince && item.city === city)
    if (location) onChange(toBirthLocation(location))
  }

  function chooseFromMap(location: BirthLocation) {
    setSelectedProvince("")
    setSelectedCity("")
    onChange(coerceBirthLocation(location.longitude, location.latitude, location.name))
    setMapOpen(false)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-light text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          出生地点
        </p>
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-light text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Map className="h-3.5 w-3.5" />
          地图选点
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <OptimizedSelect
          value={selectedProvince}
          onChange={event => chooseProvince(event.target.value)}
          options={provinces}
          placeholder={loading ? "正在加载省份" : "请选择省份"}
          disabled={disabled || loading || Boolean(loadError)}
        />
        <OptimizedSelect
          value={selectedCity}
          onChange={event => chooseCity(event.target.value)}
          options={cities}
          placeholder={selectedProvince ? "请选择城市" : "先选省份"}
          disabled={disabled || loading || Boolean(loadError) || !selectedProvince}
        />
      </div>

      {loadError && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadError}
        </p>
      )}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">方位已入盘</span>
        </div>
      )}

      {mapOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            type="button"
            aria-label="收起地图"
            onClick={() => setMapOpen(false)}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-2xl glass-minimal">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-light text-muted-foreground">山河落点</p>
                <h3 className="mt-1 text-lg font-light text-foreground">在地图上轻点出生之地</h3>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                type="button"
                aria-label="收起地图"
                onClick={() => setMapOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto">
              <BirthMap value={value} onChange={chooseFromMap} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
