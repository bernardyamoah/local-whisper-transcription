export type Model = {
  id: string;
  name: string;
  estimate: string;
  installed: boolean;
  downloading: boolean;
  phase: string;
  progress: number | null;
  size_bytes: number;
  total_bytes: number | null;
  downloaded_bytes: number;
  error: string | null;
};

export type Environment = {
  version: string;
  ffmpeg: string | null;
  runtime: string;
  database: boolean;
  free_bytes: number;
  used_bytes: number;
  data_location: string;
  compute: string;
  languages: string[];
  access_verified: boolean;
  tunnel: string;
  presets: Record<
    string,
    { model: string; memory: string; installed: boolean }
  >;
  models: Model[];
  native: {
    recording: boolean;
    speech_analyzer: boolean;
    locales: string[];
  };
  deepgram: { configured: boolean };
  jev: { configured: boolean; enabled: boolean };
  meeting_templates: MeetingTemplate[];
};

export type MeetingTemplate = {
  id: "general" | "standup" | "interview" | "customer" | "lecture";
  name: string;
  description: string;
  bookmarks: string[];
};

export type LiveTranscript = {
  source: string;
  start: number;
  end: number;
  text: string;
  final: boolean;
};

export type Bookmark = {
  id: string;
  at: number;
  kind: string;
  note: string;
  created: number;
  source: "manual" | "jev";
  confidence: number | null;
};

export type RecordingStatus = {
  state: "idle" | "recording" | "failed";
  id?: string;
  name?: string;
  started?: number;
  elapsed?: number;
  template?: MeetingTemplate["id"];
  live_transcript?: LiveTranscript[];
  live_error?: string | null;
  bookmarks?: Bookmark[];
};

export type Settings = {
  language: string;
  preset: "fast" | "balanced" | "accurate";
  retain_source: boolean;
  onboarding_completed: boolean;
  max_duration_hours: number;
  hardware: "auto" | "apple";
  transcription_provider: "local" | "deepgram";
  smart_moments: boolean;
  appearance: "light" | "dark" | "system";
};

export type ExportDestinations = {
  obsidian_vault: string;
  obsidian_folder: string;
  notion_parent_id: string;
  notion_connected: boolean;
  webhook_url: string;
  webhook_connected: boolean;
  webhook_secret_set: boolean;
};

export type Media = {
  id: string;
  name: string;
  size: number;
  duration: number;
  codec: string;
};

export type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: number | null;
  speaker_name?: string | null;
  confidence?: number | null;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
};

export type MeetingNotes = {
  summary: string;
  chapters: Array<{ start: number; title: string }>;
  topics: string[];
};

export type Job = {
  id: string;
  title: string;
  filename: string;
  duration: number;
  preset: string;
  state: string;
  progress: number;
  backend?: string;
  provider: "local" | "deepgram";
  error?: string;
  created: number;
  started?: number;
  finished?: number;
  revision: number;
  detected_language?: string;
  language: string;
  source_available: boolean;
  playback_available: boolean;
  playback_kind: "audio" | "video";
  has_video: boolean;
  segments: Segment[];
  notes?: MeetingNotes;
  template: MeetingTemplate;
  bookmarks: Bookmark[];
};
