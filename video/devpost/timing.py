"""Scene timing for the Devpost video. Each scene starts on a beat after the previous line ends.

    python3 -I video/devpost/timing.py ~/Downloads/agora-plus-devpost

Reads audio/s1.mp3 ... and writes audio/timing.json: durations, the beat, scene cues, and the
total length. The composition and the music both read that file, so cuts land on the beat.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

BPM = 96
BEAT = 60 / BPM
GAP = 0.7
# Extra seconds of picture after a line, where the scene has more to show than the line takes to say.
EXTRA = [0, 1.6, 1.6, 0.8, 1.6, 0.6, 1.6, 3.2, 1.6, 0]
TAIL = 3.4

root = Path(sys.argv[1]).expanduser()
audio = root / "audio"
files = sorted(audio.glob("s*.mp3"), key=lambda p: int(p.stem[1:]))
durations = []
for f in files:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True, check=True)
    durations.append(round(float(out.stdout.strip()), 3))

snap = lambda t: round(math.ceil(t / BEAT - 1e-6) * BEAT, 3)
cues = [snap(0.6)]
for i, d in enumerate(durations[:-1]):
    cues.append(snap(cues[-1] + d + GAP + EXTRA[i]))
bar = BEAT * 4
total = round(math.ceil((cues[-1] + durations[-1] + TAIL) / bar) * bar, 3)
(audio / "timing.json").write_text(json.dumps({"bpm": BPM, "beat": BEAT, "durations": durations, "cues": cues, "duration": total}, indent=2))
print("cues", cues)
print("duration", total)
