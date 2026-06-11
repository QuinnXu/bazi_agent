"use client"

export interface LocationData {
  area: string
  city: string
  country: string
  lat: string
  lng: string
  province: string
}

let geodataCache: LocationData[] | null = null
let geodataRequest: Promise<LocationData[]> | null = null

export function loadGeodata(): Promise<LocationData[]> {
  if (geodataCache) return Promise.resolve(geodataCache)
  if (geodataRequest) return geodataRequest

  geodataRequest = fetch('/geodata/data.json', { cache: 'force-cache' })
    .then(response => response.json())
    .then((data: LocationData[]) => {
      geodataCache = data
      return data
    })
    .catch(error => {
      geodataRequest = null
      throw error
    })

  return geodataRequest
}