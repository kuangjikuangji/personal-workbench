export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      app_settings: {
        Row: {
          deleted_at: string | null
          key: string
          server_updated_at: string
          updated_at: string
          user_id: string
          value: Json | null
        }
        Insert: {
          deleted_at?: string | null
          key: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
          value?: Json | null
        }
        Update: {
          deleted_at?: string | null
          key?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
          value?: Json | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_time: string
          end_week: number
          id: string
          location: string
          name: string
          notes: string
          semester_id: string
          server_updated_at: string
          start_time: string
          start_week: number
          teacher: string
          updated_at: string
          user_id: string
          week_rule: Json
          weekday: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_time: string
          end_week: number
          id?: string
          location: string
          name: string
          notes: string
          semester_id: string
          server_updated_at?: string
          start_time: string
          start_week: number
          teacher: string
          updated_at?: string
          user_id?: string
          week_rule: Json
          weekday: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_time?: string
          end_week?: number
          id?: string
          location?: string
          name?: string
          notes?: string
          semester_id?: string
          server_updated_at?: string
          start_time?: string
          start_week?: number
          teacher?: string
          updated_at?: string
          user_id?: string
          week_rule?: Json
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_semester_fk"
            columns: ["user_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      ideas: {
        Row: {
          archived_at: string | null
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          pinned: boolean
          server_updated_at: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          pinned: boolean
          server_updated_at?: string
          tags: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          pinned?: boolean
          server_updated_at?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learning_methods: {
        Row: {
          created_at: string
          deleted_at: string | null
          evaluation: string
          id: string
          name: string
          scenario: string
          server_updated_at: string
          steps: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          evaluation: string
          id?: string
          name: string
          scenario: string
          server_updated_at?: string
          steps: string
          tags: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          evaluation?: string
          id?: string
          name?: string
          scenario?: string
          server_updated_at?: string
          steps?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_plans: {
        Row: {
          activities: string
          chapter: string
          course_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          objectives: string
          outline: string
          planned_date: string | null
          resources: string
          server_updated_at: string
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activities: string
          chapter: string
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          objectives: string
          outline: string
          planned_date?: string | null
          resources: string
          server_updated_at?: string
          source_id?: string | null
          source_type?: string | null
          status: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activities?: string
          chapter?: string
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          objectives?: string
          outline?: string
          planned_date?: string | null
          resources?: string
          server_updated_at?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_course_fk"
            columns: ["user_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "lesson_plans_source_idea_fk"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      mentorships: {
        Row: {
          academic_year: string
          created_at: string
          deleted_at: string | null
          grade: string
          id: string
          major: string
          notes: string
          server_updated_at: string
          status: string
          student_name: string
          teacher_id: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          deleted_at?: string | null
          grade: string
          id?: string
          major: string
          notes: string
          server_updated_at?: string
          status: string
          student_name: string
          teacher_id: string
          topic: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          deleted_at?: string | null
          grade?: string
          id?: string
          major?: string
          notes?: string
          server_updated_at?: string
          status?: string
          student_name?: string
          teacher_id?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorships_teacher_fk"
            columns: ["user_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          role: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      research_items: {
        Row: {
          abstract: string
          authors: string
          created_at: string
          deleted_at: string | null
          id: string
          notes: string
          rating: number | null
          server_updated_at: string
          source: string
          source_id: string | null
          source_type: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          url_or_doi: string
          user_id: string
          year: number | null
        }
        Insert: {
          abstract: string
          authors: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes: string
          rating?: number | null
          server_updated_at?: string
          source: string
          source_id?: string | null
          source_type?: string | null
          status: string
          tags: string[]
          title: string
          updated_at?: string
          url_or_doi: string
          user_id?: string
          year?: number | null
        }
        Update: {
          abstract?: string
          authors?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string
          rating?: number | null
          server_updated_at?: string
          source?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url_or_doi?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "research_items_source_idea_fk"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      semesters: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          server_updated_at: string
          start_date: string
          total_weeks: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active: boolean
          name: string
          server_updated_at?: string
          start_date: string
          total_weeks: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          server_updated_at?: string
          start_date?: string
          total_weeks?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_records: {
        Row: {
          category: string
          content: string
          created_at: string
          date: string
          deleted_at: string | null
          follow_up: string
          id: string
          rating: string
          server_updated_at: string
          student_id: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          date: string
          deleted_at?: string | null
          follow_up: string
          id?: string
          rating: string
          server_updated_at?: string
          student_id: string
          tags: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          follow_up?: string
          id?: string
          rating?: string
          server_updated_at?: string
          student_id?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_records_student_fk"
            columns: ["user_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      students: {
        Row: {
          archived_at: string | null
          cohort: string
          contact: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string
          program: string
          server_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          cohort: string
          contact: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notes: string
          program: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          cohort?: string
          contact?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string
          program?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_records: {
        Row: {
          content: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string
          server_updated_at: string
          status: string
          teacher_id: string
          title: string
          type: string
          updated_at: string
          user_id: string
          year: string
        }
        Insert: {
          content: string
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          notes: string
          server_updated_at?: string
          status: string
          teacher_id: string
          title: string
          type: string
          updated_at?: string
          user_id?: string
          year: string
        }
        Update: {
          content?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string
          server_updated_at?: string
          status?: string
          teacher_id?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_records_teacher_fk"
            columns: ["user_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      teacher_year_summaries: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          server_updated_at: string
          state: string
          teacher_id: string
          updated_at: string
          user_id: string
          year: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          server_updated_at?: string
          state: string
          teacher_id: string
          updated_at?: string
          user_id?: string
          year: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          server_updated_at?: string
          state?: string
          teacher_id?: string
          updated_at?: string
          user_id?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_year_summaries_teacher_fk"
            columns: ["user_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      teachers: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          department: string
          id: string
          name: string
          server_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          department: string
          id?: string
          name: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string
          id?: string
          name?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          end_at: string | null
          id: string
          priority: string
          remind_at: string | null
          role: string
          server_updated_at: string
          source_id: string | null
          source_type: string | null
          start_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          end_at?: string | null
          id?: string
          priority: string
          remind_at?: string | null
          role: string
          server_updated_at?: string
          source_id?: string | null
          source_type?: string | null
          start_at?: string | null
          status: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          end_at?: string | null
          id?: string
          priority?: string
          remind_at?: string | null
          role?: string
          server_updated_at?: string
          source_id?: string | null
          source_type?: string | null
          start_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_source_idea_fk"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_student_record: {
        Args: { p_record: Json }
        Returns: {
          category: string
          content: string
          created_at: string
          date: string
          deleted_at: string | null
          follow_up: string
          id: string
          rating: string
          server_updated_at: string
          student_id: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "student_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_teacher_record: {
        Args: { p_record: Json }
        Returns: {
          content: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string
          server_updated_at: string
          status: string
          teacher_id: string
          title: string
          type: string
          updated_at: string
          user_id: string
          year: string
        }
        SetofOptions: {
          from: "*"
          to: "teacher_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_deactivate_profile: {
        Args: { p_actor_id: string; p_target_id: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: string
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_workbench_change: {
        Args: {
          p_client_updated_at: string
          p_deleted_at: string
          p_record: Json
          p_table: string
        }
        Returns: Json
      }
      batch_teacher_records: {
        Args: { p_record: Json; p_teacher_ids: string[] }
        Returns: {
          content: string
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          notes: string
          server_updated_at: string
          status: string
          teacher_id: string
          title: string
          type: string
          updated_at: string
          user_id: string
          year: string
        }[]
        SetofOptions: {
          from: "*"
          to: "teacher_records"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      convert_idea: {
        Args: { p_idea_id: string; p_target: string }
        Returns: Json
      }
      current_user_can_access: { Args: never; Returns: boolean }
      delete_semester: { Args: { p_semester_id: string }; Returns: undefined }
      fill_missing_teacher_summaries: {
        Args: { p_year: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          server_updated_at: string
          state: string
          teacher_id: string
          updated_at: string
          user_id: string
          year: string
        }[]
        SetofOptions: {
          from: "*"
          to: "teacher_year_summaries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      import_wechat_todos: {
        Args: { p_todos: Json }
        Returns: {
          created_at: string
          deleted_at: string | null
          description: string
          end_at: string | null
          id: string
          priority: string
          remind_at: string | null
          role: string
          server_updated_at: string
          source_id: string | null
          source_type: string | null
          start_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "todos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_backup_v1: { Args: { p_backup: Json }; Returns: undefined }
      save_todo_with_conflict_check: {
        Args: { p_allow_conflicts: boolean; p_todo: Json }
        Returns: Json
      }
      set_active_semester: {
        Args: { p_semester_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          server_updated_at: string
          start_date: string
          total_weeks: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "semesters"
          isOneToOne: true
          isSetofReturn: false
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
