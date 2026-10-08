## Web access: Cloudflare only
Use ONLY the Cloudflare Browser Run MCP server `cloudflare-browser` to read web pages. Do not use Firecrawl, Obscura,
curl, wget or any other web tool: this council is a Cloudflare scrape. Its main tools:
- `get_url_markdown(url)`: one page as Markdown (use this most).
- `get_url_links(url, visibleLinksOnly)`: the links on a page, to find the next pages to read.
- `start_crawl(url, render, depth, limit)` then `get_crawl_result(job_id)`: several pages of one site in one job. Use
  `render: false` for static pages (it does not use browser time) and keep `limit` at 15 or less.
- Budget: at most 25 page fetches for you (a crawl counts as its page limit). The Cloudflare free plan has about 10 browser-minutes a day shared by three members.
  Prefer pages that list many items (search results, "top this month" listings, review pages) over single posts.
- There is no search API, so discover pages by fetching listing or search pages, for example:
  `https://www.bing.com/search?q=<query>&tbs=qdr:m`, `https://old.reddit.com/r/<sub>/top/?t=month`,
  `https://old.reddit.com/r/<sub>/search?q=<query>&restrict_sr=on&sort=new`,
  `https://hn.algolia.com/api/v1/search_by_date?query=<query>&tags=story` (JSON).
- Only trust what the page says. Quote at most 25 words per quote, always with the URL and the page date.
- Prefer sources from 2026-08-01 to today (2026-10-08). Mark anything older as background.
- If Cloudflare fails 3 times in a row, stop scraping, write the report from what you have, and say so in the first line.
- List every fetch in the Scrape log section.

