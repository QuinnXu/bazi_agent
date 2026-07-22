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
          mode: 'classic' | 'agent' | 'liuyao'
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
          mode?: 'classic' | 'agent' | 'liuyao'
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
          mode?: 'classic' | 'agent' | 'liuyao'
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
          mode: 'classic' | 'agent' | 'liuyao'
          model: string | null
          tokens_used: number | null
          metadata: Record<string, unknown>
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
          mode?: 'classic' | 'agent' | 'liuyao'
          model?: string | null
          tokens_used?: number | null
          metadata?: Record<string, unknown>
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          edited_at?: string | null
        }
        Update: {
          role?: 'user' | 'assistant' | 'system'
          content?: string
          mode?: 'classic' | 'agent' | 'liuyao'
          model?: string | null
          tokens_used?: number | null
          metadata?: Record<string, unknown>
          is_edited?: boolean
          is_deleted?: boolean
          edited_at?: string | null
        }
        Relationships: []
      }

      chat_session_contexts: {
        Row: {
          id: string
          session_id: string
          context_type: string
          version: number
          payload: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          context_type: string
          version?: number
          payload?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          context_type?: string
          version?: number
          payload?: Record<string, unknown>
          updated_at?: string
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

      guest_trial_usage: {
        Row: {
          id: string
          guest_key_hash: string
          final_answers_used: number
          created_at: string
          updated_at: string
          last_seen_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          guest_key_hash: string
          final_answers_used?: number
          created_at?: string
          updated_at?: string
          last_seen_at?: string
          expires_at: string
        }
        Update: {
          guest_key_hash?: string
          final_answers_used?: number
          updated_at?: string
          last_seen_at?: string
          expires_at?: string
        }
        Relationships: []
      }

      // ============================================
      // Referrals Table
      // ============================================
      referral_attributions: {
        Row: {
          id: string
          referrer_user_id: string
          referral_code: string
          source: 'link' | 'manual'
          clicked_at: string | null
          trial_started_at: string | null
          trial_completed_at: string | null
          referred_user_id: string | null
          registered_at: string | null
          activated_at: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          referrer_user_id: string
          referral_code: string
          source?: 'link' | 'manual'
          clicked_at?: string | null
          trial_started_at?: string | null
          trial_completed_at?: string | null
          referred_user_id?: string | null
          registered_at?: string | null
          activated_at?: string | null
          expires_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          trial_started_at?: string | null
          trial_completed_at?: string | null
          referred_user_id?: string | null
          registered_at?: string | null
          activated_at?: string | null
          expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      referrals: {
        Row: {
          id: string
          referrer_user_id: string
          referred_user_id: string
          referral_code: string
          attribution_id: string | null
          status: 'pending' | 'rewarded' | 'rejected'
          reward_policy_version: string
          new_user_reward_membership_days: number
          referrer_reward_membership_days: number
          new_user_reward_apples: number
          referrer_reward_apples: number
          reward_expiry_days: number
          new_user_rewarded_at: string | null
          activated_at: string | null
          referrer_rewarded_at: string | null
          reward_note: string | null
          created_at: string
          rewarded_at: string | null
        }
        Insert: {
          id?: string
          referrer_user_id: string
          referred_user_id: string
          referral_code: string
          attribution_id?: string | null
          status?: 'pending' | 'rewarded' | 'rejected'
          reward_policy_version?: string
          new_user_reward_membership_days?: number
          referrer_reward_membership_days?: number
          new_user_reward_apples?: number
          referrer_reward_apples?: number
          reward_expiry_days?: number
          new_user_rewarded_at?: string | null
          activated_at?: string | null
          referrer_rewarded_at?: string | null
          reward_note?: string | null
          created_at?: string
          rewarded_at?: string | null
        }
        Update: {
          status?: 'pending' | 'rewarded' | 'rejected'
          attribution_id?: string | null
          reward_policy_version?: string
          new_user_reward_membership_days?: number
          referrer_reward_membership_days?: number
          new_user_reward_apples?: number
          referrer_reward_apples?: number
          reward_expiry_days?: number
          new_user_rewarded_at?: string | null
          activated_at?: string | null
          referrer_rewarded_at?: string | null
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
          kind: 'membership_days' | 'bonus_quota' | 'combo' | 'apple_wallet'
          membership_days: number
          membership_tier: 'plus' | 'ultra'
          bonus_apple_limit: number
          bonus_days: number
          apple_amount: number
          apple_expiry_days: number
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
          kind?: 'membership_days' | 'bonus_quota' | 'combo' | 'apple_wallet'
          membership_days?: number
          membership_tier?: 'plus' | 'ultra'
          bonus_apple_limit?: number
          bonus_days?: number
          apple_amount?: number
          apple_expiry_days?: number
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
          kind?: 'membership_days' | 'bonus_quota' | 'combo' | 'apple_wallet'
          membership_days?: number
          membership_tier?: 'plus' | 'ultra'
          bonus_apple_limit?: number
          bonus_days?: number
          apple_amount?: number
          apple_expiry_days?: number
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
          applied_membership_tier: 'plus' | 'ultra' | null
          applied_bonus_apple_limit: number
          applied_bonus_days: number
          applied_apple_amount: number
          applied_wallet_expires_at: string | null
          redeemed_at: string
        }
        Insert: {
          id?: string
          code: string
          user_id: string
          applied_membership_days?: number
          applied_membership_tier?: 'plus' | 'ultra' | null
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          applied_apple_amount?: number
          applied_wallet_expires_at?: string | null
          redeemed_at?: string
        }
        Update: {
          applied_membership_days?: number
          applied_membership_tier?: 'plus' | 'ultra' | null
          applied_bonus_apple_limit?: number
          applied_bonus_days?: number
          applied_apple_amount?: number
          applied_wallet_expires_at?: string | null
          redeemed_at?: string
        }
        Relationships: []
      }

      // ============================================
      // OTT Pay Checkout Orders
      // ============================================
      ottpay_orders: {
        Row: {
          prepay_order_id: string
          user_id: string | null
          sku: string
          amount_cents: number
          currency: 'CAD' | 'USD' | 'CNY'
          status: 'created' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'closed'
          provider_status: string | null
          provider_order_id: string | null
          provider_currency: 'CAD' | 'USD' | 'CNY' | null
          provider_payment_reference: string | null
          pay_url: string | null
          expires_at: string
          provider_expires_at: string | null
          product_snapshot: Record<string, any>
          raw_response: Record<string, any>
          raw_callback: Record<string, any>
          raw_query: Record<string, any>
          error_message: string | null
          user_cancelled_at: string | null
          user_cancel_reason: string | null
          callback_received_at: string | null
          last_synced_at: string | null
          sync_attempts: number
          processed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          prepay_order_id: string
          user_id: string | null
          sku: string
          amount_cents: number
          currency: 'CAD' | 'USD' | 'CNY'
          status?: 'created' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'closed'
          provider_status?: string | null
          provider_order_id?: string | null
          provider_currency?: 'CAD' | 'USD' | 'CNY' | null
          provider_payment_reference?: string | null
          pay_url?: string | null
          expires_at: string
          provider_expires_at?: string | null
          product_snapshot?: Record<string, any>
          raw_response?: Record<string, any>
          raw_callback?: Record<string, any>
          raw_query?: Record<string, any>
          error_message?: string | null
          user_cancelled_at?: string | null
          user_cancel_reason?: string | null
          callback_received_at?: string | null
          last_synced_at?: string | null
          sync_attempts?: number
          processed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string | null
          status?: 'created' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'closed'
          provider_status?: string | null
          provider_order_id?: string | null
          provider_currency?: 'CAD' | 'USD' | 'CNY' | null
          provider_payment_reference?: string | null
          pay_url?: string | null
          expires_at?: string
          provider_expires_at?: string | null
          product_snapshot?: Record<string, any>
          raw_response?: Record<string, any>
          raw_callback?: Record<string, any>
          raw_query?: Record<string, any>
          error_message?: string | null
          user_cancelled_at?: string | null
          user_cancel_reason?: string | null
          callback_received_at?: string | null
          last_synced_at?: string | null
          sync_attempts?: number
          processed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      membership_entitlements: {
        Row: {
          id: string
          user_id: string
          tier: 'plus' | 'ultra'
          sku: string
          source: 'legacy' | 'ottpay' | 'redemption' | 'referral' | 'admin' | 'legacy_reward'
          starts_at: string
          ends_at: string
          external_order_id: string | null
          external_buyer_id: string | null
          metadata: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tier: 'plus' | 'ultra'
          sku: string
          source?: 'legacy' | 'ottpay' | 'redemption' | 'referral' | 'admin' | 'legacy_reward'
          starts_at: string
          ends_at: string
          external_order_id?: string | null
          external_buyer_id?: string | null
          metadata?: Record<string, any>
          created_at?: string
        }
        Update: {
          tier?: 'plus' | 'ultra'
          starts_at?: string
          ends_at?: string
          metadata?: Record<string, any>
        }
        Relationships: []
      }

      billing_trial_claims: {
        Row: {
          id: string
          user_id: string
          external_buyer_id: string | null
          entitlement_id: string
          trial_ends_at: string
          upgrade_credit_expires_at: string
          upgrade_credit_redeemed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          external_buyer_id?: string | null
          entitlement_id: string
          trial_ends_at: string
          upgrade_credit_expires_at: string
          upgrade_credit_redeemed_at?: string | null
          created_at?: string
        }
        Update: {
          upgrade_credit_redeemed_at?: string | null
        }
        Relationships: []
      }

      apple_wallet_lots: {
        Row: {
          id: string
          user_id: string
          source: 'legacy' | 'ottpay' | 'redemption' | 'referral' | 'admin' | 'refund'
          sku: string
          initial_amount: number
          remaining_amount: number
          expires_at: string
          external_order_id: string | null
          metadata: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source?: 'legacy' | 'ottpay' | 'redemption' | 'referral' | 'admin' | 'refund'
          sku: string
          initial_amount: number
          remaining_amount: number
          expires_at: string
          external_order_id?: string | null
          metadata?: Record<string, any>
          created_at?: string
        }
        Update: {
          remaining_amount?: number
          expires_at?: string
          metadata?: Record<string, any>
        }
        Relationships: []
      }

      apple_charge_transactions: {
        Row: {
          id: string
          operation_key: string
          user_id: string
          membership_tier: 'free' | 'plus' | 'ultra'
          requested_amount: number
          daily_amount: number
          wallet_amount: number
          wallet_allocations: Record<string, any>[]
          billing_day: string
          fair_use_enforced: boolean
          fair_use_expires_at: string | null
          settled_at: string | null
          refunded_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          operation_key: string
          user_id: string
          membership_tier: 'free' | 'plus' | 'ultra'
          requested_amount?: number
          daily_amount?: number
          wallet_amount?: number
          wallet_allocations?: Record<string, any>[]
          billing_day: string
          fair_use_enforced?: boolean
          fair_use_expires_at?: string | null
          settled_at?: string | null
          refunded_at?: string | null
          created_at?: string
        }
        Update: {
          fair_use_expires_at?: string | null
          settled_at?: string | null
          refunded_at?: string | null
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
      // User Legal Consents Table
      // ============================================
      user_legal_consents: {
        Row: {
          id: string
          user_id: string | null
          email_hash: string
          agreement_version: string
          accepted_agreements: string[]
          consent_source: 'signup' | 'manual' | 'admin_import'
          ip_address: string | null
          user_agent: string | null
          metadata: Record<string, any>
          accepted_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email_hash: string
          agreement_version: string
          accepted_agreements?: string[]
          consent_source?: 'signup' | 'manual' | 'admin_import'
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Record<string, any>
          accepted_at?: string
          created_at?: string
        }
        Update: {
          user_id?: string | null
          email_hash?: string
          agreement_version?: string
          accepted_agreements?: string[]
          consent_source?: 'signup' | 'manual' | 'admin_import'
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Record<string, any>
          accepted_at?: string
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
          membership_tier: 'free' | 'plus' | 'ultra'
          daily_apple_limit: number
          membership_expires_at: string | null
          plus_expires_at: string | null
          ultra_expires_at: string | null
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
          membership_tier?: 'free' | 'plus' | 'ultra'
          daily_apple_limit?: number
          membership_expires_at?: string | null
          plus_expires_at?: string | null
          ultra_expires_at?: string | null
          bonus_apple_limit?: number
          bonus_expires_at?: string | null
          apples_used_today?: number
          last_reset_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          is_paid?: boolean
          membership_tier?: 'free' | 'plus' | 'ultra'
          daily_apple_limit?: number
          membership_expires_at?: string | null
          plus_expires_at?: string | null
          ultra_expires_at?: string | null
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
    Views: Record<string, never>

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
          p_referral_code?: string | null
          p_attribution_id?: string | null
        }
        Returns: {
          referral_applied: boolean
          reason: string | null
          referral_code: string | null
          referrer_user_id: string | null
          new_user_reward_apples: number | null
          referrer_reward_apples: number | null
          reward_expiry_days: number | null
          new_user_reward_expires_at: string | null
          referrer_reward_pending: boolean
        }[]
      }
      activate_referral_reward: {
        Args: {
          p_referred_user_id: string
        }
        Returns: {
          activated: boolean
          referral_id: string | null
          referrer_user_id: string | null
          referrer_reward_apples: number | null
          reward_expires_at: string | null
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
          membership_tier: 'free' | 'plus' | 'ultra' | null
          membership_expires_at: string | null
          bonus_apple_limit: number | null
          bonus_expires_at: string | null
          apple_wallet_balance: number
          apple_wallet_expires_at: string | null
        }[]
      }
      grant_membership_entitlement: {
        Args: {
          p_user_id: string
          p_tier: 'plus' | 'ultra'
          p_duration_days: number
          p_sku: string
          p_source?: string
          p_external_order_id?: string | null
          p_external_buyer_id?: string | null
          p_is_trial?: boolean
          p_is_trial_upgrade?: boolean
          p_metadata?: Record<string, any>
        }
        Returns: {
          entitlement_id: string
          tier: 'plus' | 'ultra'
          starts_at: string
          ends_at: string
          current_tier: 'free' | 'plus' | 'ultra'
          current_membership_expires_at: string | null
        }[]
      }
      grant_apple_wallet: {
        Args: {
          p_user_id: string
          p_amount: number
          p_expiry_days?: number
          p_sku?: string
          p_source?: string
          p_external_order_id?: string | null
          p_metadata?: Record<string, any>
        }
        Returns: {
          wallet_lot_id: string
          granted_amount: number
          expires_at: string
          wallet_balance: number
          wallet_expires_at: string | null
        }[]
      }
      consume_user_apples: {
        Args: {
          p_user_id: string
          p_count?: number
          p_enforce_fair_use?: boolean
          p_operation_key?: string | null
        }
        Returns: {
          success: boolean
          user_id: string
          is_paid: boolean
          membership_tier: 'free' | 'plus' | 'ultra'
          unlimited: boolean
          daily_apple_limit: number
          membership_expires_at: string | null
          next_membership_tier: 'free' | 'plus' | 'ultra' | null
          next_membership_starts_at: string | null
          bonus_apple_limit: number
          bonus_expires_at: string | null
          apples_used_today: number
          last_reset_date: string
          daily_remaining: number
          wallet_balance: number
          wallet_expires_at: string | null
          remaining: number
          charge_id: string | null
          fair_use_limited: boolean
          retry_after_seconds: number
        }[]
      }
      settle_apple_charge: {
        Args: {
          p_user_id: string
          p_charge_id: string
          p_refund?: boolean
        }
        Returns: boolean
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
export type ChatSessionContext = Database['public']['Tables']['chat_session_contexts']['Row']
export type LlmUsageEvent = Database['public']['Tables']['llm_usage_events']['Row']
export type GuestTrialUsage = Database['public']['Tables']['guest_trial_usage']['Row']
export type Referral = Database['public']['Tables']['referrals']['Row']
export type RedemptionCode = Database['public']['Tables']['redemption_codes']['Row']
export type RedemptionRedemption = Database['public']['Tables']['redemption_redemptions']['Row']
export type OttPayOrder = Database['public']['Tables']['ottpay_orders']['Row']
export type MembershipEntitlement = Database['public']['Tables']['membership_entitlements']['Row']
export type BillingTrialClaim = Database['public']['Tables']['billing_trial_claims']['Row']
export type AppleWalletLot = Database['public']['Tables']['apple_wallet_lots']['Row']
export type AppleChargeTransaction = Database['public']['Tables']['apple_charge_transactions']['Row']
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row']
export type UserLegalConsent = Database['public']['Tables']['user_legal_consents']['Row']
export type MessageFeedback = Database['public']['Tables']['message_feedback']['Row']
export type UserQuota = Database['public']['Tables']['user_quotas']['Row']

export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type BaziProfileInsert = Database['public']['Tables']['bazi_profiles']['Insert']
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert']
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']
export type ChatSessionContextInsert = Database['public']['Tables']['chat_session_contexts']['Insert']
export type LlmUsageEventInsert = Database['public']['Tables']['llm_usage_events']['Insert']
export type GuestTrialUsageInsert = Database['public']['Tables']['guest_trial_usage']['Insert']
export type ReferralInsert = Database['public']['Tables']['referrals']['Insert']
export type RedemptionCodeInsert = Database['public']['Tables']['redemption_codes']['Insert']
export type RedemptionRedemptionInsert = Database['public']['Tables']['redemption_redemptions']['Insert']
export type OttPayOrderInsert = Database['public']['Tables']['ottpay_orders']['Insert']
export type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert']
export type UserLegalConsentInsert = Database['public']['Tables']['user_legal_consents']['Insert']
export type MessageFeedbackInsert = Database['public']['Tables']['message_feedback']['Insert']
export type UserQuotaInsert = Database['public']['Tables']['user_quotas']['Insert']

export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type BaziProfileUpdate = Database['public']['Tables']['bazi_profiles']['Update']
export type ChatSessionUpdate = Database['public']['Tables']['chat_sessions']['Update']
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update']
export type ChatSessionContextUpdate = Database['public']['Tables']['chat_session_contexts']['Update']
export type LlmUsageEventUpdate = Database['public']['Tables']['llm_usage_events']['Update']
export type GuestTrialUsageUpdate = Database['public']['Tables']['guest_trial_usage']['Update']
export type ReferralUpdate = Database['public']['Tables']['referrals']['Update']
export type RedemptionCodeUpdate = Database['public']['Tables']['redemption_codes']['Update']
export type RedemptionRedemptionUpdate = Database['public']['Tables']['redemption_redemptions']['Update']
export type OttPayOrderUpdate = Database['public']['Tables']['ottpay_orders']['Update']
export type UserPreferencesUpdate = Database['public']['Tables']['user_preferences']['Update']
export type UserLegalConsentUpdate = Database['public']['Tables']['user_legal_consents']['Update']
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
export type RedemptionCodeKind = 'membership_days' | 'bonus_quota' | 'combo' | 'apple_wallet'
export type MembershipTier = 'free' | 'plus' | 'ultra'
export type OttPayOrderStatus = 'created' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'closed'
