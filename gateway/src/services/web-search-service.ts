/**
 * Lightweight web search service that fetches organic results via DuckDuckGo HTML
 * and formats them as text snippets for Anthropic tool_result blocks.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export const WebSearchService = {
  /**
   * Query DuckDuckGo HTML for organic search results.
   * Returns top 5 results as {title, url, snippet} objects.
   */
  async search(query: string): Promise<SearchResult[]> {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
      });

      if (!res.ok) {
        throw new Error(`DuckDuckGo returned ${res.status}`);
      }

      const html = await res.text();
      return this.parseResults(html);
    } catch (err) {
      console.error('[WebSearchService] search error:', err);
      return []; // graceful fallback so the request doesn't explode
    }
  },

  /**
   * Parse DuckDuckGo HTML results.
   * The HTML shape:
   *   <div class="result results_links results_links_deep web-result">
   *     <a class="result__a" href="URL">TITLE</a>
   *     <a class="result__url" href="URL">URL</a>
   *     <a class="result__snippet">SNIPPET</a>
   *   </div>
   */
  parseResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];

    // DuckDuckGo HTML puts each result in a div with class "web-result"
    const resultDivs = html.split(/<div class="result\b/);

    for (const chunk of resultDivs) {
      if (!chunk.includes('results_links')) continue;

      const titleMatch = chunk.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/i);
      const urlMatch = chunk.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/i);
      const snippetMatch = chunk.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/i);

      const title = titleMatch ? this.stripHtml(titleMatch[1]) : '';
      const url = urlMatch ? this.unescapeHtml(urlMatch[1]) : '';
      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : '';

      if (title && url) {
        results.push({ title, url, snippet });
      }

      if (results.length >= 5) break;
    }

    return results;
  },

  /** Strip HTML tags and decode entities. */
  stripHtml(raw: string): string {
    return this.unescapeHtml(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  },

  /** Decode common HTML entities. */
  unescapeHtml(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };
    let out = text;
    for (const [k, v] of Object.entries(entities)) {
      out = out.replaceAll(k, v);
    }
    return out;
  },

  /**
   * Format a list of search results into a compact text block suitable for
   * an Anthropic tool_result.content field.
   */
  formatResults(results: SearchResult[]): string {
    if (results.length === 0) return 'No results found.';

    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
      )
      .join('\n\n');
  },
};
