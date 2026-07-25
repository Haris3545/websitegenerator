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

export type SentimentFilter = { label: string; keywords: string[] };

export type YoutubeVideo = { id: string; title: string; publishedAt: string; thumbnail: string };

export type MusicTopTrack = {
  name: string;
  playcount: number | null;
  listeners: number | null;
  url: string;
};

export type SentimentSummary = {
  positive_pct?: number;
  negative_pct?: number;
  neutral_pct?: number;
  filters?: SentimentFilter[];
  computed_at?: string;
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
          sentiment_summary: SentimentSummary;
          content_overrides: Record<string, string>;
          published_repo_url: string | null;
          published_site_url: string | null;
          published_at: string | null;
          gate_background_url: string | null;
          youtube_channel_id: string | null;
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
          sentiment_summary?: SentimentSummary;
          content_overrides?: Record<string, string>;
          published_repo_url?: string | null;
          published_site_url?: string | null;
          published_at?: string | null;
          gate_background_url?: string | null;
          youtube_channel_id?: string | null;
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
      board_items: {
        Row: {
          id: string;
          artist_id: string;
          board_key: string;
          title: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          board_key: string;
          title: string;
          body?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["board_items"]["Insert"]>;
        Relationships: [];
      };
      artist_events: {
        Row: {
          id: string;
          artist_id: string;
          event_date: string;
          venue: string;
          city: string;
          country: string;
          url: string | null;
          source: string;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          event_date: string;
          venue: string;
          city?: string;
          country?: string;
          url?: string | null;
          source?: string;
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_events"]["Insert"]>;
        Relationships: [];
      };
      social_mentions: {
        Row: {
          id: string;
          artist_id: string;
          platform: string;
          title: string;
          url: string;
          author: string | null;
          excerpt: string;
          score: number | null;
          published_at: string | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          platform: string;
          title: string;
          url: string;
          author?: string | null;
          excerpt?: string;
          score?: number | null;
          published_at?: string | null;
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_mentions"]["Insert"]>;
        Relationships: [];
      };
      youtube_stats: {
        Row: {
          artist_id: string;
          channel_title: string | null;
          subscriber_count: number | null;
          view_count: number | null;
          video_count: number | null;
          recent_videos: YoutubeVideo[];
          fetched_at: string;
        };
        Insert: {
          artist_id: string;
          channel_title?: string | null;
          subscriber_count?: number | null;
          view_count?: number | null;
          video_count?: number | null;
          recent_videos?: YoutubeVideo[];
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["youtube_stats"]["Insert"]>;
        Relationships: [];
      };
      music_stats: {
        Row: {
          artist_id: string;
          listeners: number | null;
          playcount: number | null;
          top_tags: string[];
          top_tracks: MusicTopTrack[];
          fetched_at: string;
        };
        Insert: {
          artist_id: string;
          listeners?: number | null;
          playcount?: number | null;
          top_tags?: string[];
          top_tracks?: MusicTopTrack[];
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["music_stats"]["Insert"]>;
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
export type BoardItem = Database["public"]["Tables"]["board_items"]["Row"];
export type ArtistEvent = Database["public"]["Tables"]["artist_events"]["Row"];
export type YoutubeStats = Database["public"]["Tables"]["youtube_stats"]["Row"];
export type SocialMention = Database["public"]["Tables"]["social_mentions"]["Row"];
export type MusicStats = Database["public"]["Tables"]["music_stats"]["Row"];
