# W1 trust

Ask-before-acting is now in the voice loop and the approval store, not only in a prompt.

## What changed

- `server/alexaSim/approvalWords.ts` (new): `approvalDecision()` matches a whole phrase after folding case and punctuation. Yes is yes, yeah, yep, go ahead, do it, approve, yes go ahead, sure, ok go ahead, okay go ahead. No is no, nope, cancel, don't, stop, no cancel that. "yes but not Tuesday" and "yesterday" are null. `qualifiedApproval()` is the extra-words case. "don't forget …" is not treated as a no.
- `server/alexaSim/ack.ts`: a whole-phrase yes or no still says "Okay, going ahead." or "Okay, I won't." A yes or no with extra words says "I need a plain yes or no."
- `server/alexaSim/fastPath.ts`: the approve and reject lines call `approvalDecision()`. Same phrases as the acknowledgement. A qualified yes does not call `approve_action`.
- `server/alexaSim/conversation.ts`: the voice system prompt no longer tells the model to call `approve_action`. It says a person approves, and the model cannot.
- `server/alexaSim/bridge.ts`: the model tool list drops `approve_action` and the sentences that tell it to call that tool. If the model names it anyway, the bridge refuses and does not call MCP. A `needs_approval` result ends the model loop for that turn. The person hears the summary (and "Should I go ahead?" when the summary does not already ask). The approval id stays on the conversation, not in the text sent back to the model. A qualified yes while an approval is waiting is answered with the plain-yes line and does not start a run. Client disconnect aborts the model call and in-flight tool call. The SSE `final` event includes `runId` when that turn started a run. A forget card and the spoken line use the summary, including the fact.
- `server/household/approvals.ts`: approve marks the row `running` before the handler. A throw or an `{ ok: false }` result (busy room) puts it back to `pending`. A second overlapping yes gets `running` and does not run the action again.
- `server/household/actions.ts`: a voice forget summary is "Forget that <fact>? Say yes or no." `plan_and_run` / `requestRun` refuses ordering, buying, booking, reservations, payments, and calling someone, with no approval id. Meals and grocery planning still wait for a yes. If the plan preview throws or returns no steps, the tool says planning is unavailable and does not create an approval. Approving a plan runs only the saved step list. `ask_agora` gives the model about 4 seconds, then answers from memory. The voice simulator client (`agora-plus-voice`) gets the old 9 second budget when that client name is visible on the MCP call.
- `server/mcp/server.ts`: forget speech is the summary that names the fact. `plan_and_run` description says orders, purchases, bookings, payments, and phone calls are refused. `approve_action` speaks a busy-room or handler error and can be retried. `ask_agora` passes the 4s or 9s budget.
- `server/llm/toolLoop.ts`: the loop can stop after a tool result, and an abort signal cancels the in-flight model call so no later tool runs.
- `server/llm/bedrockProvider.ts`: the Bedrock client is created with a 90 second timeout and one retry. Preview and spoken-summary stages use 20 seconds and no retries. Worker, debate, assemble, and repair stages use 90 seconds and one retry.
- `server/modelError.ts`: a 429 or throttle is "The model is busy right now. Try again in a moment."
- Tests next to those files, plus the plan assertion in `server/mcp/mcp.test.ts` (a failed preview is an error, not a silent approval).

## Finding IDs closed

SEC-2, UX-4, ARC-1, ARC-2, ARC-3, TST-2, TST-4, TST-6, VOC-4, SPEC-7.

## Contracts

- Contract 3: the voice SSE `final` event includes `runId` when that turn started a run.
- Contract 4: `approvalDecision()` is the shared whole-phrase yes/no. `ack.ts` and the approve/reject lines in `fastPath.ts` both use it.

## Needs from others

- W3 owns server construction. The MCP instructions string still tells external clients to call `approve_action`. That should stay for Alexa. Do not copy it back into the voice system prompt.
- W4 already shows `approval.summary`. Forget summaries are now a full question. No code change is required unless the card should say something shorter than that sentence.
- W5: a busy room still returns `{ ok: false, error: 'A run is already in progress.' }`. The approval is pending again after that, so a later yes can retry. No run-engine change is required for this.
- VOC-3 (panel delete with no yes) is not in these files.

## Friction

- Task: test the 4 second `ask_agora` fallback with fake timers. Expected: advance 4 seconds and get the memory answer. Actual: advancing timers before the memory file read finished never armed the timer, so the test hung. Workaround: fake only `setTimeout` / `clearTimeout`, and let one real `setImmediate` finish the disk read first.
- Task: read the MCP client name from `McpServer`. Expected: `server.getClientVersion()`. Actual: that method is not on `McpServer`. It is `server.server.getClientVersion()`. Calling the wrong one made `ask_agora` return an error.
- Task: abort when the HTTP request closes. Expected: `req` close means the person left. Actual: `req` close also fires when the POST body has been read, which would abort every turn. Workaround: abort on `res` close.
- Task: a leading "don't" is a qualified no. Actual: "don't forget the keys" is a remember command. Workaround: phrases that start with "dont forget" are not a yes or no.

## Left undone

- Approvals are still in memory. A process restart still drops a waiting yes (ARC-4, not this task).
- If a stateless `tools/call` does not carry the client name, `ask_agora` uses the 4 second budget even for the simulator. The voice loop's own model call is a separate 20 second Bedrock timeout.
