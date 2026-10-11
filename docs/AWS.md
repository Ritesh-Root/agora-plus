# AWS Builder

AGORA+ calls two AWS services from this process: Claude on Amazon Bedrock, and Amazon Polly. Hosting is a single ECS task, or a Cloudflare tunnel, or Cloud Run. The commands and the checks that were not run are in [docs/DEPLOY.md](DEPLOY.md). This page is the Builder write-up. Prices are not estimated. Call counts below are what the code does.

## Amazon Bedrock

The client is `AnthropicBedrockMantle` from `@anthropic-ai/bedrock-sdk` (package range `^0.34.3` in [package.json](../package.json)). [server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts) calls `client.messages.create`. That is the Claude Messages endpoint. The Converse client is not imported.

Turn it on with `AGORA_SERVER_LLM=bedrock`. Credentials are the standard AWS chain. The region is `AWS_REGION`, or `us-east-1` when that is unset. Nothing in the provider logs the credential.

Model ids keep the `anthropic.` prefix:

| Variable | Default in code | Used for |
|---|---|---|
| `BEDROCK_MODEL` | `anthropic.claude-sonnet-5` | Office swarm names that do not already start with `anthropic.`, and the lead's planning call |
| `BEDROCK_FAST_MODEL` | `anthropic.claude-haiku-4-5` | `ask_agora`, `web_research` answers, the voice model when `ALEXA_SIM_MODEL` is unset, and the spoken summary |
| `ALEXA_SIM_MODEL` | falls through to the fast model | The voice simulator's model path only |

`pickModel` in [server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts) sends any other name, including the office's DeepSeek and Qwen ids, to `BEDROCK_MODEL`. A refusal becomes the sentence "The model declined this request."

Who calls it:

- The tool loop, [server/llm/toolLoop.ts](../server/llm/toolLoop.ts). History is append-only. The system prompt and the tool list stay fixed. Parallel tool results go back in one user message. The default cap is 4 steps (`maxSteps ?? 4`).
- `ask_agora` in [server/household/actions.ts](../server/household/actions.ts), on the fast model. About 4 seconds for Alexa, 9 seconds for the voice simulator client. Memory is in the user turn.
- `planSociety` in [server/society/Orchestrator.ts](../server/society/Orchestrator.ts), one Messages call that returns the step list.
- `runSociety` in the same file, after approval: workers, an optional debate, the lead's merge, and up to two repair calls when the brief asks for them.
- The spoken summary in [server/runEngine.ts](../server/runEngine.ts), one fast-model call after a household run finishes.

The office uses this provider when the browser did not send a key and `AGORA_SERVER_LLM=bedrock` ([server/relay.ts](../server/relay.ts), [server/routingProvider.ts](../server/routingProvider.ts)).

The client is created with a 90 second timeout and one retry. Preview and spoken-summary stages use 20 seconds and no retries. Worker, debate, assemble, and repair stages use 90 seconds and one retry ([server/llm/bedrockProvider.ts](../server/llm/bedrockProvider.ts)). A 429 or throttle is "The model is busy right now. Try again in a moment."

IAM: `bedrock-mantle:CreateInference` on `arn:aws:bedrock-mantle:*:*:project/*`. The policy is below. A live `messages.create` was not recorded. `aws sts get-caller-identity` in the phase 3 shell returned `NoCredentials` ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)). Bedrock and Polly run only when AWS credentials are present. Latency for a real Bedrock turn, and time to first audio, were not measured.

## Calls per voice turn

Acknowledgement text is chosen in [server/alexaSim/ack.ts](../server/alexaSim/ack.ts) before any model call. That is zero Bedrock calls.

Fast path, the default ([server/alexaSim/fastPath.ts](../server/alexaSim/fastPath.ts)): remember, recall, the briefing, task add/list/done, the shopping list, a reminder with `dueAt`, a plan request, and an exact yes or no while an approval is waiting. The bridge calls MCP and does not call Bedrock for the routing. The voice model is not given `approve_action`. `daily_briefing` is fixed logic, still zero model calls. `remember`, `recall`, `add_task`, `list_tasks`, and `complete_task` do not call a model either.

`plan_and_run` on that path calls Bedrock once, inside the tool, when the goal is something this household can plan: `planSociety` is one `generateCompletion` so the approval can show the steps. The swarm does not start until a person approves. If that preview throws or returns no steps, the tool says planning is unavailable and does not create an approval ([server/household/actions.ts](../server/household/actions.ts)). An order, a purchase, a booking, a payment, or a phone call is refused with no Bedrock call and no approval id.

Model path (`ALEXA_SIM_FAST_PATH=0`, or an utterance the fast path does not claim): `runToolLoop` makes one Messages call per step, and stops when `stop_reason` is not `tool_use`, at most 4. The voice model is `ALEXA_SIM_MODEL`, else `BEDROCK_FAST_MODEL`, else `anthropic.claude-haiku-4-5` ([server/alexaSim/oauthClient.ts](../server/alexaSim/oauthClient.ts)). Each tool the model calls can add the calls in the next paragraph.

