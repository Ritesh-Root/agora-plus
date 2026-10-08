# Your task: W6 integration and QA (second wave)
Agent id: `w6-qa`. The five first-wave branches (trust, security, brain, voice UX, office) are now merged into this tree.
Read every file in `docs/plan/notes/` first, especially each "Needs from others" section, then `docs/plan/fix/preamble.md`
(the contracts). In this wave you may edit any code or test file, but not `README.md`, `docs/*.md` or `skills/**`
(a docs agent is rewriting those in parallel).

1. Make the contracts hold end to end. Implement every "Needs from others" item that is still open, or explain in your notes
   why it should not be done. Look for mismatches between branches (types, field names, event payloads, speech strings that
   tests assert).
2. TST-8: route tests for the Household panel's writes (`POST /api/memory`, `PATCH`/`DELETE /api/memory/:id`, `POST /api/tasks`,
   task complete, `POST /api/approvals/:id`), with and without a passcode, from loopback and non-loopback.
3. TST-9: replace wall-clock waits in tests with fake timers or deterministic hooks where it is safe.
4. An e2e test for `/alexa` (Playwright, Chromium; extend `e2e/` and `playwright.config.ts`; give the web server its own
   temporary `AGORA_DATA_DIR` and a 32+ character dev token), with no model and no AWS:
   type "Remember Mia is allergic to peanuts" -> a verified receipt appears;
   "What is Mia allergic to?" -> the answer mentions peanuts;
   "Add milk to my shopping list" -> receipt, and the Household panel or simulator shows it under Shopping;
   "What's my briefing?" -> mentions the peanut allergy;
   "Forget that Mia is allergic to peanuts" -> approval card with focus on Approve -> approve -> receipt, fact gone;
   "yes but not Tuesday" after a pending approval does not approve.
5. Run the full gate: `npm run lint && npm run lint:server && npm test && npm run build && npm run test:e2e` (Chromium and
   Firefox; WebKit may skip on this host). Fix what fails. Paste the summaries into `docs/plan/notes/w6-qa.md`.
6. Production bundle: build it the way the Dockerfile does (`./node_modules/.bin/esbuild server/prod.ts --bundle --platform=node
   --format=esm --outfile=<tmp>/server.mjs --packages=external`, after `npm run build`), start it on port 3300 with
   `AGORA_HOUSEHOLD_PASSCODE` set (expect `0.0.0.0`) and without it (expect `127.0.0.1`), check `GET /` and `GET /api/household`
   (401 when locked), then stop it. Fix anything that keeps the bundle from starting.
7. Passcode limiter behind a proxy: with `AGORA_TRUST_PROXY=1`, key the limiter on the first `X-Forwarded-For` address, so one
   person's wrong guesses on Cloud Run do not lock out everyone behind the same proxy address. Add a test.
