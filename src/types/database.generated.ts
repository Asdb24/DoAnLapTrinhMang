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
      attachments: {
        Row: {
          conversation_id: string
          created_at: string
          deletion_claimed_at: string | null
          file_name: string
          file_size: number
          id: string
          message_id: string | null
          mime_type: string
          storage_path: string
          uploader_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          deletion_claimed_at?: string | null
          file_name: string
          file_size: number
          id: string
          message_id?: string | null
          mime_type: string
          storage_path: string
          uploader_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          deletion_claimed_at?: string | null
          file_name?: string
          file_size?: number
          id?: string
          message_id?: string | null
          mime_type?: string
          storage_path?: string
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_conversation_id_message_id_fkey"
            columns: ["conversation_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["conversation_id", "id"]
          },
          {
            foreignKeyName: "attachments_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          blocked_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          blocked_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          cleared_at: string | null
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          last_read_message_id: string | null
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          cleared_at?: string | null
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          muted?: boolean
          role?: string
          user_id: string
        }
        Update: {
          cleared_at?: string | null
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          muted?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          direct_key: string | null
          id: string
          is_private: boolean
          last_message_at: string | null
          last_message_id: string | null
          last_message_preview: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direct_key?: string | null
          id?: string
          is_private?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string
          title?: string
          type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direct_key?: string | null
          id?: string
          is_private?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      media_usage: {
        Row: {
          last_used_at: string
          media_id: string
          metadata: Json
          type: string
          use_count: number
          user_id: string
        }
        Insert: {
          last_used_at?: string
          media_id: string
          metadata?: Json
          type: string
          use_count?: number
          user_id: string
        }
        Update: {
          last_used_at?: string
          media_id?: string
          metadata?: Json
          type?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          client_message_id: string
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          media: Json | null
          message_type: string
          reply_to_id: string | null
          sender_id: string | null
          updated_at: string
        }
        Insert: {
          client_message_id: string
          content?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          media?: Json | null
          message_type?: string
          reply_to_id?: string | null
          sender_id?: string | null
          updated_at?: string
        }
        Update: {
          client_message_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          media?: Json | null
          message_type?: string
          reply_to_id?: string | null
          sender_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_reply_to_id_fkey"
            columns: ["conversation_id", "reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["conversation_id", "id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          presence: string
          role: string
          status_message: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string
          bio?: string
          created_at?: string
          display_name: string
          id: string
          presence?: string
          role?: string
          status_message?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string
          bio?: string
          created_at?: string
          display_name?: string
          id?: string
          presence?: string
          role?: string
          status_message?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          density: string
          desktop_notifications: boolean
          enter_to_send: boolean
          sound_notifications: boolean
          theme: string
          user_id: string
        }
        Insert: {
          density?: string
          desktop_notifications?: boolean
          enter_to_send?: boolean
          sound_notifications?: boolean
          theme?: string
          user_id: string
        }
        Update: {
          density?: string
          desktop_notifications?: boolean
          enter_to_send?: boolean
          sound_notifications?: boolean
          theme?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_attachment_discard: {
        Args: { target_attachment: string }
        Returns: Json
      }
      clear_my_history: { Args: never; Returns: undefined }
      create_channel: {
        Args: {
          channel_category: string
          channel_description: string
          channel_name: string
          private_channel: boolean
        }
        Returns: string
      }
      discard_attachment: {
        Args: { target_attachment: string }
        Returns: undefined
      }
      get_or_create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      invite_channel_member: {
        Args: { target_conversation: string; target_user: string }
        Returns: undefined
      }
      list_channels: { Args: never; Returns: Json }
      list_conversations: { Args: never; Returns: Json }
      mark_conversation_read: {
        Args: { read_message_id: string; target_conversation: string }
        Returns: undefined
      }
      reserve_attachment: {
        Args: {
          file_name: string
          file_size: number
          mime_type: string
          target_conversation: string
          upload_id: string
        }
        Returns: Json
      }
      send_message: {
        Args: {
          attachment_ids?: string[]
          client_id: string
          message_content: string
          message_media?: Json
          reply_to?: string
          target_conversation: string
          used_emojis?: string[]
        }
        Returns: Json
      }
      set_blocked: {
        Args: { blocked: boolean; target_user: string }
        Returns: undefined
      }
      set_channel_membership: {
        Args: { joined: boolean; target_conversation: string }
        Returns: undefined
      }
      set_conversation_muted: {
        Args: { muted_value: boolean; target_conversation: string }
        Returns: undefined
      }
      set_reaction: {
        Args: {
          active: boolean
          reaction_emoji: string
          target_message: string
        }
        Returns: undefined
      }
      update_my_settings: { Args: { settings: Json }; Returns: undefined }
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
    Enums: {},
  },
} as const
