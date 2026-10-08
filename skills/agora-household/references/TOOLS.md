# AGORA+ MCP tools

Taken from `server/mcp/server.ts`. The server name is `agora-plus`, version `0.1.0`. The negotiated protocol is `2025-11-25` or newer. Alexa's published client sample sends `2025-03-26`. The specification index on 8 Oct 2026 names `2026-07-28`. Eleven tools are always registered. `web_research` is registered only when `FIRECRAWL_API_KEY` or `EXA_API_KEY` is set. Every tool returns `content` (text, the spoken line) and `structuredContent` (the fields below). A failure also sets `isError: true` and `status: "error"`. `daily_briefing` and `list_tasks` also set `_meta.ui.resourceUri` to the household card.

## Shared output

| Field | Type | When |
| --- | --- | --- |
| `speech` | string | Always. Short enough to say aloud. At most two sentences. |
| `status` | `ok` \| `needs_approval` \| `error` | Always. |
| `receipt` | object | After a write that finished. |
| `receipt.action` | string | What was written, such as `remember` or `forget`. |
| `receipt.id` | string | Id of the record. |
| `receipt.verified` | boolean | True when a follow-up read saw the same record. |
| `receipt.at` | string | ISO time of the receipt. |
| `approvalId` | string | When `status` is `needs_approval`. Pass it to `approve_action`. |

## remember

Call when someone asks the household to remember a fact, such as an allergy or a preference. It saves the fact on this server and returns a short confirmation plus a receipt. `verified` is true when a follow-up read saw the same words.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `fact` | string | yes | The fact to keep, in the words the person used. |
| `tags` | string[] | no | Optional labels such as allergy or preference. |
| `who` | string | no | The person this fact is about. A leading capitalised name is stored when this is omitted. |

Output: `speech`, `status`, `receipt`. `who` is on the saved memory when one was stored. The same text, after trim, collapsed space, and case folding, updates the existing row.

## recall

Call when someone asks what the household already knows. It returns the closest saved facts. A tie speaks both matches. A partial overlap says "I'm not sure, but I have: ...". An empty query returns the newest facts. It does not change anything.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | no | Words to look for. Leave empty for the newest facts. |

Output: `speech`, `status`, and `memories` (up to five).

| `memories[]` | Type |
| --- | --- |
| `id` | string |
| `text` | string |
| `tags` | string[] |
| `who` | string, only when the fact names a person |

## forget

Call when someone wants a saved fact removed. It does not delete anything. It returns `needs_approval` and an `approvalId`. Call `approve_action` before the fact is gone.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `memoryId` | string | no | Exact memory id, when you already have it. |
| `query` | string | no | Words that identify the fact, when you do not have the id. |

One of `memoryId` or `query` must be non-empty.

Output: `speech`, `status`, `approvalId`, `summary` (string, what would be forgotten).

## add_task

Call when someone wants a household to-do saved. It stores the task and returns a receipt. It does not start a plan.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | What needs doing, as a short title. |
| `due` | string | no | Optional free-text due, such as "today" or "at 6pm". |
| `who` | string | no | The person who owns the task. |
| `list` | string | no | Named list such as `shopping`. Omit it for the main to-do list. |
| `dueAt` | string | no | ISO 8601 reminder time with a numeric offset. An open task whose `dueAt` is already past is due. |

Output: `speech`, `status`, `receipt`. "today" and "due today" use `AGORA_TIMEZONE`, or the server zone when that is unset.

## list_tasks

Call when someone asks what is on the household list. It returns open tasks, finished tasks, or both, and the spoken reply gives the count. It does not change anything.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | `open` \| `done` | no | Filter. Leave empty for both. |
| `list` | string | no | `shopping` for that list, `main` for the to-do list. Leave empty for every list. |

Output: `speech`, `status`, and `tasks`. A list of only finished tasks says there are no open tasks. The shopping list says "On the shopping list: ..." or "The shopping list is empty."

| `tasks[]` | Type |
| --- | --- |
| `id` | string |
| `title` | string |
| `status` | `open` \| `done` |
| `due` | string, only when the task has one |
| `who` | string, only when the task has an owner |
| `list` | string, only when the task is on a named list |
| `dueAt` | string, only when the task has a reminder time |

## complete_task

