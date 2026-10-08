# Alexa+ voice of customer

Collected 8 Oct 2026 with Firecrawl search and page scrapes. Themes are ranked by how many distinct URLs in this pass mention them. That is a count of sources we actually opened or excerpted, not a market-wide frequency.

Reddit, CNET, and Tom's Guide refused a full scrape (see `firecrawl-friction.md`). Reddit lines below are complete sentences from search excerpts. Thread dates were not on those excerpts, so they are marked date not retrieved. Anything we could not check against a page body is marked **unverified**.

## Executive summary

- The complaint that shows up on the most URLs is reliability: routines, lights, and multi-step jobs that stop halfway. Spyglass, Wired, The Verge, David Pogue, and several r/alexa threads describe the same failure in different rooms.
- Slowness is specific enough to cite. Spyglass (30 Sep 2025) says some requests take up to 15 seconds, and more than 10 seconds for weather or a song. Separate Reddit excerpts say Alexa+ got slower, including for lights.
- Flagship reviews catch the assistant being sure and wrong. Consumer Reports saved a recipe that was gone two weeks later. Pogue (3 Aug 2026) got about half of 135 tasks right. Wired watched Alexa+ insist a show was playing when it was not.
- People do compare Alexa with ChatGPT, and they ask how to put a better talker on an Echo. The same threads complain that ChatGPT voice runs long. Large 2026 surveys want a checkpoint: Stack Overflow found 63% of technologists rarely or never let an agent run on autopilot.
- Alexa+ also does real things well. Amazon, a July 2025 Wired hands-on, Consumer Reports, The Verge, Pogue, and at least one r/homeassistant thread credit conversation, calendars, natural-language device control, and recipes. A fair demo starts from those gains and then shows memory you can delete, a plan that finishes, and a receipt.

## Themes, ranked by source count

### 1. Routines and tasks that do not finish

