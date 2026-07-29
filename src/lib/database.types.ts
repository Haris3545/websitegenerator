// Hand-written to match migrations/001_init.sql. If you have the Supabase
// CLI, prefer regenerating this with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

import type { ThemeOverrides } from "@/lib/theme";

export type AestheticParams = {
  grain_intensity?: number; // 0..1, now rendered as animated film grain
  grain_monochrome?: boolean; // false = coloured static (default), true = greyscale
  tint_color?: string; // hex; falls back to the artist's primary color if unset
  tint_opacity?: number; // 0..1
  blur?: number; // 0..1
  vignette?: number; // 0..1
  chromatic_aberration?: number; // 0..1
};

export type SentimentFilter = { label: string; keywords: string[] };

export type YoutubeVideo = { id: string; title: string; publishedAt: string; thumbnail: string };

export type MusicTopTrack = {
  name: string;
  playcount: number | null;
  listeners: number | null;
  url: string;
};

export type MusicAlbum = {
  name: string;
  playcount: number | null;
  url: string;
  artworkUrl: string | null;
};

export type SentimentSummary = {
  positive_pct?: number;
  negative_pct?: number;
  neutral_pct?: number;
  filters?: SentimentFilter[];
  computed_at?: string;
};

export type ArtistInsight = { headline: string; detail: string; basis: string };

export type SocialComment = {
  platform: "reddit" | "youtube" | "web";
  author: string;
  text: string;
  score: number | null;
  url: string;
  context: string; // the parent post/video's title
  publishedAt: string | null;
};

export type SocialCommentSubcategory = { name: string; comments: SocialComment[] };
export type SocialCommentCategory = { name: string; subcategories: SocialCommentSubcategory[] };

export type ConversationTheme = { name: string; count: number; examples: string[] };
export type WordCloudEntry = { text: string; count: number };

export type WikipediaArticleTrend = {
  title: string;
  last7DayViews: number;
  changePct: number | null;
  dailyViews: number[];
};

export type GeniusAnnotation = {
  songTitle: string;
  songUrl: string;
  fragment: string;
  annotation: string;
  votes: number;
};

