export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          updated_at?: string
        }
      }      bazi_profiles: {
        Row: {
          id: string
          user_id: string
          name: string
          year: number
          month: number
          day: number
          hour: number
          minute: number
          is_solar: boolean
          is_female: boolean
          longitude: number
          latitude: number
          bazi_result: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          year: number
          month: number
          day: number
          hour: number
          minute: number
          is_solar?: boolean
          is_female?: boolean
          longitude?: number
          latitude?: number
          bazi_result?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
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
          updated_at?: string
        }
      }
      chat_sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          content?: string
        }
      }
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type BaziProfile = Database['public']['Tables']['bazi_profiles']['Row']
export type ChatSession = Database['public']['Tables']['chat_sessions']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
