# Your task: W1 trust (approvals and the voice loop)
Agent id: `w1-trust`. Read `docs/council/reports/q1-security.md` (SEC-2), `q2-architecture.md` (ARC-1..3),
`q3-reliability-tests.md` (TST-2, TST-4, TST-6), `q4-frontend-ux.md` (UX-4), `g1-voice-of-customer.md` (VOC-4),
`g4-spec-followup.md` (SPEC-7).

Make "ask before acting" true in code, not in a prompt:
1. SEC-2: the voice loop (`server/alexaSim/bridge.ts`) must not offer `approve_action` to the model, and must refuse it if the
   model asks anyway. The system prompt in `conversation.ts` must stop telling the model to call it. When a tool returns
   `needs_approval`, end the model loop for that turn, speak the summary and "Should I go ahead?". The person's exact yes/no
   (fast path) or the approval button resolves it. Do not put raw memory text or the approval id into text the model reads
   back unless needed (keep the id in server-side conversation state).
2. Contract 4: create `server/alexaSim/approvalWords.ts` with `approvalDecision()` (whole phrase after folding case and
   punctuation: yes, yeah, yep, go ahead, do it, approve, yes go ahead, sure, ok/okay go ahead; no, nope, cancel, don't, stop,
   no cancel that). Use it in `ack.ts` (UX-4: a qualified yes must not be acknowledged as "going ahead") and in the
   `APPROVE`/`REJECT` lines of `fastPath.ts` (touch only those lines). For a qualified yes, speak that you need a plain yes or no.
3. ARC-1: a voice forget must say what will be forgotten ("Forget that Mia is allergic to peanuts? Say yes or no.").
   The bridge drops `summary`; carry it through to the card and the speech.
4. ARC-2 / TST-6: `resolveApproval` must not burn the approval when the handler fails. Mark it `running` (or keep `pending`)
   while the handler runs; on a throw or an `{ ok: false }` result (busy room), put it back to `pending` so a second yes works,
   and keep it single-execution (two concurrent yeses must not run the action twice).
5. ARC-3 / TST-2: when the plan preview fails, do not create an approval that silently plans again after yes. Speak that
   planning is unavailable right now and return an error status. Give the Bedrock client an explicit timeout and
   `maxRetries` (preview and spoken summary: about 20 s; swarm workers: keep longer but bounded) and add a 429/throttle branch
   in `server/modelError.ts` with a friendly line.
6. VOC-4: `plan_and_run` must refuse goals it cannot carry out (ordering food, buying, booking, reservations, payments, calling
   someone): speak that AGORA+ can plan and list but cannot place orders, return no `approvalId`. Meals and grocery planning
   still go through the yes.
7. SPEC-7: `ask_agora` must answer inside Alexa's latency budget: give the model about 4 s, then fall back to the memory
   recall answer it already has. Keep the 9 s path only where the caller is the simulator, if you need it.
8. Contract 3: the SSE `final` event includes `runId` when that turn started a run.
9. TST-4: add bridge tests with a fake model and a real in-process MCP server: plan utterance -> `approval_required` -> "yes"
   -> exactly one run started; the model is never given `approve_action`; "yes but not Tuesday" does not approve; a client
   disconnect aborts the model call (no further tool calls after `close`).
