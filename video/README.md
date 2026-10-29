# dot-eater video

The promo video for dot-eater, made with [Remotion](https://www.remotion.dev).
The gameplay in it is real: a recording of a run (its seed and every tick's
input) is replayed through the game's own logic (`src/replay.ts`) and drawn by
the game's own canvas renderer (`src/render.ts`), frame by frame.

This is a pnpm workspace package (`dot-eater-video`). Run `pnpm install` at the
repo root first. Commands below run from the repo root; inside `video/` drop
the `--filter dot-eater-video` part.

## Preview and render

| Command                                       | What it does                                              |
| --------------------------------------------- | --------------------------------------------------------- |
| `pnpm --filter dot-eater-video studio`        | Render the audio, then Remotion Studio: scrub and preview |
| `pnpm --filter dot-eater-video render`        | Render the audio, then `Promo` to `video/out/promo.mp4`   |
| `pnpm --filter dot-eater-video render-audio`  | Render the game's sound to `video/public/audio/`          |
| `pnpm --filter dot-eater-video record-demo`   | Re-record the demo run (`src/recordings/demo.json`)       |
| `pnpm --filter dot-eater-video record-scenes` | Re-record the directed scenes (`src/recordings/scenes/`)  |

A still frame, e.g. to check a zoom:

```sh
pnpm --filter dot-eater-video exec remotion still Promo out/frame.png --frame=443
```

The first render downloads a headless Chrome. `video/out/` is gitignored.

The game's toolchain covers this package too: root `pnpm check` formats,
lints and type-checks `video/`, and root `pnpm test` runs its `*.test.ts`
(import test APIs from `vite-plus/test`).

## Add a recording

1. Record a run in the game with `?record` (see `src/replay.ts` for the
   format) and save the JSON file.
2. Drop it in `video/src/recordings/`, e.g. `epic-run.json`. Every JSON file
   there is picked up at bundle time; there is nothing to register.
3. Use it by file name: `recording("epic-run")` from `src/recordings`. For
   the promo, set `RUN = "epic-run"` in `src/plan.ts` (the audio render
   reads the same file), and re-render the audio.

The demo run is played by a bot (`scripts/bot.ts`, recorded by
`scripts/record-demo.ts`) until real recordings replace it. A test checks
that the bot still records exactly the committed `demo.json`, so when the
game's rules change and that test fails, re-run `record-demo`.

## Directed scenes

Short runs, each set up to show off one thing, for fast cuts: `hook` (a
close call in a chase), `dragon`, `penguin`, `owl`, `skunk`, `boar` (each
animal's breath doing its thing) and `boss` (two dragons bringing the boss
down). The names and each scene's hero moment kind are in `src/scenes.ts`;
use a scene with `sceneRecording("dragon")` from `src/recordings/scenes`.

They are played by the director (`scripts/director.ts`): bots with a goal,
e.g. charge up on dots, walk to where an enemy is lined up in a corridor and
breathe as soon as a breath (tried on a copy of the game) would defeat it.
Each scene's stage, animals, seed and goal are in `SCENES` there; the
recording stops a little after the scene's key moment. The seeds were
picked by search: `record-scenes --search [n] [scene...]` tries seeds 1 to
n and prints the best by the scene's score. A test checks that the
director still records exactly the committed files, so when the game's
rules change and that test fails, re-run `record-scenes` (and check the
hero moments still look right).

`src/highlights.ts` lists a recording's key moments (`highlightsOf`):
breaths, defeats, enemies frozen, blown back or turned back at a cloud,
broken walls, boss hits and near misses, each with its tick, cell and a
`focus` point for the camera. `heroMoment(scene, recording)` is the one
tick the edit should land on a beat. To look at one, render the dev-only
`SceneCheck` composition:

```sh
pnpm --filter dot-eater-video exec remotion still SceneCheck out/dragon.png --props='{"scene":"dragon"}' --frame=1
```

## Sound

The video's sound is the game's own sound effects, in exact sync with the
run, under a song.

**Sound effects.** Remotion only plays audio files, so
`scripts/render-audio.ts` renders the game's sound offline to WAV files in
`video/public/audio/` (gitignored; about 3.8 MB each, made in about a
second). It replays the run, and each tick that stepped the game plays
`eventSounds(events)` (`src/sound.ts`) on the first video frame that shows
that tick (`sfxTimeline` in `src/soundtrack.ts`). In slow motion the sounds
keep their pitch and land further apart. The tones are made by the game's
own `scheduleTone` (`src/audio.ts`) in an `OfflineAudioContext` from
[node-web-audio-api](https://github.com/ircam-ismm/node-web-audio-api), a
Web Audio implementation for Node, with the noise seeded, so the same run
renders the same bytes every time. The `render` and `studio` scripts run it
first.

**The song.** Drop your song (mp3, m4a, wav...) into `video/public/music/`.
That folder is gitignored: never commit a song, the repo is public. The
first audio file there is played under the effects from `TRACK_START`
(`src/cues.ts`), at `MIX.song` (`src/soundtrack.ts`), with a slight dip in
slow motion and a fade out at the end. Without a song, the game's own tunes
play instead (`audio/music.wav`: the title tune over the title and end
cards, the stage's over the run), so a fresh clone still renders with sound.

**Cues.** All timing hangs off named cues in `src/cues.ts` (seconds into the
video): `intro`, `play` (cut to gameplay), `drop` (the slow-motion close call
lands on it), `outro` (cut to the end card) and `end`. They are set from the
song's beat grid, so cuts and zoom punches land on downbeats. For the
current song (97.43 bpm, from 0:50.055) every cue is a whole number of bars.
For a new song, measure its tempo and downbeats (e.g. decode it with ffmpeg
and look at the kick and snare onsets), then set `BPM`, `BAR`,
`TRACK_START` and the cues. The composition's length follows `end`.

`src/plan.ts` is the one source of truth for the scenes' frames, the run
and its time mapping: both the composition and the audio render read it, so
the sound can't drift from the picture.

## Building blocks

- `src/time.ts`: video frame to game time. A `TimeMap` is a start tick and
  speed segments (`{ fromFrame, speed, ramp? }`: 1 real time, 0.2 slow motion,
  0 freeze). `alignTo` lands a given tick on a given frame, e.g. a close call
  on a beat.
- `src/GameplayClip.tsx`: a recording, a `TimeMap` and a camera. Replays to
  each frame's tick and draws with the real renderer at high resolution
  (`resolution`, default 4), so zooms stay sharp. The HUD, rules and effects
  come from the game's own `src/scene.ts`, as main draws them, with a
  default-settings player's facing guide. `room` keeps the bottom of the
  frame clear of the board, e.g. for a caption.
- `src/effects.ts`: particles and screen shake worked out afresh for each
  frame from the run's events, seeded per tick, so they stay a pure
  function of game time.
- `src/camera.ts`: `follow({ player, smoothing, zoom })` follows a player,
  smoothed over earlier frames, with a quick pan across the board when the
  player goes through a tunnel; `fixed` and `overview` don't move;
  `keyframes` gives eased values (zoom) over frames. The clip clamps the
  camera to the board. `drawTime` holds the alpha on end screens as main
  does.
- `src/plan.ts`: the promo's frames, run and time mapping (see Sound).
- `src/soundtrack.ts`: the effects timeline, the game music sections and
  the music's volume per frame, all pure; `scripts/audio.ts` renders them.
- `src/replayers.ts`: shared replayers and a run log per recording (player
  tracks, each tick's events), and `nearMisses`, the run's closest calls
  with enemies that can catch or the boss, for slow motion.
- `src/TitleCard.tsx`, `src/EndCard.tsx`, `src/text.tsx` (`Pop`, `Caption`):
  big black-and-white words that pop in on beats.

Every frame must depend only on its frame number: Remotion renders frames out
of order, across several browser tabs. Don't use `Date`, `performance.now`,
`Math.random` or state carried between renders in anything that draws.
