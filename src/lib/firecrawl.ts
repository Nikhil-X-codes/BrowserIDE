import Firecrawl from "@mendable/firecrawl-js";

let firecrawlInstance: Firecrawl | null = null;

/**
 * Lazily instantiate Firecrawl so routes that don't scrape URLs (like /api/inngest)
 * don't crash at module evaluation when FIRECRAWL_API_KEY is unset.
 */
export function getFirecrawl(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not configured");
  }
  if (!firecrawlInstance) {
    firecrawlInstance = new Firecrawl({ apiKey });
  }
  return firecrawlInstance;
}
