# Ship AGORA+ as an Alexa+ add-on

Do not run `alexa-ai configure`, `alexa-ai deploy`, or `alexa-ai submit` from an unattended agent. Each one logs into Amazon or publishes the add-on. The person who owns the developer account runs them.

Sources, read on 2026-10-08:

- [MCP toolkit quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) (page date Jul 10, 2026)
- [Alexa AI CLI reference](https://developer.amazon.com/docs/alexaplus/add-ons/alexa-ai-cli-reference.html) (page date Aug 18, 2026)
- [Authentication](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html)
- [Account linking](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html)

The local package is `alexa-addon/`. `alexa-ai new mcp` creates its own `addon-package/addon.json` and may overwrite a hand-written manifest. Copy the reviewed `alexa-addon/addon.json` and `alexa-addon/media/` into that folder after scaffolding, or edit the generated file to match this one. Replace every `<host>` with the public hostname before deploy. Leave the angle brackets out. `https://<host>/mcp` is not a valid URL until then.

## CLI

```bash
npm install -g @alexa-ai/cli
alexa-ai --version
alexa-ai configure
```

`alexa-ai configure` opens Login with Amazon and stores credentials at `~/.alexa-ai/credentials`. On a machine without a browser, `alexa-ai configure --no-browser` prints the URL instead.

Scaffold, still without deploying:

```bash
alexa-ai new mcp --name "AGORA+" --locale en-US --mcp-server-url "https://<host>/mcp"
```

When the prompt asks whether the add-on requires account linking, answer yes. Household tools are per home. The account-linking page says that answer sets `accountLinking.enabled` and does not collect the client secret yet.

Deploy to the development stage only after the manifest, the media, and the public server are ready:

```bash
alexa-ai deploy
```

The first deploy creates the add-on id. Later deploys publish a new version of the same id. Alexa+ refreshes the tool list only on deploy.

Test the development stage in the web simulator or on a device linked to the developer account. See [Test your MCP add-ons](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-test-add-ons.html). The CLI can also run a suite that is already on disk:

```bash
alexa-ai test --stage development
```

Submit for certification only after that test:

```bash
alexa-ai submit
```

`alexa-ai submit --yes` skips the confirmation. Do not pass `--yes` unless the person has already said to submit.

## What to tell Amazon about auth

Service token, scope `mcp:service`:

| Field | Value |
| --- | --- |
| Token URL | `https://<host>/oauth/token` |
| Client id | `AGORA_OAUTH_CLIENT_ID` |
| Client secret | `AGORA_OAUTH_CLIENT_SECRET` (masked prompt or `ALEXA_CLIENT_SECRET`; do not put it in the manifest) |
| Scope | `mcp:service` |
| Client auth | HTTP Basic |

The account-linking guide says Alexa discovers the authorization URL and the token URL from `https://<host>/.well-known/oauth-protected-resource`. You pass the client id on the command line. The CLI reference instead shows `--config-file`. Those two pages do not match. Run `alexa-ai configure-account-linking --help` and use the flags that binary prints.

The form the account-linking page shows:

```bash
alexa-ai configure-account-linking --addon-id <id> --stage development --client-id <AGORA_OAUTH_CLIENT_ID>
```

Account linking is authorization code plus PKCE `S256`. The user scopes are `mcp:tools mcp:resources`.

| Field | Value |
| --- | --- |
| Authorization URL | `https://<host>/oauth/authorize` |
| Token URL | `https://<host>/oauth/token` |
| Scopes | `mcp:tools mcp:resources` |

`alexa-ai deploy` checks that discovery lists `S256`. This server does. It also issues a refresh token for the authorization-code grant and none for client credentials. Access tokens last 3600 seconds.

Register every Alexa redirect URI the CLI prints. At request time this server accepts any `https` redirect URI and echoes the `redirect_uri` Alexa sent. Still register the full list on the Amazon side.

Set `AGORA_PUBLIC_URL` to `https://<host>` with no path, so the discovery document and the manifest name the same MCP resource.

## Limits that matter here

- Distribution is `US` only. A developer outside the US can still build the package. A real Alexa+ device test needs a US account.
- Tools that do not call a model should answer in under 500 ms. `remember`, `recall`, `forget`, `add_task`, `list_tasks`, `complete_task`, `daily_briefing`, `get_run_status`, and `approve_action` are in that set. `ask_agora`, `plan_and_run`, and `web_research` may call Bedrock and can be slower.
- An unauthenticated `POST /mcp` is `401` with an empty body and no `WWW-Authenticate` header. That matches the quickstart. The account-linking page shows a JSON body on 401. This server stays with the empty body.
- `name.value` is at most 30 characters. `shortDescription` is at most 123. `fullDescription` is at most 4000. `examplePhrases` is 3 or 4 items, each at most 200 characters. Carousel `altText` is at most 250 characters.
- Icon sizes, all required: 72, 64, 88, 126, 180, and 241. One carousel image is 600×900.

The quickstart's `addon.json` nests those fields under `storeListing.locales.en-US`, `privacyAndCompliance`, `mediaAssets`, and `integrations`. `alexa-addon/addon.json` follows that shape. Image files live in `alexa-addon/media/` and are also served from `public/media/` so `https://<host>/media/...` resolves on this server after `<host>` is replaced.
