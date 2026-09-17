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
};

export type Settings = {
  language: string;
  preset: "fast" | "balanced" | "accurate";
  retain_source: boolean;
  max_duration_hours: number;
  hardware: "auto" | "cpu" | "cuda";
};

export type Media = {
  id: string;
  name: string;
  size: number;
  duration: number;
  codec: string;
};

export type Segment = { id: number; start: number; end: number; text: string };

export type Job = {
  id: string;
  title: string;
  filename: string;
  duration: number;
  preset: string;
  state: string;
  progress: number;
  backend?: string;
  error?: string;
  created: number;
  started?: number;
  finished?: number;
  revision: number;
  detected_language?: string;
  language: string;
  source_available: boolean;
  playback_available: boolean;
  segments: Segment[];
};
