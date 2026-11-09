import type {
  CatalogResponse,
  Episode,
  EpisodeListResponse,
  HomeResponse,
  MetaResponse,
  Podcast,
  PodcastResponse,
  ProgressStatus,
  ResolveResponse,
  Transcript,
  TranscriptFormat,
} from "./types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Could not reach the local server. Is it still running?");
  }

  if (!response.ok) {
    let message = `The request failed (HTTP ${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the status-based message when the server did not send JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const api = {
  home: () => request<HomeResponse>("/api/home"),

  meta: () => request<MetaResponse>("/api/meta"),

  catalog: (params: { q?: string; category?: string; level?: string } = {}) =>
    request<CatalogResponse>(`/api/discovery/catalog${queryString(params)}`),

  resolve: (url: string) =>
    request<ResolveResponse>("/api/discovery/resolve", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  podcasts: () => request<{ podcasts: Podcast[] }>("/api/podcasts"),

  podcast: (id: number) => request<PodcastResponse>(`/api/podcasts/${id}`),

  addPodcast: (feedUrl: string) =>
    request<PodcastResponse>("/api/podcasts", {
      method: "POST",
      body: JSON.stringify({ feedUrl }),
    }),

  refreshPodcast: (id: number) =>
    request<PodcastResponse>(`/api/podcasts/${id}/refresh`, { method: "POST" }),

  deletePodcast: (id: number) =>
    request<void>(`/api/podcasts/${id}`, { method: "DELETE" }),

  episodes: (
    params: {
      podcastId?: number;
      q?: string;
      status?: ProgressStatus;
      limit?: number;
      offset?: number;
    } = {},
  ) => request<EpisodeListResponse>(`/api/episodes${queryString(params)}`),

  episode: (id: number) => request<{ episode: Episode }>(`/api/episodes/${id}`),

  transcript: (id: number) =>
    request<{ transcript: Transcript | null }>(`/api/episodes/${id}/transcript`),

  importTranscript: (
    id: number,
    input: {
      source: "feed" | "url" | "text";
      url?: string;
      text?: string;
      format?: TranscriptFormat;
      language?: string;
    },
  ) =>
    request<{ transcript: Transcript }>(`/api/episodes/${id}/transcript`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteTranscript: (id: number) =>
    request<void>(`/api/episodes/${id}/transcript`, { method: "DELETE" }),

  saveProgress: (id: number, positionMs: number, status?: ProgressStatus) =>
    request<{
      progress: { positionMs: number; status: ProgressStatus; updatedAt: string };
    }>(`/api/episodes/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ positionMs, status }),
    }),
};
