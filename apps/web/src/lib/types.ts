export type ProgressStatus = "new" | "in_progress" | "completed";
export type Level = "beginner" | "intermediate" | "advanced";

export interface Podcast {
  id: number;
  feedUrl: string;
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  language: string | null;
  websiteUrl: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  episodeCount: number;
  completedCount: number;
  inProgressCount: number;
  lastEpisodeAt: string | null;
}

export interface Episode {
  id: number;
  podcastId: number;
  podcastTitle: string;
  podcastImageUrl: string | null;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  transcriptUrl: string | null;
  transcriptType: string | null;
  positionMs: number;
  status: ProgressStatus;
}

export type TranscriptFormat = "vtt" | "srt" | "json" | "text";
export type TranscriptOrigin = "feed" | "manual" | "whisper";

export interface TranscriptCue {
  index: number;
  startMs: number | null;
  endMs: number | null;
  speaker: string | null;
  text: string;
}

export interface Transcript {
  episodeId: number;
  sourceUrl: string | null;
  format: TranscriptFormat;
  origin: TranscriptOrigin;
  language: string | null;
  timed: boolean;
  cueCount: number;
  importedAt: string;
  cues: TranscriptCue[];
}

export interface CatalogPodcast {
  id: string;
  title: string;
  author: string;
  description: string;
  feedUrl: string;
  websiteUrl: string;
  imageUrl: string | null;
  language: string;
  level: Level;
  categories: string[];
  tags: string[];
  inLibrary: boolean;
  libraryId: number | null;
}

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  transcriptUrl: string | null;
  transcriptType: string | null;
}

export interface FeedPreview {
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  language: string | null;
  websiteUrl: string | null;
  episodes: FeedEpisode[];
  episodeCount: number;
}

export interface ResolveResponse {
  feedUrl: string;
  feed: FeedPreview;
}

export interface CatalogResponse {
  podcasts: CatalogPodcast[];
  categories: string[];
  total: number;
}

export interface EpisodeListResponse {
  episodes: Episode[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  podcasts: number;
  episodes: number;
  completed: number;
  inProgress: number;
}

export interface HomeResponse {
  stats: Stats;
  continueListening: Episode[];
  recent: Episode[];
  podcasts: Podcast[];
}

export interface MetaResponse {
  version: string;
  phase: number;
  dataDir: string;
  stats: Stats;
}

export interface WhisperStatus {
  available: boolean;
  engine: string;
  binary: string;
  binaryFound: boolean;
  model: string;
  modelPath: string;
  modelCached: boolean;
  device: string;
  language: string;
  reason: string | null;
}

export interface DictionaryStatus {
  available: boolean;
  path: string;
  entries: number | null;
  forms: number | null;
  source: string | null;
  license: string | null;
  error: string | null;
}

export interface ResourcesResponse {
  whisper: WhisperStatus;
  dictionary: DictionaryStatus;
}

export interface DictionaryEntry {
  id: number;
  word: string;
  pos: string;
  ipa: string | null;
  definitions: string[];
  arabic: string[];
  lemma: string | null;
}

export interface DictionaryResult {
  query: string;
  normalized: string;
  matchedBy: "word" | "form" | null;
  lemmas: string[];
  entries: DictionaryEntry[];
  forms: string[];
  source: {
    name: string;
    license: string;
    url: string;
  };
}

export type TranscriptionState =
  | "queued"
  | "downloading"
  | "transcribing"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export interface TranscriptionJob {
  id: string;
  episodeId: number;
  state: TranscriptionState;
  model: string;
  language: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  audioBytes: number | null;
  cueCount: number | null;
}

export interface TranscriptionStatus {
  available: boolean;
  reason: string | null;
  job: TranscriptionJob | null;
}

export interface PodcastResponse {
  podcast: Podcast;
}
