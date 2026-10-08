# Phase 3: Amazon Bedrock, a tool-use loop, and the model-backed tools

Goal: AGORA+ thinks with Claude on **Amazon Bedrock** (this is our AWS Builder entry), and the three stub tools from
Phase 2 (`ask_agora`, `plan_and_run`, `web_research`) become real.

## Packages
`npm install @anthropic-ai/bedrock-sdk@^0.34 @anthropic-ai/sdk`. Read their `.d.ts` files before coding.

Use the **"Claude in Amazon Bedrock" Messages endpoint** through `AnthropicBedrockMantle`:
```ts
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
const client = new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION || 'us-east-1' });
const msg = await client.messages.create({ model: 'anthropic.claude-sonnet-5', max_tokens: 1024, messages: [...] });
```
Docs: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock — credentials come from the standard
AWS chain (env vars, SSO profile, ECS task role). Do **not** use `@aws-sdk/client-bedrock-runtime` / `ConverseCommand`
(it does not reach current Claude models). Rules for this endpoint:
- Model ids have the `anthropic.` prefix. Defaults: `BEDROCK_MODEL` = `anthropic.claude-sonnet-5`,
  `BEDROCK_FAST_MODEL` = `anthropic.claude-haiku-4-5`.
- Structured outputs are not supported. `tool_choice` stays `auto` (omit it).
- Do not send `temperature`/`top_p` together; simplest is to send neither.
- Check `stop_reason`: `end_turn`, `tool_use`, `max_tokens`, `refusal`.
- History is append-only: send the assistant's `response.content` back unchanged; never edit or trim earlier turns
  inside one loop. Keep the system prompt and tool list fixed for the whole loop; put changing data (memory, tasks)
  in the user message.

## Files

1. `server/llm/bedrockProvider.ts` — `createBedrockProvider(options?: { client?, model?, fastModel?, region? })`
   implementing `ServerProvider` from `server/society/provider.ts`, plus `createMessage(params)` that returns the raw
   SDK `Message` (for the tool loop) and `fastModel` / `model` getters.
   - `generateCompletion(messages, tools, systemInstruction, modelName)`: any `system`-role messages are appended to the
     system prompt; consecutive same-role messages are merged; the first message must be `user`.
     If `modelName` does not start with `anthropic.`, use the default model (this covers the Qwen/DeepSeek names
     hard-coded in `Orchestrator.ts` and `relay.ts`). `max_tokens` 8000. Return the joined text blocks as `content`
     and map `usage.input_tokens/output_tokens` to `promptTokens/completionTokens`. Count usage like `createServerProvider` does.
   - `refusal` → throw `new Error('The model declined this request.')`. Never log message contents or credentials.
   - Accept an injected `client` (`{ messages: { create } }`) so tests never touch the network.
2. `server/llm/toolLoop.ts` — `runToolLoop({ create, model, system, tools, messages, execute, maxSteps = 4, maxTokens = 1024, onEvent? })`.
   - `tools` are Anthropic tool definitions (`{ name, description, input_schema }`).
   - Loop: call `create`; append `{ role: 'assistant', content: response.content }` unchanged; if `stop_reason === 'tool_use'`,
     run every `tool_use` block with `execute(name, input)` **in parallel**, then append **one** user message with all
     `tool_result` blocks in the same order (`is_error: true` when `execute` threw or returned an error). Repeat.
   - Stop on `end_turn`, `max_tokens`, `refusal`, or after `maxSteps` tool rounds. Return
     `{ text, messages, stopReason, steps, toolCalls: [{ name, input, ok, ms }] }`.
   - `onEvent` receives `tool_call` / `tool_result` events (Phase 4 streams them to the simulator).
3. `server/llm/serverProvider.ts` — `serverLlmMode()` (`'bedrock'` when `AGORA_SERVER_LLM=bedrock`, else `'key'`),
   `getBedrock()` (one lazily created provider), and `defaultServerProvider()` which returns Bedrock in bedrock mode,
   otherwise the routing provider from `resolveRoutedAccess({})`. At startup (where `routes.ts` is first loaded) call
   `setServerProviderFactory(defaultServerProvider)` from `server/household/actions.ts`.
