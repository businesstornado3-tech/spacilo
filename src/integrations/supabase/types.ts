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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
          model: string
          notes: string | null
          orientation_suggestion: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group: string | null
          possible_restricted_item: boolean
          provider: string
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
          model: string
          notes?: string | null
          orientation_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group?: string | null
          possible_restricted_item?: boolean
          provider: string
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
          model?: string
          notes?: string | null
          orientation_suggestion?: Database["public"]["Enums"]["item_tri_state"]
          possible_duplicate_group?: string | null
          possible_restricted_item?: boolean
          provider?: string
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
          approximate_area: string | null
          created_at: string
          currency: string
          description: string
          dimensions_unknown: boolean
          door_height_cm: number | null
          door_width_cm: number | null
          estimated_available_volume_m3: number | null
          features: string[]
          floor_area_m2: number | null
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
          minimum_storage_period_months: number
          moisture_condition: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence: number | null
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
          approximate_area?: string | null
          created_at?: string
          currency?: string
          description?: string
          dimensions_unknown?: boolean
          door_height_cm?: number | null
          door_width_cm?: number | null
          estimated_available_volume_m3?: number | null
          features?: string[]
          floor_area_m2?: number | null
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
          minimum_storage_period_months?: number
          moisture_condition?: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence?: number | null
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
          approximate_area?: string | null
          created_at?: string
          currency?: string
          description?: string
          dimensions_unknown?: boolean
          door_height_cm?: number | null
          door_width_cm?: number | null
          estimated_available_volume_m3?: number | null
          features?: string[]
          floor_area_m2?: number | null
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
          minimum_storage_period_months?: number
          moisture_condition?: Database["public"]["Enums"]["moisture_condition"]
          monthly_price_pence?: number | null
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
          width_m?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_published_space: {
        Args: { space_id: string }
        Returns: {
          accepted_categories: string[]
          access_frequency: Database["public"]["Enums"]["space_access_frequency"]
          access_notes: string
          access_type: Database["public"]["Enums"]["space_access_type"]
          approximate_area: string
          currency: string
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
          host_restrictions: string[]
          id: string
          length_m: number
          lift_available: Database["public"]["Enums"]["tri_state"]
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
          width_m: number
        }[]
      }
      get_published_spaces: {
        Args: { limit_count?: number }
        Returns: {
          accepted_categories: string[]
          access_frequency: Database["public"]["Enums"]["space_access_frequency"]
          access_type: Database["public"]["Enums"]["space_access_type"]
          approximate_area: string
          cover_path: string
          currency: string
          description: string
          estimated_available_volume_m3: number
          features: string[]
          floor_area_m2: number
          host_available_percentage: number
          host_display_name: string
          host_phone_verified: boolean
          id: string
          latitude: number
          longitude: number
          minimum_storage_period_months: number
          monthly_price_pence: number
          postcode_district: string
          published_at: string
          space_type: Database["public"]["Enums"]["space_type"]
          storage_mode: Database["public"]["Enums"]["storage_mode"]
          title: string
          total_volume_m3: number
        }[]
      }
      inventory_recalculate: { Args: { target: string }; Returns: undefined }
    }
    Enums: {
      analysis_run_status:
        | "queued"
        | "running"
        | "completed"
        | "partial"
        | "failed"
      detection_review_status: "pending" | "confirmed" | "edited" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      detection_review_status: ["pending", "confirmed", "edited", "rejected"],
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
      temperature_condition: ["normal_indoor", "unheated", "unknown"],
      tri_state: ["yes", "no", "not_applicable"],
      user_mode: ["renter", "host"],
    },
  },
} as const
