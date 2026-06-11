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
          referral_code: string | null
          referred_by: string | null
          referral_bound_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          referral_bound_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          display_name?: string | null
          avatar_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          referral_bound_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
          mode: 'classic' | 'agent'
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
          mode?: 'classic' | 'agent'
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
          mode?: 'classic' | 'agent'
          message_count?: number
          status?: 'active' | 'archived' | 'deleted'
          updated_at?: string
          last_message_at?: string
        }
        Relationships: []
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
          mode: 'classic' | 'agent'
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
          mode?: 'classic' | 'agent'
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
          mode?: 'classic' | 'agent'
          model?: string | null
          tokens_used?: number | null
          is_edited?: boolean
          is_deleted?: boolean
          edited_at?: string | null
        }
        Relationships: []
      }

      // ============================================
      // LLM Usage Events Table
      // ============================================
      llm_usage_events: {
        Row: {
          id: string
          user_id: string
          source: 'classic_chat' | 'agent_planner' | 'agent_analysis' | 'feature_page' | 'agent_tool'
          mode: 'classic' | 'agent' | 'feature'
          feature_kind: string | null
          model: string
          task: string
          status: 'completed' | 'empty' | 'aborted' | 'failed'
          input_tokens: number
          output_tokens: number
          total_tokens: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source: 'classic_chat' | 'agent_planner' | 'agent_analysis' | 'feature_page' | 'agent_tool'
          mode: 'classic' | 'agent' | 'feature'
          feature_kind?: string | null
          model: string
          task: string
          status?: 'completed' | 'empty' | 'aborted' | 'failed'
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          created_at?: string
        }
        Update: {
          source?: 'classic_chat' | 'agent_planner' | 'agent_analysis' | 'feature_page' | 'agent_tool'
          mode?: 'classic' | 'agent' | 'feature'
          feature_kind?: string | null
          model?: string
          task?: string
          status?: 'completed' | 'empty' | 'aborted' | 'failed'
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
        }
        Relationships: []
      }

      llm_runs: {
        Row: {
          id: string
          user_id: string
          session_id: string
          client_message_id: string | null
          kind: 'classic_chat' | 'agent_chat' | 'feature_analyze'
          status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
          payload: Record<string, any>
          output_text: string
          final_metadata: Record<string, any>
          assistant_message_id: string | null
          model: string | null
          task: string | null
          input_tokens: number
          apple_cost: number
          quota_refunded: boolean
          error_message: string | null
          started_at: string | null
          completed_at: string | null
          canceled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          client_message_id?: string | null
          kind: 'classic_chat' | 'agent_chat' | 'feature_analyze'
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
          payload?: Record<string, any>
          output_text?: string
          final_metadata?: Record<string, any>
          assistant_message_id?: string | null
          model?: string | null
          task?: string | null
          input_tokens?: number
          apple_cost?: number
          quota_refunded?: boolean
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          canceled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          client_message_id?: string | null
          kind?: 'classic_chat' | 'agent_chat' | 'feature_analyze'
          status?: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
          payload?: Record<string, any>
          output_text?: string
          final_metadata?: Record<string, any>
          assistant_message_id?: string | null
          model?: string | null
          task?: string | null
          input_tokens?: number
          apple_cost?: number
          quota_refunded?: boolean
          error_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          canceled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      llm_run_events: {
        Row: {
          id: number
          run_id: string
          seq: number
          event_type: string
          content: string | null
          payload: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: number
          run_id: string
          seq: number
          event_type: string
          content?: string | null
          payload?: Record<string, any>
          created_at?: string
        }
        Update: {
          seq?: number
          event_type?: string
          content?: string | null
          payload?: Record<string, any>
        }
        Relationships: []
      }

      // ============================================
      // Referrals Table
      // ============================================
      referrals: {
        Row: {
          id: string
          referrer_user_id: string
          referred_user_id: string
          referral_code: string
          status: 'pending' | 'rewarded' | 'rejected'
          new_user_reward_membership_days: number
          referrer_reward_membership_days: number
          reward_note: string | null
          created_at: string
          rewarded_at: string | null
        }
        Insert: {
          id?: string
          referrer_user_id: string
          referred_user_id: string
          referral_code: string
          status?: 'pending' | 'rewarded' | 'rejected'
          new_user_reward_membership_days?: number
          referrer_reward_membership_days?: number
          reward_note?: string | null
          created_at?: string
          rewarded_at?: string | null
        }
        Update: {
          status?: 'pending' | 'rewarded' | 'rejected'
          new_user_reward_membership_days?: number
          referrer_reward_membership_days?: number
          reward_note?: string | null
          rewarded_at?: string | null
        }
        Relationships: []
      }

      // ============================================
      // Redemption Codes Tables
      // ============================================
      redemption_codes: {
        Row: {
          code: string
          description: string | null
          kind: 'membership_days' | 'bonus_quota' | 'combo'
          membership_days: number
          bonus_apple_limit: number
          bonus_days: number
          max_redemptions: number | null
          redeemed_count: number
          starts_at: string
          expires_at: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          code: string
          description?: string | null
          kind?: 'membership_days' | 'bonus_quota' | 'combo'
          membership_days?: number
          bonus_apple_limit?: number
          bonus_days?: number
          max_redemptions?: number | null
          redeemed_count?: number
          starts_at?: string
          expires_at?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          kind?: 'membership_days' | 'bonus_quota' | 'combo'
          membership_days?: number
          bonus_apple_limit?: number
          bonus_days?: number
          max_redemptions?: number | null
          redeemed_count?: number
          starts_at?: string
          expires_at?: string | null
          is_active?: boolean
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      redemption_redemptions: {
        Row: {
          id: string
          code: string
          user_id: string
          applied_membership_days: number
          applied_bonus_apple_limit: number
          applied_bonus_days: number
          redeemed_at: string
        }
        Insert: {
          id?: string
          code: string
          user_id: string
          applied_membership_days?: number
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          redeemed_at?: string
        }
        Update: {
          applied_membership_days?: number
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          redeemed_at?: string
        }
        Relationships: []
      }

      // ============================================
      // Afdian Subscription Tables
      // ============================================
      afdian_bindings: {
        Row: {
          id: string
          user_id: string
          afdian_user_id: string
          user_private_id: string | null
          binding_method: 'oauth' | 'binding_code' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          afdian_user_id: string
          user_private_id?: string | null
          binding_method?: 'oauth' | 'binding_code' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          afdian_user_id?: string
          user_private_id?: string | null
          binding_method?: 'oauth' | 'binding_code' | 'admin'
          updated_at?: string
        }
        Relationships: []
      }

      afdian_binding_codes: {
        Row: {
          code: string
          user_id: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          code: string
          user_id: string
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          expires_at?: string
          used_at?: string | null
        }
        Relationships: []
      }

      afdian_plan_mappings: {
        Row: {
          plan_id: string
          name: string
          membership_days: number
          bonus_apple_limit: number
          bonus_days: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          plan_id: string
          name: string
          membership_days?: number
          bonus_apple_limit?: number
          bonus_days?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          membership_days?: number
          bonus_apple_limit?: number
          bonus_days?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }

      afdian_orders: {
        Row: {
          out_trade_no: string
          afdian_user_id: string | null
          user_private_id: string | null
          user_id: string | null
          binding_code: string | null
          plan_id: string | null
          month: number
          total_amount: number | null
          show_amount: number | null
          status: number | null
          remark: string | null
          raw: Record<string, any>
          process_status: 'pending' | 'processing' | 'processed' | 'unmatched' | 'needs_mapping' | 'ignored' | 'failed'
          error_message: string | null
          applied_membership_days: number
          applied_bonus_apple_limit: number
          applied_bonus_days: number
          processed_at: string | null
          processing_started_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          out_trade_no: string
          afdian_user_id?: string | null
          user_private_id?: string | null
          user_id?: string | null
          binding_code?: string | null
          plan_id?: string | null
          month?: number
          total_amount?: number | null
          show_amount?: number | null
          status?: number | null
          remark?: string | null
          raw?: Record<string, any>
          process_status?: 'pending' | 'processing' | 'processed' | 'unmatched' | 'needs_mapping' | 'ignored' | 'failed'
          error_message?: string | null
          applied_membership_days?: number
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          processed_at?: string | null
          processing_started_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          afdian_user_id?: string | null
          user_private_id?: string | null
          user_id?: string | null
          binding_code?: string | null
          plan_id?: string | null
          month?: number
          total_amount?: number | null
          show_amount?: number | null
          status?: number | null
          remark?: string | null
          raw?: Record<string, any>
          process_status?: 'pending' | 'processing' | 'processed' | 'unmatched' | 'needs_mapping' | 'ignored' | 'failed'
          error_message?: string | null
          applied_membership_days?: number
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          processed_at?: string | null
          processing_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }

      // ============================================
      // User Quotas Table (Apple Quota System)
      // ============================================
      user_quotas: {
        Row: {
          user_id: string
          is_paid: boolean
          daily_apple_limit: number
          membership_expires_at: string | null
          bonus_apple_limit: number
          bonus_expires_at: string | null
          apples_used_today: number
          last_reset_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          is_paid?: boolean
          daily_apple_limit?: number
          membership_expires_at?: string | null
          bonus_apple_limit?: number
          bonus_expires_at?: string | null
          apples_used_today?: number
          last_reset_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          is_paid?: boolean
          daily_apple_limit?: number
          membership_expires_at?: string | null
          bonus_apple_limit?: number
          bonus_expires_at?: string | null
          apples_used_today?: number
          last_reset_date?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
    }

    // ============================================
    // Functions
    // ============================================
    Functions: {
      apply_user_benefits: {
        Args: {
          p_user_id: string
          p_membership_days?: number
          p_bonus_apple_limit?: number
          p_bonus_days?: number
        }
        Returns: {
          membership_expires_at: string | null
          bonus_apple_limit: number
          bonus_expires_at: string | null
        }[]
      }
      settle_referral_reward: {
        Args: {
          p_referred_user_id: string
          p_referral_code: string
        }
        Returns: {
          referral_applied: boolean
          reason: string | null
          referral_code: string | null
          referrer_user_id: string | null
          new_user_reward_days: number | null
          referrer_reward_days: number | null
        }[]
      }
      redeem_redemption_code: {
        Args: {
          p_user_id: string
          p_code: string
        }
        Returns: {
          ok: boolean
          status: number
          message: string
          code: string | null
          membership_expires_at: string | null
          bonus_apple_limit: number | null
          bonus_expires_at: string | null
        }[]
      }
      consume_user_apples: {
        Args: {
          p_user_id: string
          p_count?: number
        }
        Returns: {
          success: boolean
          user_id: string
          is_paid: boolean
          daily_apple_limit: number
          membership_expires_at: string | null
          bonus_apple_limit: number
          bonus_expires_at: string | null
          apples_used_today: number
          last_reset_date: string
          remaining: number
        }[]
      }
      refund_user_apples: {
        Args: {
          p_user_id: string
          p_count?: number
        }
        Returns: {
          success: boolean
          user_id: string
          is_paid: boolean
          daily_apple_limit: number
          membership_expires_at: string | null
          bonus_apple_limit: number
          bonus_expires_at: string | null
          apples_used_today: number
          last_reset_date: string
          remaining: number
        }[]
      }
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
export type LlmUsageEvent = Database['public']['Tables']['llm_usage_events']['Row']
export type Referral = Database['public']['Tables']['referrals']['Row']
export type RedemptionCode = Database['public']['Tables']['redemption_codes']['Row']
export type RedemptionRedemption = Database['public']['Tables']['redemption_redemptions']['Row']
export type AfdianBinding = Database['public']['Tables']['afdian_bindings']['Row']
export type AfdianBindingCode = Database['public']['Tables']['afdian_binding_codes']['Row']
export type AfdianPlanMapping = Database['public']['Tables']['afdian_plan_mappings']['Row']
export type AfdianOrder = Database['public']['Tables']['afdian_orders']['Row']
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']
export type MessageFeedback = Database['public']['Tables']['message_feedback']['Row']
export type UserQuota = Database['public']['Tables']['user_quotas']['Row']

export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type BaziProfileInsert = Database['public']['Tables']['bazi_profiles']['Insert']
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert']
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
export type LlmUsageEventInsert = Database['public']['Tables']['llm_usage_events']['Insert']
export type ReferralInsert = Database['public']['Tables']['referrals']['Insert']
export type RedemptionCodeInsert = Database['public']['Tables']['redemption_codes']['Insert']
export type RedemptionRedemptionInsert = Database['public']['Tables']['redemption_redemptions']['Insert']
export type AfdianBindingInsert = Database['public']['Tables']['afdian_bindings']['Insert']
export type AfdianBindingCodeInsert = Database['public']['Tables']['afdian_binding_codes']['Insert']
export type AfdianPlanMappingInsert = Database['public']['Tables']['afdian_plan_mappings']['Insert']
export type AfdianOrderInsert = Database['public']['Tables']['afdian_orders']['Insert']
export type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert']
export type MessageFeedbackInsert = Database['public']['Tables']['message_feedback']['Insert']
export type UserQuotaInsert = Database['public']['Tables']['user_quotas']['Insert']

export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type BaziProfileUpdate = Database['public']['Tables']['bazi_profiles']['Update']
export type ChatSessionUpdate = Database['public']['Tables']['chat_sessions']['Update']
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update']
export type LlmUsageEventUpdate = Database['public']['Tables']['llm_usage_events']['Update']
export type ReferralUpdate = Database['public']['Tables']['referrals']['Update']
export type RedemptionCodeUpdate = Database['public']['Tables']['redemption_codes']['Update']
export type RedemptionRedemptionUpdate = Database['public']['Tables']['redemption_redemptions']['Update']
export type AfdianBindingUpdate = Database['public']['Tables']['afdian_bindings']['Update']
export type AfdianBindingCodeUpdate = Database['public']['Tables']['afdian_binding_codes']['Update']
export type AfdianPlanMappingUpdate = Database['public']['Tables']['afdian_plan_mappings']['Update']
export type AfdianOrderUpdate = Database['public']['Tables']['afdian_orders']['Update']
export type UserPreferencesUpdate = Database['public']['Tables']['user_preferences']['Update']
export type MessageFeedbackUpdate = Database['public']['Tables']['message_feedback']['Update']
export type UserQuotaUpdate = Database['public']['Tables']['user_quotas']['Update']

// ============================================
// Enum Types
// ============================================

export type Gender = 'male' | 'female' | 'other'
export type MessageRole = 'user' | 'assistant' | 'system'
export type SessionStatus = 'active' | 'archived' | 'deleted'
export type ChatMode = 'classic' | 'agent'
export type Theme = 'light' | 'dark' | 'auto'
export type FeedbackType = 'helpful' | 'not_helpful' | 'incorrect' | 'offensive'
export type ReferralStatus = 'pending' | 'rewarded' | 'rejected'
export type RedemptionCodeKind = 'membership_days' | 'bonus_quota' | 'combo'
export type AfdianBindingMethod = 'oauth' | 'binding_code' | 'admin'
export type AfdianOrderProcessStatus = 'pending' | 'processing' | 'processed' | 'unmatched' | 'needs_mapping' | 'ignored' | 'failed'
