import { indexDomainSitemap } from "../lib/seo";
import { UrlEmbeddingError } from "../lib/gemini";

async function main() {
  const domain = process.argv[2];
  if (!domain) {
    console.error("Usage: npm run dev:index-sitemap -- example.com");
    process.exitCode = 1;
    return;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await indexDomainSitemap(domain);
      console.log(JSON.stringify({ indexed: result.indexed, cached: result.cached, selected: result.urls.length }));
      return;
    } catch (error) {
      if (error instanceof UrlEmbeddingError && error.retryAfterMs && attempt < 3) {
        console.log("Gemini rate limited indexing. Cached batches are retained; retrying in 60 seconds.");
        await new Promise(resolve => setTimeout(resolve, error.retryAfterMs));
        continue;
      }
      console.error("Sitemap indexing failed. Verify migration 009, Gemini quota, and the public sitemap, then retry.");
      process.exitCode = 1;
      return;
    }
  }
}
void main();
