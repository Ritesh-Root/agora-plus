# Spec follow-up report

Summary: The installed SDK is already current, and it can speak both eras Alexa and the live spec ask for. The current MCP specification on 8 Oct 2026 is **2026-07-28**. Alexa’s published client still initializes at **2025-03-26** and points its transport requirement at **2025-11-25**. `@modelcontextprotocol/server` **2.3.1** (latest on npm) serves 2026-07-28 on the modern path and, on `initialize`, echoes any legacy version it supports, including 2025-03-26 and 2025-11-25. The gaps that matter are the ones a host will hit: the authorization server will send the code to any HTTPS redirect, Alexa looks for `resourceUri` on the tool **result** and we only set it on the tool definition, the server never advertises the MCP Apps extension, and the add-on manifest is still a template without account linking turned on.

## Findings

### SPEC-1 The authorization server accepts any HTTPS redirect
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:313` `if (url.protocol === 'https:') return true;` and `server/mcp/oauth.ts:338` only rejects URLs that fail that check. MCP security: “Authorization servers MUST validate exact redirect URIs against pre-registered values” (https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations, fetched 8 Oct 2026). Alexa: “verify the received redirect_uri is in your registered list. If it isn't, return an error.” (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html, last updated Jul 10, 2026).
- Why it matters: After the household passcode, the authorization code is sent to whatever HTTPS URL the request named. Alexa also uses a different redirect per device region, and linking fails for the regions you did not register. Redeeming the code still needs the client secret and the PKCE verifier. Criterion: Technical implementation.
- Fix: Keep an env list of the redirect URIs `alexa-ai configure-account-linking` prints, allow `http://localhost` and `http://127.0.0.1` for the simulator, and return an error for anything else. Echo the URI Alexa sent only when it is on that list.
- Effort: S
- Confidence: high

### SPEC-2 Alexa looks for the card on the tool result, and the result has no UI metadata
- Severity: P1
- Area: `server/mcp/server.ts`
- Evidence: `server/mcp/server.ts:74-78` returns `content` and `structuredContent` only. The card URI is set on the tool definition (`server/mcp/server.ts:116` `const cardUi = { ui: { resourceUri: HOUSEHOLD_CARD_URI } }`, used by `daily_briefing` at `server/mcp/server.ts:316`). Alexa’s sample puts it on the **result**: `"resourceUri": "ui://hotel-search"` inside `result._meta.ui`, with `invoking` and `invoked` beside it. The page says “as long as you have resourceUri defined in the tool response” (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html, last updated Jul 10, 2026). `invoking` / `invoked` do not appear in `@modelcontextprotocol/ext-apps` 2.0.3.
- Why it matters: Echo Show and the Alexa app are the screen the pitch names. The MCP Apps spec attaches `resourceUri` to the tool definition, which we do. Alexa’s own lifecycle page attaches it to the call result, which we do not. A host that follows that page will speak the briefing and skip the card. Criterion: Design, Technical implementation.
- Fix: On `daily_briefing` and `list_tasks` results, set `_meta.ui.resourceUri` to `ui://daily_briefing/household-card.html`, plus short `invoking` and `invoked` strings. Keep the same fields on the tool definition.
- Effort: S
- Confidence: high that the result omits it; medium that Alexa ignores the tool definition it already stored at deploy