Call when someone says a household task is done. Match the id or the title. Calling it again on a finished task leaves that task done and still returns a receipt.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskIdOrTitle` | string | yes | The task id, or the title in any capitalization. |

Output: `speech`, `status`, `receipt`.

## daily_briefing

Call for the morning household briefing. It is built from saved memory (allergies and medicine first), due reminders, open tasks, waiting approvals, and recent runs. It does not call a model. With a saved peanut fact the spoken line includes "Remember: Mia is allergic to peanuts." An overdue reminder is "Reminder: &lt;title&gt;."

Input: none.

Output: `speech`, `status`, `items` (string[], the briefing lines), `suggestions` (string[]), and `approvals` (`id`, `summary`) for a screen. The spoken line is still only `speech`. `daily_briefing` and `list_tasks` link a screen card at `ui://daily_briefing/household-card.html`.

## plan_and_run

Call when someone wants the household team to plan a goal, such as a week of meals. It does not start the team. It returns `needs_approval`, an `approvalId`, and a `preview` that lists the planned steps. Call `approve_action` before anything runs. An order, a purchase, a booking, a payment, or a phone call is refused, with no `approvalId`. If the preview throws or returns no steps, the speech is "Planning is unavailable right now." and there is no approval. Approving a plan runs only the saved step list.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `goal` | string | yes | What the household wants planned. |

Output: `speech`, `status`, `approvalId`, `preview` (string).

## get_run_status

Call to check a household plan run. Leave `runId` empty for the latest run. When the run has finished, the spoken reply is a short summary and the result includes a link to the written document. It does not start or change a run.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `runId` | string | no | A run id. Leave empty for the latest run. |

Output: `speech`, `status`, `runId`, `runStatus`, `brief`, `finished` (boolean). When `finished` is true, also `documentUri` (`agora://runs/{id}/document`) and a `resource_link` in `content`.

## approve_action

Call after a tool returns `needs_approval`. `decision` `approve` performs the waiting action, such as deleting a memory or starting a plan. `decision` `reject` leaves things as they are. This is the only tool that deletes a memory.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `approvalId` | string | yes | The `approvalId` from the tool that asked for a yes. |
| `decision` | `approve` \| `reject` | yes | `approve` to do it, `reject` to leave it. |

Output: `speech`, `status`. A finished forget includes `receipt`. An approved plan includes `runId` for `get_run_status`. A busy room or a handler error leaves the approval pending. Say so and let the person retry. On the voice simulator the model cannot call this tool. A person uses an exact yes or no, or a button. External clients, including an Alexa+ add-on, still call it.

## ask_agora

Call for a household question, such as an allergy. Agora answers in a sentence or two from saved memory, and may check tasks, the briefing, or a run. It does not change anything.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `question` | string | yes | The question, in everyday words. |

Output: `speech`, `status`, `memories` (`id`, `text`, `tags` only). `who` is omitted because this output schema rejects extra properties. About 4 seconds for an Alexa client, 9 seconds when the client name is `agora-plus-voice`. A missing model or a timeout names the top saved fact and does not use the two-fact recall sentence.

## web_research

Call when a household question needs the public web, such as a current price. It returns a short answer and names the source. The tool is not registered when neither `FIRECRAWL_API_KEY` nor `EXA_API_KEY` is set. It does not invent sources.

Input:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `question` | string | yes | What to look up on the web. |

Output: `speech`, `status`, and `sources` (`title`, `url`) when pages were used. The spoken line does not read the URL.

## Resources

| URI | Name | MIME | What it is |
| --- | --- | --- | --- |
| `agora://memory` | `memory` | `text/markdown` | Facts the household has asked AGORA+ to remember, grouped by tag. A fact names the person when `who` is set. |
| `agora://tasks` | `tasks` | `application/json` | Open and finished household tasks. |
| `agora://runs/{runId}/document` | `run-document` | `text/markdown` | The written result of one household run. `runId` is a UUID. A missing run is not found. |

## Prompts

### morning-briefing

Ask for today at home. No arguments. The reply should stay short enough to say aloud. The prompt text tells the agent to call `daily_briefing` and speak only its short `speech`, and to mention a waiting approval if there is one.

### plan-a-week-of-meals

Ask AGORA+ to plan meals for the people in the house. It must wait for approval before starting.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `people` | string | yes | Who is eating, for example the family or a count. |
| `constraints` | string | no | Allergies, budget, or foods to skip. |