4. `server/routingProvider.ts` — optional second argument `{ fallbackProvider?: ServerProvider }`. When the request has
   no agent route and `access.fallback` failed, use `fallbackProvider` instead of throwing. Include its usage in `takeUsage`.
   In `server/relay.ts` `providerFromClient`: in bedrock mode pass `getBedrock()` as `fallbackProvider`, and with
   `requireAll` do not reject a failed *fallback* (agents with their own failed connection are still rejected).
   This lets the office swarm and room chat run with no browser key when the server uses Bedrock.
5. `server/research/firecrawl.ts` — `firecrawlSearch(query, limit = 3, fetchImpl = fetch)` →
   `POST https://api.firecrawl.dev/v2/search` with `Authorization: Bearer ${FIRECRAWL_API_KEY}` and
   `{ query, limit, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } }`, 15 s timeout.
   Check https://docs.firecrawl.dev/api-reference/endpoint/search for the exact request and response shape
   (v2 returns results under `data.web`); return `SearchHit[]` (`server/research/webSearch.ts`) plus a clipped
   `markdown` excerpt. No key → `[]`.
6. `server/research/research.ts` — add `quickResearch(question)`: Firecrawl when `FIRECRAWL_API_KEY` is set, otherwise
   the existing Exa `searchWeb` plus `readUrl` (keeps the SSRF guard) on the top 2 hits. Strip `utm_*` query params from
   source URLs. Returns `{ sources: { title, url }[], context: string }`. Leave `researchForTask` unchanged.
7. `server/household/actions.ts` — real implementations:
   - `askAgora(question)`: `runToolLoop` on the fast model with read-only tools (`recall`, `list_tasks`, `daily_briefing`,
     `get_run_status`, and `web_research` when research is configured), executed by calling the same action functions.
     Fixed system prompt: Agora is the household's assistant; answer in at most two short spoken sentences; never claim
     an action was done unless a tool result says so; say "I don't know" rather than guess; cite the source name when a
     web result was used. The user message contains the top 8 relevant memories (`searchMemory`) and the question.
     Hard timeout 9 s → fall back to a recall-based answer. Returns `{ speech, answer, sources?, toolCalls }`.
   - `webResearch(question)`: `quickResearch` → fast-model answer grounded only in the fetched context, with sources.
     If nothing is configured, return status `error` with speech "Web research isn't set up on this server."
   - `requestRun(goal)`: build the memory-augmented brief, call `planSociety` with `HOUSEHOLD_TEAM` to get the task list,
     then create the `start_run` approval whose summary lists the steps ("Plan: 4 steps — …"). The structured result
     includes the task titles and roles. On approve, `startSocietyRun` with `presetTasks` (no second planning call).
   - When a household run finishes, save `spokenSummary` in its run record: a fast-model two-sentence summary of the
     synthesis (fall back to `toSpeech(synthesis)`), and make sure Keeper's flagged conflicts (e.g. an allergy) are
     mentioned when present. `get_run_status` speaks `spokenSummary` for finished runs.
8. `server/mcp/server.ts` — replace the Phase 2 stubs with the real actions. Tool names and schemas stay the same.

Do **not** add tool use inside Orchestrator workers in this phase (it is a cut-line in the roadmap).

## Tests (fakes only, no network)
- `bedrockProvider`: system/role merging, model mapping for non-`anthropic.` names, usage mapping, refusal error.
- `toolLoop`: assistant content passed back unchanged (same object), two parallel tool calls → one user message with
  two results in order, a throwing tool → `is_error: true`, stops at `maxSteps`.
- `routingProvider`: failed fallback + `fallbackProvider` → uses it; agent routes still win.
- `firecrawl`: request shape and response parsing with a fake fetch; no key → `[]`.
- `askAgora` with a fake `create` that first requests `recall` and then answers: the answer uses the recalled fact.
- `requestRun` with a fake provider: approval summary lists the planned steps; approving starts a run with `presetTasks`.

## Acceptance
- The full gate passes.
- Only if `aws sts get-caller-identity` succeeds in this shell: do one real call (for example a throwaway
  `node --input-type=module` script that imports the built provider, or a vitest file you run once and then delete) and
  record the model id, latency and outcome in `docs/HACKATHON_CHANGES.md`. If credentials are missing, say so in your
  summary and skip it. Never print credentials.