**Distinct sources: 10.** [Spyglass](https://spyglass.org/broken-alexa-plus/), [Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/) (Mar 2026), [The Verge](https://www.theverge.com/report/787171/amazon-alexa-plus-hardware-event-smart-home) (Sep 2025), [David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment), and six Reddit threads: [routines inconsistent](https://www.reddit.com/r/alexa/comments/1q8oexk/has_anyone_else_noticed_that_after_alexa_release/), [hit or miss](https://www.reddit.com/r/alexa/comments/1quicqo/alexa_no_longer_executing_any_of_my_routines/), [skills busted](https://www.reddit.com/r/alexa/comments/1pzf397/alexa_plus_immediately_broke_a_majority_of_my/), [cannot edit](https://www.reddit.com/r/alexa/comments/1m8bnqu/alexa_is_ruining_my_routines_i_am_unable_to_edit/), [lighting groups](https://www.reddit.com/r/alexa/comments/1szchvk/is_anyone_else_actually_enjoying_the_alexa_upgrade/), [broken routines](https://www.reddit.com/r/alexa/comments/1sqqcfs/broken_alexa_routines/). Reddit dates were not retrieved.

- "Alexa Plus tells me it has to create a routine to do that, and then doesn't run that routine." ([Spyglass](https://spyglass.org/broken-alexa-plus/), 30 Sep 2025)
- "It maneuvers like an unpredictable toddler smashing around and half-completing tasks." ([Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/), 6 Mar 2026)
- "I asked it to do 135 tasks. It got them right about half the time." ([David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment), 3 Aug 2026)
- "Basic routines are wildly inconsistent." ([r/alexa](https://www.reddit.com/r/alexa/comments/1q8oexk/has_anyone_else_noticed_that_after_alexa_release/), date not retrieved)

**What this means for AGORA+:** Every write ends in a receipt whose `verified` flag is a read-back from disk, and a plan does not run until `approve_action`.

### 2. Slow replies

**Distinct sources: 5.** [Spyglass](https://spyglass.org/broken-alexa-plus/), a reader comment on [Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/) (6 Mar 2026), and three Reddit threads: [super slow](https://www.reddit.com/r/amazonecho/comments/1omz6bm/alexa_is_super_slow/), [Hue delayed](https://www.reddit.com/r/alexa/comments/1o3047c/alexa_is_a_mess/), [still slow?](https://www.reddit.com/r/alexa/comments/1udid0u/alexa_still_slow/). A July 2025 Wired hands-on says replies come back quickly; that quote is under "What Alexa+ does well."

- "Alexa Plus is noticeably slower, with some requests taking up to 15 seconds for a response." ([Spyglass](https://spyglass.org/broken-alexa-plus/), 30 Sep 2025)
- "Waiting for over 10 seconds for the weather or a song to play is tiresome." ([Spyglass](https://spyglass.org/broken-alexa-plus/), 30 Sep 2025)
- "If anything, Alexa+ has gotten slower over the last couple of months instead of more responsive." ([r/amazonecho](https://www.reddit.com/r/amazonecho/comments/1omz6bm/alexa_is_super_slow/), date not retrieved)
- "Alexa+ is soooo slow to respond and my Philips hue integration was so delayed." ([r/alexa](https://www.reddit.com/r/alexa/comments/1o3047c/alexa_is_a_mess/), date not retrieved)

**What this means for AGORA+:** Speak a fixed acknowledgement in under a second, before any model call, and show that gap on the latency meter.

### 3. Sure, and wrong

**Distinct sources: 4.** Consumer Reports, Pogue, Wired (Mar 2026), and the Wired hands-on where a wrong place was fixed only after more context.

- "There were a few cases where I caught it being flat wrong." ([Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/), 19 Dec 2025)
- "Unfortunately, Alexa+ frequently gives bad information." ([David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment), 3 Aug 2026)
- "The AI assistant claimed multiple times that it was actually playing an episode when it was in fact not." ([Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/), 6 Mar 2026)
- "She provided me with shops in the city I live in, even though I was currently in a different city." ([Wired hands-on](https://www.wired.com/story/alexa-plus-hands-on/), 29 Jul 2025)

**What this means for AGORA+:** `web_research` returns citations, and the existing agent debate checks the result before it is spoken.

### 4. People measuring Alexa against ChatGPT

**Distinct sources: 4.** Two Echo threads, one r/ChatGPT thread, and Menlo's finding that voice AI is not happening on smart speakers. A 2023 "replacing Alexa" post exists; it is too old to treat as 2026 churn. We did **not** find a counted exodus from Echo to ChatGPT. That scale is **unverified**.

- "I honestly don't get why Amazon hasn't integrated conversational AI like ChatGPT into Alexa yet." ([r/amazonecho](https://www.reddit.com/r/amazonecho/comments/1hg83uj/why_is_alexa_still_so_dumb_when_chatgpt_exists/), date not retrieved)
- "While you can't replace Alexa with ChatGPT as the main voice, you can use a skill." ([r/amazonecho](https://www.reddit.com/r/amazonecho/comments/1l2kn24/is_there_any_method_to_use_chatgpt_on_an_echo_dot/), date not retrieved)
- "I didn't realise just how long and wordy ChatGPT's responses are." ([r/ChatGPT](https://www.reddit.com/r/ChatGPT/comments/1nehl3o/why_is_there_no_chatgpt_home_device_like_alexa/), date not retrieved)
- "The talking isn't happening on smart speakers." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)

**What this means for AGORA+:** The same household brain is an MCP server, so Alexa+, Claude, and ChatGPT can call it, and the spoken reply stays at two sentences.

### 5. Ads, and a home screen you cannot quiet

**Distinct sources: 3.** The Verge, a Google Play review excerpt, and a [Hacker News story](https://news.ycombinator.com/item?id=45531940) that points at that Verge piece (13 points, 5 comments, 9 Oct 2025; comment text not scraped).

- "The Echo Show has become a rotating billboard in my office." ([The Verge](https://www.theverge.com/report/797672/amazon-echo-show-ads-alexa-plus), 9 Oct 2025)
- "They cannot be turned off." ([The Verge](https://www.theverge.com/report/797672/amazon-echo-show-ads-alexa-plus), 9 Oct 2025)
- "It still keeps showing me ads." ([Amazon Alexa on Google Play](https://play.google.com/store/apps/details?id=com.amazon.dee.app&hl=en_US), review date not shown; listing read 8 Oct 2026)
- "Unfortunately the updates have made the app less useful to me." ([Google Play](https://play.google.com/store/apps/details?id=com.amazon.dee.app&hl=en_US), review date not shown)

The Play listing showed 4.1 stars from 5.73 million reviews. That is the lifetime app rating, not a 2026 Alexa+ score.

**What this means for AGORA+:** The household store is files on disk, the simulator has no ads, and side effects wait for approval.

### 6. Forgotten facts

**Distinct sources: 2** for the failure itself (Consumer Reports, plus Amazon's own promise that memory is a feature). This rank is low because few URLs say it. The failure is sharp: the assistant stored a recipe and then did not have it.

- "When I asked for the same recipe two weeks later, it had no idea what I was talking about." ([Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/), 19 Dec 2025)
- "Alexa+ had no problem recalling the recipe with the exact ingredients and measurements — at least at first." ([Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/), 19 Dec 2025)
- "You can also ask her to remember things that will make the experience more useful for you." ([Amazon](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence), 26 Feb 2025)

**What this means for AGORA+:** `remember`, `recall`, and `forget` are backed by `agora://memory`, which a person can read, edit, and delete.

### 7. Cloud-only processing, and an upgrade that turned itself on

**Distinct sources: 2.** Implicator, and an r/homeassistant post title. A third thread title, "Beware Alex+ Early Access," is only a title in the excerpt we got: [r/smarthome](https://www.reddit.com/r/smarthome/comments/1qhznhk/beware_alex_early_access/).

- "Alexa+ removes that option — everything you say goes to Amazon's servers for processing." ([Implicator](https://www.implicator.ai/alexa-at-seven-months-has-amazons-smarter-assistant-proved-itself/), 30 Sep 2025)
- "Amazon silently enabled Alexa+ on my Echo after I explicitly refused." (post title, [r/homeassistant](https://www.reddit.com/r/homeassistant/comments/1pqc6yj/amazon_silently_enabled_alexa_on_my_echo_after_i/), date not retrieved)

**What this means for AGORA+:** Data stays in the household data directory, and linking the brain is an explicit consent step.

### 8. Chatty replies

**Distinct sources: 2 confirmed.** One thread title, and one r/ChatGPT excerpt about the alternative people are eyeing. A CNET line that Alexa+ "errs on the side of chatty" was a search snippet only; the page would not scrape, so that line is **unverified**.

- "Alexa plus upgrade on Monday slow and chatty." (thread title, [r/alexa](https://www.reddit.com/r/alexa/comments/1q7xsif/alexa_plus_upgrade_on_monday_slow_and_chatty/), date not retrieved)
- "I didn't realise just how long and wordy ChatGPT's responses are." ([r/ChatGPT](https://www.reddit.com/r/ChatGPT/comments/1nehl3o/why_is_there_no_chatgpt_home_device_like_alexa/), date not retrieved)

The r/ChatGPT excerpt in theme 4 is the matching complaint about the alternative: ChatGPT voice is long.

**What this means for AGORA+:** `toSpeech()` caps the spoken reply at two sentences. The detail stays on screen.

## What people want from an agentic assistant

Same structure. These are 2025–2026 surveys and the household jobs in the reviews above. The roadmap draft's "proactivity (62%)" figure was **not** in any page we opened. Menlo's 62% is a different stat: Gen Z AI users who have earned money with AI. Do not put 62% proactivity on a slide.

### 1. A person still signs off

**Distinct sources: 2**, both large surveys.

- "63% of technologists still rarely or never let agents run entirely on autopilot." ([Stack Overflow](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work/), 27 May 2026; 1,100 people, late April 2026)
- "Most (60%) of survey respondents block agents from making unapproved system changes." ([Stack Overflow](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work/), 27 May 2026)
- "Thirty-two percent of AI users have already let AI act on their behalf at least once without a final sign-off." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026; 5,067 US adults, July 2026)

**What this means for AGORA+:** `forget` and `plan_and_run` return `needs_approval` plus an `approvalId`. Nothing with a side effect runs until `approve_action`.

### 2. Accuracy, trust, and privacy decide how far people go

**Distinct sources: 1 survey, three ranked factors.** Menlo says these are what AI users rank when they choose a product. Holdouts are harsher: 70% distrust AI information, 76% have privacy concerns, and 83% would rather deal with a person (same report).

- "AI users now rank accuracy (45%), trustworthiness (40%), and security and privacy (36%)." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)
- "I've tried them, and they always provide incorrect information." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026; a 56-year-old man who stopped using AI)

**What this means for AGORA+:** Citations, a receipt, and a memory file the household can open are the trust surface. There is no ad model on top.

### 3. Memory that is still there later

**Distinct sources: 2.** The Consumer Reports recipe (theme 6) is the customer proof. Amazon sells memory as a feature, on the speaker and on the web.

- "You can also ask her to remember things that will make the experience more useful for you." ([Amazon](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence), 26 Feb 2025)
- "Amazon says it will also be able to memorize personal details like your diet and movie preferences." ([The Verge](https://www.theverge.com/news/619755/amazon-alexa-ai-upgrade-artificial-intelligence-smart-assistant), 26 Feb 2025)
- "It also provides persistent context and continuity." ([Amazon, Alexa.com](https://www.aboutamazon.com/news/devices/alexa-plus-web-ai-assistant), 5 Jan 2026)

**What this means for AGORA+:** `remember` / `recall` / `forget`, and the resource `agora://memory`, so the fact can be shown and deleted.

### 4. Voice that is fast and short

**Distinct sources: 3.** Menlo on where voice actually happens, the ChatGPT wordiness excerpt, and the latency sources in theme 2.

- "Nearly half (46%) of AI users speak to AI at least some of the time." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)
- "The talking isn't happening on smart speakers." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)
- "I didn't realise just how long and wordy ChatGPT's responses are." ([r/ChatGPT](https://www.reddit.com/r/ChatGPT/comments/1nehl3o/why_is_there_no_chatgpt_home_device_like_alexa/), date not retrieved)

**What this means for AGORA+:** Instant acknowledgement, the latency meter, and a two-sentence cap. Nineteen percent of Menlo's AI users say voice is their primary mode; another 27% mix voice and typing (same report).

### 5. Help with the boring household loop

**Distinct sources: 1 survey, aimed at the jobs Alexa reviews already stumble on (lists, meals, calendars).**

- "Much of what consumers hand to AI is boring, everyday work: email, meal planning, shopping, household logistics." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)
- "Today, 84% of parents use AI, compared with 56% of non-parents." ([Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/), 16 Sep 2026)

**What this means for AGORA+:** `daily_briefing` is fixed logic with no model call, and `add_task` / `list_tasks` / `complete_task` cover the list. A proactive percentage of 62% is **unverified**.

### 6. One assistant, every surface

**Distinct sources: 2** for the desire (Amazon stating it as the product, and the Echo-to-ChatGPT threads in theme 4). Among Menlo's AI users, ChatGPT reach is 60%, Gemini 58%, Claude 20%, and the average user now uses 3.0 general assistants, up from 2.2.

- "Alexa+ will be accessible across every surface — whether you're at your desk, on the go, or at home." ([Amazon, Alexa.com](https://www.aboutamazon.com/news/devices/alexa-plus-web-ai-assistant), 5 Jan 2026)
- "From quick answers to completed tasks, Amazon now offers an AI assistant experience across voice, mobile, and web." ([Amazon, Alexa.com](https://www.aboutamazon.com/news/devices/alexa-plus-web-ai-assistant), 5 Jan 2026)

**What this means for AGORA+:** One MCP server. The demo line is the same memory answered from the simulator and from Claude.

## Latency and reliability claims we can cite

| Claim | Figure | Source | Date | Note |
|---|---|---|---|---|
| Slow requests | Up to 15 seconds | [Spyglass](https://spyglass.org/broken-alexa-plus/) | 30 Sep 2025 | Author's own use, not a benchmark lab |
| Weather or a song | Over 10 seconds | [Spyglass](https://spyglass.org/broken-alexa-plus/) | 30 Sep 2025 | Same |
| Lights and thermostat via Matter | "Fast enough" | [Spyglass](https://spyglass.org/broken-alexa-plus/) | 30 Sep 2025 | Author assumes a local path |
| Command delay | 7–10 seconds or more | Reader comment on [Wired](https://www.wired.com/story/why-is-amazon-alexa-plus-so-bad/) | 6 Mar 2026 | Comment, not Wired's measurement |
| Task accuracy | About half of 135 tasks right | [David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment) | 3 Aug 2026 | One reviewer's test |
| Recipe recall | Correct at first, gone after two weeks | [Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/) | 19 Dec 2025 | One household |
| Alexa app rating | 4.1 stars, 5.73 million reviews | [Google Play](https://play.google.com/store/apps/details?id=com.amazon.dee.app&hl=en_US) | read 8 Oct 2026 | Lifetime app rating |
| Price | $19.99 a month, free with Prime | [Amazon](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence), [The Verge](https://www.theverge.com/news/619755/amazon-alexa-ai-upgrade-artificial-intelligence-smart-assistant), [CNBC](https://www.cnbc.com/2026/02/04/amazon-alexa-plus-us-releas.html) | 26 Feb 2025 and 4 Feb 2026 | CNBC: US general availability, Prime at $139 a year |
| Amazon usage claim | Twice the conversations, three times the purchases, five times the recipe requests | [Amazon, Alexa.com](https://www.aboutamazon.com/news/devices/alexa-plus-web-ai-assistant) | 5 Jan 2026 | Company claim. "Tens of millions of customers." Not an independent audit |
| Early access scale | From "hundreds of thousands" to "more than a million" | [Implicator](https://www.implicator.ai/alexa-at-seven-months-has-amazons-smarter-assistant-proved-itself/) | 30 Sep 2025 | Implicator attributes the million to The Verge. **Unverified** against that Verge page in this pass |
| Installed base | Roughly 600 million Alexa-enabled devices sold | [Implicator](https://www.implicator.ai/alexa-at-seven-months-has-amazons-smarter-assistant-proved-itself/), quoting Amazon | 30 Sep 2025 | **Unverified** against Amazon's own sales page |
| Agents kept on a leash | 63% rarely or never fully on autopilot; 60% block unapproved system changes; 69% use a single agent | [Stack Overflow](https://stackoverflow.blog/2026/05/27/agents-on-a-leash-agentic-ai-remains-mostly-monitored-at-work/) | 27 May 2026 | n=1,100, late April 2026. Agent use 59%, up from 31% in the 2025 Developer Survey |
| Consumers letting AI act | 32% of AI users have let AI act at least once without a final sign-off. A key-findings line also says 24% have let AI act without final approval | [Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/) | 16 Sep 2026 | n=5,067 US adults, July 2026. The report states both figures; the passages we retrieved do not define the gap |
| What users rank | Accuracy 45%, trustworthiness 40%, security and privacy 36% | [Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/) | 16 Sep 2026 | Among AI users |
| Voice | 19% say voice is primary; 46% speak to AI at least sometimes | [Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/) | 16 Sep 2026 | "The talking isn't happening on smart speakers." |
| Parents | 84% of parents use AI, 40% daily, versus 56% of non-parents | [Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/) | 16 Sep 2026 | Daily-use jump from 29% in 2025 |

**Unverified numbers we will not cite as fact:** Uprisera's "6,400 internal testers" and "routines work only about half the time" ([roundup](https://uprisera.com/blog/en/alexa-plus-failing-amazon-ai-assistant-struggles-2026), the page did not link those figures to a primary source we opened). A US App Store rating (a search snippet said 4.4 from 1.2 million on a UK page). Any "62% want proactive assistants" line.

## What Alexa+ does well

Judges will know the product. These are gains the same reviewers grant.

[Amazon's February 2025 announcement](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence) describes a generative assistant that "gets things done," with "experts" that orchestrate APIs, agentic web tasks, and the ability to remember facts the customer states. Price is $19.99 a month, or included with Prime. On 26 Feb 2025 Anthropic said [Claude models help power Alexa+](https://www.anthropic.com/news/claude-and-alexa-plus) through Amazon Bedrock, with Anthropic's safety stack in the path. CNBC (4 Feb 2026) reported general US availability, still free with Prime, and free to try on the website and in the app.

On 5 Jan 2026 Amazon said Alexa.com carries chats, preferences, and personalization across voice, phone, and web, and claimed "twice the conversations, three times the purchases, five times the recipe requests" after scaling to "tens of millions of customers."

Reviewers who lived with it:

- "She's a much better conversationalist than either her past self or other smart assistants." ([Wired hands-on](https://www.wired.com/story/alexa-plus-hands-on/), 29 Jul 2025)
- "Alexa+ manages to answer quickly, even when listening to a more complex question and giving a more complex answer." ([Wired hands-on](https://www.wired.com/story/alexa-plus-hands-on/), 29 Jul 2025)
- "Controlling my lights, locks, and robot vacuum with natural language rather than precise phrases is a huge improvement." ([The Verge](https://www.theverge.com/report/787171/amazon-alexa-plus-hardware-event-smart-home), 29 Sep 2025)
- "have started talking to my Echo smart speakers much more frequently than I did before." ([Consumer Reports](https://www.consumerreports.org/electronics/digital-assistants/amazon-alexa-plus-ai-assistant-review-a1667486499/), 19 Dec 2025)
- "Alexa+ does well with ChatGPT-style queries." ([David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment), 3 Aug 2026)
- "On the other hand, the calendar stuff is rock-solid." ([David Pogue](https://pogueman.substack.com/p/alexa-is-a-buggy-embarrassment), 3 Aug 2026)
- "I'm really liking the improvements, especially with Home Assistant integration." ([r/homeassistant](https://www.reddit.com/r/homeassistant/comments/1ljn2sy/im_liking_alexa_with_home_assistant/), date not retrieved)

Pogue also says Prime Video by voice works ("Play Project Hail Mary"). Farrell's hands-on got a usable road-trip plan and recipe ideas from a thin fridge. A reader comment on the harsher Wired piece says complex reference questions work well when the person is not asking for home automation. That comment is one reader, not the review.

The pattern in the praise: conversation, calendars, and a looser way to name devices. The pattern in the complaints: the house routine, the second request, the wait, and the moment it claims a thing happened.
