# Your task: Frontend, voice UX and accessibility reviewer (prefix UX)
Write your report to `docs/council/reports/q4-frontend-ux.md`. Read files and use read-only git. Do not run npm commands.
The app is already running at http://127.0.0.1:3100 (do not start or stop it). You may look at `/alexa` and `/` with the
Obscura browser MCP tools, and you may try the read-only request "What's my briefing?" in the simulator's text box. Do not
approve anything and do not add or delete household data. Also look at the screenshots in `docs/images/` and `alexa-addon/media/`.

Scope: `src/alexa/*`, `src/main.tsx`, `src/interface/HouseholdPanel.tsx`, the Household and Voice simulator parts of
`src/interface/Header.tsx`, `server/mcp/apps/householdCard.*` (the Echo Show card), `public/privacy.html`, `public/terms.html`,
`docs/DEMO_SCRIPT.md`.

Check at least:
1. WCAG 2.2 AA: live regions for captions and status changes, focus moving to the approval card and back, full keyboard use
   (push-to-talk, approve, cancel), accessible names, contrast of the yellow/amber colours on the dark background (compute the
   ratios from the hex values in the code), reduced motion, target sizes, zoom to 200%, phone width.
2. Voice UX: mic permission denied, browsers without SpeechRecognition (Firefox, Safari), barge-in (does Agora stop talking when
   the user starts?), recovery after an error, what the user hears versus sees, and whether a spoken "yes" can be mistaken
   (for example "yes, but not Tuesday" or "yesterday").
3. Honesty of the UI: does the latency meter measure what its label says? Does anything look like a real Amazon product?
   Is the "unofficial simulated Alexa+" label clear enough for the hackathon rules on trademarks?
4. Empty, loading and error states in the simulator, Household panel and Echo Show card.
5. Walk through `docs/DEMO_SCRIPT.md` step by step against the code and say which steps could look broken or confusing on video.
6. Visual polish that a Design judge would notice in the first 10 seconds.
