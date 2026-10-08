# Phase 4: The simulated Alexa+ experience, and the Household panel

Goal: a voice web app at `/alexa` that shows, live, how Alexa+ would route a household request to our MCP server —
fast acknowledgement, visible tool calls, approvals before side effects, receipts, and short spoken answers —
plus a Household panel in the office. The Alexa+ track explicitly allows "a simulated Alexa+ experience in a web app";
the repo must contain its source and the demo must clearly show it working.

Trademark rule: label it "AGORA+ voice · simulated Alexa+ experience (unofficial)". Do not use Amazon or Alexa logos,
the Alexa cyan ring color, or Amazon fonts. Use AGORA's own palette (`src/index.css`: ink, paper, butter).

## Packages
`npm install @aws-sdk/client-polly@^3`.

## 0. Protect household data on a deployed server (do this first)
Today `/api/household` and the other household routes are open to anyone who can reach the server.
- When `AGORA_HOUSEHOLD_PASSCODE` is set, these routes require a household session: `/api/household`, `/api/memory*`,
  `/api/tasks*`, `/api/approvals*`, `/api/alexa-sim/*`, `/api/tts`. When it is unset (local dev), they stay open.
- `POST /api/session { passcode }` → timing-safe check → sets cookie `agora_household` (HMAC-signed with
  `AGORA_TOKEN_SECRET`, `HttpOnly`, `SameSite=Strict`, `Secure` when the request is HTTPS, 12 h, `Path=/`). Wrong passcode → 401
  after a short fixed delay. `DELETE /api/session` clears it. `GET /api/session` → `{ required, active }`.
- Missing/invalid session → 401 JSON `{ error: 'household_locked' }`. The UI shows a passcode prompt on that error.
- Keep the existing same-origin check for writes. Tests: locked without cookie, unlocked with cookie, open when no passcode.

## 1. Server (`server/alexaSim/`)
1. `ack.ts` — `acknowledge(utterance)` → one short phrase chosen by fixed rules (no model):
   remember/note → "Got it, saving that."; plan/organize/schedule → "On it. I'll get the team on that.";
   briefing/today → "Here's your day."; yes/approve → "Okay, going ahead."; no/cancel → "Okay, I won't.";
   question words → "Let me check."; default → "On it." Export the list of all phrases.
2. `tts.ts` — `POST /api/tts { text }` → `audio/mpeg`.
   `PollyClient` (`AWS_REGION`) + `SynthesizeSpeechCommand({ Engine: POLLY_ENGINE || 'neural', VoiceId: POLLY_VOICE || 'Joanna',
   OutputFormat: 'mp3', Text })`, read `AudioStream.transformToByteArray()`. Text max 1500 chars. In-memory LRU cache
   (100 entries). On startup, try to pre-generate the acknowledgement phrases in the background (ignore failures).
   Missing credentials or Polly error → 503 JSON `{ error: 'tts_unavailable' }` (the client falls back to browser speech).
   Read `@aws-sdk/client-polly` `.d.ts` for exact types.
3. `oauthClient.ts` — how the simulator gets MCP tokens, the same way Alexa+ does:
   - Service token: `client_credentials` with HTTP Basic against our own `/oauth/token` (scope `mcp:service`), cached until
     shortly before expiry.
   - Account linking ("Link AGORA+"): `GET /api/alexa-sim/link` creates a PKCE verifier + `state` (kept in memory, 10 min) and
     returns the `/oauth/authorize` URL with `redirect_uri = <origin>/alexa?linked=1`. After the user enters the household
     passcode, the browser lands on `/alexa?linked=1&code=…&state=…` and calls `POST /api/alexa-sim/link/complete { code, state }`;
     the server exchanges the code and keeps the user token (+ refresh) in memory. `GET /api/alexa-sim/status` →
     `{ linked, mode: 'oauth' | 'dev-token' | 'unconfigured', model, tts }`.
   - If OAuth env vars are missing but `AGORA_MCP_TOKEN` is set, use the dev token for everything and report `mode: 'dev-token'`.
   - Self URL: `AGORA_SELF_URL`, else `http://127.0.0.1:<port of the incoming request's Host header>`.
4. `bridge.ts` — `POST /api/alexa-sim/turn { utterance, conversationId? }` → `text/event-stream`.
   - Write the `ack` event `{ text, at }` immediately, before any network or model call.
   - Then act as the "Alexa+ AI reasoning" layer: an MCP `Client` (`@modelcontextprotocol/client`) with
     `StreamableHTTPClientTransport` to `<self>/mcp`, using the account-linked token for `tools/call` (service token is
     enough for `tools/list`). **Never import `server/household/actions.ts` here** — everything goes through real MCP over HTTP.
   - Conversation store (in memory, 30-minute TTL, max 40 messages; past that, start a new conversation seeded with a short
     summary): the system prompt and the tool list are frozen when the conversation starts (`tools/list` → Anthropic tools,
     `input_schema = inputSchema`). Use `runToolLoop` from `server/llm/toolLoop.ts` with `getBedrock().createMessage`,
     model `ALEXA_SIM_MODEL || BEDROCK_FAST_MODEL`, `execute` = MCP `callTool`, returning the tool's text content.
   - Frozen system prompt: you are a voice assistant for this household; speak the `speech` field of tool results; at most
     two short sentences; never perform a side effect without the approval step; when a tool returns `needs_approval`,
     read the summary and ask "Should I go ahead?"; when the user then says yes/no, call `approve_action` with that
     `approvalId`; never claim something happened unless a tool result says so.
   - SSE events: `ack`, `tool_call { name, input }`, `tool_result { name, status, speech, receipt?, approvalId?, ms }`,
     `approval_required { approvalId, summary }`, `final { text, timings: { ackMs, firstToolMs?, totalMs } }`, `error { message }`.
     Close the stream after `final` or `error`. Abort the loop if the client disconnects.
   - Not linked and no dev token → `error` with a message telling the user to press "Link AGORA+".
