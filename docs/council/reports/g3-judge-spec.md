Cloudflare Browser returned HTTP 429 three times in a row after the Devpost pages, so this scrape stopped. The Amazon Alexa+ toolkit, the live MCP specification, and the MCP Apps extension were not fetched.

# Hackathon judge and spec-compliance report

Summary: Do not file this yet. The household MCP server, Agent Skill, unofficial voice simulator, friction log, and product feedback match the Alexa+ path on the Devpost resources page, and the window commits are real. The packet is not a legal submission: there is no public video, and the repo, contribution, and GitHub fields are still placeholders. Pasting the description as written would also over-claim live Alexa+, ChatGPT, Bedrock, and Polly use. Scores if a judge saw the repo today and no video: Technical 7, Design 6, Impact 6, Quality of idea 8.

## Findings

### JDG-1 No public demo video, and the packet has no video field
- Severity: P0
- Area: `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`
- Evidence: `docs/SUBMISSION.md:101` starts "Product feedback" and the file ends at line 107 with no YouTube or Vimeo URL (a search of that file for video, YouTube, and Vimeo has no hits). `docs/DEMO_SCRIPT.md:3` is a script ("Target length: under 2:55"), not a recording. Rules: "should be less than three (3) minutes. Judges are not required to watch beyond three minutes" and "must be uploaded to and made publicly visible on YouTube or Vimeo" (https://amazonappdev2026.devpost.com/rules, page contains a 16 Sep 2026 repository update; fetched 8 Oct 2026).
- Why it matters: Judges may score from the video alone ("Judges are not required to test the Project"). Without it the entry fails Submission Requirements. Criterion: Technical implementation, Design, Impact, Quality of idea.
- Fix: Record the existing script in Chrome, stop before 2:55, upload a public English YouTube or Vimeo video, and add that URL to the Devpost form and to `docs/SUBMISSION.md`.
- Effort: M
- Confidence: high

### JDG-2 Public repo URL and Open Source fields are still placeholders
- Severity: P0
- Area: `docs/SUBMISSION.md`, `README.md`
- Evidence: `docs/SUBMISSION.md:55` is `` `<REPO_URL>` ``. Lines 87–91 are `` `<CONTRIBUTION_URL>` ``, `` `<REPO_URL>` ``, and `` `<GITHUB_USERNAME>` ``. Lines 53–57 say the live repo is `https://github.com/Ritesh-Root/agora` and "The hackathon entry is a new public MIT repo. Its URL is not published from this workspace." `README.md:53` is `git clone <REPO_URL>`. Rules require "a URL to your code repository" that is public with a visible open-source license, or private and shared with testing@devpost.com plus chris-trag, knmeiss, giolaq, anishamalde, mosesroth, and emersonsklar. Open Source additionally: "Provide contribution URL, project repository URL, GitHub username, and a description" (https://amazonappdev2026.devpost.com/rules, fetched 8 Oct 2026). Local `git status -sb` shows `alexa-hackathon` with no upstream; whether that branch is already on GitHub is unverified (no GitHub fetch).
- Why it matters: Judges cannot clone, and the Open Source mini challenge is incomplete. `docs/SUBMISSION.md:73` also says the Devpost text is "in the working tree until the phase is committed," but commit `23f39e9` (8 Oct 2026, "Phase 6") already contains that file and the rest of the tree is clean aside from `docs/council/`. Pasting that sentence tells judges the write-up was never committed. Criterion: Technical implementation, Quality of idea.
- Fix: Publish the public MIT repo (or invite the listed reviewers on a private one), fill the three Open Source fields with real URLs and the GitHub username, delete the "working tree" sentence, and point the README clone line at that URL. Add the reviewers when you submit; invitations expire after 7 days.
- Effort: S
- Confidence: high

### JDG-3 The pitch says Alexa+, ChatGPT, Bedrock, and Polly are already in use
- Severity: P1
- Area: `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`, `docs/ARCHITECTURE.md`
- Evidence: `docs/SUBMISSION.md:19` "Claude and ChatGPT call that server too." `docs/SUBMISSION.md:29` "The swarm calls Claude on Bedrock." `docs/ARCHITECTURE.md:34` "Alexa+, Claude, ChatGPT, and the voice simulator all reach the same tools. The other three are MCP clients." `docs/DEMO_SCRIPT.md:98` tells the narrator to say "Alexa+, Claude, and ChatGPT call one MCP server. Bedrock plans. Polly speaks." The same packet says `docs/SUBMISSION.md:83` "A live Bedrock call and a successful Polly synthesize were not recorded." `docs/FEEDBACK.md:25` "`alexa-ai` was not installed, logged in, configured, deployed, or submitted." The only client setup in `skills/agora-household/SKILL.md:18-21` is Claude Code with `AGORA_MCP_TOKEN`. No ChatGPT connector config exists in the repo.
- Why it matters: A judge who reads the first paragraphs, or hears that line, will think three assistants and two AWS services were demonstrated. The later caveat does not undo the claim. The rules also say the video must show the project "functioning … as depicted." Criterion: Technical implementation, Impact, Quality of idea.
- Fix: In the Devpost description and the voiceover, say the judged surfaces are the unofficial simulator and a self-hosted MCP server exercised from Claude Code. Say Bedrock and Polly run only when AWS credentials are present, and show one successful call in the video if you want AWS Builder credit for them.
- Effort: S
- Confidence: high

### JDG-4 The Alexa+ add-on package cannot be deployed or certified from this tree
- Severity: P1
- Area: `alexa-addon/addon.json`
- Evidence: `alexa-addon/addon.json:21` `"privacyPolicyUrl": "https://<host>/privacy.html"` and `alexa-addon/addon.json:54` `"uri": "https://<host>/mcp"`. `alexa-addon/addon.json:4` `"distributionCountries": ["US"]`. `docs/FEEDBACK.md:25` says `alexa-ai` was never deployed or submitted. The hackathon does allow a simulator instead of a live add-on: "You can simulate an Alexa+ experience using your preferred agentic tools via a web app" (https://amazonappdev2026.devpost.com/resources, page shows an 7 Oct 2026 credits update; fetched 8 Oct 2026). Certification steps on developer.amazon.com were not fetched (see the first line).
- Why it matters: Alexa track judges are on the panel (Karthik Ragubathy, Emerson Sklar, Saylee Joshi, listed on https://amazonappdev2026.devpost.com/, fetched 8 Oct 2026). The description leads with "OAuth for Alexa+" (`docs/SUBMISSION.md:19`) while the manifest is still a template. Criterion: Technical implementation, Design.
- Fix: Either replace `<host>` with a stable HTTPS origin, deploy, and show that server in the video, or state in the first paragraph that the entry is the simulator plus the MCP server and that the add-on was not submitted to Alexa.
- Effort: M
- Confidence: high

### JDG-5 The first screen a judge opens is the old 3D office
- Severity: P1
- Area: `README.md`, `src/alexa/AlexaSimulator.tsx`
- Evidence: `README.md:80` "Open http://localhost:3000/ for the office and http://localhost:3000/alexa for the voice page." `README.md:41-46` still lists `household-panel.png`, `office-household-run.png`, `mcp-inspector.png`, and `claude-mcp-recall.png` as "Still to capture." The voice page itself is labeled at `src/alexa/AlexaSimulator.tsx:400` "AGORA+ voice · simulated Alexa+ experience (unofficial)." Design criterion: "Does the project deliver a complete, coherent product experience?" (https://amazonappdev2026.devpost.com/, fetched 8 Oct 2026).
- Why it matters: The household story lives on `/alexa`. The URL in the quick start is the pre-window office. Missing shots are the editable memory, the team during a plan, the tool list, and Claude recalling the allergy, which is the demo the script needs. Criterion: Design.
- Fix: Make `/alexa` the quick-start URL and the first shot in the video. Capture those four images before submit. Keep the office as a short cut after the approval, which the script already does at `docs/DEMO_SCRIPT.md:51`.
- Effort: S
- Confidence: high

### JDG-6 Open Source prize text treats a mixed-license repo as one MIT project
- Severity: P1
- Area: `LICENSE`, `LICENSE-ASSETS.md`, `docs/SUBMISSION.md`
- Evidence: `LICENSE:1` "MIT License". `LICENSE-ASSETS.md:9` "3D Assets License: CC BY-NC 4.0" and `LICENSE-ASSETS.md:29` "they must be replaced with original or CC0 assets before any commercial deployment." `docs/SUBMISSION.md:97` tells Devpost "The code license is LICENSE (MIT). 3D assets are CC BY-NC 4.0." Alexa+ and Open Source prizes include "Project featured on Amazon Developer channels" (https://amazonappdev2026.devpost.com/, fetched 8 Oct 2026). `git cat-file -e pre-window:LICENSE` succeeds, so the MIT file predates the 31 Aug 2026 window start stated in the rules.
- Why it matters: Featuring the 3D models can conflict with the non-commercial term the repo already warns about. The Open Source challenge wants a project or contribution made during the window, not only a license that was already on AGORA. The household demo does not need the models. Criterion: Quality of idea, Technical implementation.
- Fix: In the Open Source answer, say the window contribution is the household MCP branch, code is MIT, and `public/models/` is CC BY-NC and not required to run `/alexa`. If Amazon may feature the video, keep those models out of the video or swap them.
- Effort: S
- Confidence: high

### JDG-7 OAuth will send the authorization code to any HTTPS redirect
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:313` `if (url.protocol === 'https:') return true;` `server/mcp/oauth.ts:338` rejects only URLs that fail `allowedRedirect`. `skills/agora-household/references/ALEXA_ADDON.md:84` says "At request time this server accepts any `https` redirect URI and echoes the `redirect_uri` Alexa sent." The Amazon authentication page that would say whether a registered redirect list is required was not fetched.
- Why it matters: Anyone who knows the client id can start account linking and receive the code on their own HTTPS URL. That is a real hole in the auth the pitch offers to Alexa+. Criterion: Technical implementation.
- Fix: Allow only redirect URIs from an env list (the ones `alexa-ai` prints), plus localhost for the simulator.
- Effort: S
- Confidence: high on the code; medium that a written Amazon rule requires the allowlist (that page was not fetched)

### JDG-8 The demo hook puts copyrighted review sentences on screen
- Severity: P2
- Area: `docs/DEMO_SCRIPT.md`
- Evidence: `docs/DEMO_SCRIPT.md:16-18` puts Spyglass, Wired, and Consumer Reports sentences on screen as the opening shot. Rules: "must not include third party trademarks, or copyrighted music or other material unless the Entrant has permission" (https://amazonappdev2026.devpost.com/rules, fetched 8 Oct 2026).
- Why it matters: Those lines are someone else's article text. A strict reading of the video rule can discount the opening. Criterion: Design.
- Fix: Paraphrase the three complaints in your own words and leave the citations in the README, not as article excerpts on screen.
- Effort: S
- Confidence: medium

### JDG-9 A default setup leaves household files readable on the network
- Severity: P2
- Area: `server/household/session.ts`, `.env.example`, `README.md`
- Evidence: `server/household/session.test.ts:128` "leaves the routes open when no passcode is configured" and expects `GET /api/household` to return 200. `.env.example:28` is `AGORA_HOUSEHOLD_PASSCODE=` (empty). `README.md:80` says `npm run dev` "binds `0.0.0.0`".
- Why it matters: The quick start a judge follows serves memory and tasks to every interface on the machine until a passcode is set. Criterion: Technical implementation, Impact.
- Fix: When `AGORA_HOUSEHOLD_PASSCODE` is empty, bind the dev server to 127.0.0.1, or refuse `/api/household` with a clear "set a passcode" error outside localhost.
- Effort: S
- Confidence: high

## Scores

Judged as the repo stands on 8 Oct 2026, with no video and no public URL. The four criteria are equally weighted ("equally weighted criteria", https://amazonappdev2026.devpost.com/rules, fetched 8 Oct 2026). Stage 1 is pass/fail on whether the project fits the track. This one should pass Stage 1 once the video shows `/alexa` and the MCP server, because the resources page asks for Agent Skills plus Streamable HTTP, or a web simulator, and the code has both.

### Technical implementation: 7
The MCP surface is a real server, not a README mention: `server/mcp/http.ts:33-36` uses `createMcpHandler` with `legacy: 'stateless'`, `server/mcp/mcp.test.ts:162-170` requires a negotiated version `>= '2025-11-25'` and output schemas on all 12 tools, and `server/mcp/oauth.ts:12-14` issues `mcp:service` versus `mcp:tools mcp:resources`. Bedrock is a Messages call in `server/llm/bedrockProvider.ts:12-13` and `server/llm/bedrockProvider.ts:8`. What holds the score down is JDG-3, JDG-4, and JDG-7: AWS has never completed a call in this workspace, the add-on URLs are still `<host>`, and the redirect check accepts any HTTPS URL. Unmeasured Bedrock and Polly latency is already accepted and is not scored as a new defect.

Two changes before 23 Oct 2026: (1) Film MCP Inspector, or the existing client test output, plus one Claude Code `recall` of the peanut fact, so the required runtime hook is visible. (2) Allowlist OAuth redirects and either deploy the add-on or say plainly that you are on the simulator path.

### Design: 6
`/alexa` is a considered voice UI: unofficial label (`src/alexa/AlexaSimulator.tsx:400`), a fast path, an approval card, and a latency meter, with desktop and phone shots already in `docs/images/`. The product a judge hits first is still the 3D office (`README.md:80`), and the four shots that explain memory, the team, and the tool list are missing (`README.md:41-46`). The script is the right length (`docs/DEMO_SCRIPT.md:3`, under 2:55, inside the 3-minute rule). It is not a recording.

Two changes: (1) Open the video and the README on `/alexa` and tell one household story: remember, approve, briefing, then Claude. (2) Cut the office to the few seconds where Keeper's allergy line is visible, and capture the household panel in that same take.

### Impact: 6
The problem is specific and tied to cited complaints in `README.md:11-16`, and the build refuses to pretend it controls lights (`docs/SUBMISSION.md:25`). A self-hosted memory with a receipt and a yes before forget or plan is a credible product for someone who will run a server. It is not yet a product a stranger can open: no public URL (`README.md:142`), one household per process (`README.md:134`), US-only distribution in the manifest (`alexa-addon/addon.json:4`), and files that vanish when the task disk is replaced (`README.md:136`). With 51,725 participants on the overview page (fetched 8 Oct 2026; the count ticked up on later fetches), "beyond the hackathon" has to be a URL and an audience, not a slogan.

Two changes: (1) Put a stable HTTPS demo in the testing notes, with the passcode, and keep it up through the judging window (rules: available to judges until the Judging Period ends, 20 Nov 2026). (2) Name the audience in one sentence: households that already self-host and want a shared memory across assistants. Do not claim it replaces Alexa in the home.

### Quality of idea: 8
The rules' own creative bar for Alexa+ is "agentic workflow that orchestrates across services autonomously, context-aware add-on that maintains state across sessions" plus "MCP Apps, Agent Skills" (https://amazonappdev2026.devpost.com/rules, fetched 8 Oct 2026). This entry does that shape: four named agents, `needs_approval` then `approve_action` (`skills/agora-household/SKILL.md:71-73`), files at `agora://memory`, a card at `ui://daily_briefing/household-card.html` (`server/mcp/apps/cardHtml.ts:7`), and a skill that tells the agent to wait. It is not a one-shot wrapper. The score is not a 9 because the spoken pitch claims ChatGPT and a live Alexa+ add-on that were not run, and because device control, the loudest gap they documented, is honestly out of scope.

Two changes: (1) Lead the description with the checkpoint and the disk receipt, and delete the sentence that ChatGPT and Alexa+ already call the server. (2) Show the skill's approval rule and the household card in the video. Those are the two things the creative examples name.

## Compliance checklist

Status is against the Devpost pages fetched on 8 Oct 2026, plus this repo. Amazon toolkit and modelcontextprotocol.io page bodies were not fetched.

| Requirement | Status | Evidence | Source |
|---|---|---|---|
| Primary track is Alexa+, Bee, Fire TV, or Ring | met | `docs/SUBMISSION.md:37` "Alexa+ (primary)" | https://amazonappdev2026.devpost.com/ |
| Alexa+: Agent Skill or self-hosted MCP, spec minimum 2025-11-25, or a web simulator | partly | Code has all three. Skill: `skills/agora-household/SKILL.md:2`. MCP client test: `server/mcp/mcp.test.ts:162-165` (`version >= '2025-11-25'`) using `StreamableHTTPClientTransport` (`server/mcp/mcp.test.ts:6`). Simulator: `src/alexa/AlexaSimulator.tsx:400`. Not shown in a public video (JDG-1). | Rules: "minimum acceptable version is 2025-11-25". Resources: Agent Skills and Streamable HTTP links, plus "simulate an Alexa+ experience … via a web app" |
| Runtime import, not only a README mention | met | `server/mcp/http.ts:1-2` imports `@modelcontextprotocol/server` and `@modelcontextprotocol/node`; `server/mcp/http.ts:33` calls `createMcpHandler` | Rules: "imported and actually called … not just named in the README" |
| Current MCP spec version on modelcontextprotocol.io, and whether 2025-11-25 is still current | cannot tell | Repo negotiates `>= 2025-11-25` only. Changelog and `/specification/latest` returned 429. | Resources links `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`. Rules also link `modelcontextprotocol.io/docs/latest/getting-started/intro` |
| MCP Apps extension requirements | cannot tell | Card is registered: `server/mcp/server.ts:300-316` and `server/mcp/apps/cardHtml.ts:7`. The extension page was not fetched. The rules only name it as a creative example. | https://modelcontextprotocol.io/extensions/apps/overview (linked from the rules, not fetched) |
| Amazon auth, tool rules, latency, `addon.json` schema, certification | cannot tell | The resources page does not link developer.amazon.com Alexa+ docs. It links the Agent Skills API and the 2025-11-25 transport section only. Direct toolkit fetches returned 429. Local manifest matches the shape the repo claims: `alexa-addon/addon.json:47-56` `integrations[].config.endpoints.default.uri`. | https://amazonappdev2026.devpost.com/resources |
| Text description of what it does and how | met in draft | `docs/SUBMISSION.md:15-33` | Overview "What to Submit" |
| GitHub repo, public with a visible license, or private and shared | not met | Placeholders at `docs/SUBMISSION.md:55` and `README.md:53`. `LICENSE:1` is MIT, which satisfies the license file once the repo is public. | Rules, including the 16 Sep 2026 repository update |
| Setup instructions a judge can run | partly | `README.md:48-80` is a real quick start, then stops on `<REPO_URL>`. Fast path needs no AWS. | Rules: "clear setup and run instructions" |
| Demo video under 3 minutes, public, English, YouTube or Vimeo, project functioning | not met | No URL. Script only: `docs/DEMO_SCRIPT.md:3`. | Rules |
| Video shows the intended platform | not met | Script would show `/alexa` and label it unofficial (`docs/DEMO_SCRIPT.md:10`). No recording. | Rules: "functioning on the platform for which it is intended" |
| No unlicensed copyrighted music, footage, or other material | partly | Script puts article sentences on screen (`docs/DEMO_SCRIPT.md:16-18`). No music is specified. | Rules |
| Product feedback: tools used, what worked, what needs work, onboarding, build again | met in draft | `docs/FEEDBACK.md` has those five beats for each tool, including "Build again?" | Rules |
| AWS services described in the feedback answer | partly | `docs/SUBMISSION.md:77-83` and `docs/FEEDBACK.md:76-88` name Bedrock Messages and Polly. No successful call was recorded. Code path: `server/llm/bedrockProvider.ts:8`. | Rules: "with documented integrations" and "Describe which AWS service(s) you used and how" |
| Tracks and mini challenges named | met in draft | `docs/SUBMISSION.md:35-39` Alexa+, AWS Builder, Open Source | Overview |
| Open Source: contribution URL, repo URL, GitHub username, description, during the window | not met | URLs and username are placeholders (`docs/SUBMISSION.md:87-91`). The description text at lines 95–97 is written. Commits from `4d95503` (8 Oct) through `23f39e9` (8 Oct) fall inside 31 Aug–23 Oct 2026; September office commits from 23 Sep do too (`git log`). | Rules |
| Pre-existing project: what changed in the window | met in draft | `docs/SUBMISSION.md:61-71`. Tag `pre-window` is `4f61371` dated 2026-08-20, before the 31 Aug 2026 start. | Rules: "must have been significantly updated" |
| English materials | met | README, submission, skill, and script are English | Rules |
| Optional feature requests with critical / important / nice-to-have | met | `docs/FEEDBACK.md:114-135` | Overview |
| Optional friction log: task, steps, expected vs actual, severity, workaround, suggestion | met | `docs/FRICTION_LOG.md:5` header row matches those columns. Bonus is "up to 10%". | Rules |
| One track prize and one mini-challenge prize maximum | met | Entering both minis is allowed; winning both is not. The packet does not ask to win both. | Overview: "each project can only win one track prize and one mini challenge prize" |
| Available to judges through the judging period (ends 20 Nov 2026) | partly | Local run instructions exist. No public URL, no testing credentials, repo URL unpublished. | Rules "Testing" |
| Deadline 23 Oct 2026, 12:00 PT | met as a date match | Rules: "Friday, October 23, 2026 (12:00 pm Pacific Time)". Overview: "Oct 23, 2026 @ 7:00pm UTC", which is the same instant while Pacific is UTC−7. | Both Devpost pages |
| Sponsor IP and third-party terms | partly | MIT code plus CC BY-NC models (`LICENSE-ASSETS.md:9`). Firecrawl and AWS SDKs are normal dependencies. NC models vs a featuring prize is JDG-6. | Rules "Intellectual Property" |

## Submission packet

`docs/SUBMISSION.md` covers the description, how it works, tracks, built-with list, the pre-window explanation, an AWS paragraph, an Open Source paragraph, and a pointer at `docs/FEEDBACK.md`. `docs/FEEDBACK.md` answers the five feedback questions and files feature requests with the three priority words. `docs/FRICTION_LOG.md` has the columns the bonus asks for, so the 10% note is available if those rows are pasted into the form. `docs/DEMO_SCRIPT.md` fits under three minutes.

Missing before anyone can submit: the video URL (JDG-1), the public repo URL, the contribution URL, and the GitHub username (JDG-2).

Likely to be penalised if pasted unchanged: "Claude and ChatGPT call that server too" (`docs/SUBMISSION.md:19`), "The swarm calls Claude on Bedrock" (`docs/SUBMISSION.md:29`), the voiceover at `docs/DEMO_SCRIPT.md:98`, and the stale line that the write-up is still uncommitted (`docs/SUBMISSION.md:73`). The AWS section does disclose that no live Bedrock or Polly call was recorded (`docs/SUBMISSION.md:83`). That sentence should be the claim, and the earlier sentences should match it. The diff stat at `docs/SUBMISSION.md:67` is explicitly for commit `42a83b6`. At HEAD `23f39e9` a fresh `git diff --stat pre-window..HEAD` is 234 files, 22982 insertions, 2296 deletions. Update that block if the pasted text should describe HEAD.

`docs/SUBMISSION.md` has no heading for the video. Add one, even if the value is filled on Devpost the same day.

## What is good (keep)

- The resources page's Alexa+ bar is Agent Skills, Streamable HTTP at the 2025-11-25 anchor, or a web simulator. This repo has the skill (`skills/agora-household/SKILL.md:2`), a Streamable HTTP handler (`server/mcp/http.ts:33-36`), and a labeled unofficial simulator (`src/alexa/AlexaSimulator.tsx:400`).
- The client test checks the negotiated version and that every tool has an output schema (`server/mcp/mcp.test.ts:162-170`). The 12 names are listed at `server/mcp/mcp.test.ts:14-27`.
- `forget` and `plan_and_run` wait for `approve_action`, and the skill says not to approve on the user's behalf (`skills/agora-household/SKILL.md:71-75`).
- The screen card the rules cite as a creative example is actually registered (`server/mcp/apps/cardHtml.ts:7`, `server/mcp/server.ts:300`).
- Product feedback and the friction log match the form fields, including the AWS "what you used and how" answer (`docs/FEEDBACK.md`, `docs/FRICTION_LOG.md:5`).
- The packet admits the gaps judges would otherwise discover: no device control (`docs/SUBMISSION.md:25`), no recorded Bedrock or Polly success (`docs/SUBMISSION.md:83`), and a US-only manifest (`alexa-addon/addon.json:4`).
- Window work is dated inside the submission period. `pre-window` is `4f61371` on 2026-08-20. Household commits run from `56afe14` through `23f39e9` on 2026-10-08, with office commits from 2026-09-23.
- A judge can run remember, briefing, and the approval card with no AWS credentials. The README says so (`README.md:123`).

## Scrape log

| URL | Tool | Result | Date on the page |
|---|---|---|---|
| https://amazonappdev2026.devpost.com/ | `get_url_markdown` | ok | No published date. Deadline shown as Oct 23, 2026 @ 7:00pm UTC. Footer © 2026 Devpost. Fetched 8 Oct 2026. |
| https://amazonappdev2026.devpost.com/rules | `get_url_markdown` | ok | Heading "September 16, 2026 UPDATE" on the code-repository rules. Submission period printed as 31 Aug 2026 10:15am PT through 23 Oct 2026 12:00pm PT. Fetched 8 Oct 2026. |
| https://amazonappdev2026.devpost.com/resources | `get_url_markdown` | failed, HTTP 429 | — |
| https://amazonappdev2026.devpost.com/resources | `get_url_markdown` | ok | "October 7th Update" that credit codes are gone. Fetched 8 Oct 2026. |
| https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | `get_url_markdown` | failed, HTTP 429 | — |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html | `get_url_markdown` | failed, HTTP 429 | — |
| https://apps.extensions.modelcontextprotocol.io/api/ | `get_url_markdown` | failed, HTTP 429 | — |

Stopped after those three consecutive 429s. Not fetched: MCP changelog and current spec version, MCP Apps overview, authentication, account linking, tool requirements, latency, certification, and the Devpost FAQ and updates pages.
