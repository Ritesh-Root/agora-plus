---
name: agora-household
description: Saves and reads household memory, tasks, briefings, and approval-gated plans through the AGORA+ MCP server. Use when someone asks what the household knows, wants a fact or task saved or forgotten, needs today's briefing, or wants a plan such as dinners for the week.
license: MIT
compatibility: Needs network access to a running AGORA+ server and a bearer token (the AGORA_MCP_TOKEN development token, or an OAuth access token).
---

# AGORA+ household

AGORA+ is a self-hosted household brain. It remembers facts, keeps a task list, and plans work with a small team named Agora, Scout, Planner, and Keeper. Agents talk to it through the MCP server at `/mcp`, which speaks Streamable HTTP and protocol `2025-11-25`. Forgetting a fact or starting a plan does not happen until a person says yes.

Read [references/TOOLS.md](references/TOOLS.md) for every input field and output field. Read [references/ALEXA_ADDON.md](references/ALEXA_ADDON.md) only when shipping this server as an Alexa+ add-on.

## Connect

Replace `<url>` with the server origin, such as `http://127.0.0.1:8080` or the public `https://` tunnel. Do not put a secret in the skill file. The token stays in the environment.

Claude Code, with the development token:

```bash
claude mcp add --transport http agora <url>/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"
```

Any other MCP client uses Streamable HTTP `POST <url>/mcp`. Send `Accept: application/json, text/event-stream` and `Authorization: Bearer <token>`. Two tokens work:

- Development token: `AGORA_MCP_TOKEN`. It does not expire. It can list and call tools and read resources.
- OAuth: `POST <url>/oauth/token` with `Content-Type: application/x-www-form-urlencoded`. Client credentials use HTTP Basic (`client_id:client_secret`) and `grant_type=client_credentials` with `scope=mcp:service` and `resource=<url>/mcp`. That token can initialize and list. It cannot call tools or read resources. Calling those needs the authorization-code token, scope `mcp:tools mcp:resources`, from `GET <url>/oauth/authorize` with PKCE `S256`.

If `AGORA_OAUTH_CLIENT_ID`, `AGORA_OAUTH_CLIENT_SECRET`, and `AGORA_TOKEN_SECRET` are unset, the OAuth routes return 503 and only the development token works. Access tokens last one hour. A client-credentials token has no refresh token; request a new one. An authorization-code token comes with a refresh token that rotates.

Discovery, when OAuth is configured:

- `GET <url>/.well-known/oauth-authorization-server`
- `GET <url>/.well-known/oauth-protected-resource`

## Tools

Call the tool whose description matches the request. One example each. Arguments only; the client wraps them in `tools/call`.

| Tool | Use it when | Example arguments |
| --- | --- | --- |
| `remember` | Someone wants a fact kept, such as an allergy or a preference. | `{ "fact": "Mia is allergic to peanuts", "tags": ["allergy"] }` |
| `recall` | Someone asks what is already saved. Empty query returns the newest facts. | `{ "query": "Mia allergy" }` |
| `forget` | Someone wants a saved fact removed. This does not delete it. | `{ "query": "peanuts" }` |
| `add_task` | Someone wants a to-do saved. This does not start a plan. | `{ "title": "Buy oat milk", "due": "2026-10-09" }` |
| `list_tasks` | Someone asks what is on the list. | `{ "status": "open" }` |
| `complete_task` | Someone says a task is done. Match the id or the title. | `{ "taskIdOrTitle": "Buy oat milk" }` |
| `daily_briefing` | Someone wants this morning at home. No model call. | `{}` |
| `plan_and_run` | Someone wants the team to plan a goal, such as a week of meals. This does not start the team. | `{ "goal": "Plan dinners for this week" }` |
| `get_run_status` | Someone asks how a plan is going. Omit `runId` for the latest run. | `{}` |
| `approve_action` | A tool returned `needs_approval` and the person has given an explicit yes or no. | `{ "approvalId": "<approvalId>", "decision": "approve" }` |
| `ask_agora` | A household question, such as an allergy. Answers from saved memory. It does not change anything. | `{ "question": "What is Mia allergic to?" }` |
| `web_research` | The question needs the public web, such as a current price. | `{ "question": "What does oat milk cost this week?" }` |

`ask_agora`, `plan_and_run`, and `web_research` may call the server model. The other tools do not. Alexa+ wants a round trip under 500 ms for tools that do not call a model. Prefer `recall`, `list_tasks`, and `daily_briefing` for those questions.

## Resources and prompts

Read a resource when the person wants the file, not a spoken line.

- `agora://memory` — markdown facts, grouped by tag.
- `agora://tasks` — JSON, open and finished tasks.
- `agora://runs/{runId}/document` — the written result of one run. `get_run_status` returns this URI when the run has finished.
- `ui://daily_briefing/household-card.html` — the screen card linked from `daily_briefing` and `list_tasks`. A host that supports MCP Apps renders it. The card can mark a task done or approve a waiting action. On a speaker, ignore the card and speak `speech`.

Prompts:

- `morning-briefing` — no arguments. Then call `daily_briefing` and speak only its `speech`.
- `plan-a-week-of-meals` — arguments `{ "people": "the family", "constraints": "Mia is allergic to peanuts" }`. Then call `plan_and_run` and wait.

## Approval

`forget` and `plan_and_run` return `status: "needs_approval"` and an `approvalId`. Show the person the `summary` or `preview` and ask for a yes or a no. Call `approve_action` only after an explicit yes (`yes`, `approve`, `do it`) or an explicit no (`no`, `don't`, `cancel`).

Never approve on the person's behalf. Do not treat silence, an earlier yes, or your own judgment as approval. A screen card may call `approve_action` when the person taps Approve or Decline. Do not send a second decision for the same id. A yes for one approval does not cover the next one. If they change the subject, leave the approval waiting. Approvals expire after ten minutes. If `approve_action` says the approval expired, ask again and get a new yes.

`decision: "approve"` is the only call that deletes a memory or starts the household team. `decision: "reject"` leaves things as they are.

## Voice

Speak the `speech` field. At most two sentences. Put lists, receipts, previews, and links on screen. Do not read URLs aloud. Do not add a third spoken sentence around the tool result.

## Receipts

A write can include `receipt`. `verified: true` means a follow-up read saw the same record. `verified: false` means that read did not. Say so. Do not tell the person the save is confirmed when `verified` is false.

## Errors

- **401 on `/mcp`.** The body is empty and there is no `WWW-Authenticate` header. The token is missing, wrong, or expired. Fetch a new one: development token from the person who runs the server, a new client-credentials token, or `grant_type=refresh_token`. Then retry the same call once. Do not keep sending the dead token.
- **403.** The JSON-RPC message names the missing scope, `mcp:tools` or `mcp:resources`. A `mcp:service` token cannot call tools or read resources. Get an authorization-code token, or use the development token. Do not retry with the same token.
- **`household_locked`.** Household HTTP routes return `401` and `{ "error": "household_locked" }` when `AGORA_HOUSEHOLD_PASSCODE` is set and the browser has no `agora_household` cookie. `/mcp` does not use that cookie. Tell the person the household page is locked and to enter the passcode on the server. Do not guess the passcode, and do not send it to a tool.
