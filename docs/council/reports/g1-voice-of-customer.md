# Voice-of-customer report

Summary: The pitch still opens on a 2025 story, slow replies and routines that die halfway. A Verge review published today says the opposite about the house: Alexa+ is now this reviewer's best smart-home assistant, routines run, and weather or a timer comes back in 3–5 seconds. The failures she still fires it for are family memory, identity, and agent errands that eat 20 minutes and do not finish. AGORA+ can answer that second list before 23 Oct. It does not, yet. Recall will state one keyword hit as fact, the Household panel deletes a memory with no yes, and `plan_and_run` will offer to plan an order it cannot place. Reddit listings did not load. The fresh user voice is the US App Store: 31 of the 50 newest reviews, all from 5–6 Oct 2026, are 1 star.

## Pain and want table

Counts are distinct pages opened in this pass, not a market rate. The App Store row is one feed of 50 reviews. "Already in research" means [docs/research/alexa-plus-voice-of-customer.md](../../research/alexa-plus-voice-of-customer.md) or [docs/research/feature-matrix.md](../../research/feature-matrix.md).

| Pain or want | Sources | Best quote | In research? | What AGORA+ does | Gap |
|---|---|---|---|---|---|
| Family fact stored, then stated about the wrong place or person | 2 (Verge 8 Oct; App Store "family settings" review) | "it confidently gave me the traffic conditions and travel time to an entirely different school, and it insisted that was the school" — [The Verge](https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max), 8 Oct 2026 | Partial. Research has a recipe that vanished, not a fact swapped for another. | `recall` speaks the top keyword hit as certain (`server/household/actions.ts`). Memory has no person field (`server/household/memoryStore.ts`). | Missing |
| Shared schedules for more than one adult | 2 (same Verge review; one App Store review) | "it still isn't as good as the Skylight Calendar for viewing multiple schedules" — [The Verge](https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max), 8 Oct 2026 | No | Tasks have a title and an optional due date, and no owner (`server/household/taskStore.ts`). | Missing |
| A yes before something is forgotten | 1 new page, plus the surveys already in research | Panel Delete calls `deleteMemory`, whose comment is "UI delete. Does not ask for approval." — `server/household/actions.ts` | Yes, for MCP. The panel hole is not in the research. | Voice and MCP `forget` return `needs_approval`. The panel does not. | Partial |
| Agent errands that waste time and do not finish (lunch, a tradesperson) | 1 (Verge 8 Oct) | "I spent 20 minutes trying to order a Chick-fil-A meal with iced tea" — [The Verge](https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max), 8 Oct 2026 | Partial. Research covers half-finished routines, not these bookings. | Any goal gets "I can plan that, but I will wait for your yes before starting." (`server/mcp/server.ts`) | Missing |
| Shopping list that stays a list | 2 (App Store feed; Verge on list chatter) | "now 75% of the screen is filled with random UI that has nothing to do with the list" — [US App Store feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=944011620/sortby=mostrecent/json), Yesimahuman, 5 Oct 2026 | No | Fast path matches "to my list", not "shopping list" (`server/alexaSim/fastPath.ts`). | Partial |
| Answer only what was asked. No follow-up, no new personality | 2 (Verge Brief mode; App Store feed) | "I do not want a relationship with a large language model kitchen Assistant." — [US App Store feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=944011620/sortby=mostrecent/json), Angelag83, 5 Oct 2026 | Yes, thinner. Research had a thread title and a ChatGPT wordiness line. | `toSpeech` keeps two sentences (`server/household/speech.ts`). The page says "Answers stay to two short sentences." | Partial |
| Speaker talks or plays when nobody asked, and cannot explain it | 4 (Verge, PCMag, Android Authority, App Store) | "hearing Alexa+ singing \"La La La\" unprompted" — [PCMag](https://www.pcmag.com/news/is-your-alexa-plus-device-randomly-singing-la-la-la-a-fix-is-on-the-way), 6 Oct 2026 | No | Speech starts from a user turn. A later turn calls `stop()`. There is no Stop control on the page. | Partial |
| Slow simple commands | 2, and they disagree | Verge: timers and weather "execute in three to five seconds". App Store: "wait at least 15 seconds before they're able to turn off their lights" — Courtney moto, 6 Oct 2026 | Yes. Research cites Spyglass, Sep 2025, up to 15 s, and does not have today's split. | The meter on `/alexa` cites only that Sep 2025 line (`src/alexa/AlexaSimulator.tsx`). | Partial |
| Home routines that do not finish | 1 new review says they now do, against the older set | "A year in, Alexa Plus is the best smart home assistant I've tested" — [The Verge](https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max), 8 Oct 2026 | Yes, as the top pain. This review updates it. | Plan, approve, receipt. No lights, which the submission already says. | Partial (pitch is stale; product scope is already honest) |
| Ads, including video, including in front of a child | 2 (Verge 8 Oct; TechRepublic 6 Oct) | "playing video ads automatically" — [TechRepublic](https://www.techrepublic.com/article/news-alexa-plus-autoplay-video-ads/), 6 Oct 2026 | Yes for still ads. Video and the $2.99 opt-out are new. | No ad slot. Files on disk. | None |
| One brain Claude or ChatGPT can call | 2 (TechRepublic 18 Sep; Verge 8 Oct points at Google Home MCP) | "giving compatible AI agents such as Anthropic's Claude Cowork access to authorized Google Home data" — [TechRepublic](https://www.techrepublic.com/article/news-google-home-claude-ai-agents/), 18 Sep 2026 | The wish is in research. Google shipping it is not. | `/mcp` already serves Claude. No device tools, on purpose. | None on the pipe. The pitch must say what is different. |
| Leaving Alexa for ChatGPT or another speaker | 1 review that says so, plus one considering a HomePod | "I am turning to ChatGPT and if I can find other sources for music and audiobooks, I will likely leave" — [US App Store feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=944011620/sortby=mostrecent/json), PSGent, 6 Oct 2026 | Research said a counted exodus was unverified. Still unverified. This is one reviewer. | Same MCP brain for Alexa+, Claude, and ChatGPT. | None as a feature. Do not cite a mass switch. |
| A basic hardware command removed | 1 page opened (Verge). Ars is cited there and was not opened. | "Alexa voice commands to play or pause from line in may stop working." — [The Verge](https://www.theverge.com/tech/1006103/amazon-alexa-aux-voice-commands), 6 Oct 2026 | No | Out of scope. Amazon says the affected set is "very small". | None for this hackathon |

## Findings

### VOC-1 The demo still opens on the complaint Alexa+ just stopped losing

- Severity: P1
- Area: `docs/DEMO_SCRIPT.md`, `README.md`, the meter on `/alexa`
- Evidence: Demo script line 20: "People are waiting up to 15 seconds, watching jobs stop halfway". The Verge, 8 Oct 2026: "A year in, Alexa Plus is the best smart home assistant I've tested" and weather or a timer now "execute in three to five seconds" ([review](https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max)). Same review: agent tasks still fail, and memory still sends her daughter to the wrong school.
- Why it matters: A judge who read this morning's review will hear the old lead and think we did not look. The job they will ask about is the life admin, not the lamp. Judging: Quality of idea, Impact.
- Fix: Open the demo on the school memory and the 20-minute lunch order. Say, in one sentence, that simple home commands got faster for this reviewer and that we do not claim lights. Keep the receipt and the yes.
- Effort: S
- Confidence: high

### VOC-2 Recall will swear to the wrong family fact

- Severity: P1
- Area: `remember`, `recall`, `daily_briefing`, `agora://memory`, Household panel
- Evidence: Verge, 8 Oct 2026: "it confidently gave me the traffic conditions and travel time to an entirely different school, and it insisted that was the school". Also: "For a while, it forgot who I was". `MemoryEntry` is `id`, `text`, `tags`, timestamps, and `source` (`server/household/memoryStore.ts` lines 6–13). `recallAnswer` speaks `I remember this: ${best.text}` for `memories[0]` (`server/household/actions.ts` lines 310–312). An App Store review the same week: "Family settings aren't working. Went back to original Alexa and everything is gone." Another wants to "manage schedules with my wife".
- Why it matters: The pitch's proof is "Remember Mia is allergic to peanuts." Two schools, two allergies, or two adults, and the spoken line can be the sure-and-wrong failure we claim to fix. Judging: Technical implementation, Quality of idea.
- Fix: Add an optional `who` on `remember` and `add_task`. A fast-path "I'm Jen" sets the speaker for that turn. If recall finds two hits, say both and do not pick one. Group the briefing and the panel by person. Demo: Jen's school and Mia's allergy, then ask "what school?" from each name.
- Effort: M
- Confidence: high

### VOC-3 The panel deletes a memory with no yes

- Severity: P1
- Area: Household panel, `DELETE /api/memory/:id`
- Evidence: `export async function deleteMemory` is commented "UI delete. Does not ask for approval." (`server/household/actions.ts` lines 154–155). The panel button is `Delete` and calls that route (`src/interface/HouseholdPanel.tsx` lines 153–156 and 216). MCP `forget` still returns `needs_approval` (`server/mcp/server.ts`).
- Why it matters: The pitch says a person signs off before a fact is forgotten. A judge in the panel can remove the peanut allergy with one click. That is the checkpoint story failing on the screen next to the voice demo. Judging: Design, Technical implementation.
- Fix: Panel Delete should call the same `forget` plus `approve_action` path as voice, and show the approval that is already on the panel.
- Effort: S
- Confidence: high

### VOC-4 "Order lunch" is accepted as a plan

- Severity: P1
- Area: `plan_and_run`
- Evidence: Verge, 8 Oct 2026: "I spent 20 minutes trying to order a Chick-fil-A meal with iced tea", then the display "insisted on ordering me a s'mores milkshake". Thumbtack ended in a phone number. The tool tells every goal: "I can plan that, but I will wait for your yes before starting." (`server/mcp/server.ts` lines 346–355). Nothing in `server/household` refuses a booking.
- Why it matters: The review's point is that these errands are the bad part of an agent. If a judge says "order lunch" and the ring goes amber, we look like the product that just wasted her 20 minutes. Judging: Quality of idea, Design.
- Fix: If the goal is an order, a reservation, or a booking, `plan_and_run` should speak that it cannot place it, return no `approvalId`, and leave the team idle. Meals and groceries still go through the yes.
- Effort: S
- Confidence: high

### VOC-5 The shopping list is the daily job, and the fast path misses the phrase

- Severity: P1
- Area: `add_task`, `list_tasks`, `daily_briefing`, Household panel
- Evidence: On the App Store feed, six of the 50 newest reviews (5–6 Oct 2026) are about lists getting harder. Yesimahuman: "now 75% of the screen is filled with random UI that has nothing to do with the list you're using." Waco fam: "You added other lists and an extra step to read and update my shopping list." Fast path: `/^add\s+(.+?)\s+to\s+my\s+(?:list|tasks|to-do|todo)$/i` (`server/alexaSim/fastPath.ts` line 17). "Add milk to my shopping list" does not match, because `shopping` sits between `my` and `list`.
- Why it matters: Lists are what these reviewers still open the app for. A demo that only understands "to my list" misses the sentence they actually say. Judging: Design, Impact.
- Fix: Accept "shopping list" on the fast path, store a list name on the task, and show Shopping as its own block in the panel and the briefing. No model call, no reorder animation.
- Effort: S
- Confidence: high

### VOC-6 The on-screen wait time is only the 2025 number

- Severity: P1
- Area: `src/alexa/AlexaSimulator.tsx`, `docs/DEMO_SCRIPT.md`
- Evidence: The meter says "Reported Alexa+ wait: up to 15 s (Spyglass, Sep 2025)" (`src/alexa/AlexaSimulator.tsx` lines 16 and 526). Verge, 8 Oct 2026, on weather, general knowledge, and timers: "execute in three to five seconds". App Store, Courtney moto, 6 Oct 2026, on lights: "wait at least 15 seconds before they're able to turn off their lights".
- Why it matters: Both sentences are on screen if a judge has the review open. Citing only the older, slower number looks chosen. Judging: Quality of idea.
- Fix: Put both figures on the meter, with dates. Say simple commands are a few seconds for this reviewer, lights are still slow for others, and our acknowledgement is the fast path with no model call.
- Effort: S
- Confidence: high

### VOC-7 Claude-to-the-home is no longer ours alone

- Severity: P1
- Area: pitch, `server/mcp/server.ts`
- Evidence: TechRepublic, 18 Sep 2026: "giving compatible AI agents such as Anthropic's Claude Cowork access to authorized Google Home data and device controls." Same page: "a prohibition on unlocking doors." The Verge review, 8 Oct 2026, tells Amazon to be a home brain that plugs into the assistant people already use, and names Google Home MCP.
- Why it matters: "The same brain works from Claude" is true here and, for devices, true at Google. A judge will ask what the extra step is. The answer is family memory, the yes, and the receipt. Device control stays out of scope. Judging: Quality of idea, Impact.
- Fix: One demo sentence after the Claude recall: Google already lets Claude see devices; AGORA+ is the household facts and the approval Google's light switch does not keep. Do not add a light tool this week.
- Effort: S
- Confidence: high

### VOC-8 There is no Stop while it is talking

- Severity: P2
- Area: `/alexa` voice page
- Evidence: PCMag, 6 Oct 2026: users heard Alexa+ "singing \"La La La\" unprompted", and one report "went on for 10 minutes" during a skin-care conversation. Android Authority, 5 Oct 2026: Amazon confirmed a bug for "a small number of Alexa Plus" users. App Store, Braatzy74, 5 Oct 2026: "randomly playing music when no one is asking it to play music." Angelag83, same feed: "answer the questions I ask only." `submit` calls `stop()` only when a new turn starts, and it returns immediately while `busy` is true (`src/alexa/AlexaSimulator.tsx` lines 200–205). The page has no Stop button.
- Why it matters: This week's scare story is a speaker that will not be quiet. Our turns are short, and a second utterance does cut playback once the request finishes. A judge who says "stop" during the ack has no control for that. Judging: Design.
- Fix: A Stop control that calls the existing `stop()` even when a turn is in flight, and a one-line fast path for "what did you just say?" that reads the last spoken line.
- Effort: S
- Confidence: medium

## What is good (keep)

- Spoken replies are capped at two sentences in `toSpeech` (`server/household/speech.ts` lines 31–34), and the voice page says so. That matches Angelag83 and the Verge reviewer who had to switch Alexa+ to Brief mode after it praised her shopping list.
- MCP `forget` and `plan_and_run` still wait for `approve_action`. The hole is the panel, not the tool.
- The submission already refuses lights, locks, and Hue (`docs/SUBMISSION.md`). Today's review says that is the part Alexa+ got better at. Keeping the refusal is the right call. Do not fake a lamp.
- There is no ad surface. The Verge reviewer goes from a photo of her son to "a hideous brown leather recliner", and TechRepublic says 15-second videos now autoplay on Echo Show. Amazon's help text, quoted by TechRepublic, says people "cannot completely turn off sponsored ads."
- The fast path answers remember, briefing, tasks, and yes/no with no model call (`server/alexaSim/fastPath.ts`). That is the right shape for "answer the question I asked."
- One household file store is still the right trust demo: open `agora://memory` and read it. It needs a person on each line before that demo survives "which daughter?"

## Scrape log (web members only)

Tool for every row: Cloudflare Browser `get_url_markdown`, except the first Hacker News call, which was `get_url_json`. Fetched 8 Oct 2026. A crawl was not used.

| URL | Result | Date on the page |
|---|---|---|
| https://old.reddit.com/r/alexa/top/?t=month | Failed. Login wall, title "Welcome to Reddit". | None |
| https://old.reddit.com/r/amazonecho/top/?t=month | Failed. Same login wall. | None |
| https://hn.algolia.com/api/v1/search_by_date?query=Alexa%20Plus&tags=story&numericFilters=created_at_i%3E1785542400&hitsPerPage=20 | Failed. `get_url_json` returned 422. The error body included one hit, "New Amazon Alexa Tablets with Alexa+", created 2026-10-08. | 2026-10-08 on that hit |
| https://www.bing.com/search?q=Alexa%2B+complaints+OR+problems+OR+broken+2026&tbs=qdr%3Am&count=20 | Failed as a source. Bing said there were no results. The `+` was treated as part of the query. | Page itself undated; © 2026 Microsoft |
| https://hn.algolia.com/api/v1/search_by_date?query=Alexa&tags=story&numericFilters=created_at_i%3E1785542400&hitsPerPage=30 | Ok, too broad. Real Alexa hits: tablets (8 Oct), AUX commands (7 Oct), "lalala" (6 Oct). Most hits are names that contain "alex". | Hit dates 4–8 Oct 2026 |
| https://www.reddit.com/r/alexa/top.json?t=month&limit=25&raw_json=1 | Failed. Block / login page, not JSON. | None |
| https://www.bing.com/search?q=%22Alexa+Plus%22+problems+OR+review+OR+complaints&filters=ex1%3a%22ez5_20369_20734%22&count=15 | Ok, not useful. Results were Japanese explainers. The UI was in Japanese. | Snippet dates include 8 Jan 2026, 20 Mar 2026, 2 Sep 2026 |
| https://www.bing.com/news/search?q=%22Alexa+Plus%22&qft=interval%3d%229%22&form=PTFTNR | Ok. Led to the pages below. Relative times: Verge one-year review "1h", CNET tablet "1h", lalala stories "2d", TechRepublic video ads "2d". | Fetched 8 Oct 2026; story dates confirmed on the articles |
| https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max | Failed once, 429. Retry ok. | 8 Oct 2026, 2:00 PM UTC |
| https://www.theverge.com/tech/1005342/amazon-alexa-plus-keeps-creepily-singing-lalala-for-minutes-on-end | Ok | 6 Oct 2026, 10:53 AM UTC |
| https://www.techrepublic.com/article/news-alexa-plus-autoplay-video-ads/ | Failed once, 429. Retry ok. | 6 Oct 2026 |
| https://www.bing.com/search?q=site%3Areddit.com%2Fr%2Falexa+%22Alexa+Plus%22+OR+%22alexa%2b%22&setlang=en&cc=US&count=15 | Failed as a source. Results were Anna Kendrick, not r/alexa. | None relevant |
| https://hn.algolia.com/api/v1/search_by_date?query=%22alexa%20plus%22&tags=story&numericFilters=created_at_i%3E1754006400&hitsPerPage=20 | Ok. 9 stories. In-window: tablets, 8 Oct 2026. Older background includes the Echo Show ads story, 9 Oct 2025. | 2025-10-01 through 2026-10-08 |
| https://www.pcmag.com/news/is-your-alexa-plus-device-randomly-singing-la-la-la-a-fix-is-on-the-way | Ok | 6 Oct 2026 |
| https://old.reddit.com/r/alexa/comments/1wk4rii/alexa_said_lalalalala_for_10_minutes/.json | Failed. Login wall. Thread text is unverified. PCMag and The Verge describe it. | None |
| https://www.techrepublic.com/article/news-google-home-claude-ai-agents/ | Ok | 18 Sep 2026 |
| https://www.bing.com/search?q=%22Alexa+Plus%22+family+OR+daughter+OR+calendar+OR+%22forgot+who%22&mkt=en-US&setlang=en&count=10 | Failed as a source. Results were San Diego Padres pages. Bing marked the page "Content was generated with AI." | None relevant |
| https://www.theverge.com/tech/1006103/amazon-alexa-aux-voice-commands | Ok | 6 Oct 2026, 7:03 PM UTC |
| https://www.androidauthority.com/amazon-alexa-la-la-la-3719167/ | Ok | 5 Oct 2026; update the same day |
| https://itunes.apple.com/us/rss/customerreviews/page=1/id=944011620/sortby=mostrecent/json | Ok. 50 reviews, 31 rated 1. | 5 Oct 2026 03:47 through 6 Oct 2026 23:20, US Pacific |
| https://www.androidauthority.com/alexa-plus-sounds-3680475/ | Ok. Background: before 1 Aug 2026. A family unplugged speakers after guttural sounds while counting with kids. Amazon blamed text-to-speech on 2 Jul 2026. | 23 Jun 2026; update 2 Jul 2026 |

Not opened, so unverified: r/smarthome, r/homeassistant, and r/amazonecho listing bodies; the Reddit threads cited by PCMag and The Verge; the Ars Technica aux story (quoted second-hand by The Verge); the CNET tablet story (headline only, on Bing News); Tom's Guide; a fresh Google Play pass. No counted exodus from Alexa to ChatGPT. One reviewer said they are turning to ChatGPT. That is the whole scale this pass can support.
