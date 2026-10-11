# Judge cut

A 2:47 narrated submission video. Scenes 1–8 and the close are the Devpost cut ([../devpost](../devpost)). Scenes 9–14 add what the judges score:

| # | Scene | Source |
|---|---|---|
| 9 | Claude Code asks the same household over MCP | A real `claude -p` run with `--mcp-config` against the capture server. It called `recall` and `list_tasks`. The output is set as text from the saved stream-json. |
| 10 | Lock-down | A real `curl` with no token (401, empty body, no `WWW-Authenticate`), a real `forget` over MCP (`needs_approval`), and a capture of that request under "Waiting for you" on Home |
| 11 | Architecture | An animated diagram of [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) |
| 12 | AWS | The same diagram with Bedrock and Polly picked out. The narration and a chip say this recording used Featherless and that neither AWS path was recorded live. |
| 13 | Alexa+ | Excerpts of [alexa-addon/addon.json](../../alexa-addon/addon.json) and [skills/agora-household/SKILL.md](../../skills/agora-household/SKILL.md). A chip says the add-on is not deployed. |
| 14 | Open source | A capture of the public repository |

Creative brief adapted from two prompts in the
[opus-video-prompts](https://github.com/yihui-dev/awesome-opus5-5-videos) library (MIT):
[@daniel_haida](https://x.com/daniel_haida/status/2104139720829636937) and
[@jhylee95](https://x.com/jhylee95/status/2103604431627452427).

## Steps

1. Copy the Devpost captures into `~/Downloads/agora-plus-judge/assets/` and the Devpost clips `s1`–`s8` and `s10` into `audio/` as `j1`–`j8` and `j15`.
2. Seed a household on a capture server (port 3300 here) through the MCP tools, run the Claude Code session, the `curl`, and the `forget`, and save their output into `assets/`.
3. `node video/judge/capture.mjs http://127.0.0.1:3300 ~/Downloads/agora-plus-judge/assets` captures the waiting approval on Home and the GitHub page.
4. Voice `j9`–`j14` from [narration.tsv](narration.tsv) with `eleven tts -v <voice> -o audio/jN.mp3 "<line>"`.
5. `python3 -I video/judge/timing.py ~/Downloads/agora-plus-judge`, then `python3 video/judge/music.py ~/Downloads/agora-plus-judge`.
6. Copy `index.html` into the folder and render:
   `node video/demo/render-demo.mjs ~/Downloads/agora-plus-judge --out ~/Downloads/agora-plus-judge.mp4`.
