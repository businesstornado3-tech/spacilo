export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          device: string | null
          environment: string
          event_name: string
          id: number
          is_bot: boolean
          occurred_at: string
          path: string | null
          props: Json
          referrer_host: string | null
          session_ref: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_ref: string
        }
        Insert: {
          device?: string | null
          environment?: string
          event_name: string
          id?: never
          is_bot?: boolean
          occurred_at?: string
          path?: string | null
          props?: Json
          referrer_host?: string | null
          session_ref: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_ref: string
        }
        Update: {
          device?: string | null
          environment?: string
          event_name?: string
          id?: never
          is_bot?: boolean
          occurred_at?: string
          path?: string | null
          props?: Json
          referrer_host?: string | null
          session_ref?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_ref?: string
        }
        Relationships: []
      }
      booking_cancellations: {
        Row: {
          booking_id: string
          category: string | null
          created_at: string
          effective_at: string
          financial_resolution_state: Database["public"]["Enums"]["cancellation_resolution"]
          id: string
          payment_id: string | null
          policy_version: string
          reason: string | null
          requested_at: string
          requested_by: string
          requested_by_role: string
          resolved_at: string | null
          storage_started: boolean
          updated_at: string
        }
        Insert: {
          booking_id: string
          category?: string | null
          created_at?: string
          effective_at?: string
          financial_resolution_state?: Database["public"]["Enums"]["cancellation_resolution"]
          id?: string
          payment_id?: string | null
          policy_version: string
          reason?: string | null
          requested_at?: string
          requested_by: string
          requested_by_role: string
          resolved_at?: string | null
          storage_started?: boolean
          updated_at?: string
        }
        Update: {
          booking_id?: string
          category?: string | null
          created_at?: string
          effective_at?: string
          financial_resolution_state?: Database["public"]["Enums"]["cancellation_resolution"]
          id?: string
          payment_id?: string | null
          policy_version?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string
          requested_by_role?: string
          resolved_at?: string | null
          storage_started?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_change_requests: {
        Row: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at: string
          currency: string
          host_id: string
          host_response_note: string | null
          id: string
          kind: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note: string | null
          requested_by: string
          requested_by_role: string
          responded_at: string | null
          responded_by: string | null
          space_id: string
          status: Database["public"]["Enums"]["booking_change_status"]
          updated_at: string
        }
        Insert: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at?: string
          currency?: string
          host_id: string
          host_response_note?: string | null
          id?: string
          kind?: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown?: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note?: string | null
          requested_by: string
          requested_by_role: string
          responded_at?: string | null
          responded_by?: string | null
          space_id: string
          status?: Database["public"]["Enums"]["booking_change_status"]
          updated_at?: string
        }
        Update: {
          additional_days?: number
          additional_service_fee_pence?: number
          additional_storage_amount_pence?: number
          additional_total_pence?: number
          booking_id?: string
          created_at?: string
          currency?: string
          host_id?: string
          host_response_note?: string | null
          id?: string
          kind?: string
          original_end_date?: string
          original_start_date?: string
          pricing_breakdown?: Json | null
          pricing_version?: string
          proposed_end_date?: string
          proposed_start_date?: string
          renter_id?: string
          renter_note?: string | null
          requested_by?: string
          requested_by_role?: string
          responded_at?: string | null
          responded_by?: string | null
          space_id?: string
          status?: Database["public"]["Enums"]["booking_change_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_change_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_condition_notes: {
        Row: {
          author_id: string
          author_role: string
          body: string
          booking_id: string
          created_at: string
          id: string
          stage: Database["public"]["Enums"]["handover_stage"]
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          booking_id: string
          created_at?: string
          id?: string
          stage: Database["public"]["Enums"]["handover_stage"]
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          stage?: Database["public"]["Enums"]["handover_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_condition_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_evidence_photos: {
        Row: {
          booking_id: string
          caption: string | null
          created_at: string
          id: string
          stage: Database["public"]["Enums"]["handover_stage"]
          storage_path: string
          uploaded_by: string
          uploader_role: string
        }
        Insert: {
          booking_id: string
          caption?: string | null
          created_at?: string
          id?: string
          stage: Database["public"]["Enums"]["handover_stage"]
          storage_path: string
          uploaded_by: string
          uploader_role: string
        }
        Update: {
          booking_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          stage?: Database["public"]["Enums"]["handover_stage"]
          storage_path?: string
          uploaded_by?: string
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_evidence_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_handover_issues: {
        Row: {
          booking_id: string
          category: Database["public"]["Enums"]["handover_issue_category"]
          created_at: string
          description: string
          id: string
          reported_by: string
          reporter_role: string
          stage: Database["public"]["Enums"]["handover_stage"]
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          category: Database["public"]["Enums"]["handover_issue_category"]
          created_at?: string
          description: string
          id?: string
          reported_by: string
          reporter_role: string
          stage: Database["public"]["Enums"]["handover_stage"]
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          category?: Database["public"]["Enums"]["handover_issue_category"]
          created_at?: string
          description?: string
          id?: string
          reported_by?: string
          reporter_role?: string
          stage?: Database["public"]["Enums"]["handover_stage"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_handover_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_refunds: {
        Row: {
          booking_id: string
          cancellation_id: string | null
          completed_at: string | null
          created_at: string
          currency: string
          externally_initiated: boolean
          failure_reason: string | null
          id: string
          initiated_by: Database["public"]["Enums"]["refund_initiator"]
          payment_id: string
          policy_version: string
          reason: string | null
          service_fee_refund_pence: number
          status: Database["public"]["Enums"]["refund_status"]
          storage_refund_pence: number
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          support_case_id: string | null
          total_refund_pence: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          cancellation_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          externally_initiated?: boolean
          failure_reason?: string | null
          id?: string
          initiated_by: Database["public"]["Enums"]["refund_initiator"]
          payment_id: string
          policy_version: string
          reason?: string | null
          service_fee_refund_pence: number
          status?: Database["public"]["Enums"]["refund_status"]
          storage_refund_pence: number
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          support_case_id?: string | null
          total_refund_pence: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          cancellation_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          externally_initiated?: boolean
          failure_reason?: string | null
          id?: string
          initiated_by?: Database["public"]["Enums"]["refund_initiator"]
          payment_id?: string
          policy_version?: string
          reason?: string | null
          service_fee_refund_pence?: number
          status?: Database["public"]["Enums"]["refund_status"]
          storage_refund_pence?: number
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          support_case_id?: string | null
          total_refund_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_cancellation_id_fkey"
            columns: ["cancellation_id"]
            isOneToOne: false
            referencedRelation: "booking_cancellations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_support_case_id_fkey"
            columns: ["support_case_id"]
            isOneToOne: false
            referencedRelation: "booking_support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_review_moderation_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          from_status:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
          id: string
          reason: string | null
          review_id: string
          to_status:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
          id?: string
          reason?: string | null
          review_id: string
          to_status?:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
          id?: string
          reason?: string | null
          review_id?: string
          to_status?:
            | Database["public"]["Enums"]["review_moderation_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_review_moderation_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "booking_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_review_reports: {
        Row: {
          booking_id: string
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["review_report_reason"]
          reported_by: string
          resolved_at: string | null
          review_id: string
          status: Database["public"]["Enums"]["review_report_status"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["review_report_reason"]
          reported_by: string
          resolved_at?: string | null
          review_id: string
          status?: Database["public"]["Enums"]["review_report_status"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["review_report_reason"]
          reported_by?: string
          resolved_at?: string | null
          review_id?: string
          status?: Database["public"]["Enums"]["review_report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_review_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "booking_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reviews: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: Database["public"]["Enums"]["review_moderation_status"]
          published_at: string | null
          rating: number
          rating_access: number | null
          rating_accuracy: number | null
          rating_communication: number | null
          rating_condition: number | null
          review_text: string | null
          review_window_closes_at: string
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
          space_id: string
          submitted_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: Database["public"]["Enums"]["review_moderation_status"]
          published_at?: string | null
          rating: number
          rating_access?: number | null
          rating_accuracy?: number | null
          rating_communication?: number | null
          rating_condition?: number | null
          review_text?: string | null
          review_window_closes_at: string
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
          space_id: string
          submitted_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: Database["public"]["Enums"]["review_moderation_status"]
          published_at?: string | null
          rating?: number
          rating_access?: number | null
          rating_accuracy?: number | null
          rating_communication?: number | null
          rating_condition?: number | null
          review_text?: string | null
          review_window_closes_at?: string
          reviewee_id?: string
          reviewer_id?: string
          reviewer_role?: string
          space_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reviews_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_support_case_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          booking_id: string
          case_id: string
          created_at: string
          event_type: string
          id: string
          internal_note: string | null
          metadata: Json
          public_message: string | null
          visibility: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          booking_id: string
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          internal_note?: string | null
          metadata?: Json
          public_message?: string | null
          visibility?: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          booking_id?: string
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          internal_note?: string | null
          metadata?: Json
          public_message?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_support_case_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_support_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "booking_support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_support_case_evidence: {
        Row: {
          booking_id: string
          caption: string | null
          case_id: string
          created_at: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          uploaded_by_role: string
          uploaded_by_user_id: string
        }
        Insert: {
          booking_id: string
          caption?: string | null
          case_id: string
          created_at?: string
          file_size: number
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by_role: string
          uploaded_by_user_id: string
        }
        Update: {
          booking_id?: string
          caption?: string | null
          case_id?: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by_role?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_support_case_evidence_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_support_case_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "booking_support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_support_case_messages: {
        Row: {
          author_role: string
          author_user_id: string
          body: string
          booking_id: string
          case_id: string
          created_at: string
          id: string
          visibility: string
        }
        Insert: {
          author_role: string
          author_user_id: string
          body: string
          booking_id: string
          case_id: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Update: {
          author_role?: string
          author_user_id?: string
          body?: string
          booking_id?: string
          case_id?: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_support_case_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_support_case_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "booking_support_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_support_cases: {
        Row: {
          assigned_to_user_id: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at: string | null
          created_at: string
          description: string
          financially_resolved: boolean
          host_id: string
          id: string
          last_activity_at: string
          linked_handover_issue_id: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency: string | null
          refund_total_pence: number
          renter_id: string
          resolution_code:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status: Database["public"]["Enums"]["support_case_status"]
          submitted_at: string
          summary: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at?: string | null
          created_at?: string
          description: string
          financially_resolved?: boolean
          host_id: string
          id?: string
          last_activity_at?: string
          linked_handover_issue_id?: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency?: string | null
          refund_total_pence?: number
          renter_id: string
          resolution_code?:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status?: Database["public"]["Enums"]["support_case_status"]
          submitted_at?: string
          summary: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          booking_id?: string
          category?: Database["public"]["Enums"]["support_case_category"]
          closed_at?: string | null
          created_at?: string
          description?: string
          financially_resolved?: boolean
          host_id?: string
          id?: string
          last_activity_at?: string
          linked_handover_issue_id?: string | null
          opened_by_role?: string
          opened_by_user_id?: string
          reference?: string
          refund_currency?: string | null
          refund_total_pence?: number
          renter_id?: string
          resolution_code?:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stage?: Database["public"]["Enums"]["support_case_stage"]
          status?: Database["public"]["Enums"]["support_case_status"]
          submitted_at?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_support_cases_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_support_cases_linked_handover_issue_id_fkey"
            columns: ["linked_handover_issue_id"]
            isOneToOne: false
            referencedRelation: "booking_handover_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        Insert: {
          activated_at?: string | null
          cancellation_policy_version?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          compatibility_snapshot?: Json | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          currency_snapshot?: string
          daily_rate_snapshot?: number | null
          duration_days_snapshot?: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot?: number
          host_accepted_at?: string | null
          host_collection_confirmed_at?: string | null
          host_handover_confirmed_at?: string | null
          host_id: string
          id?: string
          inventory_item_count_snapshot?: number
          inventory_items_snapshot?: Json
          minimum_stay_days_snapshot?: number | null
          monthly_price_snapshot?: number | null
          paid_at?: string | null
          policy_screening_snapshot?: Json | null
          policy_version_id_snapshot?: string | null
          policy_version_snapshot?: string | null
          pricing_breakdown_snapshot?: Json | null
          pricing_version_snapshot?: string | null
          renter_collection_confirmed_at?: string | null
          renter_declaration_snapshot?: Json | null
          renter_first_name_snapshot?: string | null
          renter_handover_confirmed_at?: string | null
          renter_id: string
          renter_total_amount_pence?: number | null
          request_id: string
          service_fee_amount_pence?: number | null
          service_fee_minimum_pence?: number | null
          service_fee_rate_bps?: number | null
          space_area_snapshot?: string | null
          space_id: string
          space_postcode_district_snapshot?: string | null
          space_suitability_snapshot?: Json | null
          space_title_snapshot?: string | null
          space_type_snapshot?: string | null
          spacefit_algorithm_snapshot?: string | null
          spacefit_breakdown_snapshot?: Json | null
          spacefit_label_snapshot?: string | null
          spacefit_plan_snapshot?: Json | null
          spacefit_score_snapshot?: number | null
          spacefit_space_dimensions_snapshot?: Json | null
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence?: number | null
          updated_at?: string
          vat_amount_pence?: number
          vat_policy_status?: string
          vat_rate_percent?: number | null
          weekly_rate_snapshot?: number | null
        }
        Update: {
          activated_at?: string | null
          cancellation_policy_version?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          compatibility_snapshot?: Json | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          currency_snapshot?: string
          daily_rate_snapshot?: number | null
          duration_days_snapshot?: number | null
          end_date?: string
          estimated_storage_requirement_m3_snapshot?: number
          host_accepted_at?: string | null
          host_collection_confirmed_at?: string | null
          host_handover_confirmed_at?: string | null
          host_id?: string
          id?: string
          inventory_item_count_snapshot?: number
          inventory_items_snapshot?: Json
          minimum_stay_days_snapshot?: number | null
          monthly_price_snapshot?: number | null
          paid_at?: string | null
          policy_screening_snapshot?: Json | null
          policy_version_id_snapshot?: string | null
          policy_version_snapshot?: string | null
          pricing_breakdown_snapshot?: Json | null
          pricing_version_snapshot?: string | null
          renter_collection_confirmed_at?: string | null
          renter_declaration_snapshot?: Json | null
          renter_first_name_snapshot?: string | null
          renter_handover_confirmed_at?: string | null
          renter_id?: string
          renter_total_amount_pence?: number | null
          request_id?: string
          service_fee_amount_pence?: number | null
          service_fee_minimum_pence?: number | null
          service_fee_rate_bps?: number | null
          space_area_snapshot?: string | null
          space_id?: string
          space_postcode_district_snapshot?: string | null
          space_suitability_snapshot?: Json | null
          space_title_snapshot?: string | null
          space_type_snapshot?: string | null
          spacefit_algorithm_snapshot?: string | null
          spacefit_breakdown_snapshot?: Json | null
          spacefit_label_snapshot?: string | null
          spacefit_plan_snapshot?: Json | null
          spacefit_score_snapshot?: number | null
          spacefit_space_dimensions_snapshot?: Json | null
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence?: number | null
          updated_at?: string
          vat_amount_pence?: number
          vat_policy_status?: string
          vat_rate_percent?: number | null
          weekly_rate_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "storage_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reports: {
        Row: {
          conversation_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          host_archived_at: string | null
          host_id: string
          host_last_read_at: string | null
          id: string
          last_message_at: string | null
          moderation_status: string
          renter_archived_at: string | null
          renter_id: string
          renter_last_read_at: string | null
          space_id: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          host_archived_at?: string | null
          host_id: string
          host_last_read_at?: string | null
          id?: string
          last_message_at?: string | null
          moderation_status?: string
          renter_archived_at?: string | null
          renter_id: string
          renter_last_read_at?: string | null
          space_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          host_archived_at?: string | null
          host_id?: string
          host_last_read_at?: string | null
          id?: string
          last_message_at?: string | null
          moderation_status?: string
          renter_archived_at?: string | null
          renter_id?: string
          renter_last_read_at?: string | null
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_audit_events: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: Json
          event_key: string
          id: string
          occurred_at: string
          reason: string
          reference_id: string
          source: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: Json
          event_key: string
          id?: string
          occurred_at?: string
          reason: string
          reference_id: string
          source: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: Json
          event_key?: string
          id?: string
          occurred_at?: string
          reason?: string
          reference_id?: string
          source?: string
        }
        Relationships: []
      }
      growth_autonomy_config: {
        Row: {
          budgets: Json
          created_at: string
          default_retention_days: number
          emergency_stop: boolean
          flags: Json
          id: boolean
          limits: Json
          paused_channels: Json
          paused_connectors: Json
          suppressed_categories: Json
          thresholds: Json
          updated_at: string
        }
        Insert: {
          budgets?: Json
          created_at?: string
          default_retention_days?: number
          emergency_stop?: boolean
          flags?: Json
          id?: boolean
          limits?: Json
          paused_channels?: Json
          paused_connectors?: Json
          suppressed_categories?: Json
          thresholds?: Json
          updated_at?: string
        }
        Update: {
          budgets?: Json
          created_at?: string
          default_retention_days?: number
          emergency_stop?: boolean
          flags?: Json
          id?: boolean
          limits?: Json
          paused_channels?: Json
          paused_connectors?: Json
          suppressed_categories?: Json
          thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      growth_campaigns: {
        Row: {
          attempt_count: number
          channel: string | null
          created_at: string
          decision: Json
          expires_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          message: Json | null
          opportunity_key: string
          policy: Json
          sent_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel?: string | null
          created_at?: string
          decision?: Json
          expires_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          message?: Json | null
          opportunity_key: string
          policy?: Json
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: string | null
          created_at?: string
          decision?: Json
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          message?: Json | null
          opportunity_key?: string
          policy?: Json
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      growth_connectors: {
        Row: {
          connected: boolean
          created_at: string
          enabled: boolean
          flag: string
          id: string
          kind: string
          last_error: string | null
          last_sync_at: string | null
          level: string
          name: string
          notes: string
          permissions: Json
          rate_limit: Json
          retention_days: number
          updated_at: string
        }
        Insert: {
          connected?: boolean
          created_at?: string
          enabled?: boolean
          flag: string
          id: string
          kind: string
          last_error?: string | null
          last_sync_at?: string | null
          level?: string
          name: string
          notes?: string
          permissions?: Json
          rate_limit?: Json
          retention_days?: number
          updated_at?: string
        }
        Update: {
          connected?: boolean
          created_at?: string
          enabled?: boolean
          flag?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_sync_at?: string | null
          level?: string
          name?: string
          notes?: string
          permissions?: Json
          rate_limit?: Json
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      growth_insights: {
        Row: {
          audience: string
          components: Json
          confidence: number
          created_at: string
          evidence_count: number
          geography: string | null
          id: string
          insight_key: string
          kind: string
          problem: string
          recommendation: string
          status: string
          supporting_keys: Json
          title: string
          updated_at: string
        }
        Insert: {
          audience: string
          components?: Json
          confidence?: number
          created_at?: string
          evidence_count?: number
          geography?: string | null
          id?: string
          insight_key: string
          kind: string
          problem: string
          recommendation: string
          status?: string
          supporting_keys?: Json
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          components?: Json
          confidence?: number
          created_at?: string
          evidence_count?: number
          geography?: string | null
          id?: string
          insight_key?: string
          kind?: string
          problem?: string
          recommendation?: string
          status?: string
          supporting_keys?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      growth_learning_signals: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          metadata: Json
          occurred_at: string
          opportunity_key: string
          outcome: string
          value_pence: number | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          opportunity_key: string
          outcome: string
          value_pence?: number | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          opportunity_key?: string
          outcome?: string
          value_pence?: number | null
        }
        Relationships: []
      }
      growth_opportunities: {
        Row: {
          audience: Json
          campaign_decision: Json
          connector_id: string
          created_at: string
          evidence: Json
          first_seen_at: string
          fit: Json
          frequency: number
          key: string
          latest_seen_at: string
          pain_points: Json
          scores: Json
          signal_id: string
          situation: Json
          status: string
          supply: Json
          updated_at: string
        }
        Insert: {
          audience?: Json
          campaign_decision?: Json
          connector_id: string
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          fit?: Json
          frequency?: number
          key: string
          latest_seen_at?: string
          pain_points?: Json
          scores?: Json
          signal_id: string
          situation?: Json
          status?: string
          supply?: Json
          updated_at?: string
        }
        Update: {
          audience?: Json
          campaign_decision?: Json
          connector_id?: string
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          fit?: Json
          frequency?: number
          key?: string
          latest_seen_at?: string
          pain_points?: Json
          scores?: Json
          signal_id?: string
          situation?: Json
          status?: string
          supply?: Json
          updated_at?: string
        }
        Relationships: []
      }
      guest_spacefit_runs: {
        Row: {
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          detection_count: number
          duration_ms: number | null
          error_category: string | null
          id: string
          model: string | null
          photo_count: number
          provider: string | null
          result: Json | null
          session_id: string
          status: string
        }
        Insert: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          detection_count?: number
          duration_ms?: number | null
          error_category?: string | null
          id?: string
          model?: string | null
          photo_count?: number
          provider?: string | null
          result?: Json | null
          session_id: string
          status?: string
        }
        Update: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          detection_count?: number
          duration_ms?: number | null
          error_category?: string | null
          id?: string
          model?: string | null
          photo_count?: number
          provider?: string | null
          result?: Json | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_spacefit_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "guest_spacefit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_spacefit_sessions: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          expires_at: string
          id: string
          ip_hash: string | null
          kind: string
          photo_count: number
          result: Json | null
          result_at: string | null
          run_count: number
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          kind: string
          photo_count?: number
          result?: Json | null
          result_at?: string | null
          run_count?: number
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          kind?: string
          photo_count?: number
          result?: Json | null
          result_at?: string | null
          run_count?: number
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      host_balance_adjustments: {
        Row: {
          amount_pence: number
          booking_id: string | null
          created_at: string
          currency: string
          earning_id: string | null
          host_user_id: string
          id: string
          notes: string | null
          offset_earning_id: string | null
          resolved_at: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["host_liability_source"]
          status: Database["public"]["Enums"]["host_liability_status"]
          updated_at: string
        }
        Insert: {
          amount_pence: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          earning_id?: string | null
          host_user_id: string
          id?: string
          notes?: string | null
          offset_earning_id?: string | null
          resolved_at?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["host_liability_source"]
          status?: Database["public"]["Enums"]["host_liability_status"]
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          earning_id?: string | null
          host_user_id?: string
          id?: string
          notes?: string | null
          offset_earning_id?: string | null
          resolved_at?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["host_liability_source"]
          status?: Database["public"]["Enums"]["host_liability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_balance_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_balance_adjustments_earning_id_fkey"
            columns: ["earning_id"]
            isOneToOne: false
            referencedRelation: "host_earnings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_balance_adjustments_offset_earning_id_fkey"
            columns: ["offset_earning_id"]
            isOneToOne: false
            referencedRelation: "host_earnings"
            referencedColumns: ["id"]
          },
        ]
      }
      host_earnings: {
        Row: {
          blocked_reason: string | null
          booking_id: string
          connected_account_id: string | null
          created_at: string
          currency: string
          eligible_at: string
          gross_storage_amount_pence: number
          hold_dispute: boolean
          hold_refund: boolean
          hold_review: boolean
          host_entitlement_pence: number
          host_user_id: string
          id: string
          last_error: string | null
          livemode: boolean | null
          payment_id: string
          period_end: string | null
          period_index: number
          period_label: string
          period_start: string | null
          platform_fee_pence: number
          refunded_storage_pence: number
          reversed_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status: Database["public"]["Enums"]["host_earning_status"]
          stripe_transfer_id: string | null
          transfer_attempted_at: string | null
          transfer_attempts: number
          transfer_created_at: string | null
          transferred_amount_pence: number
          updated_at: string
        }
        Insert: {
          blocked_reason?: string | null
          booking_id: string
          connected_account_id?: string | null
          created_at?: string
          currency?: string
          eligible_at: string
          gross_storage_amount_pence: number
          hold_dispute?: boolean
          hold_refund?: boolean
          hold_review?: boolean
          host_entitlement_pence: number
          host_user_id: string
          id?: string
          last_error?: string | null
          livemode?: boolean | null
          payment_id: string
          period_end?: string | null
          period_index?: number
          period_label?: string
          period_start?: string | null
          platform_fee_pence: number
          refunded_storage_pence?: number
          reversed_amount_pence?: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status?: Database["public"]["Enums"]["host_earning_status"]
          stripe_transfer_id?: string | null
          transfer_attempted_at?: string | null
          transfer_attempts?: number
          transfer_created_at?: string | null
          transferred_amount_pence?: number
          updated_at?: string
        }
        Update: {
          blocked_reason?: string | null
          booking_id?: string
          connected_account_id?: string | null
          created_at?: string
          currency?: string
          eligible_at?: string
          gross_storage_amount_pence?: number
          hold_dispute?: boolean
          hold_refund?: boolean
          hold_review?: boolean
          host_entitlement_pence?: number
          host_user_id?: string
          id?: string
          last_error?: string | null
          livemode?: boolean | null
          payment_id?: string
          period_end?: string | null
          period_index?: number
          period_label?: string
          period_start?: string | null
          platform_fee_pence?: number
          refunded_storage_pence?: number
          reversed_amount_pence?: number
          service_fee_minimum_pence?: number
          service_fee_rate_bps?: number
          space_id?: string
          status?: Database["public"]["Enums"]["host_earning_status"]
          stripe_transfer_id?: string | null
          transfer_attempted_at?: string | null
          transfer_attempts?: number
          transfer_created_at?: string | null
          transferred_amount_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_earnings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_earnings_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      host_payout_accounts: {
        Row: {
          charges_enabled: boolean
          country: string | null
          created_at: string
          currently_due: Json
          details_submitted: boolean
          disabled_reason: string | null
          eventually_due: Json
          host_user_id: string
          id: string
          last_synced_at: string | null
          livemode: boolean | null
          onboarding_started_at: string | null
          payouts_enabled: boolean
          pending_verification: Json
          status: Database["public"]["Enums"]["host_payout_status"]
          stripe_account_id: string
          transfers_capability: string | null
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          currently_due?: Json
          details_submitted?: boolean
          disabled_reason?: string | null
          eventually_due?: Json
          host_user_id: string
          id?: string
          last_synced_at?: string | null
          livemode?: boolean | null
          onboarding_started_at?: string | null
          payouts_enabled?: boolean
          pending_verification?: Json
          status?: Database["public"]["Enums"]["host_payout_status"]
          stripe_account_id: string
          transfers_capability?: string | null
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          currently_due?: Json
          details_submitted?: boolean
          disabled_reason?: string | null
          eventually_due?: Json
          host_user_id?: string
          id?: string
          last_synced_at?: string | null
          livemode?: boolean | null
          onboarding_started_at?: string | null
          payouts_enabled?: boolean
          pending_verification?: Json
          status?: Database["public"]["Enums"]["host_payout_status"]
          stripe_account_id?: string
          transfers_capability?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_analysis_runs: {
        Row: {
          analysed_photo_count: number
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          detection_count: number
          duration_ms: number | null
          error_category: string | null
          failed_photo_count: number
          id: string
          inventory_id: string
          model: string
          photo_count: number
          prompt_version: string
          provider: string
          schema_version: string
          started_at: string
          status: Database["public"]["Enums"]["analysis_run_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          analysed_photo_count?: number
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          detection_count?: number
          duration_ms?: number | null
          error_category?: string | null
          failed_photo_count?: number
          id?: string
          inventory_id: string
          model: string
          photo_count?: number
          prompt_version?: string
          provider: string
          schema_version?: string
          started_at?: string
          status?: Database["public"]["Enums"]["analysis_run_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          analysed_photo_count?: number
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          detection_count?: number
          duration_ms?: number | null
          error_category?: string | null
          failed_photo_count?: number
          id?: string
          inventory_id?: string
          model?: string
          photo_count?: number
          prompt_version?: string
          provider?: string
          schema_version?: string
          started_at?: string
          status?: Database["public"]["Enums"]["analysis_run_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_analysis_runs_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "renter_inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_detection_photos: {
        Row: {
          created_at: string
          detection_id: string
          id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detection_id: string
          id?: string
          photo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          detection_id?: string
          id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_detection_photos_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: false
            referencedRelation: "inventory_detections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_detection_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "inventory_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_detections: {
        Row: {
          confidence_score: number | null
          confirmed_quantity: number | null
          created_at: string
          detected_label: string
          duplicate_certainty: string | null
          fragile_suggestion: Database["public"]["Enums"]["item_tri_state"]
          id: string
          inventory_id: string
          inventory_intent: string
          max_plausible_quantity: number | null
          min_plausible_quantity: number | null
          model: string
          notes: string | null
          object_confidence: string | null
          orientation_suggestion: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group: string | null
          possible_restricted_item: boolean
          provider: string
          quantity_confidence: string | null
          restricted_reason: string | null
          resulting_item_id: string | null
          review_status: Database["public"]["Enums"]["detection_review_status"]
          run_id: string
          stackable_suggestion: Database["public"]["Enums"]["item_tri_state"]
          suggested_catalogue_key: string | null
          suggested_category: Database["public"]["Enums"]["inventory_item_category"]
          suggested_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          detected_label: string
          duplicate_certainty?: string | null
          fragile_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          id?: string
          inventory_id: string
          inventory_intent?: string
          max_plausible_quantity?: number | null
          min_plausible_quantity?: number | null
          model: string
          notes?: string | null
          object_confidence?: string | null
          orientation_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group?: string | null
          possible_restricted_item?: boolean
          provider: string
          quantity_confidence?: string | null
          restricted_reason?: string | null
          resulting_item_id?: string | null
          review_status?: Database["public"]["Enums"]["detection_review_status"]
          run_id: string
          stackable_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          suggested_catalogue_key?: string | null
          suggested_category?: Database["public"]["Enums"]["inventory_item_category"]
          suggested_quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          detected_label?: string
          duplicate_certainty?: string | null
          fragile_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          id?: string
          inventory_id?: string
          inventory_intent?: string
          max_plausible_quantity?: number | null
          min_plausible_quantity?: number | null
          model?: string
          notes?: string | null
          object_confidence?: string | null
          orientation_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group?: string | null
          possible_restricted_item?: boolean
          provider?: string
          quantity_confidence?: string | null
          restricted_reason?: string | null
          resulting_item_id?: string | null
          review_status?: Database["public"]["Enums"]["detection_review_status"]
          run_id?: string
          stackable_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          suggested_catalogue_key?: string | null
          suggested_category?: Database["public"]["Enums"]["inventory_item_category"]
          suggested_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_detections_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "renter_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_detections_resulting_item_id_fkey"
            columns: ["resulting_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_detections_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "inventory_analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          ai_confirmed: boolean
          ai_detected: boolean
          catalogue_key: string | null
          category: Database["public"]["Enums"]["inventory_item_category"]
          confidence_score: number | null
          created_at: string
          created_manually: boolean
          estimated_total_volume_m3: number | null
          estimated_unit_volume_m3: number | null
          fragile: boolean
          height_cm: number | null
          id: string
          inventory_id: string
          item_name: string
          length_cm: number | null
          notes: string | null
          orientation_flexible: Database["public"]["Enums"]["item_tri_state"]
          policy_category: string | null
          policy_confirmed_at: string | null
          policy_note: string | null
          policy_provenance: string
          quantity: number
          size_source: Database["public"]["Enums"]["item_size_source"]
          source_photo_id: string | null
          stackable: Database["public"]["Enums"]["item_tri_state"]
          updated_at: string
          user_id: string
          width_cm: number | null
        }
        Insert: {
          ai_confirmed?: boolean
          ai_detected?: boolean
          catalogue_key?: string | null
          category?: Database["public"]["Enums"]["inventory_item_category"]
          confidence_score?: number | null
          created_at?: string
          created_manually?: boolean
          estimated_total_volume_m3?: number | null
          estimated_unit_volume_m3?: number | null
          fragile?: boolean
          height_cm?: number | null
          id?: string
          inventory_id: string
          item_name: string
          length_cm?: number | null
          notes?: string | null
          orientation_flexible?: Database["public"]["Enums"]["item_tri_state"]
          policy_category?: string | null
          policy_confirmed_at?: string | null
          policy_note?: string | null
          policy_provenance?: string
          quantity?: number
          size_source?: Database["public"]["Enums"]["item_size_source"]
          source_photo_id?: string | null
          stackable?: Database["public"]["Enums"]["item_tri_state"]
          updated_at?: string
          user_id: string
          width_cm?: number | null
        }
        Update: {
          ai_confirmed?: boolean
          ai_detected?: boolean
          catalogue_key?: string | null
          category?: Database["public"]["Enums"]["inventory_item_category"]
          confidence_score?: number | null
          created_at?: string
          created_manually?: boolean
          estimated_total_volume_m3?: number | null
          estimated_unit_volume_m3?: number | null
          fragile?: boolean
          height_cm?: number | null
          id?: string
          inventory_id?: string
          item_name?: string
          length_cm?: number | null
          notes?: string | null
          orientation_flexible?: Database["public"]["Enums"]["item_tri_state"]
          policy_category?: string | null
          policy_confirmed_at?: string | null
          policy_note?: string | null
          policy_provenance?: string
          quantity?: number
          size_source?: Database["public"]["Enums"]["item_size_source"]
          source_photo_id?: string | null
          stackable?: Database["public"]["Enums"]["item_tri_state"]
          updated_at?: string
          user_id?: string
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "renter_inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_photos: {
        Row: {
          analysed_at: string | null
          analysis_status: Database["public"]["Enums"]["inventory_photo_status"]
          created_at: string
          display_order: number
          id: string
          inventory_id: string
          last_error_category: string | null
          last_run_id: string | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysed_at?: string | null
          analysis_status?: Database["public"]["Enums"]["inventory_photo_status"]
          created_at?: string
          display_order?: number
          id?: string
          inventory_id: string
          last_error_category?: string | null
          last_run_id?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysed_at?: string | null
          analysis_status?: Database["public"]["Enums"]["inventory_photo_status"]
          created_at?: string
          display_order?: number
          id?: string
          inventory_id?: string
          last_error_category?: string | null
          last_run_id?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_photos_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "renter_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_photos_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "inventory_analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          booking_id: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          booking_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_announcements: boolean
          email_bookings: boolean
          email_messages: boolean
          email_payments: boolean
          email_reviews: boolean
          inapp_announcements: boolean
          inapp_bookings: boolean
          inapp_messages: boolean
          inapp_payments: boolean
          inapp_reviews: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_announcements?: boolean
          email_bookings?: boolean
          email_messages?: boolean
          email_payments?: boolean
          email_reviews?: boolean
          inapp_announcements?: boolean
          inapp_bookings?: boolean
          inapp_messages?: boolean
          inapp_payments?: boolean
          inapp_reviews?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_announcements?: boolean
          email_bookings?: boolean
          email_messages?: boolean
          email_payments?: boolean
          email_reviews?: boolean
          inapp_announcements?: boolean
          inapp_bookings?: boolean
          inapp_messages?: boolean
          inapp_payments?: boolean
          inapp_reviews?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_received_pence: number | null
          booking_id: string
          change_request_id: string | null
          checkout_created_at: string | null
          created_at: string
          currency: string
          currency_received: string | null
          disputed: boolean
          failed_at: string | null
          failure_reason: string | null
          hold_expires_at: string | null
          hold_released_at: string | null
          hold_volume_m3: number
          host_id: string
          id: string
          last_webhook_at: string | null
          livemode: boolean | null
          period_end: string | null
          period_index: number
          period_label: string
          period_start: string | null
          provider: string
          refund_state: Database["public"]["Enums"]["payment_refund_state"]
          refunded_service_fee_pence: number
          refunded_storage_pence: number
          refunded_total_pence: number
          renter_id: string
          renter_total_amount_pence: number
          service_fee_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status: Database["public"]["Enums"]["payment_status"]
          storage_amount_pence: number
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
        }
        Insert: {
          amount_received_pence?: number | null
          booking_id: string
          change_request_id?: string | null
          checkout_created_at?: string | null
          created_at?: string
          currency?: string
          currency_received?: string | null
          disputed?: boolean
          failed_at?: string | null
          failure_reason?: string | null
          hold_expires_at?: string | null
          hold_released_at?: string | null
          hold_volume_m3?: number
          host_id: string
          id?: string
          last_webhook_at?: string | null
          livemode?: boolean | null
          period_end?: string | null
          period_index?: number
          period_label?: string
          period_start?: string | null
          provider?: string
          refund_state?: Database["public"]["Enums"]["payment_refund_state"]
          refunded_service_fee_pence?: number
          refunded_storage_pence?: number
          refunded_total_pence?: number
          renter_id: string
          renter_total_amount_pence: number
          service_fee_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          storage_amount_pence: number
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
          vat_amount_pence?: number
          vat_policy_status?: string
          vat_rate_percent?: number | null
        }
        Update: {
          amount_received_pence?: number | null
          booking_id?: string
          change_request_id?: string | null
          checkout_created_at?: string | null
          created_at?: string
          currency?: string
          currency_received?: string | null
          disputed?: boolean
          failed_at?: string | null
          failure_reason?: string | null
          hold_expires_at?: string | null
          hold_released_at?: string | null
          hold_volume_m3?: number
          host_id?: string
          id?: string
          last_webhook_at?: string | null
          livemode?: boolean | null
          period_end?: string | null
          period_index?: number
          period_label?: string
          period_start?: string | null
          provider?: string
          refund_state?: Database["public"]["Enums"]["payment_refund_state"]
          refunded_service_fee_pence?: number
          refunded_storage_pence?: number
          refunded_total_pence?: number
          renter_id?: string
          renter_total_amount_pence?: number
          service_fee_amount_pence?: number
          service_fee_minimum_pence?: number
          service_fee_rate_bps?: number
          space_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          storage_amount_pence?: number
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          succeeded_at?: string | null
          updated_at?: string
          vat_amount_pence?: number
          vat_policy_status?: string
          vat_rate_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "booking_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acceptances: {
        Row: {
          accepted_at: string
          context: Json
          id: string
          policy_version_id: string
          role: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          context?: Json
          id?: string
          policy_version_id: string
          role: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          context?: Json
          id?: string
          policy_version_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acceptances_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "storage_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_audit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          subject_id?: string | null
          subject_type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          current_mode: Database["public"]["Enums"]["user_mode"]
          display_name: string | null
          first_name: string
          host_enabled: boolean
          id: string
          initial_mode: Database["public"]["Enums"]["user_mode"]
          last_name: string
          marketing_opt_in: boolean
          onboarding_completed: boolean
          phone: string | null
          phone_verified: boolean
          profile_photo_url: string | null
          renter_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_mode?: Database["public"]["Enums"]["user_mode"]
          display_name?: string | null
          first_name?: string
          host_enabled?: boolean
          id: string
          initial_mode?: Database["public"]["Enums"]["user_mode"]
          last_name?: string
          marketing_opt_in?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          phone_verified?: boolean
          profile_photo_url?: string | null
          renter_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_mode?: Database["public"]["Enums"]["user_mode"]
          display_name?: string | null
          first_name?: string
          host_enabled?: boolean
          id?: string
          initial_mode?: Database["public"]["Enums"]["user_mode"]
          last_name?: string
          marketing_opt_in?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          phone_verified?: boolean
          profile_photo_url?: string | null
          renter_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      renter_inventories: {
        Row: {
          created_at: string
          estimated_storage_requirement_m3: number
          estimated_total_item_volume_m3: number
          id: string
          item_count: number
          name: string
          status: Database["public"]["Enums"]["inventory_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_storage_requirement_m3?: number
          estimated_total_item_volume_m3?: number
          id?: string
          item_count?: number
          name?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_storage_requirement_m3?: number
          estimated_total_item_volume_m3?: number
          id?: string
          item_count?: number
          name?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      space_ai_observations: {
        Row: {
          confidence: number | null
          created_at: string
          host_id: string
          id: string
          observation: string
          observation_key: string
          resolved_at: string | null
          source: string
          space_id: string
          verification_state: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          host_id: string
          id?: string
          observation: string
          observation_key: string
          resolved_at?: string | null
          source?: string
          space_id: string
          verification_state?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          host_id?: string
          id?: string
          observation?: string
          observation_key?: string
          resolved_at?: string | null
          source?: string
          space_id?: string
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_ai_observations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_measurement_proposals: {
        Row: {
          applied_at: string | null
          confidence: string
          created_at: string
          depth_m: number | null
          floor_area_m2: number | null
          gross_volume_m3: number | null
          host_id: string
          id: string
          limitations: Json
          notes: string | null
          proposed_obstacles: Json
          session_id: string
          space_id: string
          usable_height_m: number | null
          usable_volume_m3: number | null
          verification_state: string
          width_m: number | null
        }
        Insert: {
          applied_at?: string | null
          confidence?: string
          created_at?: string
          depth_m?: number | null
          floor_area_m2?: number | null
          gross_volume_m3?: number | null
          host_id: string
          id?: string
          limitations?: Json
          notes?: string | null
          proposed_obstacles?: Json
          session_id: string
          space_id: string
          usable_height_m?: number | null
          usable_volume_m3?: number | null
          verification_state?: string
          width_m?: number | null
        }
        Update: {
          applied_at?: string | null
          confidence?: string
          created_at?: string
          depth_m?: number | null
          floor_area_m2?: number | null
          gross_volume_m3?: number | null
          host_id?: string
          id?: string
          limitations?: Json
          notes?: string | null
          proposed_obstacles?: Json
          session_id?: string
          space_id?: string
          usable_height_m?: number | null
          usable_volume_m3?: number | null
          verification_state?: string
          width_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "space_measurement_proposals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "space_scan_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_measurement_proposals_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_photos: {
        Row: {
          alt: string | null
          created_at: string
          display_order: number
          id: string
          is_cover: boolean
          space_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_cover?: boolean
          space_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_cover?: boolean
          space_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_photos_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_scan_photos: {
        Row: {
          analysis_status: Database["public"]["Enums"]["inventory_photo_status"]
          created_at: string
          host_id: string
          id: string
          session_id: string | null
          space_id: string
          storage_path: string
        }
        Insert: {
          analysis_status?: Database["public"]["Enums"]["inventory_photo_status"]
          created_at?: string
          host_id: string
          id?: string
          session_id?: string | null
          space_id: string
          storage_path: string
        }
        Update: {
          analysis_status?: Database["public"]["Enums"]["inventory_photo_status"]
          created_at?: string
          host_id?: string
          id?: string
          session_id?: string | null
          space_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_scan_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "space_scan_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_scan_photos_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_scan_sessions: {
        Row: {
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_category: string | null
          host_id: string
          id: string
          model: string | null
          photo_count: number
          prompt_version: string | null
          provider: string | null
          schema_version: string | null
          space_id: string
          status: Database["public"]["Enums"]["analysis_run_status"]
        }
        Insert: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_category?: string | null
          host_id: string
          id?: string
          model?: string | null
          photo_count?: number
          prompt_version?: string | null
          provider?: string | null
          schema_version?: string | null
          space_id: string
          status?: Database["public"]["Enums"]["analysis_run_status"]
        }
        Update: {
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_category?: string | null
          host_id?: string
          id?: string
          model?: string | null
          photo_count?: number
          prompt_version?: string | null
          provider?: string | null
          schema_version?: string | null
          space_id?: string
          status?: Database["public"]["Enums"]["analysis_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "space_scan_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_suitability_profiles: {
        Row: {
          attributes: Json
          created_at: string
          declaration_accuracy: boolean
          declaration_authority: boolean
          declaration_compliance: boolean
          declared_at: string | null
          declared_policy_version_id: string | null
          host_confirmed_at: string | null
          host_id: string
          host_notes: string | null
          space_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          declaration_accuracy?: boolean
          declaration_authority?: boolean
          declaration_compliance?: boolean
          declared_at?: string | null
          declared_policy_version_id?: string | null
          host_confirmed_at?: string | null
          host_id: string
          host_notes?: string | null
          space_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          declaration_accuracy?: boolean
          declaration_authority?: boolean
          declaration_compliance?: boolean
          declared_at?: string | null
          declared_policy_version_id?: string | null
          host_confirmed_at?: string | null
          host_id?: string
          host_notes?: string | null
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_suitability_profiles_declared_policy_version_id_fkey"
            columns: ["declared_policy_version_id"]
            isOneToOne: false
            referencedRelation: "storage_policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_suitability_profiles_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          accepted_categories: string[]
          access_frequency:
            | Database["public"]["Enums"]["space_access_frequency"]
            | null
          access_notes: string | null
          access_type: Database["public"]["Enums"]["space_access_type"] | null
          address_line1: string | null
          address_line2: string | null
          approx_latitude: number | null
          approx_longitude: number | null
          approximate_area: string | null
          availability_mode: string
          available_from: string | null
          available_until: string | null
          created_at: string
          currency: string
          daily_price_pence: number | null
          description: string
          dimensions_unknown: boolean
          door_height_cm: number | null
          door_width_cm: number | null
          estimated_available_volume_m3: number | null
          features: string[]
          floor_area_m2: number | null
          geocode_error: string | null
          geocode_source: string | null
          geocode_status: string
          geocoded_at: string | null
          ground_floor_access: boolean | null
          height_m: number | null
          host_available_percentage: number | null
          host_id: string
          host_restrictions: string[]
          id: string
          latitude: number | null
          length_m: number | null
          lift_available: Database["public"]["Enums"]["tri_state"] | null
          listing_status: Database["public"]["Enums"]["listing_status"]
          longitude: number | null
          measurement_source: string
          measurements_verified_at: string | null
          minimum_stay_days: number | null
          minimum_storage_period_months: number
          moisture_condition: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence: number | null
          obstacle_volume_m3: number
          obstacles: Json
          occupied_volume_m3: number
          onboarding_step: number
          postcode: string | null
          postcode_district: string | null
          published_at: string | null
          reserved_volume_m3: number
          restriction_notes: string | null
          space_type: Database["public"]["Enums"]["space_type"] | null
          spatial_model: Json | null
          stairs_required: boolean | null
          storage_mode: Database["public"]["Enums"]["storage_mode"] | null
          temperature_condition: Database["public"]["Enums"]["temperature_condition"]
          title: string
          total_volume_m3: number | null
          town: string | null
          updated_at: string
          vehicle_access_close: boolean | null
          weekly_price_pence: number | null
          width_m: number | null
        }
        Insert: {
          accepted_categories?: string[]
          access_frequency?:
            | Database["public"]["Enums"]["space_access_frequency"]
            | null
          access_notes?: string | null
          access_type?: Database["public"]["Enums"]["space_access_type"] | null
          address_line1?: string | null
          address_line2?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          approximate_area?: string | null
          availability_mode?: string
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          currency?: string
          daily_price_pence?: number | null
          description?: string
          dimensions_unknown?: boolean
          door_height_cm?: number | null
          door_width_cm?: number | null
          estimated_available_volume_m3?: number | null
          features?: string[]
          floor_area_m2?: number | null
          geocode_error?: string | null
          geocode_source?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          ground_floor_access?: boolean | null
          height_m?: number | null
          host_available_percentage?: number | null
          host_id?: string
          host_restrictions?: string[]
          id?: string
          latitude?: number | null
          length_m?: number | null
          lift_available?: Database["public"]["Enums"]["tri_state"] | null
          listing_status?: Database["public"]["Enums"]["listing_status"]
          longitude?: number | null
          measurement_source?: string
          measurements_verified_at?: string | null
          minimum_stay_days?: number | null
          minimum_storage_period_months?: number
          moisture_condition?: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence?: number | null
          obstacle_volume_m3?: number
          obstacles?: Json
          occupied_volume_m3?: number
          onboarding_step?: number
          postcode?: string | null
          postcode_district?: string | null
          published_at?: string | null
          reserved_volume_m3?: number
          restriction_notes?: string | null
          space_type?: Database["public"]["Enums"]["space_type"] | null
          spatial_model?: Json | null
          stairs_required?: boolean | null
          storage_mode?: Database["public"]["Enums"]["storage_mode"] | null
          temperature_condition?: Database["public"]["Enums"]["temperature_condition"]
          title?: string
          total_volume_m3?: number | null
          town?: string | null
          updated_at?: string
          vehicle_access_close?: boolean | null
          weekly_price_pence?: number | null
          width_m?: number | null
        }
        Update: {
          accepted_categories?: string[]
          access_frequency?:
            | Database["public"]["Enums"]["space_access_frequency"]
            | null
          access_notes?: string | null
          access_type?: Database["public"]["Enums"]["space_access_type"] | null
          address_line1?: string | null
          address_line2?: string | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          approximate_area?: string | null
          availability_mode?: string
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          currency?: string
          daily_price_pence?: number | null
          description?: string
          dimensions_unknown?: boolean
          door_height_cm?: number | null
          door_width_cm?: number | null
          estimated_available_volume_m3?: number | null
          features?: string[]
          floor_area_m2?: number | null
          geocode_error?: string | null
          geocode_source?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          ground_floor_access?: boolean | null
          height_m?: number | null
          host_available_percentage?: number | null
          host_id?: string
          host_restrictions?: string[]
          id?: string
          latitude?: number | null
          length_m?: number | null
          lift_available?: Database["public"]["Enums"]["tri_state"] | null
          listing_status?: Database["public"]["Enums"]["listing_status"]
          longitude?: number | null
          measurement_source?: string
          measurements_verified_at?: string | null
          minimum_stay_days?: number | null
          minimum_storage_period_months?: number
          moisture_condition?: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence?: number | null
          obstacle_volume_m3?: number
          obstacles?: Json
          occupied_volume_m3?: number
          onboarding_step?: number
          postcode?: string | null
          postcode_district?: string | null
          published_at?: string | null
          reserved_volume_m3?: number
          restriction_notes?: string | null
          space_type?: Database["public"]["Enums"]["space_type"] | null
          spatial_model?: Json | null
          stairs_required?: boolean | null
          storage_mode?: Database["public"]["Enums"]["storage_mode"] | null
          temperature_condition?: Database["public"]["Enums"]["temperature_condition"]
          title?: string
          total_volume_m3?: number | null
          town?: string | null
          updated_at?: string
          vehicle_access_close?: boolean | null
          weekly_price_pence?: number | null
          width_m?: number | null
        }
        Relationships: []
      }
      storage_policy_rules: {
        Row: {
          category: string
          created_at: string
          decision: Database["public"]["Enums"]["policy_decision"]
          host_message: string | null
          id: string
          internal_reason_code: string
          is_active: boolean
          policy_version_id: string
          renter_message: string
          required_space_attributes: Json
          requires_staff_review: boolean
          requires_user_confirmation: boolean
          rule_key: string
          severity: number
          sort_order: number
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          decision: Database["public"]["Enums"]["policy_decision"]
          host_message?: string | null
          id?: string
          internal_reason_code: string
          is_active?: boolean
          policy_version_id: string
          renter_message: string
          required_space_attributes?: Json
          requires_staff_review?: boolean
          requires_user_confirmation?: boolean
          rule_key: string
          severity?: number
          sort_order?: number
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["policy_decision"]
          host_message?: string | null
          id?: string
          internal_reason_code?: string
          is_active?: boolean
          policy_version_id?: string
          renter_message?: string
          required_space_attributes?: Json
          requires_staff_review?: boolean
          requires_user_confirmation?: boolean
          rule_key?: string
          severity?: number
          sort_order?: number
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_policy_rules_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "storage_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_policy_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          legal_review_required: boolean
          published_at: string | null
          retired_at: string | null
          sections: Json
          status: Database["public"]["Enums"]["policy_version_status"]
          summary: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          legal_review_required?: boolean
          published_at?: string | null
          retired_at?: string | null
          sections?: Json
          status?: Database["public"]["Enums"]["policy_version_status"]
          summary?: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          id?: string
          legal_review_required?: boolean
          published_at?: string | null
          retired_at?: string | null
          sections?: Json
          status?: Database["public"]["Enums"]["policy_version_status"]
          summary?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      storage_requests: {
        Row: {
          booking_action_expires_at: string | null
          compatibility_snapshot: Json | null
          created_at: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          decline_reason: string | null
          duration_days_snapshot: number | null
          estimated_item_volume_m3_snapshot: number
          estimated_storage_requirement_m3_snapshot: number
          expires_at: string
          host_id: string
          id: string
          inventory_id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          inventory_line_count_snapshot: number
          largest_item_snapshot: Json | null
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          price_reviewed_amount_pence: number | null
          price_reviewed_at: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_id: string
          renter_note: string | null
          requested_end_date: string
          requested_start_date: string
          responded_at: string | null
          space_accepted_categories_snapshot: string[] | null
          space_access_summary_snapshot: string | null
          space_area_snapshot: string | null
          space_available_capacity_m3_snapshot: number | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          status: Database["public"]["Enums"]["storage_request_status"]
          storage_amount_pence: number | null
          updated_at: string
          weekly_rate_snapshot: number | null
          withdrawn_at: string | null
        }
        Insert: {
          booking_action_expires_at?: string | null
          compatibility_snapshot?: Json | null
          created_at?: string
          currency_snapshot?: string
          daily_rate_snapshot?: number | null
          decline_reason?: string | null
          duration_days_snapshot?: number | null
          estimated_item_volume_m3_snapshot: number
          estimated_storage_requirement_m3_snapshot: number
          expires_at?: string
          host_id: string
          id?: string
          inventory_id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot?: Json
          inventory_line_count_snapshot: number
          largest_item_snapshot?: Json | null
          minimum_stay_days_snapshot?: number | null
          monthly_price_snapshot?: number | null
          policy_screening_snapshot?: Json | null
          policy_version_id_snapshot?: string | null
          policy_version_snapshot?: string | null
          price_reviewed_amount_pence?: number | null
          price_reviewed_at?: string | null
          pricing_breakdown_snapshot?: Json | null
          pricing_version_snapshot?: string | null
          renter_declaration_snapshot?: Json | null
          renter_first_name_snapshot?: string | null
          renter_id: string
          renter_note?: string | null
          requested_end_date: string
          requested_start_date: string
          responded_at?: string | null
          space_accepted_categories_snapshot?: string[] | null
          space_access_summary_snapshot?: string | null
          space_area_snapshot?: string | null
          space_available_capacity_m3_snapshot?: number | null
          space_id: string
          space_postcode_district_snapshot?: string | null
          space_suitability_snapshot?: Json | null
          space_title_snapshot?: string | null
          space_type_snapshot?: string | null
          spacefit_algorithm_snapshot?: string | null
          spacefit_breakdown_snapshot?: Json | null
          spacefit_label_snapshot?: string | null
          spacefit_plan_snapshot?: Json | null
          spacefit_score_snapshot?: number | null
          spacefit_space_dimensions_snapshot?: Json | null
          status?: Database["public"]["Enums"]["storage_request_status"]
          storage_amount_pence?: number | null
          updated_at?: string
          weekly_rate_snapshot?: number | null
          withdrawn_at?: string | null
        }
        Update: {
          booking_action_expires_at?: string | null
          compatibility_snapshot?: Json | null
          created_at?: string
          currency_snapshot?: string
          daily_rate_snapshot?: number | null
          decline_reason?: string | null
          duration_days_snapshot?: number | null
          estimated_item_volume_m3_snapshot?: number
          estimated_storage_requirement_m3_snapshot?: number
          expires_at?: string
          host_id?: string
          id?: string
          inventory_id?: string
          inventory_item_count_snapshot?: number
          inventory_items_snapshot?: Json
          inventory_line_count_snapshot?: number
          largest_item_snapshot?: Json | null
          minimum_stay_days_snapshot?: number | null
          monthly_price_snapshot?: number | null
          policy_screening_snapshot?: Json | null
          policy_version_id_snapshot?: string | null
          policy_version_snapshot?: string | null
          price_reviewed_amount_pence?: number | null
          price_reviewed_at?: string | null
          pricing_breakdown_snapshot?: Json | null
          pricing_version_snapshot?: string | null
          renter_declaration_snapshot?: Json | null
          renter_first_name_snapshot?: string | null
          renter_id?: string
          renter_note?: string | null
          requested_end_date?: string
          requested_start_date?: string
          responded_at?: string | null
          space_accepted_categories_snapshot?: string[] | null
          space_access_summary_snapshot?: string | null
          space_area_snapshot?: string | null
          space_available_capacity_m3_snapshot?: number | null
          space_id?: string
          space_postcode_district_snapshot?: string | null
          space_suitability_snapshot?: Json | null
          space_title_snapshot?: string | null
          space_type_snapshot?: string | null
          spacefit_algorithm_snapshot?: string | null
          spacefit_breakdown_snapshot?: Json | null
          spacefit_label_snapshot?: string | null
          spacefit_plan_snapshot?: Json | null
          spacefit_score_snapshot?: number | null
          spacefit_space_dimensions_snapshot?: Json | null
          status?: Database["public"]["Enums"]["storage_request_status"]
          storage_amount_pence?: number | null
          updated_at?: string
          weekly_rate_snapshot?: number | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_requests_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "renter_inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_disputes: {
        Row: {
          amount_pence: number
          booking_id: string | null
          created_at: string
          currency: string
          id: string
          livemode: boolean | null
          opened_at: string
          outcome: string | null
          payment_id: string | null
          reason: string | null
          resolved_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_pence?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          livemode?: boolean | null
          opened_at?: string
          outcome?: string | null
          payment_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          livemode?: boolean | null
          opened_at?: string
          outcome?: string | null
          payment_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_dispute_id?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          booking_id: string | null
          id: string
          livemode: boolean
          outcome: string | null
          payment_id: string | null
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          booking_id?: string | null
          id: string
          livemode: boolean
          outcome?: string | null
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          booking_id?: string | null
          id?: string
          livemode?: boolean
          outcome?: string | null
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_path: string | null
          archived_at: string | null
          body: string
          booking_id: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          recipient_user_id: string
          title: string
        }
        Insert: {
          action_path?: string | null
          archived_at?: string | null
          body: string
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          recipient_user_id: string
          title: string
        }
        Update: {
          action_path?: string | null
          archived_at?: string | null
          body?: string
          booking_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          recipient_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_request_price: {
        Args: { p_request_id: string }
        Returns: Json
      }
      activate_booking: {
        Args: { p_booking_id: string }
        Returns: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_support_case_message: {
        Args: { p_body: string; p_case_id: string }
        Returns: {
          author_role: string
          author_user_id: string
          body: string
          booking_id: string
          case_id: string
          created_at: string
          id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_support_case_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dashboard_breakdowns: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_dashboard_kpis: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_dashboard_trends: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      analytics_is_public_path: { Args: { p_path: string }; Returns: boolean }
      analytics_prune: { Args: { p_keep_days?: number }; Returns: number }
      apply_storage_refund_to_earning: {
        Args: {
          p_payment_id: string
          p_reason?: string
          p_refunded_storage_pence: number
        }
        Returns: Json
      }
      archive_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      begin_booking_checkout: {
        Args: { p_booking_id: string }
        Returns: {
          amount_received_pence: number | null
          booking_id: string
          change_request_id: string | null
          checkout_created_at: string | null
          created_at: string
          currency: string
          currency_received: string | null
          disputed: boolean
          failed_at: string | null
          failure_reason: string | null
          hold_expires_at: string | null
          hold_released_at: string | null
          hold_volume_m3: number
          host_id: string
          id: string
          last_webhook_at: string | null
          livemode: boolean | null
          period_end: string | null
          period_index: number
          period_label: string
          period_start: string | null
          provider: string
          refund_state: Database["public"]["Enums"]["payment_refund_state"]
          refunded_service_fee_pence: number
          refunded_storage_pence: number
          refunded_total_pence: number
          renter_id: string
          renter_total_amount_pence: number
          service_fee_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status: Database["public"]["Enums"]["payment_status"]
          storage_amount_pence: number
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_extension_checkout: {
        Args: { p_change_id: string }
        Returns: {
          amount_received_pence: number | null
          booking_id: string
          change_request_id: string | null
          checkout_created_at: string | null
          created_at: string
          currency: string
          currency_received: string | null
          disputed: boolean
          failed_at: string | null
          failure_reason: string | null
          hold_expires_at: string | null
          hold_released_at: string | null
          hold_volume_m3: number
          host_id: string
          id: string
          last_webhook_at: string | null
          livemode: boolean | null
          period_end: string | null
          period_index: number
          period_label: string
          period_start: string | null
          provider: string
          refund_state: Database["public"]["Enums"]["payment_refund_state"]
          refunded_service_fee_pence: number
          refunded_storage_pence: number
          refunded_total_pence: number
          renter_id: string
          renter_total_amount_pence: number
          service_fee_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status: Database["public"]["Enums"]["payment_status"]
          storage_amount_pence: number
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          succeeded_at: string | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_party_role: {
        Args: { _booking_id: string; _user_id: string }
        Returns: string
      }
      booking_stage_open: {
        Args: {
          _booking_id: string
          _stage: Database["public"]["Enums"]["handover_stage"]
        }
        Returns: boolean
      }
      cancel_booking: {
        Args: {
          p_booking_id: string
          p_reason?: string
          p_reason_category?: string
        }
        Returns: Json
      }
      claim_host_earnings_for_transfer: {
        Args: { p_limit?: number }
        Returns: {
          blocked_reason: string | null
          booking_id: string
          connected_account_id: string | null
          created_at: string
          currency: string
          eligible_at: string
          gross_storage_amount_pence: number
          hold_dispute: boolean
          hold_refund: boolean
          hold_review: boolean
          host_entitlement_pence: number
          host_user_id: string
          id: string
          last_error: string | null
          livemode: boolean | null
          payment_id: string
          period_end: string | null
          period_index: number
          period_label: string
          period_start: string | null
          platform_fee_pence: number
          refunded_storage_pence: number
          reversed_amount_pence: number
          service_fee_minimum_pence: number
          service_fee_rate_bps: number
          space_id: string
          status: Database["public"]["Enums"]["host_earning_status"]
          stripe_transfer_id: string | null
          transfer_attempted_at: string | null
          transfer_attempts: number
          transfer_created_at: string | null
          transferred_amount_pence: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "host_earnings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_guest_spacefit: { Args: { _limit?: number }; Returns: number }
      complete_booking: {
        Args: { p_booking_id: string }
        Returns: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_host_earning_transfer: {
        Args: {
          p_connected_account_id: string
          p_earning_id: string
          p_transfer_id: string
        }
        Returns: Json
      }
      confirm_booking_collection: {
        Args: { p_booking_id: string }
        Returns: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_booking_handover: {
        Args: { p_booking_id: string }
        Returns: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_booking_payment: {
        Args: {
          p_amount_pence: number
          p_currency: string
          p_event_id: string
          p_event_type: string
          p_livemode: boolean
          p_payment_id: string
          p_payment_intent_id: string
          p_session_id: string
        }
        Returns: Json
      }
      create_booking_from_request: {
        Args: { p_request_id: string }
        Returns: {
          activated_at: string | null
          cancellation_policy_version: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          compatibility_snapshot: Json | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          duration_days_snapshot: number | null
          end_date: string
          estimated_storage_requirement_m3_snapshot: number
          host_accepted_at: string | null
          host_collection_confirmed_at: string | null
          host_handover_confirmed_at: string | null
          host_id: string
          id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          paid_at: string | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_collection_confirmed_at: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_handover_confirmed_at: string | null
          renter_id: string
          renter_total_amount_pence: number | null
          request_id: string
          service_fee_amount_pence: number | null
          service_fee_minimum_pence: number | null
          service_fee_rate_bps: number | null
          space_area_snapshot: string | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          storage_amount_pence: number | null
          updated_at: string
          vat_amount_pence: number
          vat_policy_status: string
          vat_rate_percent: number | null
          weekly_rate_snapshot: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_policy_draft: {
        Args: {
          p_copy_rules_from?: string
          p_sections?: Json
          p_summary?: string
          p_title: string
          p_version: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          legal_review_required: boolean
          published_at: string | null
          retired_at: string | null
          sections: Json
          status: Database["public"]["Enums"]["policy_version_status"]
          summary: string
          title: string
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "storage_policy_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_storage_request: {
        Args: {
          p_declaration?: Json
          p_end_date: string
          p_inventory_id: string
          p_renter_note?: string
          p_space_id: string
          p_spacefit?: Json
          p_start_date: string
        }
        Returns: {
          booking_action_expires_at: string | null
          compatibility_snapshot: Json | null
          created_at: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          decline_reason: string | null
          duration_days_snapshot: number | null
          estimated_item_volume_m3_snapshot: number
          estimated_storage_requirement_m3_snapshot: number
          expires_at: string
          host_id: string
          id: string
          inventory_id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          inventory_line_count_snapshot: number
          largest_item_snapshot: Json | null
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          price_reviewed_amount_pence: number | null
          price_reviewed_at: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_id: string
          renter_note: string | null
          requested_end_date: string
          requested_start_date: string
          responded_at: string | null
          space_accepted_categories_snapshot: string[] | null
          space_access_summary_snapshot: string | null
          space_area_snapshot: string | null
          space_available_capacity_m3_snapshot: number | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          status: Database["public"]["Enums"]["storage_request_status"]
          storage_amount_pence: number | null
          updated_at: string
          weekly_rate_snapshot: number | null
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "storage_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_user_notification: {
        Args: {
          p_action_path?: string
          p_body: string
          p_booking_id?: string
          p_collapse?: boolean
          p_dedupe_key?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_priority?: Database["public"]["Enums"]["notification_priority"]
          p_recipient: string
          p_title: string
        }
        Returns: string
      }
      expire_stale_storage_requests: { Args: never; Returns: number }
      fail_host_earning_transfer: {
        Args: { p_block?: boolean; p_earning_id: string; p_reason: string }
        Returns: Json
      }
      fail_refund: {
        Args: { p_reason: string; p_refund_id: string }
        Returns: Json
      }
      get_booking_cancellation_quote: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_booking_exact_address: {
        Args: { p_booking_id: string }
        Returns: {
          access_notes: string
          address_line1: string
          address_line2: string
          postcode: string
          town: string
        }[]
      }
      get_booking_review_state: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_host_reputation: { Args: { p_host_id: string }; Returns: Json }
      get_host_response_stats: { Args: { p_host_id: string }; Returns: Json }
      get_or_create_booking_conversation: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string | null
          created_at: string
          host_archived_at: string | null
          host_id: string
          host_last_read_at: string | null
          id: string
          last_message_at: string | null
          moderation_status: string
          renter_archived_at: string | null
          renter_id: string
          renter_last_read_at: string | null
          space_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_space_conversation: {
        Args: { p_space_id: string }
        Returns: {
          booking_id: string | null
          created_at: string
          host_archived_at: string | null
          host_id: string
          host_last_read_at: string | null
          id: string
          last_message_at: string | null
          moderation_status: string
          renter_archived_at: string | null
          renter_id: string
          renter_last_read_at: string | null
          space_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_host_profile: { Args: { p_space_id: string }; Returns: Json }
      get_public_policy_rules: {
        Args: { p_version_id: string }
        Returns: {
          category: string
          decision: Database["public"]["Enums"]["policy_decision"]
          id: string
          is_active: boolean
          policy_version_id: string
          renter_message: string
          required_space_attributes: Json
          requires_user_confirmation: boolean
          rule_key: string
          severity: number
          sort_order: number
          subcategory: string
        }[]
      }
      get_published_space: {
        Args: { space_id: string }
        Returns: {
          accepted_categories: string[]
          access_frequency: Database["public"]["Enums"]["space_access_frequency"]
          access_notes: string
          access_type: Database["public"]["Enums"]["space_access_type"]
          approximate_area: string
          availability_mode: string
          available_from: string
          available_until: string
          currency: string
          daily_price_pence: number
          description: string
          door_height_cm: number
          door_width_cm: number
          estimated_available_volume_m3: number
          features: string[]
          floor_area_m2: number
          ground_floor_access: boolean
          height_m: number
          host_available_percentage: number
          host_display_name: string
          host_phone_verified: boolean
          host_response_stats: Json
          host_restrictions: string[]
          id: string
          length_m: number
          lift_available: Database["public"]["Enums"]["tri_state"]
          measurement_source: string
          measurements_verified_at: string
          minimum_stay_days: number
          minimum_storage_period_months: number
          moisture_condition: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence: number
          photo_paths: string[]
          postcode_district: string
          published_at: string
          restriction_notes: string
          space_type: Database["public"]["Enums"]["space_type"]
          stairs_required: boolean
          storage_mode: Database["public"]["Enums"]["storage_mode"]
          temperature_condition: Database["public"]["Enums"]["temperature_condition"]
          title: string
          total_volume_m3: number
          vehicle_access_close: boolean
          weekly_price_pence: number
          width_m: number
        }[]
      }
      get_published_spaces: {
        Args: { limit_count?: number }
        Returns: {
          accepted_categories: string[]
          access_frequency: Database["public"]["Enums"]["space_access_frequency"]
          access_type: Database["public"]["Enums"]["space_access_type"]
          approx_latitude: number
          approx_longitude: number
          approximate_area: string
          cover_path: string
          currency: string
          description: string
          door_height_cm: number
          door_width_cm: number
          estimated_available_volume_m3: number
          features: string[]
          floor_area_m2: number
          ground_floor_access: boolean
          host_available_percentage: number
          host_display_name: string
          host_phone_verified: boolean
          host_restrictions: string[]
          id: string
          lift_available: Database["public"]["Enums"]["tri_state"]
          minimum_storage_period_months: number
          moisture_condition: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence: number
          photo_count: number
          postcode_district: string
          published_at: string
          restriction_notes: string
          space_type: Database["public"]["Enums"]["space_type"]
          stairs_required: boolean
          storage_mode: Database["public"]["Enums"]["storage_mode"]
          temperature_condition: Database["public"]["Enums"]["temperature_condition"]
          title: string
          total_volume_m3: number
          vehicle_access_close: boolean
        }[]
      }
      get_renter_reputation: { Args: { p_renter_id: string }; Returns: Json }
      get_space_review_summary: { Args: { p_space_id: string }; Returns: Json }
      get_space_reviews: {
        Args: { p_limit?: number; p_offset?: number; p_space_id: string }
        Returns: {
          author_name: string
          id: string
          rating: number
          rating_access: number
          rating_accuracy: number
          rating_communication: number
          rating_condition: number
          review_text: string
          submitted_at: string
        }[]
      }
      get_space_suitability_public: {
        Args: { p_space_id: string }
        Returns: Json
      }
      get_space_unavailable_dates: {
        Args: { p_space_id: string }
        Returns: {
          end_date: string
          reason: string
          start_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_miles: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      inventory_recalculate: { Args: { target: string }; Returns: undefined }
      is_booking_participant: {
        Args: { _booking_id: string; _user_id: string }
        Returns: boolean
      }
      is_booking_participant_text: {
        Args: { _booking_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_support_staff: { Args: { _user_id?: string }; Returns: boolean }
      list_my_conversations: {
        Args: { p_archived?: boolean }
        Returns: {
          archived: boolean
          booking_id: string
          booking_status: string
          counterpart_name: string
          counterpart_role: string
          cover_path: string
          id: string
          last_message_at: string
          last_message_preview: string
          moderation_status: string
          space_id: string
          space_title: string
          unread_count: number
        }[]
      }
      list_reported_reviews: { Args: { p_limit?: number }; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_host_earnings_eligible: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string; p_read?: boolean }
        Returns: undefined
      }
      mark_refund_submitted: {
        Args: {
          p_charge_id?: string
          p_refund_id: string
          p_stripe_refund_id: string
        }
        Returns: Json
      }
      moderate_booking_review: {
        Args: { p_action: string; p_reason?: string; p_review_id: string }
        Returns: {
          booking_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: Database["public"]["Enums"]["review_moderation_status"]
          published_at: string | null
          rating: number
          rating_access: number | null
          rating_accuracy: number | null
          rating_communication: number | null
          rating_condition: number | null
          review_text: string | null
          review_window_closes_at: string
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
          space_id: string
          submitted_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_conversation: {
        Args: { p_conversation_id: string; p_status: string }
        Returns: undefined
      }
      notification_booking_path: {
        Args: { p_audience: string; p_booking_id: string }
        Returns: string
      }
      open_support_case: {
        Args: {
          p_booking_id: string
          p_category: Database["public"]["Enums"]["support_case_category"]
          p_description: string
          p_handover_issue_id?: string
          p_stage: Database["public"]["Enums"]["support_case_stage"]
          p_summary: string
        }
        Returns: {
          assigned_to_user_id: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at: string | null
          created_at: string
          description: string
          financially_resolved: boolean
          host_id: string
          id: string
          last_activity_at: string
          linked_handover_issue_id: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency: string | null
          refund_total_pence: number
          renter_id: string
          resolution_code:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status: Database["public"]["Enums"]["support_case_status"]
          submitted_at: string
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_support_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_policy_version: {
        Args: { p_effective_at?: string; p_version_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          legal_review_required: boolean
          published_at: string | null
          retired_at: string | null
          sections: Json
          status: Database["public"]["Enums"]["policy_version_status"]
          summary: string
          title: string
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "storage_policy_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_charge_refund: {
        Args: {
          p_charge_id: string
          p_currency: string
          p_event_id: string
          p_payment_id: string
          p_refunded_total_pence: number
        }
        Returns: Json
      }
      record_host_earning: { Args: { p_payment_id: string }; Returns: string }
      record_host_earning_reversal: {
        Args: { p_earning_id: string; p_reversed_pence: number }
        Returns: Json
      }
      record_payment_failure: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_livemode: boolean
          p_payment_id: string
          p_reason: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: Json
      }
      record_stripe_dispute: {
        Args: {
          p_amount_pence: number
          p_charge_id: string
          p_closed?: boolean
          p_currency: string
          p_dispute_id: string
          p_livemode: boolean
          p_payment_intent_id: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      report_booking_review: {
        Args: {
          p_details?: string
          p_reason: Database["public"]["Enums"]["review_report_reason"]
          p_review_id: string
        }
        Returns: {
          booking_id: string
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["review_report_reason"]
          reported_by: string
          resolved_at: string | null
          review_id: string
          status: Database["public"]["Enums"]["review_report_status"]
        }
        SetofOptions: {
          from: "*"
          to: "booking_review_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_conversation: {
        Args: {
          p_conversation_id: string
          p_details?: string
          p_reason: string
        }
        Returns: string
      }
      request_booking_extension: {
        Args: { p_booking_id: string; p_new_end_date: string; p_note?: string }
        Returns: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at: string
          currency: string
          host_id: string
          host_response_note: string | null
          id: string
          kind: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note: string | null
          requested_by: string
          requested_by_role: string
          responded_at: string | null
          responded_by: string | null
          space_id: string
          status: Database["public"]["Enums"]["booking_change_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_early_termination: {
        Args: {
          p_booking_id: string
          p_proposed_end_date: string
          p_reason?: string
          p_reason_category?: string
        }
        Returns: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at: string
          currency: string
          host_id: string
          host_response_note: string | null
          id: string
          kind: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note: string | null
          requested_by: string
          requested_by_role: string
          responded_at: string | null
          responded_by: string | null
          space_id: string
          status: Database["public"]["Enums"]["booking_change_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_booking_extension: {
        Args: { p_accept: boolean; p_change_id: string; p_note?: string }
        Returns: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at: string
          currency: string
          host_id: string
          host_response_note: string | null
          id: string
          kind: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note: string | null
          requested_by: string
          requested_by_role: string
          responded_at: string | null
          responded_by: string | null
          space_id: string
          status: Database["public"]["Enums"]["booking_change_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_early_termination: {
        Args: { p_accept: boolean; p_change_id: string; p_note?: string }
        Returns: {
          additional_days: number
          additional_service_fee_pence: number
          additional_storage_amount_pence: number
          additional_total_pence: number
          booking_id: string
          created_at: string
          currency: string
          host_id: string
          host_response_note: string | null
          id: string
          kind: string
          original_end_date: string
          original_start_date: string
          pricing_breakdown: Json | null
          pricing_version: string
          proposed_end_date: string
          proposed_start_date: string
          renter_id: string
          renter_note: string | null
          requested_by: string
          requested_by_role: string
          responded_at: string | null
          responded_by: string | null
          space_id: string
          status: Database["public"]["Enums"]["booking_change_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_storage_request: {
        Args: {
          p_decision: string
          p_decline_reason?: string
          p_request_id: string
        }
        Returns: {
          booking_action_expires_at: string | null
          compatibility_snapshot: Json | null
          created_at: string
          currency_snapshot: string
          daily_rate_snapshot: number | null
          decline_reason: string | null
          duration_days_snapshot: number | null
          estimated_item_volume_m3_snapshot: number
          estimated_storage_requirement_m3_snapshot: number
          expires_at: string
          host_id: string
          id: string
          inventory_id: string
          inventory_item_count_snapshot: number
          inventory_items_snapshot: Json
          inventory_line_count_snapshot: number
          largest_item_snapshot: Json | null
          minimum_stay_days_snapshot: number | null
          monthly_price_snapshot: number | null
          policy_screening_snapshot: Json | null
          policy_version_id_snapshot: string | null
          policy_version_snapshot: string | null
          price_reviewed_amount_pence: number | null
          price_reviewed_at: string | null
          pricing_breakdown_snapshot: Json | null
          pricing_version_snapshot: string | null
          renter_declaration_snapshot: Json | null
          renter_first_name_snapshot: string | null
          renter_id: string
          renter_note: string | null
          requested_end_date: string
          requested_start_date: string
          responded_at: string | null
          space_accepted_categories_snapshot: string[] | null
          space_access_summary_snapshot: string | null
          space_area_snapshot: string | null
          space_available_capacity_m3_snapshot: number | null
          space_id: string
          space_postcode_district_snapshot: string | null
          space_suitability_snapshot: Json | null
          space_title_snapshot: string | null
          space_type_snapshot: string | null
          spacefit_algorithm_snapshot: string | null
          spacefit_breakdown_snapshot: Json | null
          spacefit_label_snapshot: string | null
          spacefit_plan_snapshot: Json | null
          spacefit_score_snapshot: number | null
          spacefit_space_dimensions_snapshot: Json | null
          status: Database["public"]["Enums"]["storage_request_status"]
          storage_amount_pence: number | null
          updated_at: string
          weekly_rate_snapshot: number | null
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "storage_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_publication_ready: {
        Args: {
          _booking_id: string
          _reviewer_id: string
          _window_closes_at: string
        }
        Returns: boolean
      }
      screen_my_inventory: { Args: { p_inventory_id: string }; Returns: Json }
      search_published_spaces: {
        Args: {
          limit_count?: number
          radius_miles?: number
          search_lat?: number
          search_lng?: number
        }
        Returns: {
          accepted_categories: string[]
          access_frequency: Database["public"]["Enums"]["space_access_frequency"]
          access_type: Database["public"]["Enums"]["space_access_type"]
          approx_latitude: number
          approx_longitude: number
          approximate_area: string
          cover_path: string
          currency: string
          description: string
          distance_miles: number
          door_height_cm: number
          door_width_cm: number
          estimated_available_volume_m3: number
          features: string[]
          floor_area_m2: number
          ground_floor_access: boolean
          host_available_percentage: number
          host_display_name: string
          host_phone_verified: boolean
          host_restrictions: string[]
          id: string
          lift_available: Database["public"]["Enums"]["tri_state"]
          minimum_storage_period_months: number
          moisture_condition: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence: number
          photo_count: number
          postcode_district: string
          published_at: string
          restriction_notes: string
          space_type: Database["public"]["Enums"]["space_type"]
          stairs_required: boolean
          storage_mode: Database["public"]["Enums"]["storage_mode"]
          temperature_condition: Database["public"]["Enums"]["temperature_condition"]
          title: string
          total_volume_m3: number
          vehicle_access_close: boolean
        }[]
      }
      set_conversation_archived: {
        Args: { p_archived: boolean; p_conversation_id: string }
        Returns: undefined
      }
      space_available_volume_m3: {
        Args: {
          p_end: string
          p_exclude_booking?: string
          p_space_id: string
          p_start: string
        }
        Returns: number
      }
      stow_active_policy_version: {
        Args: never
        Returns: {
          created_at: string
          created_by: string | null
          effective_at: string | null
          id: string
          legal_review_required: boolean
          published_at: string | null
          retired_at: string | null
          sections: Json
          status: Database["public"]["Enums"]["policy_version_status"]
          summary: string
          title: string
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "storage_policy_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stow_assert_within_availability: {
        Args: { p_end: string; p_space_id: string; p_start: string }
        Returns: undefined
      }
      stow_cancellation_policy_version: { Args: never; Returns: string }
      stow_effective_rates: {
        Args: { p_daily: number; p_monthly: number; p_weekly: number }
        Returns: {
          daily: number
          monthly: number
          weekly: number
        }[]
      }
      stow_payout_eligible_at: {
        Args: { p_start_date: string }
        Returns: string
      }
      stow_payout_release_delay_hours: { Args: never; Returns: number }
      stow_policy_category: {
        Args: {
          p_catalogue_key?: string
          p_category: string
          p_item_name: string
        }
        Returns: string
      }
      stow_pricing_breakdown: {
        Args: {
          p_daily: number
          p_end: string
          p_monthly: number
          p_start: string
          p_weekly: number
        }
        Returns: Json
      }
      stow_pricing_version: { Args: never; Returns: string }
      stow_recompute_earning_status: {
        Args: { p_earning_id: string }
        Returns: Database["public"]["Enums"]["host_earning_status"]
      }
      stow_request_price_state: {
        Args: { p_request_id: string }
        Returns: Json
      }
      stow_review_window_days: { Args: never; Returns: number }
      stow_screen_inventory: {
        Args: { p_inventory_id: string; p_user_id: string }
        Returns: Json
      }
      stow_service_fee_pence: {
        Args: {
          p_minimum_pence?: number
          p_rate_bps?: number
          p_storage_pence: number
        }
        Returns: number
      }
      stow_storage_price_pence: {
        Args: {
          p_daily: number
          p_end: string
          p_monthly: number
          p_start: string
          p_weekly: number
        }
        Returns: number
      }
      submit_booking_review: {
        Args: {
          p_access?: number
          p_accuracy?: number
          p_booking_id: string
          p_communication?: number
          p_condition?: number
          p_rating: number
          p_review_text?: string
        }
        Returns: {
          booking_id: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: Database["public"]["Enums"]["review_moderation_status"]
          published_at: string | null
          rating: number
          rating_access: number | null
          rating_accuracy: number | null
          rating_communication: number | null
          rating_condition: number | null
          review_text: string | null
          review_window_closes_at: string
          reviewee_id: string
          reviewer_id: string
          reviewer_role: string
          space_id: string
          submitted_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_add_note: {
        Args: { p_case_id: string; p_note: string }
        Returns: undefined
      }
      support_assign_case: {
        Args: { p_assignee: string; p_case_id: string }
        Returns: {
          assigned_to_user_id: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at: string | null
          created_at: string
          description: string
          financially_resolved: boolean
          host_id: string
          id: string
          last_activity_at: string
          linked_handover_issue_id: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency: string | null
          refund_total_pence: number
          renter_id: string
          resolution_code:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status: Database["public"]["Enums"]["support_case_status"]
          submitted_at: string
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_support_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_case_refundable: {
        Args: { p_case_id: string }
        Returns: {
          currency: string
          is_extension: boolean
          paid_pence: number
          payment_id: string
          period_index: number
          period_label: string
          refunded_pence: number
          remaining_pence: number
        }[]
      }
      support_post_update: {
        Args: { p_case_id: string; p_message: string }
        Returns: undefined
      }
      support_record_resolution: {
        Args: {
          p_case_id: string
          p_close?: boolean
          p_internal_note?: string
          p_resolution_code: Database["public"]["Enums"]["support_resolution_code"]
          p_resolution_summary: string
        }
        Returns: {
          assigned_to_user_id: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at: string | null
          created_at: string
          description: string
          financially_resolved: boolean
          host_id: string
          id: string
          last_activity_at: string
          linked_handover_issue_id: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency: string | null
          refund_total_pence: number
          renter_id: string
          resolution_code:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status: Database["public"]["Enums"]["support_case_status"]
          submitted_at: string
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_support_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_resolve_case_with_refund: {
        Args: {
          p_amount_pence: number
          p_case_id: string
          p_internal_note?: string
          p_payment_id: string
          p_resolution_summary: string
        }
        Returns: Json
      }
      support_set_status: {
        Args: {
          p_case_id: string
          p_message?: string
          p_status: Database["public"]["Enums"]["support_case_status"]
        }
        Returns: {
          assigned_to_user_id: string | null
          booking_id: string
          category: Database["public"]["Enums"]["support_case_category"]
          closed_at: string | null
          created_at: string
          description: string
          financially_resolved: boolean
          host_id: string
          id: string
          last_activity_at: string
          linked_handover_issue_id: string | null
          opened_by_role: string
          opened_by_user_id: string
          reference: string
          refund_currency: string | null
          refund_total_pence: number
          renter_id: string
          resolution_code:
            | Database["public"]["Enums"]["support_resolution_code"]
            | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["support_case_stage"]
          status: Database["public"]["Enums"]["support_case_status"]
          submitted_at: string
          summary: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_support_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unread_notification_count: { Args: never; Returns: number }
      upsert_host_payout_account: {
        Args: {
          p_charges_enabled: boolean
          p_country: string
          p_currently_due: Json
          p_details_submitted: boolean
          p_disabled_reason: string
          p_eventually_due: Json
          p_host_user_id: string
          p_livemode: boolean
          p_payouts_enabled: boolean
          p_pending_verification: Json
          p_stripe_account_id: string
          p_transfers_capability: string
        }
        Returns: {
          charges_enabled: boolean
          country: string | null
          created_at: string
          currently_due: Json
          details_submitted: boolean
          disabled_reason: string | null
          eventually_due: Json
          host_user_id: string
          id: string
          last_synced_at: string | null
          livemode: boolean | null
          onboarding_started_at: string | null
          payouts_enabled: boolean
          pending_verification: Json
          status: Database["public"]["Enums"]["host_payout_status"]
          stripe_account_id: string
          transfers_capability: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "host_payout_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      analysis_run_status:
        | "queued"
        | "running"
        | "completed"
        | "partial"
        | "failed"
      app_role: "support" | "admin"
      booking_change_status:
        | "pending"
        | "accepted_awaiting_payment"
        | "declined"
        | "withdrawn"
        | "applied"
      booking_status:
        | "pending_payment"
        | "confirmed"
        | "active"
        | "cancelled"
        | "completed"
      cancellation_resolution:
        | "not_required"
        | "refund_pending"
        | "refunded"
        | "review_required"
        | "resolved"
      detection_review_status: "pending" | "confirmed" | "edited" | "rejected"
      handover_issue_category:
        | "items_differ"
        | "quantity_differs"
        | "condition_concern"
        | "access_problem"
        | "restricted_item"
        | "other"
      handover_stage: "check_in" | "check_out"
      host_earning_status:
        | "pending"
        | "eligible"
        | "transferring"
        | "transferred"
        | "reversed"
        | "partially_reversed"
        | "blocked"
      host_liability_source:
        | "refund"
        | "dispute"
        | "chargeback"
        | "manual_adjustment"
      host_liability_status:
        | "outstanding"
        | "offset"
        | "recovered"
        | "cancelled"
        | "written_off"
      host_payout_status:
        | "not_started"
        | "incomplete"
        | "pending_verification"
        | "restricted"
        | "ready"
      inventory_item_category:
        | "boxes"
        | "bags"
        | "furniture"
        | "appliances"
        | "electronics"
        | "bicycles"
        | "sports"
        | "student"
        | "business"
        | "documents"
        | "other"
      inventory_photo_status:
        | "uploaded"
        | "pending"
        | "analysed"
        | "failed"
        | "queued"
        | "analysing"
      inventory_status: "draft" | "ready" | "archived"
      item_size_source: "catalogue_estimate" | "user_measured" | "unknown"
      item_tri_state: "yes" | "no" | "unknown"
      listing_status: "draft" | "published" | "paused" | "archived"
      moisture_condition: "dry" | "some_humidity" | "unknown"
      notification_priority: "informational" | "action_required" | "important"
      payment_refund_state:
        | "none"
        | "pending"
        | "partially_refunded"
        | "refunded"
      payment_status:
        | "requires_payment"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "expired"
      policy_decision:
        | "allowed"
        | "allowed_with_confirmation"
        | "restricted"
        | "prohibited"
        | "needs_identification"
        | "needs_review"
      policy_version_status: "draft" | "published" | "retired"
      refund_initiator:
        | "renter"
        | "host"
        | "admin"
        | "stripe_dispute"
        | "system"
      refund_status: "pending" | "succeeded" | "failed" | "cancelled"
      review_moderation_status: "visible" | "under_review" | "hidden"
      review_report_reason:
        | "personal_information"
        | "abusive"
        | "discriminatory"
        | "unrelated"
        | "spam"
        | "other"
      review_report_status: "open" | "actioned" | "dismissed"
      space_access_frequency:
        | "occasional"
        | "monthly"
        | "few_times_month"
        | "weekly"
        | "flexible"
      space_access_type:
        | "by_arrangement"
        | "host_present"
        | "daytime"
        | "independent"
        | "anytime"
      space_type:
        | "garage"
        | "spare_room"
        | "loft"
        | "shed"
        | "basement"
        | "storage_room"
        | "outbuilding"
        | "commercial"
        | "other"
      storage_mode: "whole" | "partial"
      storage_request_status:
        | "pending"
        | "withdrawn"
        | "expired"
        | "accepted"
        | "declined"
        | "reserved"
        | "confirmed"
        | "active"
        | "completed"
        | "cancelled"
        | "disputed"
      support_case_category:
        | "inventory_mismatch"
        | "quantity_mismatch"
        | "belongings_damage"
        | "space_damage"
        | "condition_concern"
        | "access_problem"
        | "handover_problem"
        | "collection_problem"
        | "prohibited_item"
        | "missing_belongings"
        | "cancellation_problem"
        | "extension_problem"
        | "payment_problem"
        | "refund_problem"
        | "other"
      support_case_stage:
        | "before_storage"
        | "checkin"
        | "during_storage"
        | "checkout"
        | "after_storage"
        | "cancellation"
        | "extension"
        | "payment"
        | "other"
      support_case_status:
        | "open"
        | "waiting_for_other_party"
        | "waiting_for_reporter"
        | "under_review"
        | "resolved"
        | "closed"
      support_resolution_code:
        | "no_action"
        | "information_only"
        | "agreement_reached"
        | "refund_full"
        | "refund_partial"
        | "host_adjustment"
        | "renter_adjustment"
        | "booking_cancelled"
        | "other"
      temperature_condition: "normal_indoor" | "unheated" | "unknown"
      tri_state: "yes" | "no" | "not_applicable"
      user_mode: "renter" | "host"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analysis_run_status: [
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
      ],
      app_role: ["support", "admin"],
      booking_change_status: [
        "pending",
        "accepted_awaiting_payment",
        "declined",
        "withdrawn",
        "applied",
      ],
      booking_status: [
        "pending_payment",
        "confirmed",
        "active",
        "cancelled",
        "completed",
      ],
      cancellation_resolution: [
        "not_required",
        "refund_pending",
        "refunded",
        "review_required",
        "resolved",
      ],
      detection_review_status: ["pending", "confirmed", "edited", "rejected"],
      handover_issue_category: [
        "items_differ",
        "quantity_differs",
        "condition_concern",
        "access_problem",
        "restricted_item",
        "other",
      ],
      handover_stage: ["check_in", "check_out"],
      host_earning_status: [
        "pending",
        "eligible",
        "transferring",
        "transferred",
        "reversed",
        "partially_reversed",
        "blocked",
      ],
      host_liability_source: [
        "refund",
        "dispute",
        "chargeback",
        "manual_adjustment",
      ],
      host_liability_status: [
        "outstanding",
        "offset",
        "recovered",
        "cancelled",
        "written_off",
      ],
      host_payout_status: [
        "not_started",
        "incomplete",
        "pending_verification",
        "restricted",
        "ready",
      ],
      inventory_item_category: [
        "boxes",
        "bags",
        "furniture",
        "appliances",
        "electronics",
        "bicycles",
        "sports",
        "student",
        "business",
        "documents",
        "other",
      ],
      inventory_photo_status: [
        "uploaded",
        "pending",
        "analysed",
        "failed",
        "queued",
        "analysing",
      ],
      inventory_status: ["draft", "ready", "archived"],
      item_size_source: ["catalogue_estimate", "user_measured", "unknown"],
      item_tri_state: ["yes", "no", "unknown"],
      listing_status: ["draft", "published", "paused", "archived"],
      moisture_condition: ["dry", "some_humidity", "unknown"],
      notification_priority: ["informational", "action_required", "important"],
      payment_refund_state: [
        "none",
        "pending",
        "partially_refunded",
        "refunded",
      ],
      payment_status: [
        "requires_payment",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "expired",
      ],
      policy_decision: [
        "allowed",
        "allowed_with_confirmation",
        "restricted",
        "prohibited",
        "needs_identification",
        "needs_review",
      ],
      policy_version_status: ["draft", "published", "retired"],
      refund_initiator: ["renter", "host", "admin", "stripe_dispute", "system"],
      refund_status: ["pending", "succeeded", "failed", "cancelled"],
      review_moderation_status: ["visible", "under_review", "hidden"],
      review_report_reason: [
        "personal_information",
        "abusive",
        "discriminatory",
        "unrelated",
        "spam",
        "other",
      ],
      review_report_status: ["open", "actioned", "dismissed"],
      space_access_frequency: [
        "occasional",
        "monthly",
        "few_times_month",
        "weekly",
        "flexible",
      ],
      space_access_type: [
        "by_arrangement",
        "host_present",
        "daytime",
        "independent",
        "anytime",
      ],
      space_type: [
        "garage",
        "spare_room",
        "loft",
        "shed",
        "basement",
        "storage_room",
        "outbuilding",
        "commercial",
        "other",
      ],
      storage_mode: ["whole", "partial"],
      storage_request_status: [
        "pending",
        "withdrawn",
        "expired",
        "accepted",
        "declined",
        "reserved",
        "confirmed",
        "active",
        "completed",
        "cancelled",
        "disputed",
      ],
      support_case_category: [
        "inventory_mismatch",
        "quantity_mismatch",
        "belongings_damage",
        "space_damage",
        "condition_concern",
        "access_problem",
        "handover_problem",
        "collection_problem",
        "prohibited_item",
        "missing_belongings",
        "cancellation_problem",
        "extension_problem",
        "payment_problem",
        "refund_problem",
        "other",
      ],
      support_case_stage: [
        "before_storage",
        "checkin",
        "during_storage",
        "checkout",
        "after_storage",
        "cancellation",
        "extension",
        "payment",
        "other",
      ],
      support_case_status: [
        "open",
        "waiting_for_other_party",
        "waiting_for_reporter",
        "under_review",
        "resolved",
        "closed",
      ],
      support_resolution_code: [
        "no_action",
        "information_only",
        "agreement_reached",
        "refund_full",
        "refund_partial",
        "host_adjustment",
        "renter_adjustment",
        "booking_cancelled",
        "other",
      ],
      temperature_condition: ["normal_indoor", "unheated", "unknown"],
      tri_state: ["yes", "no", "not_applicable"],
      user_mode: ["renter", "host"],
    },
  },
} as const
