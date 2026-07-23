// Hand-written to match migrations/001_init.sql. If you have the Supabase
// CLI, prefer regenerating this with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

import type { ThemeOverrides } from "@/lib/theme";

export type AestheticParams = {
  grain_intensity?: number; // 0..1
  tint_opacity?: number; // 0..1
  blur?: number; // 0..1
  vignette?: number; // 0..1
};

export type TabKey =
  | "dashboard"
  | "media"
  | "social_listening"
  | "music"
  | "youtube"
  | "audience"
  | "strategy"
  | "tactics"
  | "locations"
  | "ideas"
  | "calendar"
  | "research";

export interface Database {
  public: {
    Tables: {
      builder_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      artists: {
        Row: {
          id: string;
          slug: string;
          name: string;
          primary_color: string;
          secondary_color: string;
          accent_color: string;
          font_family: string;
          background_image_url: string | null;
          landing_video_url: string | null;
          aesthetic_prompt: string;
          aesthetic_params: AestheticParams;
          tagline: string;
          project_title: string;
          theme_overrides: ThemeOverrides;
          enabled_tabs: TabKey[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          font_family?: string;
          background_image_url?: string | null;
          landing_video_url?: string | null;
          aesthetic_prompt?: string;
          aesthetic_params?: AestheticParams;
          tagline?: string;
          project_title?: string;
          theme_overrides?: ThemeOverrides;
          enabled_tabs?: TabKey[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artists"]["Insert"]>;
        Relationships: [];
      };
      artist_secrets: {
        Row: { artist_id: string; encrypted: Record<string, string>; updated_at: string };
        Insert: {
          artist_id: string;
          encrypted?: Record<string, string>;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_secrets"]["Insert"]>;
        Relationships: [];
      };
      artist_members: {
        Row: {
          id: string;
          artist_id: string;
          user_id: string;
          role: "viewer" | "editor";
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          user_id: string;
          role: "viewer" | "editor";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_members"]["Insert"]>;
        Relationships: [];
      };
      media_articles: {
        Row: {
          id: string;
          artist_id: string;
          title: string;
          url: string;
          source: string;
          excerpt: string;
          published_at: string | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          title: string;
          url: string;
          source: string;
          excerpt?: string;
          published_at?: string | null;
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["media_articles"]["Insert"]>;
        Relationships: [];
      };
      audience_uploads: {
        Row: { id: string; artist_id: string; filename: string; uploaded_at: string };
        Insert: {
          id?: string;
          artist_id: string;
          filename: string;
          uploaded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audience_uploads"]["Insert"]>;
        Relationships: [];
      };
      audience_statements: {
        Row: {
          id: string;
          upload_id: string;
          artist_id: string;
          category: string | null;
          statement: string;
          segment: string;
          universe: number | null;
          responses: number | null;
          column_pct: number | null;
          row_pct: number | null;
          index_value: number | null;
        };
        Insert: {
          id?: string;
          upload_id: string;
          artist_id: string;
          category?: string | null;
          statement: string;
          segment: string;
          universe?: number | null;
          responses?: number | null;
          column_pct?: number | null;
          row_pct?: number | null;
          index_value?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["audience_statements"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Artist = Database["public"]["Tables"]["artists"]["Row"];
export type MediaArticle = Database["public"]["Tables"]["media_articles"]["Row"];
