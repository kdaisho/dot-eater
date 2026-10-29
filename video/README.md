# dot-eater video

The promo video for dot-eater, made with [Remotion](https://www.remotion.dev).
The gameplay in it is real: a recording of a run (its seed and every tick's
input) is replayed through the game's own logic (`src/replay.ts`) and drawn by
the game's own canvas renderer (`src/render.ts`), frame by frame.

This is a pnpm workspace package (`dot-eater-video`). Run `pnpm install` at the
repo root first. Commands below run from the repo root; inside `video/` drop
the `--filter dot-eater-video` part.

## Preview and render

| Command                                     | What it does                                        |
| ------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter dot-eater-video studio`      | Remotion Studio: scrub and preview the video        |
| `pnpm --filter dot-eater-video render`      | Render `Promo` to `video/out/promo.mp4`             |
| `pnpm --filter dot-eater-video record-demo` | Re-record the demo run (`src/recordings/demo.json`) |

A still frame, e.g. to check a zoom:

```sh
pnpm --filter dot-eater-video exec remotion still Promo out/frame.png --frame=270
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
3. Use it by file name: `recording("epic-run")` from `src/recordings`. In
   `src/Promo.tsx`, change `RUN`.

The demo run is played by a bot (`scripts/bot.ts`, recorded by
`scripts/record-demo.ts`) until real recordings replace it. A test checks
that the bot still records exactly the committed `demo.json`, so when the
game's rules change and that test fails, re-run `record-demo`.

## Music and cues

All timing hangs off named music cues in `src/cues.ts` (seconds into the
track): `intro`, `drop`, `chorus`, `outro` and `end`. Scenes cut and pop on
`cueFrame("drop", fps)` and the like instead of frame numbers, so when the
track arrives only the cue times change.

To set the music:

1. Put the track in `video/public/`, e.g. `video/public/music.mp3`.
2. Set `MUSIC = "music.mp3"` in `src/cues.ts`. The `<Audio>` is only added
   when `MUSIC` is set.
3. Set the cue times from the track (scrub it in Studio), and `BEAT` in
   `src/Promo.tsx` to the frames per beat.

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
- `src/replayers.ts`: shared replayers and a run log per recording (player
  tracks, each tick's events), and `nearMisses`, the run's closest calls
  with enemies that can catch or the boss, for slow motion.
- `src/TitleCard.tsx`, `src/EndCard.tsx`, `src/text.tsx` (`Pop`, `Caption`):
  big black-and-white words that pop in on beats.

Every frame must depend only on its frame number: Remotion renders frames out
of order, across several browser tabs. Don't use `Date`, `performance.now`,
`Math.random` or state carried between renders in anything that draws.
