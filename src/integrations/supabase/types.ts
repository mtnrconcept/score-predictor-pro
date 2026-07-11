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
      fixture_lineups: {
        Row: {
          confidence: number
          confirmed: boolean
          fixture_id: string
          formation: string | null
          players: Json
          source_url: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          confirmed?: boolean
          fixture_id: string
          formation?: string | null
          players?: Json
          source_url?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          confirmed?: boolean
          fixture_id?: string
          formation?: string | null
          players?: Json
          source_url?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "sports_fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_provider_mappings: {
        Row: {
          fixture_id: string
          manually_verified: boolean
          provider: string
          provider_fixture_id: string
          raw_data: Json
          resolution_confidence: number
          updated_at: string
        }
        Insert: {
          fixture_id: string
          manually_verified?: boolean
          provider: string
          provider_fixture_id: string
          raw_data?: Json
          resolution_confidence?: number
          updated_at?: string
        }
        Update: {
          fixture_id?: string
          manually_verified?: boolean
          provider?: string
          provider_fixture_id?: string
          raw_data?: Json
          resolution_confidence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_provider_mappings_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "sports_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availability: {
        Row: {
          attack_impact: number
          defense_impact: number
          fixture_id: string | null
          id: string
          observed_at: string
          player_id: string | null
          player_name: string
          reason: string | null
          source_url: string | null
          status: string
          team_id: string
        }
        Insert: {
          attack_impact?: number
          defense_impact?: number
          fixture_id?: string | null
          id?: string
          observed_at?: string
          player_id?: string | null
          player_name: string
          reason?: string | null
          source_url?: string | null
          status: string
          team_id: string
        }
        Update: {
          attack_impact?: number
          defense_impact?: number
          fixture_id?: string | null
          id?: string
          observed_at?: string
          player_id?: string | null
          player_name?: string
          reason?: string | null
          source_url?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "sports_fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sports_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_provider_mappings: {
        Row: {
          player_id: string
          provider: string
          provider_name: string
          provider_player_id: string
          raw_data: Json
          updated_at: string
        }
        Insert: {
          player_id: string
          provider: string
          provider_name: string
          provider_player_id: string
          raw_data?: Json
          updated_at?: string
        }
        Update: {
          player_id?: string
          provider?: string
          provider_name?: string
          provider_player_id?: string
          raw_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_provider_mappings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sports_players"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_runs: {
        Row: {
          abstention_reasons: Json
          completed_at: string | null
          created_at: string
          data_quality: number | null
          engine_version: string
          error_code: string | null
          fixture_id: string | null
          id: string
          input_snapshot: Json
          match_id: string
          model: string
          result: Json | null
          status: Database["public"]["Enums"]["prediction_run_status"]
          user_id: string
        }
        Insert: {
          abstention_reasons?: Json
          completed_at?: string | null
          created_at?: string
          data_quality?: number | null
          engine_version?: string
          error_code?: string | null
          fixture_id?: string | null
          id?: string
          input_snapshot?: Json
          match_id: string
          model?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["prediction_run_status"]
          user_id: string
        }
        Update: {
          abstention_reasons?: Json
          completed_at?: string | null
          created_at?: string
          data_quality?: number | null
          engine_version?: string
          error_code?: string | null
          fixture_id?: string | null
          id?: string
          input_snapshot?: Json
          match_id?: string
          model?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["prediction_run_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_runs_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "sports_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_usage: {
        Row: {
          input_tokens: number
          output_tokens: number
          requests: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          input_tokens?: number
          output_tokens?: number
          requests?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          input_tokens?: number
          output_tokens?: number
          requests?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      predictions_cache: {
        Row: {
          abstained: boolean
          data_quality: number | null
          expires_at: string | null
          generated_at: string
          match_id: string
          model_version: string
          prediction: Json
          sport: string
        }
        Insert: {
          abstained?: boolean
          data_quality?: number | null
          expires_at?: string | null
          generated_at?: string
          match_id: string
          model_version?: string
          prediction: Json
          sport: string
        }
        Update: {
          abstained?: boolean
          data_quality?: number | null
          expires_at?: string | null
          generated_at?: string
          match_id?: string
          model_version?: string
          prediction?: Json
          sport?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      provider_import_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          provider: string
          records_received: number
          records_written: number
          requested_for: string | null
          resource: string
          started_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          provider: string
          records_received?: number
          records_written?: number
          requested_for?: string | null
          resource: string
          started_at?: string
          status: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          provider?: string
          records_received?: number
          records_written?: number
          requested_for?: string | null
          resource?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      saved_predictions: {
        Row: {
          away_team: string
          competition: string | null
          created_at: string
          home_team: string
          id: string
          match_id: string
          match_start: string | null
          prediction: Json
          sport: string
          status: string
          user_id: string
        }
        Insert: {
          away_team: string
          competition?: string | null
          created_at?: string
          home_team: string
          id?: string
          match_id: string
          match_start?: string | null
          prediction: Json
          sport: string
          status?: string
          user_id: string
        }
        Update: {
          away_team?: string
          competition?: string | null
          created_at?: string
          home_team?: string
          id?: string
          match_id?: string
          match_start?: string | null
          prediction?: Json
          sport?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      sports_fixtures: {
        Row: {
          away_score: number | null
          away_team_id: string
          away_xg: number | null
          competition_id: string | null
          competition_name: string
          created_at: string
          home_score: number | null
          home_team_id: string
          home_xg: number | null
          id: string
          provider: string
          provider_fixture_id: string
          raw_data: Json
          season: string | null
          sport: string
          starts_at: string
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          away_xg?: number | null
          competition_id?: string | null
          competition_name: string
          created_at?: string
          home_score?: number | null
          home_team_id: string
          home_xg?: number | null
          id?: string
          provider: string
          provider_fixture_id: string
          raw_data?: Json
          season?: string | null
          sport?: string
          starts_at: string
          status: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          away_xg?: number | null
          competition_id?: string | null
          competition_name?: string
          created_at?: string
          home_score?: number | null
          home_team_id?: string
          home_xg?: number | null
          id?: string
          provider?: string
          provider_fixture_id?: string
          raw_data?: Json
          season?: string | null
          sport?: string
          starts_at?: string
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_players: {
        Row: {
          created_at: string
          date_of_birth: string | null
          id: string
          name: string
          nationality: string | null
          normalized_name: string
          position: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          name: string
          nationality?: string | null
          normalized_name: string
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          id?: string
          name?: string
          nationality?: string | null
          normalized_name?: string
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_teams: {
        Row: {
          country: string | null
          created_at: string
          current_elo: number
          id: string
          logo_url: string | null
          name: string
          normalized_name: string
          sport: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          current_elo?: number
          id?: string
          logo_url?: string | null
          name: string
          normalized_name: string
          sport?: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          current_elo?: number
          id?: string
          logo_url?: string | null
          name?: string
          normalized_name?: string
          sport?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_match_metrics: {
        Row: {
          cards: number | null
          corners: number | null
          expected_goals_against: number | null
          expected_goals_for: number | null
          fixture_id: string
          goals_against: number | null
          goals_for: number | null
          is_home: boolean
          possession: number | null
          raw_data: Json
          rest_days: number | null
          shots: number | null
          shots_on_target: number | null
          team_id: string
        }
        Insert: {
          cards?: number | null
          corners?: number | null
          expected_goals_against?: number | null
          expected_goals_for?: number | null
          fixture_id: string
          goals_against?: number | null
          goals_for?: number | null
          is_home: boolean
          possession?: number | null
          raw_data?: Json
          rest_days?: number | null
          shots?: number | null
          shots_on_target?: number | null
          team_id: string
        }
        Update: {
          cards?: number | null
          corners?: number | null
          expected_goals_against?: number | null
          expected_goals_for?: number | null
          fixture_id?: string
          goals_against?: number | null
          goals_for?: number | null
          is_home?: boolean
          possession?: number | null
          raw_data?: Json
          rest_days?: number | null
          shots?: number | null
          shots_on_target?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_match_metrics_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "sports_fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_match_metrics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_provider_mappings: {
        Row: {
          manually_verified: boolean
          provider: string
          provider_name: string
          provider_team_id: string
          raw_data: Json
          resolution_confidence: number
          team_id: string
          updated_at: string
        }
        Insert: {
          manually_verified?: boolean
          provider: string
          provider_name: string
          provider_team_id: string
          raw_data?: Json
          resolution_confidence?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          manually_verified?: boolean
          provider?: string
          provider_name?: string
          provider_team_id?: string
          raw_data?: Json
          resolution_confidence?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_provider_mappings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "sports_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_secret_exists: { Args: { requested_name: string }; Returns: boolean }
      consume_prediction_quota: { Args: never; Returns: Json }
      delete_app_secret: {
        Args: { requested_name: string }
        Returns: undefined
      }
      get_app_secret: { Args: { requested_name: string }; Returns: string }
      set_app_secret: {
        Args: {
          requested_description?: string
          requested_name: string
          requested_secret: string
        }
        Returns: undefined
      }
    }
    Enums: {
      prediction_run_status:
        | "queued"
        | "running"
        | "completed"
        | "abstained"
        | "failed"
      subscription_tier: "free" | "starter" | "pro" | "enterprise"
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
      prediction_run_status: [
        "queued",
        "running",
        "completed",
        "abstained",
        "failed",
      ],
      subscription_tier: ["free", "starter", "pro", "enterprise"],
    },
  },
} as const