| Tool the voice model calls | Extra Bedrock calls |
|---|---|
| `remember`, `recall`, `forget`, `add_task`, `list_tasks`, `complete_task`, `daily_briefing`, `get_run_status`, `approve_action` | 0 |
| `ask_agora` | Up to 4 on the fast model, or fewer if the loop ends, or 0 if the model is missing or the timeout fires (about 4 seconds for an Alexa client, 9 seconds when the MCP client name is `agora-plus-voice`). The reply falls back to the top saved fact. |
| `web_research` | 1 fast-model completion when Firecrawl or Exa is configured and the search returned text. 0 when research is not configured |
| `plan_and_run` | 1 planning call for the preview |

## Calls per swarm run

The preview above is the planning call. Approval starts `runSociety` with `presetTasks`, so it does not plan again.

From [server/society/Orchestrator.ts](../server/society/Orchestrator.ts) and [server/society/Negotiation.ts](../server/society/Negotiation.ts):

- One Messages call per worker attempt. `MAX_ATTEMPTS` is 2 (the first try and one retry).
- When at least two worker outputs are usable, they are debated. [server/society/leadNotes.ts](../server/society/leadNotes.ts) sends the first two of those outputs into the debate. Each round is one call per position plus one referee call. A decisive round adds one synthesis call. Otherwise the loop runs up to `maxRounds` (default 2) and then one escalation call.
- One lead merge call when any worker finished with text.
- Up to `MAX_DOCUMENT_REPAIRS` (2) more lead calls, only when the brief matches the word-limit or section checks in [server/society/documentCheck.ts](../server/society/documentCheck.ts). `householdBrief` in [server/household/actions.ts](../server/household/actions.ts) is the goal plus up to eight memory lines. It does not add "under 400 words" or the four section names.
- One fast-model spoken summary after the document is saved ([server/runEngine.ts](../server/runEngine.ts)). That call is outside `runSociety`'s tally.

How many workers the preview produces depends on the model. This page does not turn that into a single call count or a dollar figure. The office validation table in [README.md](../README.md) records call counts for older film-brief runs. Those runs are not household dinner plans, and this pass did not rerun them.

## Amazon Polly

[server/alexaSim/tts.ts](../server/alexaSim/tts.ts) uses `@aws-sdk/client-polly` (`SynthesizeSpeechCommand`). Defaults: voice `Joanna`, engine `neural`, region `AWS_REGION` or `us-east-1`. Output is mp3. The cache holds 100 clips, keyed by engine, voice, and text. `warmAcknowledgements` fills that cache with the seven phrases in `ACK_PHRASES`.

A voice turn asks Polly for the acknowledgement (a cache hit after the warm-up) and for the spoken reply (a cache hit only if that sentence was spoken before). Each miss is one `SynthesizeSpeech`. The route is `POST /api/tts`. No credentials, or a Polly error, returns 503 `tts_unavailable`, and the browser speaks instead.

Polly latency on a successful synthesize was not measured. The phase 4 log recorded a 503 in about 2 seconds when the shell had no AWS credentials ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)).

IAM: `polly:SynthesizeSpeech` on `*`.

## Deployment

[docs/DEPLOY.md](DEPLOY.md) is the runbook:

- A named Cloudflare tunnel, because a quick tunnel hostname changes and Alexa+ stores the MCP URL.
- Amazon ECR, then ECS Express Mode, or one Fargate task if `aws ecs create-express-gateway-service help` is missing.
- Cloud Run as the fallback. [server/prod.ts](../server/prod.ts) listens on `PORT`.

Run one task. The office room and the waiting approvals are in that process. A second task has its own room and will not see the first task's approvals. `.agora-data` is on the task disk unless you mount a volume.

The Express Mode and Fargate commands in that doc were not executed from this workspace. The production bundle was started locally on port 8099 and then stopped ([docs/HACKATHON_CHANGES.md](HACKATHON_CHANGES.md)).

## Task role

Trust `ecs-tasks.amazonaws.com` with `sts:AssumeRole`. This is the same policy as [docs/DEPLOY.md](DEPLOY.md):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockMantle",
      "Effect": "Allow",
      "Action": "bedrock-mantle:CreateInference",
      "Resource": "arn:aws:bedrock-mantle:*:*:project/*"
    },
    {
      "Sid": "PollySpeech",
      "Effect": "Allow",
      "Action": "polly:SynthesizeSpeech",
      "Resource": "*"
    }
  ]
}
```

`bedrock-mantle:CreateInference` matches the managed policy `AmazonBedrockMantleInferenceAccess` resource shape, as noted in the deploy doc. Secrets stay in the task environment or in Secrets Manager. They are not in the image and not in this repository.
