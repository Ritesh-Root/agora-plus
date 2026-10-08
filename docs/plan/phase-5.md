# Phase 5: Agent Skill, Alexa+ add-on package, and deploy

Goal: cover the second half of the Alexa+ track ("or an Agent Skill"), prepare everything an Alexa+ add-on submission
needs, and make the production build deployable. Do not run any deploy, login or submit command yourself.

## 1. Agent Skill — `skills/agora-household/`
Follow the Agent Skills spec (https://agentskills.io/specification):
- `SKILL.md` frontmatter: `name: agora-household` (lowercase, hyphens, must equal the folder name), `description`
  (≤ 1024 chars; say what it does and when to use it: household memory, tasks, briefings, and approval-gated plans through
  the AGORA+ MCP server), `license: MIT`, `compatibility` (needs network access to an AGORA+ server and a bearer token).
- Body (< 500 lines), written for an AI agent:
  - What AGORA+ is in three sentences.
  - How to connect: Claude Code `claude mcp add --transport http agora <url>/mcp --header "Authorization: Bearer $AGORA_MCP_TOKEN"`;
    any other MCP client (Streamable HTTP, OAuth client credentials or the dev token).
  - When to use each of the 12 tools, with one example call each. The three resources and two prompts.
  - The approval protocol: tools that return `needs_approval` must be confirmed by the human; only then call
    `approve_action`. Never approve on the user's behalf without an explicit yes.
  - Voice style: speak the `speech` field; at most two sentences; details go on screen.
  - Receipts: report `verified: false` honestly.
  - Error handling for 401 (token expired → fetch a new one), 403 (scope), and `household_locked`.
- `references/TOOLS.md`: the generated tool reference (name, description, input schema, output fields) — write a small
  vitest-free node script under `server/mcp/` *only if needed*; simplest is to write it by hand from `server/mcp/server.ts`.
- `references/ALEXA_ADDON.md`: how to ship AGORA+ as an Alexa+ add-on, from
  https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html and
  https://developer.amazon.com/docs/alexaplus/add-ons/alexa-ai-cli-reference.html :
  `npm install -g @alexa-ai/cli`, `alexa-ai --version`, `alexa-ai configure` (Login with Amazon),
  `alexa-ai new mcp --name "AGORA+" --locale en-US --mcp-server-url "https://<host>/mcp"`, `alexa-ai deploy`
  (development stage), testing (simulator / device), `alexa-ai submit`. Auth fields to enter: token URL
  `https://<host>/oauth/token`, client id/secret, scope `mcp:service`; account linking with `/oauth/authorize`
  (authorization code + PKCE) for `mcp:tools mcp:resources`. Note: US-only distribution, < 500 ms round trip for
  non-model tools, 401 without `WWW-Authenticate`.
- `server/skill.test.ts`: parses the frontmatter of every `skills/*/SKILL.md` and checks the name pattern
  (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 chars), name = folder name, description present and ≤ 1024 chars, body < 500 lines.

## 2. Alexa+ add-on package — `alexa-addon/`
- `addon.json` matching the quickstart's fields and limits: `name.value` ≤ 30 chars ("AGORA+ Household"),
  `shortDescription` ≤ 123, `fullDescription` ≤ 4000, 3–4 `examplePhrases` ≤ 200 chars each (e.g. "Ask AGORA what Mia is
  allergic to", "Tell AGORA to plan dinners for this week", "Ask AGORA for my briefing"), `privacyPolicyUrl` and
  `termsOfUseUrl` pointing at `https://<host>/privacy.html` and `/terms.html`, `distributionCountries: ["US"]`,
  the MCP server URL placeholder `https://<host>/mcp`. Keep `<host>` as a literal placeholder and explain it in a README.
  If the real schema differs from what the docs show, follow the docs and say so in the friction log.
- `alexa-addon/README.md`: what each field is, how to fill `<host>`, and that `alexa-ai new mcp` may regenerate this.
- Media: create `alexa-addon/media/icon.svg` (an original mark in AGORA's palette — butter ring on ink; no Amazon marks)
  and render PNG icons at 72, 64, 88, 126, 180 and 241 px plus one 600×900 carousel image with ImageMagick
  (`magick` is installed). Put them in `alexa-addon/media/` and list them in `addon.json` with alt text ≤ 250 chars.
- `public/privacy.html` and `public/terms.html`: short, plain, honest pages for a self-hosted household server
  (what is stored, where, who can see it, how to delete it; no warranty; open source MIT). Same fonts/colors as the app.

## 3. Production build and deploy docs
- Make sure the production bundle works with the new dependencies: run
  `npm run build && ./node_modules/.bin/esbuild server/prod.ts --bundle --platform=node --format=esm --outfile=dist/server.mjs --packages=external`,
  then start `PORT=8099 AGORA_MCP_TOKEN=x node dist/server.mjs` in the background, check
  `curl -si -X POST localhost:8099/mcp -H 'content-type: application/json' -d '{}'` → 401 and `curl -s localhost:8099/alexa` → HTML,
  then stop it. Fix anything that breaks (for example ESM/CJS interop of new packages). Do not change the Dockerfile unless needed.
- `docs/DEPLOY.md`:
  - Local + HTTPS tunnel for Alexa+ testing: a **named** Cloudflare tunnel (quick tunnels change URL every run, which
    breaks the add-on's registered URL), with the exact `cloudflared` commands; set `AGORA_PUBLIC_URL` to the tunnel URL.
  - AWS: container image in Amazon ECR, run on Amazon ECS (Express Mode if available in the account, otherwise a
    one-task Fargate service behind an Application Load Balancer), one task only (the room and approvals are in memory),
    port 8080, ALB idle timeout ≥ 300 s for WebSockets/SSE, a task role with `bedrock-mantle:CreateInference` and
    `polly:SynthesizeSpeech` (show the IAM policy JSON), secrets via AWS Secrets Manager / SSM for `AGORA_*`. Mark every
    command whose flags you are unsure about with a `verify:` note and the doc URL. Mention that `.agora-data` is lost
    when the task is replaced unless an EFS volume is mounted.
  - Cloud Run fallback (the existing `server/prod.ts` notes).
  - Environment table: every variable in `.env.example`, required/optional, default, what it does.

## Acceptance
- The full gate passes (including `server/skill.test.ts`).
- The production bundle smoke test above passes and the server is stopped afterwards.
- `alexa-addon/addon.json` is valid JSON and every length limit is met (add a small check in `server/skill.test.ts`).
