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
| `pnpm --filter dot-eater-video analyze-track` | Measure the songs' beats and sections (see Edit toolkit)  |
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
That folder is gitignored: never commit a song, the repo is public. Each
composition plays the song whose file name matches its entry in `SONGS`
(`src/songs.ts`, ignoring case, spaces and punctuation): `Promo` plays
"slam", the v2 edit "great expectations". `Promo`'s song is played under
the effects from `TRACK_START`
(`src/cues.ts`), at `MIX.song` (`src/soundtrack.ts`), with a slight dip in
slow motion and a fade out at the end. Without a song, the game's own tunes
play instead (`audio/music.wav`: the title tune over the title and end
cards, the stage's over the run), so a fresh clone still renders with sound.

**Cues.** All timing hangs off named cues in `src/cues.ts` (seconds into the
video): `intro`, `play` (cut to gameplay), `drop` (the slow-motion close call
lands on it), `outro` (cut to the end card) and `end`. They are set from the
song's beat grid, so cuts and zoom punches land on downbeats. For the
current song (97.43 bpm, from 0:50.055) every cue is a whole number of bars.
For a new song, measure its tempo and downbeats with `analyze-track` (see
Edit toolkit), then set `BPM`, `BAR`,
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

## Edit toolkit

The v2 promo is cut fast to the beat. Its pieces are pure functions of the
frame, unit-tested next to the code, and `ToolkitDemo` (about 10 s) shows
them all:

```sh
pnpm --filter dot-eater-video exec remotion render ToolkitDemo out/demo.mp4
```

### Analyse a new track

1. Drop the song into `video/public/music/` (gitignored) and add it to
   `SONGS` in `src/songs.ts`, by a part of its file name.
2. Run `pnpm --filter dot-eater-video analyze-track [file]`. With no
   argument it analyses every song in `public/music/`; otherwise give a path
   or a part of a file name. It decodes the song with ffmpeg (on `PATH` or
   in `/opt/homebrew/bin`) and writes `<name>.beats.json` next to it
   (gitignored too: never commit it). It also prints the tempo, the first
   downbeat and the section map.
3. Copy the printed bpm and first downbeat into `SONG_GRIDS`
   (`src/excerpts.ts`), so a clone without the song still cuts on the same
   frames.
4. Pick the excerpt by bars and name its cues: see `PROMO2_EXCERPT`.

The analysis (`scripts/analysis.ts`, tested on synthetic click tracks):

- **Tempo:** autocorrelation of the spectral-flux onset envelope, weighted
  towards 120 bpm against octave errors. The period is then refined, and
  the beat phase found, by folding the envelope over candidate periods.
- **Downbeats:** the kick picks beats 1 and 3 over 2 and 4. Of those two,
  beat 1 is where the sound changes most, at the peaks of a beat-level
  timbre novelty curve.
- **Sections:** per-bar chroma, timbre, vocal-band density, drum pattern
  and level give a bar self-similarity matrix. Its checkerboard novelty,
  plus changes in the drums and the level, marks the boundaries.
    - A track with quiet breakdowns well under its loud parts is labelled by
      loudness: intro, build, drop, breakdown, groove, outro.
    - A steady track (hip-hop, pop) is labelled by repetition: the 8-bar
      passage that comes back most alike (`findRepeats`) is the hook, and the
      rest are verses.
    - Every section has a group letter (alike sections share one) and a
      confidence.
- **Strongest drop:** the loudest drop or hook that lifts the most, the
  first time it comes.

Measured so far:

- Slam: 97.431 bpm, its drop at 1:04.82.
- Great Expectations: 96.968 bpm, hooks at bars 16, 40 and 64.

### Pieces

- `src/beats.ts`: the `BeatsFile` the analyser writes, `fallbackBeats`, and
  `beatsOf(file, { fps, start })`. That gives the frame maths: `beatFrame(n)`,
  `barFrame(n)`, `beatAt(frame)`, `sectionFrames(label, nth)`, `dropFrame`,
  `nearestBeat(frame)`, and `pulse(frame)`, a 0–1 envelope that jumps on
  each beat (hardest on downbeats) and decays.
- `src/loadBeats.ts`: `loadBeats(song)` fetches the beats file in a
  composition's `calculateMetadata`, and falls back to the measured grid.
- `src/excerpts.ts`: an excerpt is a song's bars `[fromBar, toBar)` with its
  cues as bar numbers (`PROMO2_EXCERPT`: bars 32–48 of Great Expectations).
  `excerptFrames` turns one into frames: `cue(name)`, `bar(n)`, `duration`,
  `start` (for `<Audio trimBefore>`) and its `beats`.
- `src/cutList.ts`: the declarative edit. A shot is either a gameplay shot
  (`{ recording, heroTick, at, durationBeats, heroBeat?, speed?, camera?,
  colour?, caption?, transition?, shake? }`) or a character card
  (`{ kind: "card", animal, durationBeats }`).
    - `compileCuts(list, beats)` lays the shots end to end on the beat grid.
      It lines each gameplay clip up with `alignTo`, so its hero tick lands
      exactly on its hero beat.
    - It throws a `CutListError` that names every shot that would run off
      either end of its recording, with by how much.
- `src/drama.ts` (maths) and `src/DramaFx.tsx` (components):
    - `speedRamp`: normal, fast, hard slow motion on the hero frame, normal.
    - `punchZoom`: zoom punches on the beat, through the camera.
    - `shakeAt` / `Shake`: camera shake on impacts.
    - `flashAt` / `Flash`: white or colour flashes. With `blend="multiply"`
      the board's white takes the colour and its black stays.
    - Transitions: `whipAt` / `Whip` (whip pan with motion blur), `wipeAt` /
      `ColourWipe`, and a 1-frame flash cut.
    - `slamAt` / `Slam` / `SlamCard` (the character name slam), `SlamCaption`,
      `PulseText`, `Letterbox` and `Vignette`.
- `src/CutSequence.tsx`: draws a compiled cut list.
- `src/palette.ts`: the look. It's black and white plus one colour per
  character:
    - dragon fire `#FF4B12`
    - penguin ice `#12C8F2`
    - owl wind `#8B4DFF`
    - skunk green `#34D058`
    - boar earth `#A8642A`

    Each character also has a name, an ability word and an emoji.
