import Firecrawl from "@mendable/firecrawl-js";

let _client: Firecrawl | null = null;

function getClient(): Firecrawl | null {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Firecrawl({ apiKey });
  return _client;
}

export interface FirecrawlSnippet {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
}

/**
 * Recherche des actualités récentes (blessures, forme, previews) pour un match donné.
 * Renvoie une liste courte de snippets utilisables directement dans le prompt IA.
 */
export async function searchMatchContext(query: string, opts?: { limit?: number; withContent?: boolean }): Promise<FirecrawlSnippet[]> {
  const client = getClient();
  if (!client) return [];
  const limit = opts?.limit ?? 5;
  try {
    const result: any = await client.search(query, {
      limit,
      tbs: "qdr:w", // dernière semaine
      ...(opts?.withContent ? { scrapeOptions: { formats: ["markdown"] } } : {}),
    } as any);
    const items: any[] = Array.isArray(result?.web)
      ? result.web
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result)
          ? result
          : [];
    return items.slice(0, limit).map((r: any) => ({
      title: r.title ?? r.metadata?.title ?? "",
      url: r.url ?? r.metadata?.sourceURL ?? "",
      description: r.description ?? r.snippet ?? r.metadata?.description ?? "",
      markdown: typeof r.markdown === "string" ? r.markdown.slice(0, 1500) : undefined,
    }));
  } catch (err) {
    console.error("Firecrawl search failed", err);
    return [];
  }
}

export function formatSnippetsForPrompt(snippets: FirecrawlSnippet[]): string {
  if (!snippets.length) return "";
  return snippets
    .map((s, i) => {
      const lines = [
        `[${i + 1}] ${s.title}`,
        s.url,
        s.description || "",
        s.markdown ? `Extrait : ${s.markdown.replace(/\s+/g, " ").slice(0, 800)}` : "",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}
