// 字段映射辅助函数
// 将旧字段名映射到新字段名，便于过渡

export type LegacyBaziProfile = {
  id?: string
  user_id?: string
  name?: string
  year?: number
  month?: number
  day?: number
  hour?: number
  minute?: number
  is_solar?: boolean
  is_female?: boolean
  longitude?: number
  latitude?: number
  bazi_result?: string
  created_at?: string
  updated_at?: string
}

export type NewBaziProfile = {
  id?: string
  user_id?: string
  profile_name?: string
  birth_year?: number
  birth_month?: number
  birth_day?: number
  birth_hour?: number
  birth_minute?: number
  is_solar_calendar?: boolean
  gender?: 'male' | 'female' | 'other'
  birth_longitude?: number
  birth_latitude?: number
  bazi_result_text?: string
  bazi_result?: Record<string, any>
  birth_location_name?: string
  description?: string
  avatar_emoji?: string
  is_favorite?: boolean
  tags?: string[]
  created_at?: string
  updated_at?: string
}

/**
 * 将新格式转换为旧格式（向后兼容）
 */
export function newToLegacy(newProfile: NewBaziProfile): LegacyBaziProfile {
  return {
    id: newProfile.id,
    user_id: newProfile.user_id,
    name: newProfile.profile_name,
    year: newProfile.birth_year,
    month: newProfile.birth_month,
    day: newProfile.birth_day,
    hour: newProfile.birth_hour,
    minute: newProfile.birth_minute,
    is_solar: newProfile.is_solar_calendar,
    is_female: newProfile.gender === 'female',
    longitude: newProfile.birth_longitude,
    latitude: newProfile.birth_latitude,
    bazi_result: newProfile.bazi_result_text,
    created_at: newProfile.created_at,
    updated_at: newProfile.updated_at,
  }
}

/**
 * 将旧格式转换为新格式
 */
export function legacyToNew(legacyProfile: LegacyBaziProfile): NewBaziProfile {
  return {
    id: legacyProfile.id,
    user_id: legacyProfile.user_id,
    profile_name: legacyProfile.name,
    birth_year: legacyProfile.year,
    birth_month: legacyProfile.month,
    birth_day: legacyProfile.day,
    birth_hour: legacyProfile.hour,
    birth_minute: legacyProfile.minute,
    is_solar_calendar: legacyProfile.is_solar,
    gender: legacyProfile.is_female ? 'female' : 'male',
    birth_longitude: legacyProfile.longitude,
    birth_latitude: legacyProfile.latitude,
    bazi_result_text: legacyProfile.bazi_result,
    avatar_emoji: '😊',
    is_favorite: false,
    tags: [],
    created_at: legacyProfile.created_at,
    updated_at: legacyProfile.updated_at,
  }
}

/**
 * 创建兼容两种格式的 profile 对象
 */
export function createCompatibleProfile(data: any) {
  // 如果已经是新格式，直接返回
  if (data.profile_name !== undefined) {
    return data
  }
  
  // 否则转换为新格式
  return legacyToNew(data)
}
