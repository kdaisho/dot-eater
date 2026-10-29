// Renders the promo's game sound to WAV files in public/audio/, for
// Promo.tsx to play: the sound effects in sync with the run, and the
// game's own music (played when there is no song in public/music/).
//
//     pnpm --filter dot-eater-video render-audio
//
// The render and studio scripts run it first. The timing comes from
// src/plan.ts, as the composition's does, so the two can't drift.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import type { Recording } from "../../src/replay.ts"
import { DURATION, FPS, promoClip, RUN } from "../src/plan.ts"
import { runOf } from "../src/replayers.ts"
import {
    AUDIO_FILES,
    MIX,
    musicSections,
    sfxTimeline,
} from "../src/soundtrack.ts"
import {
    encodeWav,
    peak,
    renderEffects,
    renderMusic,
    SAMPLE_RATE,
} from "./audio.ts"

const PUBLIC = new URL("../public/", import.meta.url)

const run = JSON.parse(
    readFileSync(new URL(`../src/recordings/${RUN}.json`, import.meta.url), {
        encoding: "utf8",
    })
) as Recording
const clip = promoClip(run)
const { ticks } = runOf(run)
const seconds = DURATION / FPS

const cues = sfxTimeline(clip, ticks)
const sections = musicSections({
    fps: FPS,
    clip,
    level: run.level,
    ticks,
    duration: DURATION,
})

const files = [
    [AUDIO_FILES.effects, await renderEffects(cues, seconds, MIX.effects)],
    [AUDIO_FILES.music, await renderMusic(sections, seconds, MIX.gameMusic)],
] as const

mkdirSync(new URL("audio/", PUBLIC), { recursive: true })
for (const [name, samples] of files) {
    const level = peak(samples)
    const wav = encodeWav(samples, SAMPLE_RATE)
    writeFileSync(new URL(name, PUBLIC), wav)
    console.log(
        `${name}: ${(wav.length / 1e6).toFixed(2)} MB, peak ${(20 * Math.log10(level)).toFixed(1)} dBFS`
    )
    if (level >= 1) throw new Error(`${name} clips`)
}
console.log(
    `${cues.length} effects, music: ${sections.map((s) => `${s.track} ${s.from.toFixed(2)}–${s.to.toFixed(2)} s`).join(", ")}`
)
