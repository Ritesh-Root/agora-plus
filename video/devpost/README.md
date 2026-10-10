# Devpost video

A 1:47 narrated video of the household Home, built only from captures of the running app.

Creative brief adapted from two prompts in the
[opus-video-prompts](https://github.com/yihui-dev/awesome-opus5-5-videos) library (MIT):
[@daniel_haida](https://x.com/daniel_haida/status/2104139720829636937) (a restrained product film, with
the soundtrack synthesized in code) and [@jhylee95](https://x.com/jhylee95/status/2103604431627452427)
(a hook in the first second, distinct proof beats, cuts on the beat).

## Steps

1. Seed an empty household and start a server on it (port 3300 in these notes). The capture types every
   request for real, so the plan step needs a working server model (`AGORA_SERVER_LLM`).
2. Capture: `node video/devpost/capture.mjs http://127.0.0.1:3300 ~/Downloads/agora-plus-devpost/assets`
   (2x screenshots, typing frames, real scroll sequences, a live team run, element boxes).
3. Narration: one line per row in `narration.tsv`, saved as `audio/s1.mp3` ... `audio/s10.mp3`
   (`eleven tts -v <voice> -o <file> "<line>"`).
4. Timing: `python3 -I video/devpost/timing.py ~/Downloads/agora-plus-devpost` snaps each scene to the
   96 BPM beat after the previous line ends and writes `audio/timing.json`.
5. Music: `python3 video/devpost/music.py ~/Downloads/agora-plus-devpost` (numpy) writes `audio/music.wav`
   from sines and noise, with a bell on every scene cut.
6. Copy `index.html` into the folder and render:
   `node video/demo/render-demo.mjs ~/Downloads/agora-plus-devpost --out ~/Downloads/agora-plus-devpost.mp4`.
   `--stills 12,30,75` renders review frames instead. The music ducks under the voice, and loudness is
   normalised to -14 LUFS in two passes.

## Honesty notes on screen

- "Simulated Alexa+ experience, unofficial" is on every frame.
- The team run is sped up and labelled so. Its finish time is the real one.
- The plans were written by Qwen 2.5 32B on Featherless (no AWS credentials were available), and the
  video says so while the plan is on screen.
- The plan document's first draft line came out garbled. The camera frames the clean plan below it
  instead of editing the capture.
