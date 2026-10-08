# AGORA+ Alexa+ add-on package

This folder is the listing Amazon asks for when AGORA+ is submitted as an Alexa+ MCP add-on. It is not deployed from this repository. The person who owns the Amazon developer account runs `alexa-ai`.

`<host>` in `addon.json` is a literal placeholder. Replace it with the public hostname and nothing else, so `https://<host>/mcp` becomes `https://agora.example.com/mcp`. The angle brackets are not part of a real URL. Privacy, terms, icons, and the carousel use the same token. Those pages and images are served by this app from `public/` once the hostname is real.

`alexa-ai new mcp` creates `addon-package/addon.json` in a new directory and may regenerate fields from the live MCP server. After that command, copy this `addon.json` and `media/` into `addon-package/`, or check the generated file against this one before `alexa-ai deploy`.

## Fields

The shape matches the [MCP toolkit quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) (Jul 10, 2026), not a flat list of those same names.

| Field | Limit | What to put |
| --- | --- | --- |
| `manifestVersion` | `"1.0"` | Leave it. |
| `storeListing.distributionCountries` | ISO codes | `["US"]`. Alexa+ distribution in this track is US-only. |
| `locales.en-US.default` | the example uses `"DEFAULT"` | Leave it. The quickstart includes it and does not define it. |
| `name.value` | ≤ 30 characters | `AGORA+ Household`. |
| `shortDescription` | ≤ 123 | One line for the store card. |
| `fullDescription` | ≤ 4000 | What the add-on does, including that plans wait for a yes. |
| `examplePhrases` | 3 or 4 items, each ≤ 200 | Phrases a person can say. |
| `privacyAndCompliance.privacyPolicyUrl` | HTTPS | `https://<host>/privacy.html` after you replace `<host>`. |
| `privacyAndCompliance.termsOfUseUrl` | HTTPS | `https://<host>/terms.html`. |
| `mediaAssets.icons.light` | all six sizes | 72, 64, 88, 126, 180, 241. PNG files are in `media/`. |
| `mediaAssets.carouselImages` | at least one 600×900, `altText` ≤ 250 | `media/carousel-600x900.png`. |
| `integrations[].config.endpoints.default.uri` | HTTPS MCP URL | `https://<host>/mcp`. |

The quickstart's icon objects have `size` and `uri` only. Alt text is on the carousel image. The published example uses HTTPS image URLs. These URIs point at `/media/` on the same host as the app. The PNG bytes are in this folder and are copied to `public/media/` so the production server can serve them.

Icon alt text, if a later form asks for it: "Butter-yellow ring on a dark ink square, the AGORA+ mark." That line is 62 characters.

## Auth is not in this file

Client id, client secret, and token URL are not fields in the quickstart schema. They are entered with `alexa-ai configure-account-linking` after the server is publicly reachable. See `skills/agora-household/references/ALEXA_ADDON.md`.
