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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          email: string
          created_at: string
          app_role: 'admin' | 'member'
        }
        Insert: {
          email: string
          created_at?: string
          app_role?: 'admin' | 'member'
        }
        Update: {
          email?: string
          created_at?: string
          app_role?: 'admin' | 'member'
        }
        Relationships: []
      }
      app_invites: {
        Row: {
          id: string
          code: string
          created_by: string | null
          used_by_email: string | null
          used_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          created_by?: string | null
          used_by_email?: string | null
          used_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          created_by?: string | null
          used_by_email?: string | null
          used_at?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          user_id: string
          holiday_countries: string[]
          app_theme: string
          show_lunar: boolean
          last_label_color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          holiday_countries?: string[]
          app_theme?: string
          show_lunar?: boolean
          last_label_color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          holiday_countries?: string[]
          app_theme?: string
          show_lunar?: boolean
          last_label_color?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          remind_minutes_before: number
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          remind_minutes_before: number
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          remind_minutes_before?: number
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_members: {
        Row: {
          calendar_id: string
          user_id: string
          role: 'owner' | 'member'
          created_at: string
        }
        Insert: {
          calendar_id: string
          user_id: string
          role?: 'owner' | 'member'
          created_at?: string
        }
        Update: {
          calendar_id?: string
          user_id?: string
          role?: 'owner' | 'member'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_members_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          id: string
          family_id: string
          created_by: string
          name: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          created_by: string
          name: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          created_by?: string
          name?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      event_votes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_votes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          calendar_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string | null
          family_id: string
          id: string
          is_all_day: boolean
          is_cancelled: boolean
          label_color: string | null
          series_id: string | null
          series_occurrence_date: string | null
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_at?: string | null
          family_id: string
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          label_color?: string | null
          series_id?: string | null
          series_occurrence_date?: string | null
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string | null
          family_id?: string
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          label_color?: string | null
          series_id?: string | null
          series_occurrence_date?: string | null
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "recurrence_series"
            referencedColumns: ["id"]
          },
        ]
      }
      recurrence_rules: {
        Row: {
          id: string
          freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval: number
          days_of_week: number[] | null
          day_of_month: number | null
          end_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval?: number
          days_of_week?: number[] | null
          day_of_month?: number | null
          end_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          freq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval?: number
          days_of_week?: number[] | null
          day_of_month?: number | null
          end_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      recurrence_series: {
        Row: {
          id: string
          family_id: string
          calendar_id: string | null
          title: string
          description: string | null
          is_all_day: boolean
          start_time: string | null
          end_time: string | null
          reminder_minutes: number[]
          rule_id: string
          created_by: string
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          calendar_id?: string | null
          title: string
          description?: string | null
          is_all_day?: boolean
          start_time?: string | null
          end_time?: string | null
          reminder_minutes?: number[]
          rule_id: string
          created_by: string
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          calendar_id?: string | null
          title?: string
          description?: string | null
          is_all_day?: boolean
          start_time?: string | null
          end_time?: string | null
          reminder_minutes?: number[]
          rule_id?: string
          created_by?: string
          deleted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurrence_series_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrence_series_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          id: string
          invite_code: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          created_at: string
          display_name: string
          family_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          family_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          family_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      memos: {
        Row: {
          content: string
          created_at: string
          created_by: string
          family_id: string
          id: string
          image_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          image_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          image_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memos_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
          updated_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          created_by: string
          id: string
          is_checked: boolean
          list_id: string
          name: string
          sort_order: number
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_checked?: boolean
          list_id: string
          name: string
          sort_order?: number
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_checked?: boolean
          list_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          created_by: string
          family_id: string
          id: string
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          name: string
          sort_order?: number
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          name?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_or_create_family: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_my_family: {
        Args: { p_user_id: string }
        Returns: string | null
      }
      create_family_with_name: {
        Args: { p_user_id: string; p_name: string }
        Returns: string
      }
      consume_app_invite: {
        Args: { p_code: string; p_email: string }
        Returns: boolean
      }
      join_family_by_invite_code: {
        Args: {
          p_display_name?: string | null
          p_invite_code: string
          p_user_id: string
        }
        Returns: string
      }
      get_my_family_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_my_list_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_my_calendar_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_and_mark_due_reminders: {
        Args: Record<PropertyKey, never>
        Returns: {
          reminder_id: string
          event_title: string
          event_start: string
          family_id: string
        }[]
      }
      cleanup_sent_event_reminders: {
        Args: {
          p_retention_days?: number
        }
        Returns: number
      }
      create_event_with_reminders: {
        Args: {
          p_family_id: string
          p_created_by: string
          p_calendar_id: string | null
          p_title: string
          p_description: string | null
          p_start_at: string
          p_end_at: string | null
          p_is_all_day: boolean
          p_reminder_minutes: number[]
        }
        Returns: {
          id: string
          family_id: string
          created_by: string
          calendar_id: string | null
          title: string
          description: string | null
          start_at: string
          end_at: string | null
          is_all_day: boolean
          created_at: string
          updated_at: string
        }[]
      }
      update_event_with_reminders: {
        Args: {
          p_event_id: string
          p_title: string
          p_description: string | null
          p_start_at: string
          p_end_at: string | null
          p_is_all_day: boolean
          p_calendar_id: string | null
          p_reminder_minutes: number[] | null
        }
        Returns: undefined
      }
      create_event_authorized: {
        Args: {
          p_actor_user_id: string
          p_calendar_id: string | null
          p_title: string
          p_description: string | null
          p_start_at: string
          p_end_at: string | null
          p_is_all_day: boolean
          p_reminder_minutes: number[]
        }
        Returns: {
          id: string
          family_id: string
          created_by: string
          calendar_id: string | null
          title: string
          description: string | null
          start_at: string
          end_at: string | null
          is_all_day: boolean
          created_at: string
          updated_at: string
        }[]
      }
      update_event_authorized: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
          p_title: string | null
          p_description: string | null
          p_has_description: boolean
          p_start_at: string | null
          p_end_at: string | null
          p_has_end_at: boolean
          p_is_all_day: boolean | null
          p_calendar_id: string | null
          p_has_calendar_id: boolean
          p_reminder_minutes: number[] | null
        }
        Returns: Json
      }
      delete_event_authorized: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
        }
        Returns: Json
      }
      create_recurring_series_authorized: {
        Args: {
          p_actor_user_id: string
          p_calendar_id: string | null
          p_title: string
          p_description: string | null
          p_start_at: string
          p_end_at: string | null
          p_is_all_day: boolean
          p_reminder_minutes: number[]
          p_freq: string
          p_interval: number
          p_days_of_week: number[]
          p_day_of_month: number | null
          p_end_date: string | null
        }
        Returns: { series_id: string; event_count: number }[]
      }
      delete_series_authorized: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
          p_scope: string
          p_anchor_occurrence_date: string | null
        }
        Returns: Json
      }
      update_series_authorized: {
        Args: {
          p_actor_user_id: string
          p_event_id: string
          p_scope: string
          p_anchor_occurrence_date: string | null
          p_title: string | null
          p_description: string | null
          p_has_description: boolean
          p_start_at: string | null
          p_end_at: string | null
          p_has_end_at: boolean
          p_start_time: string | null
          p_end_time: string | null
          p_is_all_day: boolean | null
          p_calendar_id: string | null
          p_has_calendar_id: boolean
          p_reminder_minutes: number[] | null
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
