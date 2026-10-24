
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_runs": {
                  Row: {
                    "details": NonNullable<Json>,"duration_ms": number | null,"finished_at": string | null,"gh_run_id": number | null,"gh_run_url": string | null,"id": string,"issue_number": number | null,"model": string | null,"pr_number": number | null,"started_at": string,"status": Database["public"]['Enums']["agent_run_status"],"turns": number | null,"workflow": string
                  }
                  ComputedFields: never
                  Insert: {
                    "details"?: NonNullable<Json>,"duration_ms"?: number | null,"finished_at"?: string | null,"gh_run_id"?: number | null,"gh_run_url"?: string | null,"id"?: string,"issue_number"?: number | null,"model"?: string | null,"pr_number"?: number | null,"started_at"?: string,"status": Database["public"]['Enums']["agent_run_status"],"turns"?: number | null,"workflow": string
                  }
                  Update: {
                    "details"?: NonNullable<Json>,"duration_ms"?: number | null,"finished_at"?: string | null,"gh_run_id"?: number | null,"gh_run_url"?: string | null,"id"?: string,"issue_number"?: number | null,"model"?: string | null,"pr_number"?: number | null,"started_at"?: string,"status"?: Database["public"]['Enums']["agent_run_status"],"turns"?: number | null,"workflow"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_flags": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"changelog": {
                  Row: {
                    "after_screenshot_urls": (string)[],"before_screenshot_urls": (string)[],"commit_sha": string | null,"created_at": string,"feedback_ids": (string)[],"id": string,"kind": Database["public"]['Enums']["changelog_kind"],"merged_at": string,"pr_number": number | null,"pr_url": string | null,"reverts_id": string | null,"summary": string,"title": string,"trust_level": number
                  }
                  ComputedFields: never
                  Insert: {
                    "after_screenshot_urls"?: (string)[],"before_screenshot_urls"?: (string)[],"commit_sha"?: string | null,"created_at"?: string,"feedback_ids"?: (string)[],"id"?: string,"kind"?: Database["public"]['Enums']["changelog_kind"],"merged_at": string,"pr_number"?: number | null,"pr_url"?: string | null,"reverts_id"?: string | null,"summary": string,"title": string,"trust_level": number
                  }
                  Update: {
                    "after_screenshot_urls"?: (string)[],"before_screenshot_urls"?: (string)[],"commit_sha"?: string | null,"created_at"?: string,"feedback_ids"?: (string)[],"id"?: string,"kind"?: Database["public"]['Enums']["changelog_kind"],"merged_at"?: string,"pr_number"?: number | null,"pr_url"?: string | null,"reverts_id"?: string | null,"summary"?: string,"title"?: string,"trust_level"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "changelog_reverts_id_fkey"
      columns: ["reverts_id"]
isOneToOne: false
      referencedRelation: "changelog"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "action": string,"created_at": string,"feature_id": string,"id": number,"path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"feature_id": string,"id"?: never,"path": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"feature_id"?: string,"id"?: never,"path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "author_hash": string,"body": string,"category": Database["public"]['Enums']["feedback_category"],"created_at": string,"hidden": boolean,"id": string,"issue_number": number | null,"issue_url": string | null,"pr_url": string | null,"report_count": number,"status": Database["public"]['Enums']["feedback_status"],"updated_at": string,"vote_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_hash": string,"body": string,"category": Database["public"]['Enums']["feedback_category"],"created_at"?: string,"hidden"?: boolean,"id"?: string,"issue_number"?: number | null,"issue_url"?: string | null,"pr_url"?: string | null,"report_count"?: number,"status"?: Database["public"]['Enums']["feedback_status"],"updated_at"?: string,"vote_count"?: number
                  }
                  Update: {
                    "author_hash"?: string,"body"?: string,"category"?: Database["public"]['Enums']["feedback_category"],"created_at"?: string,"hidden"?: boolean,"id"?: string,"issue_number"?: number | null,"issue_url"?: string | null,"pr_url"?: string | null,"report_count"?: number,"status"?: Database["public"]['Enums']["feedback_status"],"updated_at"?: string,"vote_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"feedback_reports": {
                  Row: {
                    "created_at": string,"feedback_id": string,"id": string,"reporter_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"feedback_id": string,"id"?: string,"reporter_hash": string
                  }
                  Update: {
                    "created_at"?: string,"feedback_id"?: string,"id"?: string,"reporter_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_reports_feedback_id_fkey"
      columns: ["feedback_id"]
isOneToOne: false
      referencedRelation: "feedback"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "action": string,"created_at": string,"id": number,"ip_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: never,"ip_hash": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: never,"ip_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"votes": {
                  Row: {
                    "created_at": string,"feedback_id": string,"id": string,"ip_hash": string | null,"voter_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"feedback_id": string,"id"?: string,"ip_hash"?: string | null,"voter_hash": string
                  }
                  Update: {
                    "created_at"?: string,"feedback_id"?: string,"id"?: string,"ip_hash"?: string | null,"voter_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "votes_feedback_id_fkey"
      columns: ["feedback_id"]
isOneToOne: false
      referencedRelation: "feedback"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cast_vote":
{ Args: { "p_feedback_id": string,"p_ip_cap": number,"p_ip_hash": string,"p_voter_hash": string }; Returns: string
                           },
"consume_rate_limit":
{ Args: { "p_action": string,"p_ip_hash": string,"p_limit": number,"p_window": string }; Returns: boolean
                           }
          }
          Enums: {
            "agent_run_status": "pass"|"fail"|"skipped"|"error","changelog_kind": "change"|"revert","feedback_category": "idea"|"bug","feedback_status": "new"|"triaged"|"building"|"shipped"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "agent_run_status": ["pass", "fail", "skipped", "error"],"changelog_kind": ["change", "revert"],"feedback_category": ["idea", "bug"],"feedback_status": ["new", "triaged", "building", "shipped", "rejected"]
          }
        }
} as const
