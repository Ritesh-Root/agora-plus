# Firecrawl friction (phase 0b)

Research-only notes from 8 Oct 2026. The same eight items are the last rows of [docs/FRICTION_LOG.md](../FRICTION_LOG.md), which is the Devpost log. This file stays so the research pass still has its own copy.

## 1. Reddit pages cannot be scraped

- **Task:** Open r/alexa, r/amazonecho, r/homeassistant, r/smarthome, r/ChatGPT threads and quote them.
- **Steps:** `firecrawl_search` with `site:reddit.com`, then `firecrawl_scrape` on `old.reddit.com` and on `www.reddit.com/...json`.
- **Expected:** Thread body, comment text, and post dates.
- **Actual:** Search returned short excerpts. Scrape returned: "We apologize for the inconvenience but we do not support this site."
- **Severity:** Medium. Quotes are real sentences from search excerpts, but dates and full threads are missing.
- **Workaround:** Cite the excerpt and mark the date "not retrieved."
- **Suggestion:** For a later pass, use a Reddit API or a mirror Firecrawl does not block, and only then add dates.

## 2. CNET and Tom's Guide are on the same block list

- **Task:** Scrape CNET's year-with-Alexa+ review, the "errs on the side of chatty" piece, and Tom's Guide's family test.
- **Steps:** `firecrawl_scrape`, including one retry with `proxy: stealth`.
- **Expected:** Review body and a date.
- **Actual:** Same "we do not support this site" error. The chatty line stays **unverified**.
- **Severity:** Medium.
- **Workaround:** Leave those outlets out of quotes. Wired, The Verge, Consumer Reports, and Spyglass did scrape.
- **Suggestion:** Do not retry those hosts in a loop. Treat the block as final for this key.

## 3. TechRadar scrape returned the newsletter wall

- **Task:** Scrape the June 2025 Alexa+ early-access diary.
- **Steps:** `firecrawl_scrape` with summary and direct-quote query.
- **Expected:** The seven-day diary.
- **Actual:** HTTP 200, and the extracted text was a subscription prompt. The quote field was empty.
- **Severity:** Low.
- **Workaround:** Drop TechRadar from the quote set.
- **Suggestion:** If a scrape's summary is a paywall or newsletter, do not paraphrase it into a customer quote.

## 4. App Store review text did not extract

- **Task:** Recent 2026 US App Store reviews of Amazon Alexa.
- **Steps:** `firecrawl_scrape` on `apps.apple.com/us/app/amazon-alexa/id944011620?see-all=reviews` with a direct-quote query.
- **Expected:** Star rating and short reviews.
- **Actual:** Page returned, then "Query generation failed after all models." The summary was a paraphrase, not quotes, so it was not used. A search snippet claimed 4.4 stars and 1.2 million ratings on a UK URL. That number is **unverified**.
- **Severity:** Low. Google Play did return 4.1 from 5.73 million reviews and two review excerpts, without review dates.
- **Workaround:** Cite Play. Do not cite the App Store rating.
- **Suggestion:** Ask for markdown on store pages, then pick quotes by hand. The query model dropped this one.

## 5. PullPush rate-limited the Reddit backup

- **Task:** After Reddit itself was blocked, fetch recent r/alexa posts from `api.pullpush.io`.
- **Steps:** `firecrawl_scrape` on the PullPush search URL.
- **Expected:** Post JSON.
- **Actual:** HTTP 429, "Rate limit exceeded. This website does not provide free scraping resources for agents."
- **Severity:** Low.
- **Workaround:** Stay with Firecrawl search excerpts.
- **Suggestion:** Do not send agent traffic at PullPush.

## 6. Hacker News query operators returned an empty hit list

- **Task:** Find HN stories about Alexa+ being slow or broken.
- **Steps:** Scrape `hn.algolia.com` with `query=Alexa%2B%20slow%20OR%20broken`.
- **Expected:** Matching stories.
- **Actual:** `nbHits: 0`. A second query, `Alexa Plus`, returned 119 stories, including the Echo Show ads thread (id 45531940, 9 Oct 2025).
- **Severity:** Low.
- **Workaround:** Drop boolean operators on that API. Comment bodies were not scraped, so HN is cited as a pointer, not as a quote.
- **Suggestion:** Use the Algolia `query` as plain words.

## 7. Direct-quote mode sometimes returned whole sections

- **Task:** Pull quotes under 25 words.
- **Steps:** `firecrawl_scrape` with `queryOptions.mode: directQuote`.
- **Expected:** Short quotations.
- **Actual:** Several answers were multi-paragraph extracts. Menlo's report came back with broken line breaks around percentages, so the 45/40/36 ranking line was reassembled from those fragments.
- **Severity:** Low.
- **Workaround:** Cut quotes by hand and count words. Mark the reassembled Menlo ranking line as taken from adjacent fragments of the same paragraph.
- **Suggestion:** Post-filter scrape answers to sentences under 25 words before they enter a quote bank.

## 8. A search snippet and a scrape of the same Amazon URL disagreed on an update date

- **Task:** Date Amazon's Alexa+ announcement.
- **Steps:** `firecrawl_search`, then `firecrawl_scrape` on `aboutamazon.com/.../new-alexa-generative-artificial-intelligence`.
- **Expected:** One publication date.
- **Actual:** The search excerpt said the article was updated 21 Jul 2026. The scrape metadata and body say published 26 Feb 2025, and the retrieved body did not include that update note. Cache time on the scrape was 7 Oct 2026.
- **Severity:** Low.
- **Workaround:** Cite 26 Feb 2025 only. Do not cite 21 Jul 2026.
- **Suggestion:** Prefer the scraped body over the search blurb when they conflict.
