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
      authorized_devices: {
        Row: {
          created_at: string
          device_id: string
          driver_id: string | null
          id: string
          is_active: boolean
          last_seen: string
          name: string
          role: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          name?: string
          role?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string
          name?: string
          role?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorized_devices_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      completed_paths: {
        Row: {
          cards: Json
          created_at: string
          driver_id: string
          driver_name: string
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          cards?: Json
          created_at?: string
          driver_id: string
          driver_name: string
          end_time?: string
          id?: string
          start_time: string
        }
        Update: {
          cards?: Json
          created_at?: string
          driver_id?: string
          driver_name?: string
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_paths_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          driver_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          area: string
          avatar: string
          created_at: string
          id: string
          is_active: boolean
          is_on_duty: boolean
          name: string
          phone: string
          route_start_time: string | null
        }
        Insert: {
          area?: string
          avatar?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_on_duty?: boolean
          name: string
          phone?: string
          route_start_time?: string | null
        }
        Update: {
          area?: string
          avatar?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_on_duty?: boolean
          name?: string
          phone?: string
          route_start_time?: string | null
        }
        Relationships: []
      }
      invoice_cards: {
        Row: {
          address: string
          client_name: string
          created_at: string
          delivered_at: string | null
          delivered_lat: number | null
          delivered_lng: number | null
          driver_id: string | null
          id: string
          invoice_number: string | null
          lat: number | null
          lng: number | null
          location: Database["public"]["Enums"]["card_location"]
          route_id: string | null
          sort_order: number
          type: Database["public"]["Enums"]["card_type"]
        }
        Insert: {
          address: string
          client_name: string
          created_at?: string
          delivered_at?: string | null
          delivered_lat?: number | null
          delivered_lng?: number | null
          driver_id?: string | null
          id?: string
          invoice_number?: string | null
          lat?: number | null
          lng?: number | null
          location?: Database["public"]["Enums"]["card_location"]
          route_id?: string | null
          sort_order?: number
          type?: Database["public"]["Enums"]["card_type"]
        }
        Update: {
          address?: string
          client_name?: string
          created_at?: string
          delivered_at?: string | null
          delivered_lat?: number | null
          delivered_lng?: number | null
          driver_id?: string | null
          id?: string
          invoice_number?: string | null
          lat?: number | null
          lng?: number | null
          location?: Database["public"]["Enums"]["card_location"]
          route_id?: string | null
          sort_order?: number
          type?: Database["public"]["Enums"]["card_type"]
        }
        Relationships: [
          {
            foreignKeyName: "invoice_cards_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_cards_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      card_location: "inbox" | "active" | "staging"
      card_type: "invoice" | "pickup"
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
      card_location: ["inbox", "active", "staging"],
      card_type: ["invoice", "pickup"],
    },
  },
} as const
