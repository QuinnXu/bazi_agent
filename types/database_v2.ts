// ============================================
// Supabase Database Types (English Version)
// ============================================
// Auto-generated types for TypeScript
// Matches schema_v2_english.sql
// ============================================

export interface Database {
  public: {
    Tables: {
      // ============================================
      // Profiles Table
      // ============================================
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          display_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }

      // ============================================
      // Bazi Profiles Table
      // ============================================
      bazi_profiles: {
        Row: {
          id: string
          user_id: string
          profile_name: string
          description: string | null
          avatar_emoji: string
          birth_year: number
          birth_month: number
          birth_day: number
          birth_hour: number
          birth_minute: number
          is_solar_calendar: boolean
          gender: 'male' | 'female' | 'other' | null
          birth_longitude: number
          birth_latitude: number
          birth_location_name: string | null
          bazi_result: Record<string, any> | null
          bazi_result_text: string | null
          is_favorite: boolean
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          profile_name: string
          description?: string | null
          avatar_emoji?: string
          birth_year: number
          birth_month: number
          birth_day: number
          birth_hour: number
          birth_minute: number
          is_solar_calendar?: boolean
          gender?: 'male' | 'female' | 'other' | null
          birth_longitude?: number
          birth_latitude?: number
          birth_location_name?: string | null
          bazi_result?: Record<string, any> | null
          bazi_result_text?: string | null
          is_favorite?: boolean
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          profile_name?: string
          description?: string | null
          avatar_emoji?: string
          birth_year?: number
          birth_month?: number
          birth_day?: number
          birth_hour?: number
          birth_minute?: number
          is_solar_calendar?: boolean
          gender?: 'male' | 'female' | 'other' | null
          birth_longitude?: number
          birth_latitude?: number
          birth_location_name?: string | null
          bazi_result?: Record<string, any> | null
          bazi_result_text?: string | null
          is_favorite?: boolean
          tags?: string[]
          updated_at?: string
        }
      }

      // ============================================
      // Chat Sessions Table
      // ============================================
      chat_sessions: {
        Row: {
          id: string
          user_id: string
          bazi_profile_id: string | null
          title: string
          summary: string | null
          message_count: number
          status: 'active' | 'archived' | 'deleted'
          created_at: string
          updated_at: string
          last_message_at: string
        }
        Insert: {
          id?: string
          user_id: string
          bazi_profile_id?: string | null
          title?: string
          summary?: string | null
          message_count?: number
          status?: 'active' | 'archived' | 'deleted'
          created_at?: string
          updated_at?: string
          last_message_at?: string
        }
        Update: {
          bazi_profile_id?: string | null
          title?: string
          summary?: string | null
          message_count?: number
          status?: 'active' | 'archived' | 'deleted'
          updated_at?: string
          last_message_at?: string
        }
      }

      // ============================================
      // Chat Messages Table
      // ============================================
      chat_messages: {
        Row: {
          id: string
          session_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          model: string | null
          tokens_used: number | null
          is_edited: boolean
          is_deleted: boolean
          created_at: string
          edited_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          model?: string | null
          tokens_used?: number | null
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          edited_at?: string | null
        }
        Update: {
          role?: 'user' | 'assistant' | 'system'
          content?: string
          model?: string | null
          tokens_used?: number | null
          is_edited?: boolean
          is_deleted?: boolean
          edited_at?: string | null
        }
      }

      // ============================================
      // User Preferences Table
      // ============================================
      user_preferences: {
        Row: {
          user_id: string
          theme: 'light' | 'dark' | 'auto'
          language: string
          email_notifications: boolean
          data_collection_consent: boolean
          preferences: Record<string, any>
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          theme?: 'light' | 'dark' | 'auto'
          language?: string
          email_notifications?: boolean
          data_collection_consent?: boolean
          preferences?: Record<string, any>
          created_at?: string
          updated_at?: string
        }
        Update: {
          theme?: 'light' | 'dark' | 'auto'
          language?: string
          email_notifications?: boolean
          data_collection_consent?: boolean
          preferences?: Record<string, any>
          updated_at?: string
        }
      }

      // ============================================
      // User Quotas Table (Apple Quota System)
      // ============================================
      user_quotas: {
        Row: {
          user_id: string
          is_paid: boolean
          daily_apple_limit: number
          apples_used_today: number
          last_reset_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          is_paid?: boolean
          daily_apple_limit?: number
          apples_used_today?: number
          last_reset_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          is_paid?: boolean
          daily_apple_limit?: number
          apples_used_today?: number
          last_reset_date?: string
          updated_at?: string
        }
      }

      // ============================================
      // Message Feedback Table
      // ============================================
      message_feedback: {
        Row: {
          id: string
          user_id: string
          message_id: string
          rating: number | null
          feedback_type: 'helpful' | 'not_helpful' | 'incorrect' | 'offensive' | null
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          message_id: string
          rating?: number | null
          feedback_type?: 'helpful' | 'not_helpful' | 'incorrect' | 'offensive' | null
          comment?: string | null
          created_at?: string
        }
        Update: {
          rating?: number | null
          feedback_type?: 'helpful' | 'not_helpful' | 'incorrect' | 'offensive' | null
          comment?: string | null
        }
      }
    }

    // ============================================
    // Views
    // ============================================
    Views: {
      active_sessions_with_profiles: {
        Row: {
          session_id: string
          user_id: string
          session_title: string
          message_count: number
          last_message_at: string
          profile_id: string | null
          profile_name: string | null
          avatar_emoji: string | null
        }
      }
      user_statistics: {
        Row: {
          user_id: string
          email: string
          display_name: string | null
          bazi_profiles_count: number
          chat_sessions_count: number
          total_messages_count: number
          user_created_at: string
        }
      }
    }

    // ============================================
    // Functions
    // ============================================
    Functions: {
      // Add custom functions here if needed
    }
  }
}

// ============================================
// Helper Types
// ============================================

export type Profile = Database['public']['Tables']['profiles']['Row']
export type BaziProfile = Database['public']['Tables']['bazi_profiles']['Row']
export type ChatSession = Database['public']['Tables']['chat_sessions']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']
export type MessageFeedback = Database['public']['Tables']['message_feedback']['Row']
export type UserQuota = Database['public']['Tables']['user_quotas']['Row']

export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type BaziProfileInsert = Database['public']['Tables']['bazi_profiles']['Insert']
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert']
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
export type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert']
export type MessageFeedbackInsert = Database['public']['Tables']['message_feedback']['Insert']
export type UserQuotaInsert = Database['public']['Tables']['user_quotas']['Insert']

export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type BaziProfileUpdate = Database['public']['Tables']['bazi_profiles']['Update']
export type ChatSessionUpdate = Database['public']['Tables']['chat_sessions']['Update']
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update']
export type UserPreferencesUpdate = Database['public']['Tables']['user_preferences']['Update']
export type MessageFeedbackUpdate = Database['public']['Tables']['message_feedback']['Update']
export type UserQuotaUpdate = Database['public']['Tables']['user_quotas']['Update']

// ============================================
// Enum Types
// ============================================

export type Gender = 'male' | 'female' | 'other'
export type MessageRole = 'user' | 'assistant' | 'system'
export type SessionStatus = 'active' | 'archived' | 'deleted'
export type Theme = 'light' | 'dark' | 'auto'
export type FeedbackType = 'helpful' | 'not_helpful' | 'incorrect' | 'offensive'