export type SearchTrendPoint = { date: string; value: number };

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
          aesthetic_prompt: string;
          aesthetic_params: AestheticParams;
          tagline: string;
          project_title: string;
          theme_overrides: ThemeOverrides;
          sentiment_summary: SentimentSummary;
          content_overrides: Record<string, string>;
          published_repo_url: string | null;
          published_site_url: string | null;
          published_deployment_id: string | null;
          published_at: string | null;
          gate_background_url: string | null;
          gate_screenshot_url: string | null;
          youtube_channel_id: string | null;
          background_youtube_id: string | null;
          background_youtube_start: number;
          background_youtube_end: number | null;
          gate_youtube_id: string | null;
          gate_youtube_start: number;
          gate_youtube_end: number | null;
          gate_scrim_opacity: number;
          gate_grain_intensity: number;
          gate_grain_monochrome: boolean;
          enabled_tabs: TabKey[];
          dashboard_section_order: string[];
          youtube_section_order: string[];
          folder_id: string | null;
          sort_order: number;
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
          aesthetic_prompt?: string;
          aesthetic_params?: AestheticParams;
          tagline?: string;
          project_title?: string;
          theme_overrides?: ThemeOverrides;
          sentiment_summary?: SentimentSummary;
          content_overrides?: Record<string, string>;
          published_repo_url?: string | null;
          published_site_url?: string | null;
          published_deployment_id?: string | null;
          published_at?: string | null;
          gate_background_url?: string | null;
          gate_screenshot_url?: string | null;
          youtube_channel_id?: string | null;
          background_youtube_id?: string | null;
          background_youtube_start?: number;
          background_youtube_end?: number | null;
          gate_youtube_id?: string | null;
          gate_youtube_start?: number;
          gate_youtube_end?: number | null;
          gate_scrim_opacity?: number;
          gate_grain_intensity?: number;
          gate_grain_monochrome?: boolean;
          enabled_tabs?: TabKey[];
          dashboard_section_order?: string[];
          youtube_section_order?: string[];
          folder_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artists"]["Insert"]>;
        Relationships: [];
      };
      artist_folders: {
        Row: { id: string; name: string; position: number; created_at: string };
        Insert: { id?: string; name: string; position?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["artist_folders"]["Insert"]>;
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
          image_url: string | null;
          status: "pending" | "liked" | "disliked";
          timeline: string | null;
          calendar_status: "confirmed" | "tbc" | null;
          scheduled_date: string | null;
          scheduled_time: string | null;
          calendar_event_id: string | null;
          channel: "Social" | "OOH" | "PPC" | "Audio" | "Video" | "Experiential" | null;
          pillar: "tease" | "launch" | "sustain" | null;
          tactic_status: "planned" | "approved" | "booked" | "archived" | null;
          objective: string | null;
          kpi: string | null;
          role_in_mix: string | null;
          audience: string[];
          audience_detail: string | null;
          format: string | null;
          phase: string | null;
          budget: string | null;
          campaign_start_date: string | null;
          campaign_end_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          board_key: string;
          title: string;
          body?: string;
          image_url?: string | null;
          status?: "pending" | "liked" | "disliked";
          timeline?: string | null;
          calendar_status?: "confirmed" | "tbc" | null;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          calendar_event_id?: string | null;
          channel?: "Social" | "OOH" | "PPC" | "Audio" | "Video" | "Experiential" | null;
          pillar?: "tease" | "launch" | "sustain" | null;
          tactic_status?: "planned" | "approved" | "booked" | "archived" | null;
          objective?: string | null;
          kpi?: string | null;
          role_in_mix?: string | null;
          audience?: string[];
          audience_detail?: string | null;
          format?: string | null;
          phase?: string | null;
          budget?: string | null;
          campaign_start_date?: string | null;
          campaign_end_date?: string | null;
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
          latitude: number | null;
          longitude: number | null;
          description: string | null;
          image_url: string | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          event_date: string;
          venue: string;
          city?: string;
          country?: string;
          description?: string | null;
          image_url?: string | null;
          url?: string | null;
          source?: string;
          latitude?: number | null;
          longitude?: number | null;
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_events"]["Insert"]>;
        Relationships: [];
      };
      location_pins: {
        Row: {
          id: string;
          artist_id: string;
          name: string;
          color: string;
          lat: number;
          lng: number;
          tag_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          name: string;
          color?: string;
          lat: number;
          lng: number;
          tag_ids?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["location_pins"]["Insert"]>;
        Relationships: [];
      };
      location_pin_tags: {
        Row: {
          id: string;
          artist_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["location_pin_tags"]["Insert"]>;
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
      social_comment_map: {
        Row: {
          artist_id: string;
          categories: SocialCommentCategory[];
          comment_count: number;
          last_error: string | null;
          computed_at: string;
        };
        Insert: {
          artist_id: string;
          categories?: SocialCommentCategory[];
          comment_count?: number;
          last_error?: string | null;
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_comment_map"]["Insert"]>;
        Relationships: [];
      };
      wikipedia_trends: {
        Row: {
          artist_id: string;
          articles: WikipediaArticleTrend[];
          top_mover: WikipediaArticleTrend | null;
          computed_at: string;
        };
        Insert: {
          artist_id: string;
          articles?: WikipediaArticleTrend[];
          top_mover?: WikipediaArticleTrend | null;
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wikipedia_trends"]["Insert"]>;
        Relationships: [];
      };
      gemini_usage: {
        Row: { usage_date: string; request_count: number };
        Insert: { usage_date: string; request_count?: number };
        Update: Partial<Database["public"]["Tables"]["gemini_usage"]["Insert"]>;
        Relationships: [];
      };
      conversation_themes: {
        Row: {
          artist_id: string;
          themes: ConversationTheme[];
          word_cloud: WordCloudEntry[];
          computed_at: string;
        };
        Insert: {
          artist_id: string;
          themes?: ConversationTheme[];
          word_cloud?: WordCloudEntry[];
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversation_themes"]["Insert"]>;
        Relationships: [];
      };
      genius_annotations: {
        Row: { artist_id: string; annotations: GeniusAnnotation[]; computed_at: string };
        Insert: { artist_id: string; annotations?: GeniusAnnotation[]; computed_at?: string };
        Update: Partial<Database["public"]["Tables"]["genius_annotations"]["Insert"]>;
        Relationships: [];
      };
      search_trends: {
        Row: { artist_id: string; points: SearchTrendPoint[]; computed_at: string };
        Insert: { artist_id: string; points?: SearchTrendPoint[]; computed_at?: string };
        Update: Partial<Database["public"]["Tables"]["search_trends"]["Insert"]>;
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
          top_albums: MusicAlbum[];
          fetched_at: string;
        };
        Insert: {
          artist_id: string;
          listeners?: number | null;
          playcount?: number | null;
          top_tags?: string[];
          top_tracks?: MusicTopTrack[];
          top_albums?: MusicAlbum[];
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["music_stats"]["Insert"]>;
        Relationships: [];
      };
      artist_metric_snapshots: {
        Row: {
          id: string;
          artist_id: string;
          captured_at: string;
          metrics: Record<string, number | string | null>;
        };
        Insert: {
          id?: string;
          artist_id: string;
          captured_at?: string;
          metrics?: Record<string, number | string | null>;
        };
        Update: Partial<Database["public"]["Tables"]["artist_metric_snapshots"]["Insert"]>;
        Relationships: [];
      };
      artist_insights: {
        Row: {
          artist_id: string;
          insights: ArtistInsight[];
          computed_at: string;
        };
        Insert: {
          artist_id: string;
          insights?: ArtistInsight[];
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artist_insights"]["Insert"]>;
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
export type ArtistFolder = Database["public"]["Tables"]["artist_folders"]["Row"];
export type MediaArticle = Database["public"]["Tables"]["media_articles"]["Row"];
export type BoardItem = Database["public"]["Tables"]["board_items"]["Row"];
export type ArtistEvent = Database["public"]["Tables"]["artist_events"]["Row"];
export type LocationPin = Database["public"]["Tables"]["location_pins"]["Row"];
export type LocationPinTag = Database["public"]["Tables"]["location_pin_tags"]["Row"];
export type YoutubeStats = Database["public"]["Tables"]["youtube_stats"]["Row"];
export type SocialMention = Database["public"]["Tables"]["social_mentions"]["Row"];
export type MusicStats = Database["public"]["Tables"]["music_stats"]["Row"];
export type ArtistMetricSnapshot = Database["public"]["Tables"]["artist_metric_snapshots"]["Row"];
export type ArtistInsightsRow = Database["public"]["Tables"]["artist_insights"]["Row"];
export type SocialCommentMap = Database["public"]["Tables"]["social_comment_map"]["Row"];
