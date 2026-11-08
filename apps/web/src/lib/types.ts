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

export interface PodcastResponse {
  podcast: Podcast;
}
