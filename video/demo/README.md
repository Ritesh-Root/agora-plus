# Narrated product demo

A ~94 s demo built only from real captures of the running app, voiced with ElevenLabs.

1. **Narration**: one clip per scene from [narration.tsv](narration.tsv), e.g.
   `eleven tts -v <voice> -o audio/s1.mp3 "..."`, then write `audio/timing.json`
   (`{"durations": [...]}`) from `ffprobe`. Scene starts follow the clip lengths.
2. **Capture**: start a server on an empty household (`AGORA_DATA_DIR`), then
   `node video/demo/capture.mjs http://127.0.0.1:3300 <dir>/assets`. It types each request
   for real, approves the plan, records the 3D office and saves 2x screenshots plus a
   manifest of element boxes. `--from plan` resumes after the quick requests.
3. **Compose**: [index.html](index.html) is a `seek(t)` page (camera springs, cursor, masked
   type). Put it next to `assets/` and `audio/`.
4. **Render**: `node video/demo/render-demo.mjs <dir> --out <dir>.mp4` renders 60 fps frames
   with NVENC and mixes the narration at -14 LUFS. `--stills 5,20` renders review frames.

Creative brief adapted from two prompts in the opus-video-prompts library (MIT):
[@twoclipping](https://x.com/twoclipping/status/2102554209166000267) and
[@verbove](https://x.com/verbove/status/2103483957266268381).
