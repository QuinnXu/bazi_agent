export interface BirthLocation {
  name: string
  latitude: number
  longitude: number
}

export const DEFAULT_BIRTH_LOCATION: BirthLocation = {
  name: '上海市 市辖区',
  latitude: 31.235929,
  longitude: 121.480539,
}

export function formatBirthLocationName(province: string, city: string) {
  if (!province && !city) return ''
  if (!city || city === '市辖区') return province
  return `${province} ${city}`
}

export function coerceBirthLocation(
  longitude: string | number | null | undefined,
  latitude: string | number | null | undefined,
  name?: string | null,
): BirthLocation {
  const parsedLongitude = Number(longitude)
  const parsedLatitude = Number(latitude)
  return {
    name: name?.trim() || DEFAULT_BIRTH_LOCATION.name,
    longitude: Number.isFinite(parsedLongitude) ? parsedLongitude : DEFAULT_BIRTH_LOCATION.longitude,
    latitude: Number.isFinite(parsedLatitude) ? parsedLatitude : DEFAULT_BIRTH_LOCATION.latitude,
  }
}