5. Mount everything through `server/routes.ts` (both Vite and prod).

## 2. Client (`src/alexa/`, lazy-loaded)
- `src/main.tsx`: if `location.pathname` starts with `/alexa`, lazy-import `src/alexa/AlexaSimulator.tsx` and render it
  instead of `<App />`, so three.js and the office stores never load there. Keep `<App />` unchanged otherwise.
- `AlexaSimulator.tsx`: a device-like screen centered on the page (dark ink card, rounded, subtle bezel) with:
  - `StatusRing.tsx` — a large ring with states idle / listening / thinking / speaking / approval (amber pulse) / error,
    animated with CSS only; honors `prefers-reduced-motion`.
  - Push-to-talk button (also hold Space) using `useSpeechInput.ts` (`webkitSpeechRecognition` / `SpeechRecognition`,
    `en-US`, interim results shown as live caption). A text box fallback is always visible; when speech is unsupported
    (non-Chrome), say so in one line.
  - Transcript of turns (user, assistant), newest at the bottom.
  - `ReceiptCard.tsx` — for every tool call: tool name, status chip (ok / needs approval / error), `speech`, receipt
    (`verified ✓` or `not verified`), ms. Approval cards show the summary with **Approve** / **Decline** buttons that send
    the utterance "Yes, go ahead." / "No, cancel that." as the next turn.
  - `LatencyMeter.tsx` — time from end of speech (or Enter) to first audio `playing` (time to first speech), and to the final
    answer starting; keep the last 10 turns and show the median. Also `console.info` one JSON line per turn
    (`{ ttfsMs, finalMs }`) so we can quote measured numbers in the demo script.
  - `useSpeechOutput.ts` — play the `ack` text immediately, then the `final` text: fetch `/api/tts` → `Audio`; on 503 or
    error fall back to `speechSynthesis`. Never overlap: queue utterances; a new user turn stops current speech.
  - `simClient.ts` — POST + parse SSE from a `fetch` `ReadableStream` (no EventSource; we need POST).
  - Header strip: "Link AGORA+" button (account linking) or "Linked ✓"; mode badge (`oauth` / `dev-token`); a link back to
    the office (`/`). Passcode prompt when the API says `household_locked`.
  - Sample prompts as chips: "Remember Mia is allergic to peanuts", "Plan dinners for this week and add the groceries",
    "What's my briefing?", "What is Mia allergic to?".
  - Responsive down to 375 px wide; keyboard accessible; visible focus states; aria-live region for the transcript.
- `speech.d.ts` with minimal Web Speech API types if TypeScript lacks them.

## 3. Household panel in the office
- `src/interface/HouseholdPanel.tsx`: a modal in the same style as `ConnectionsModal`. Polls `GET /api/household` every 2 s
  while open. Sections: Memory (inline edit and delete — the person acts directly; add new), Tasks (add, complete),
  Pending approvals (cards in the `BossCard` style with Approve / Decline → `POST /api/approvals/:id`), Recent runs
  (status, brief, a "Download .md" link to the saved synthesis — add `GET /api/runs/:id/document` returning the markdown),
  and the briefing suggestions. Passcode prompt on `household_locked`.
- `src/interface/Header.tsx`: two new icon buttons next to the existing ones, matching their style and `title`s:
  "Household" (opens the panel) and "Voice simulator" (opens `/alexa` in a new tab). Add `data-testid`s.
- Add the open/close flag to `uiStore` next to the existing modal flags.

## Tests
- vitest: `acknowledge` rules; SSE event formatting; conversation store TTL and the 40-message rollover; household session
  cookie sign/verify and route locking; `/api/tts` returns 503 when the Polly client throws (inject the client).
- A bridge test with a fake model `create` and a real ephemeral MCP server (reuse the Phase 2 test helpers): utterance
  "remember X" → the stream has `ack` first, then `tool_call remember`, `tool_result` with `verified: true`, then `final`.
- `npm run test:e2e` must still pass (the office e2e).

## Acceptance
- The full gate passes, plus `npm run test:e2e`.
- In Chrome at `http://localhost:3000/alexa` with `AGORA_MCP_TOKEN` set (and Bedrock credentials if available):
  "Remember Mia is allergic to peanuts" → acknowledgement in under a second and a `verified` receipt; "What's my briefing?"
  works; "Plan dinners for this week and add the groceries" → amber approval → "yes" → a run appears in the office.
  If Bedrock credentials are missing in your shell, verify the non-model paths and say so in your summary.
