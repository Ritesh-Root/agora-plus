# AGORA+ motion video

An 83-second product piece made with three.js. Every frame is a pure function of time
(`renderAt(t)` in [motion.js](motion.js)), so the renderer captures exact 60 fps frames
with no dropped or uneven frames, however slow the machine is.

Preview in a browser (plays in real time; `?t=40` starts at 40 s):

```bash
npx vite --port 3300
```

then open http://localhost:3300/video/index.html.

Render to MP4 (H.264, 1920×1080, 60 fps). It uses NVENC when present; pass
`--encoder libopenh264` otherwise, and `MOTION_GL=swiftshader` on a machine without a GPU:

```bash
node video/render.mjs --out ~/Downloads/agora-plus-motion.mp4
```

Review a few frames first:

```bash
node video/render.mjs --stills 4,20,46 --dir /tmp/agora-stills
```

Scenes: title, the problem, memory with receipts, recall and briefing, lists and reminders,
ask before acting, the four-agent team, one server for every assistant, trust, close.
The palette stays light (paper, cream, butter) and the voice page is labelled as an
unofficial simulated Alexa+ experience.
