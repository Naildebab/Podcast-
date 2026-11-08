import fs from "node:fs";

export interface CatalogPodcast {
  id: string;
  title: string;
  author: string;
  description: string;
  feedUrl: string;
  websiteUrl: string;
  imageUrl: string | null;
  language: string;
  level: "beginner" | "intermediate" | "advanced";
  categories: string[];
  tags: string[];
}

export interface CatalogFilter {
  q?: string;
  category?: string;
  level?: string;
}

const catalogPath = new URL("../../../catalog/podcasts.json", import.meta.url);

let cached: CatalogPodcast[] | null = null;

export function loadCatalog(): CatalogPodcast[] {
  if (cached) return cached;
  const raw = fs.readFileSync(catalogPath, "utf8");
  cached = JSON.parse(raw) as CatalogPodcast[];
  return cached;
}

export function catalogCategories(items: CatalogPodcast[]): string[] {
  const found = new Set<string>();
  for (const item of items) for (const category of item.categories) found.add(category);
  return [...found].sort((a, b) => {
    if (a === "English learning") return -1;
    if (b === "English learning") return 1;
    return a.localeCompare(b);
  });
}

/**
 * Small, predictable search over the curated directory. No fuzzy ranking:
 * users should be able to see exactly why a show matched.
 */
export function searchCatalog(
  items: CatalogPodcast[],
  filter: CatalogFilter,
): CatalogPodcast[] {
  const query = filter.q?.trim().toLowerCase() ?? "";
  const category = filter.category?.trim().toLowerCase() ?? "";
  const level = filter.level?.trim().toLowerCase() ?? "";

  return items
    .filter((item) => {
      if (category && category !== "all") {
        if (!item.categories.some((value) => value.toLowerCase() === category)) {
          return false;
        }
      }
      if (level && level !== "all" && item.level.toLowerCase() !== level) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        item.title,
        item.author,
        item.description,
        item.level,
        ...item.categories,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