### SPEC-3 The server never advertises the MCP Apps extension
- Severity: P1
- Area: `server/mcp/server.ts`
- Evidence: `server/mcp/server.ts:126-128` constructs `McpServer` with a name and `instructions` only. Nothing in `server/mcp/` sets `io.modelcontextprotocol/ui`. `registerAppTool` in `node_modules/@modelcontextprotocol/ext-apps/dist/src/server/index.js` only copies `_meta`; it does not register a capability. The extensions page says “a client only uses an extension if both client and server declare support in the extensions field” (https://modelcontextprotocol.io/extensions/client-matrix, fetched 8 Oct 2026). The server example puts `"io.modelcontextprotocol/ui": {}` under `server/discover` `capabilities.extensions` (https://modelcontextprotocol.io/extensions/overview, fetched 8 Oct 2026).
- Why it matters: Claude is on the Apps client list. A 2026 host that waits for that capability will not render the household card, even though the HTML resource is valid. Alexa’s initialize sample only sends `capabilities.roots`, so this gap is the Claude path, not the Alexa sample. Criterion: Design, Technical implementation.
- Fix: Pass `capabilities.extensions['io.modelcontextprotocol/ui']` (an empty object, or `mimeTypes: ['text/html;profile=mcp-app']`) into the server so `initialize` and `server/discover` both advertise it.
- Effort: S
- Confidence: high

### SPEC-4 The manifest is not a deployable add-on, and account linking is not turned on
- Severity: P1
- Area: `alexa-addon/addon.json`
- Evidence: `alexa-addon/addon.json:21` `"privacyPolicyUrl": "https://<host>/privacy.html"` and `alexa-addon/addon.json:54` `"uri": "https://<host>/mcp"`. The file has no `accountLinking` key. The quickstart table says `privacyPolicyUrl` and `termsOfUseUrl` must be a “Valid HTTPS URL”, and the endpoint type must be `"HTTPS"` (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html, last updated Jul 10, 2026). Answering yes at scaffold time “sets `accountLinking.enabled`” is how the account-linking page describes it: “Your manifest is updated with `accountLinking.enabled: true`” (same site, account-linking page, last updated Jul 10, 2026). `skills/agora-household/references/ALEXA_ADDON.md:30` tells the owner to answer yes, then says to copy this manifest over the generated one.
- Why it matters: Copying the reviewed manifest drops the flag the CLI just wrote, and `<host>` is not a URL Alexa can call. Name, short description, phrase count, and icon size list do match the table (name is 16 characters, short description 76, four phrases, six light icons). Criterion: Technical implementation.
- Fix: Add `"accountLinking": { "enabled": true }` and replace every `<host>` with the real HTTPS origin before anyone runs `alexa-ai deploy`. Do not copy the template over a scaffold that already has the flag.
- Effort: S
- Confidence: high

### SPEC-5 The authorization-code token call in Amazon’s sample would be rejected
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:484` rejects the request before the body is read: `if (!clientAuthenticated(req.headers.authorization))`. That helper accepts HTTP Basic only. The client-credentials sample on the authentication page does send `Authorization: Basic`. The same page’s checklist also says “Client authentication via HTTP Basic or POST body credentials,” and a MUST NOT line says to use “the authorization header or POST body” (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html, last updated Jul 10, 2026). The account-linking token sample is only `client_id`, `code`, `redirect_uri`, `code_verifier`, and `resource`. It has no `Authorization` header and no client secret (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html, last updated Jul 10, 2026).
- Why it matters: A client-credentials call that follows the authentication sample succeeds here. A user-token call that follows the account-linking sample is rejected as `invalid_client` before PKCE is checked. Linking then never finishes. Criterion: Technical implementation.
- Fix: Keep requiring the client secret. Accept it in HTTP Basic or in the form body. Add a test whose body is the account-linking sample plus `client_secret`.
- Effort: S
- Confidence: medium (the failure depends on which Amazon page the live client follows; that client was not run)

### SPEC-6 A restart makes the refresh token useless
- Severity: P1
- Area: `server/mcp/oauth.ts`
- Evidence: `server/mcp/oauth.ts:53` `const refreshes = new Map<string, RefreshRecord>()`. On refresh, a missing map entry returns `invalid_grant` (`server/mcp/oauth.ts:548-551`) even when the HMAC still verifies. Access tokens last `ACCESS_SECONDS = 3600` (`server/mcp/oauth.ts:15`). Alexa: “If no refresh token is issued, customers must re-link their account each time the access token expires” (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html, last updated Jul 10, 2026). We do return a refresh token on the authorization-code grant (`server/mcp/oauth.ts:529-537`) and correctly omit one for client credentials (`server/mcp/oauth.ts:505-507`).
- Why it matters: The access token survives a restart because it is stateless HMAC. An hour later the refresh lookup fails, and Alexa starts account linking again. A deploy or a crash does that to every linked household. Criterion: Technical implementation.
- Fix: Store refresh records under `AGORA_DATA_DIR` the same way memories are stored, and load them on startup. Keep rotation and the 100-entry cap.
- Effort: M
- Confidence: high

### SPEC-7 `ask_agora` is allowed to run for 9 seconds, and the quickstart cap is 500 ms
- Severity: P1
- Area: `server/household/actions.ts`, `skills/agora-household/references/ALEXA_ADDON.md`
- Evidence: `server/household/actions.ts:208` `const ASK_TIMEOUT_MS = 9_000` and `server/household/actions.ts:454-457` calls Bedrock when that provider is configured. The quickstart says “Your MCP server must meet a round-trip query response latency of less than 500 ms” (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html, last updated Jul 10, 2026). `skills/agora-household/references/ALEXA_ADDON.md:91` says `ask_agora`, `plan_and_run`, and `web_research` “may call Bedrock and can be slower.” The functional guide separately says to “surface an interim still working message when tool calls are slow” (https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html, last updated Jul 21, 2026). This server does not emit `notifications/progress`. A successful Bedrock timing was not measured here; that gap is the accepted `TODO(measure)`.
- Why it matters: The local guide invents an exception the quickstart does not give. A tool whose own timeout is 9 seconds cannot meet a 500 ms ceiling on the calls that reach the model. Disk tools (`remember`, `recall`, `daily_briefing`) are a different path and were not timed in this audit. Criterion: Technical implementation.
- Fix: Keep `ask_agora` on the fast memory fallback for the Alexa tool, or return a short spoken line immediately and finish the model answer out of band. Do not document a 500 ms exception the quickstart does not state.
- Effort: M
- Confidence: medium that Alexa applies 500 ms to every tool rather than to discovery only; high that the 9 second ceiling is in the code

### SPEC-8 The README names one protocol version, and three are in play
- Severity: P2
- Area: `README.md`, `docs/SUBMISSION.md`
- Evidence: `README.md:21` says “Protocol 2025-11-25”. `server/mcp/http.ts:29-30` says the handler “answers 2025-11-25 clients, which is what Alexa+ speaks.” The spec index says “Version 2026-07-28 (latest)” (https://modelcontextprotocol.io/specification/latest, fetched 8 Oct 2026). Alexa’s initialize sample sends `"protocolVersion": "2025-03-26"` (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html, last updated Jul 10, 2026). The SDK echoes a requested legacy version when it is in the supported list (`node_modules/@modelcontextprotocol/server/dist/mcp-DIH4cS6P.mjs:1343`). That list is `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07` (`node_modules/@modelcontextprotocol/core/dist/auth-BNDyLTqp.mjs:4-11`). Modern traffic is a separate list, `2026-07-28` only (`node_modules/@modelcontextprotocol/server/dist/src-Cqbh3MYc.mjs:567-574`). `docs/SUBMISSION.md:107` says “Lifecycle samples should show protocol 2025-11-25” and “Stateless Streamable HTTP cannot elicit.” The same lifecycle page says Alexa uses “the existing elicitation framework through the MCP protocol” when it receives an elicitation request. On 2026-07-28 a server can return `resultType: "input_required"` on the same POST. Alexa’s published client still starts with `initialize`, so that 2026 return path is not what the sample shows.
- Why it matters: A judge who reads the README thinks the server speaks one revision. It speaks the Alexa sample, the hackathon minimum, and the current spec, on two different wires. The feedback sentence about elicitation is true for Alexa’s 2025 `initialize` and false for a 2026 client. Criterion: Technical implementation, Quality of idea.
- Fix: Say in the README that Alexa’s published client initializes at 2025-03-26, the hackathon floor is 2025-11-25, and this SDK also serves 2026-07-28 without `initialize`. Drop the request that Amazon reprint its sample at 2025-11-25 until their page actually changes.
- Effort: S
- Confidence: high

### SPEC-9 `web_research` is listed, and with no key it only returns an error
- Severity: P2
- Area: `server/mcp/server.ts`
- Evidence: `server/mcp/server.ts:488-502` registers `web_research`. The tool test expects `isError: true` and the text “isn't set up” (`server/mcp/mcp.test.ts:227-230`). Certification says “Every tool returned by your server's tools/list endpoint must be invocable — no dead, placeholder, or non-functional entries” (https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html, last updated Jul 21, 2026).
- Why it matters: Alexa builds the add-on from `tools/list`. A tool that errors until a key is set is a placeholder on a default deploy. The description is honest, which is better than a fake answer, and it still fails the “must be invocable” line. Criterion: Technical implementation.
- Fix: Omit `web_research` from the server unless web research is configured, and redeploy so Alexa drops it from the tool list.
- Effort: S
- Confidence: high

### SPEC-10 The store description names an MCP server
- Severity: P2
- Area: `alexa-addon/addon.json`
- Evidence: `alexa-addon/addon.json:12` “This add-on talks to your AGORA+ MCP server over HTTPS.” Certification says “Use plain consumer language — no API names, tool names, JSON references, or developer jargon” (https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html, section 5, last updated Jul 21, 2026).
- Why it matters: The listing is what a customer reads before enabling the add-on, and section 5 is a certification check. The rest of the description is already in household language. Criterion: Design.
- Fix: Say “the household server you host” in `fullDescription`. Keep the MCP name in the developer README.
- Effort: S
- Confidence: high

## What changed from 2025-11-25 to 2026-07-28

Source: https://modelcontextprotocol.io/specification/2026-07-28/changelog, fetched 8 Oct 2026. The page says it lists changes since 2025-11-25. These are the ones that touch a stateless Streamable HTTP server with OAuth.

| Change | What a server has to do | This repo |
|---|---|---|
| Sessions and `Mcp-Session-Id` removed | Do not mint a session. `legacy: 'stateless'` already answers GET and DELETE with 405 | Met, by the SDK option in `server/mcp/http.ts:33-35` |
| `initialize` removed on the modern wire | Version, client info, and capabilities travel in `_meta` on every request. `server/discover` is required | Met for modern clients by SDK 2.3.1. Alexa’s sample still uses `initialize`, and we still answer it |
| Standalone GET stream replaced by `subscriptions/listen` | Do not require a hanging GET | Met. We do not implement list-change subscriptions; nothing in this server needs them |
| `ping` and `logging/setLevel` removed | Do not depend on them | Met. `server/mcp/http.ts:16-25` still allows those methods on the legacy path, which is correct |
| Every result needs `resultType` | `"complete"` or `"input_required"` | Met on the 2026 encode path inside the SDK. Legacy results stay in the 2025 shape |
| `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` required on modern POSTs | Reject mismatches with `-32020` | Met by the SDK on modern requests. A 2025 `initialize` does not send those headers |
| `ttlMs` and `cacheScope` required on list and read results | The SDK fills defaults when the handler omits them | Met by the SDK, not by our handlers |
| `iss` on the authorization redirect | SHOULD, not MUST. Clients must check it when present | Not sent. `server/mcp/oauth.ts:639-644` redirects with `code` and `state` only. Partly |
| Dynamic client registration deprecated in favor of Client ID Metadata Documents | Alexa supports neither (“Not Supported Yet” on the quickstart) | Met. We are a pre-registered confidential client |
| Roots, sampling, and logging deprecated | Do not add them | Met. We do not implement them. Alexa’s sample still sends `capabilities.roots` |

`npm view` on 8 Oct 2026: `@modelcontextprotocol/server` latest is `2.3.1` (installed), `@modelcontextprotocol/client` latest is `2.3.1` (installed), `@modelcontextprotocol/node` latest is `2.1.1` (installed), `@modelcontextprotocol/ext-apps` latest is `2.0.3` (installed). No newer SDK release is waiting.

## Compliance table

Amazon pages below show “Last updated” in July 2026, which is before the 1 Aug 2026 preference. They are still the pages the site served on 8 Oct 2026. No newer date was printed on them.

| Requirement | URL | Status | Evidence in this repo |
|---|---|---|---|
| Current MCP revision is 2026-07-28 | https://modelcontextprotocol.io/specification/latest | partly | SDK serves it on the modern path. Docs name only 2025-11-25 (`README.md:21`). SPEC-8 |
| Alexa transport: Streamable HTTP, 2025-11-25 page, not standalone SSE | https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html | met | `server/mcp/http.ts:33-35` `legacy: 'stateless'` |
| Alexa `initialize` sample at `2025-03-26` | https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html | met | SDK echoes that version when asked (`mcp-DIH4cS6P.mjs:1343`). Our test only checks `>= 2025-11-25` (`server/mcp/mcp.test.ts:162-165`) |
| `server/discover` for 2026 clients | https://modelcontextprotocol.io/specification/2026-07-28/changelog | met | Implemented by SDK 2.3.1. `server/mcp/http.ts:25` allows the method with any token |
| Origin check on `/mcp` | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http | met | `server/mcp/http.ts:71-88`. A missing Origin is allowed, which matches “if present and invalid” |
| Bind to localhost | same transport page, SHOULD | partly | `README.md:80` says `npm run dev` binds `0.0.0.0` |
| Protected Resource Metadata and authorization-server metadata | https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery and the Alexa quickstart | met | `server/mcp/oauth.ts:420-439` and the three well-known paths at `server/mcp/oauth.ts:676-678` |
| 401 with no `WWW-Authenticate` | Alexa quickstart, “Not Supported Yet” | met | `server/mcp/http.ts:63-68`. MCP also allows discovery by well-known URI alone, which we serve |
| 401 JSON body in the account-linking example | account-linking page, step 1b | partly | We return an empty body. The page’s prose says to return the status. The example body is JSON. Unverified which one the live client requires |
| PKCE `S256` in metadata | Alexa quickstart and authentication page | met | `server/mcp/oauth.ts:428` |
| Grants: `client_credentials`, `authorization_code`, `refresh_token` | Alexa authentication page | met | `server/mcp/oauth.ts:426` |
| `client_credentials` scope is only `mcp:service`, no refresh token, `expires_in` ≤ 3600 | Alexa authentication page | met | `server/mcp/oauth.ts:12-15` and `505-507`. The same page’s step 5 says the service token is issued with `mcp:tools`; that sentence contradicts the MUST above, and we follow the MUST |
| User grant scopes `mcp:tools` and `mcp:resources` | Alexa authentication scope table | met | `server/mcp/oauth.ts:13` and `529` |
| `resource` required and checked | Alexa authentication page, “Validate the resource parameter” | partly | Checked only when present (`server/mcp/oauth.ts:500-502`). A missing `resource` still issues a token whose audience is this server |
| Exact registered redirect URIs | MCP security considerations and Alexa account-linking step 4 | not met | SPEC-1 |
| HTTP Basic or form-body client authentication | Alexa authentication checklist, “HTTP Basic or POST body credentials” | partly | Basic only. The client-credentials sample uses Basic and would succeed. The account-linking token sample would not. SPEC-5 |
| User linking is authorization code; service calls are client credentials | Authentication page requires both grants. Account linking says “Alexa+ add-ons support only the Authorization Code Grant” | met for the authentication page | `server/mcp/oauth.ts:426` lists `client_credentials`, `authorization_code`, and `refresh_token`. Do not drop client credentials to match the account-linking sentence |
| Refresh token on the user grant, and it keeps working | Alexa account-linking page | partly | Issued, then dropped on process exit. SPEC-6 |
| Access token lifetime ≤ 3600 seconds | Alexa authentication page | met | `server/mcp/oauth.ts:15` `ACCESS_SECONDS = 3600`. No refresh-token lifetime number was on the pages fetched. Ours is 30 days (`server/mcp/oauth.ts:16`) |
| DCR, CIMD, OIDC, step-up, `WWW-Authenticate` | Alexa quickstart, “Not Supported Yet” | met | None of these are implemented |
| `iss` on the redirect | MCP authorization page, SHOULD | not met | Not sent. Not an Alexa requirement on the pages fetched |
| Round trip under 500 ms | Alexa quickstart | not met for `ask_agora` when a model is configured | SPEC-7. Other tools were not timed |
| Tool annotations (`readOnlyHint` and the rest) | Not required on any Alexa page fetched | met as optional | Set on every tool, for example `server/mcp/server.ts:118-119` |
| `inputSchema` on every tool, `isError` on failures | functional requirements, section 13 | met | `server/mcp/mcp.test.ts:168-171` and `fail()` at `server/mcp/server.ts:81-82` |
| Every listed tool works | functional requirements, section 13 | partly | SPEC-9 |
| `ui://` resource, MIME `text/html;profile=mcp-app`, `resourceUri` on the tool | MCP Apps draft, content requirements | met for the tool definition | `server/mcp/apps/cardHtml.ts:7`, `server/mcp/mcp.test.ts:275` and `288`. The quickstart’s “MCP Apps” link points at the 2025-11-25 Streamable HTTP heading, not an Apps document (quickstart, last updated Jul 10, 2026). The card follows the draft the Apps build guide links |
| `resourceUri` on the tool result, plus `invoking` / `invoked` | Alexa client lifecycle | not met | SPEC-2 |
| Server advertises `io.modelcontextprotocol/ui` | https://modelcontextprotocol.io/extensions/overview | not met | SPEC-3 |
| CSP and permissions on the UI resource | Apps draft: omitted CSP means no network, inline script allowed | met | The card is one HTML file with an inline script (`server/mcp/apps/buildCard.ts:42`). No `csp` is set, which is the restrictive default. `prefersBorder: true` is on the resource listing (`server/mcp/server.ts:512`) |
| Hosts that render Apps | Apps overview names Claude, Claude Desktop, VS Code, Microsoft 365 Copilot, Goose, Postman, MCPJam, and Archestra.AI. It does not name Echo Show | partly | `docs/HACKATHON_CHANGES.md:84` names “Echo Show, the Alexa app, Claude, ChatGPT”. Alexa’s display-mode page does say a UI payload renders inline. ChatGPT’s cell in the client matrix did not survive as text; see the scrape log |
| `addon.json` field limits and HTTPS URLs | Alexa quickstart schema table | partly | Lengths and icon sizes match. URLs are `<host>`. SPEC-4 |
| `accountLinking.enabled` | Alexa account-linking step 2 | not met | SPEC-4 |
| Distribution `US` | quickstart example `"distributionCountries": ["US"]` | met | `alexa-addon/addon.json:4` |
| Privacy policy and terms are real HTTPS URLs | quickstart and functional requirements section 5 | not met | SPEC-4. The HTML files exist under `public/`; the manifest does not point at a host |
| Store description in plain consumer language | functional requirements section 5 | not met | SPEC-10 |

## What is good (keep)

- `legacy: 'stateless'` is the right SDK switch for a server that must answer Alexa’s `initialize` and a 2026 client on the same URL (`server/mcp/http.ts:28-35`).
- The legacy version list includes both `2025-03-26` and `2025-11-25`, so Alexa’s published sample and the hackathon floor are both in range (`node_modules/@modelcontextprotocol/core/dist/auth-BNDyLTqp.mjs:4-11`).
- Empty `401` with no `WWW-Authenticate` matches the Alexa quickstart, and the well-known metadata documents still satisfy MCP discovery (`server/mcp/http.ts:63-68`, `server/mcp/oauth.ts:676-678`).
- Client credentials stay on `mcp:service` and do not get a refresh token, which is the MUST on the authentication page, not the contradictory step 5 on that same page (`server/mcp/oauth.ts:505-507`).
- PKCE is S256 only, codes last five minutes, and a code is deleted before it is redeemed (`server/mcp/oauth.ts:17`, `340`, `516-518`).
- The card URI, MIME type, and inline bundle match the Apps draft: `ui://daily_briefing/household-card.html`, `text/html;profile=mcp-app`, no external font host (`server/mcp/mcp.test.ts:272-280`).
- SDK packages installed are the latest npm releases as of this audit: server 2.3.1, client 2.3.1, node 2.1.1, ext-apps 2.0.3.
- Store-listing lengths already fit the quickstart table: name 16, short description 76, full description 923, four example phrases, carousel alt text 73.

## Scrape log

No Cloudflare 429 on this pass. Amazon “Last updated” dates are July 2026, before the 1 Aug 2026 preference. They are marked background by date and were still the pages served today.

| URL | Tool | Result | Date on the page |
|---|---|---|---|
| https://modelcontextprotocol.io/specification/latest | `get_url_markdown` | ok | “Version 2026-07-28 (latest)”. No calendar date |
| https://modelcontextprotocol.io/specification/2026-07-28/changelog | `get_url_markdown` | ok | Changes since 2025-11-25. No calendar date |
| https://modelcontextprotocol.io/llms.txt | `get_url_markdown` | ok | Index of 2026-07-28 spec URLs. No calendar date |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http.md | `get_url_markdown` | ok | Revision 2026-07-28. No calendar date |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/index.md | `get_url_markdown` | ok | No calendar date |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations.md | `get_url_markdown` | ok | No calendar date |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery.md | `get_url_markdown` | ok | No calendar date |
| https://modelcontextprotocol.io/extensions/apps/overview.md | `get_url_markdown` | ok | No calendar date. Spec link inside the page points at `specification/2026-01-26/apps.mdx` |
| https://modelcontextprotocol.io/extensions/apps/build.md | `get_url_markdown` | ok | No calendar date. Spec link points at `specification/draft/apps.mdx` |
| https://modelcontextprotocol.io/extensions/client-matrix | `get_url_markdown` | ok | Check marks in the table did not come through as text. ChatGPT’s Apps cell is unverified from this fetch |
| https://modelcontextprotocol.io/extensions/overview.md | `get_url_markdown` | ok | No calendar date |
| https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/refs/heads/main/specification/draft/apps.mdx | `get_url_markdown` | ok | “Status: Draft”. “Created: 2025-11-21” (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html | `get_url_markdown` | ok | Last updated Jul 10, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html | `get_url_markdown` | ok | Last updated Jul 10, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html | `get_url_markdown` | ok | Last updated Jul 10, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-tools-schema-data-design.html | `get_url_markdown` | ok | Last updated Jul 21, 2026 (background). No annotation or latency numbers on this page |
| https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html | `get_url_markdown` | ok | Last updated Jul 21, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-display-modes.html | `get_url_markdown` | ok | Last updated Jul 21, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html | `get_url_markdown` | ok | Last updated Jul 10, 2026 (background) |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-supported-capabilities.html | `get_url_markdown` | ok | Last updated Jul 10, 2026 (background). This page is only two links |

These five were fetched again on 8 Oct 2026 to check quotes against the live pages. All five returned ok. None returned 429.

| URL | Tool | Result | Date on the page |
|---|---|---|---|
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html | `get_url_markdown` | ok, re-fetch | Last updated Jul 10, 2026 |
| https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html | `get_url_markdown` | ok, re-fetch | Last updated Jul 21, 2026 |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html | `get_url_markdown` | ok, re-fetch | Last updated Jul 10, 2026 |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html | `get_url_markdown` | ok, re-fetch | Last updated Jul 10, 2026 |
| https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html | `get_url_markdown` | ok, re-fetch | Last updated Jul 10, 2026 |

Not fetched: the certify page, the test-add-ons page, the CLI reference, and the layout-and-rendering page. Tool-annotation requirements beyond the functional-requirements page are unverified. Whether the live Alexa client sends HTTP Basic or the account-linking sample body was not run. Fetch count is 25, which is the budget.
