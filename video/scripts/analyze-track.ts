// Measures a song's beat grid and structure and writes it next to the song
// as <name>.beats.json, for the compositions to cut to (see src/beats.ts):
//
//     pnpm --filter dot-eater-video analyze-track [file]
//
// `file` is a path, or part of a file name in public/music/; without it,
// every song in public/music/ is analysed. The song is decoded with ffmpeg
// (on PATH, or /opt/homebrew/bin) to mono 22.05 kHz. The beats file is
// gitignored with the song: never commit either.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beatsFileName, songMatches } from "../src/songs.ts"
import { analyse } from "./analysis.ts"

const MUSIC = fileURLToPath(new URL("../public/music/", import.meta.url))
const AUDIO = /\.(mp3|m4a|aac|wav|ogg|flac)$/i
const SAMPLE_RATE = 22_050

function ffmpeg(): string {
    const which = spawnSync("which", ["ffmpeg"], { encoding: "utf8" })
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim()
    const brew = "/opt/homebrew/bin/ffmpeg"
    if (existsSync(brew)) return brew
    throw new Error("ffmpeg not found: install it (e.g. brew install ffmpeg)")
}

// The song as mono samples at SAMPLE_RATE.
function decode(file: string): Float32Array {
    const args = ["-v", "error", "-i", file, "-ac", "1"]
    args.push("-ar", String(SAMPLE_RATE), "-f", "f32le", "-")
    const result = spawnSync(ffmpeg(), args, { maxBuffer: 1024 ** 3 })
    if (result.status !== 0) {
        throw new Error(`ffmpeg failed on ${file}: ${String(result.stderr)}`)
    }
    const bytes = result.stdout
    return new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
    )
}

function songs(arg: string | undefined): string[] {
    const inFolder = existsSync(MUSIC)
        ? readdirSync(MUSIC).filter((name) => AUDIO.test(name))
        : []
    if (!arg) return inFolder.map((name) => join(MUSIC, name))
    if (existsSync(arg)) return [resolve(arg)]
    const found = inFolder.filter((name) => songMatches(name, arg))
    if (!found.length) throw new Error(`No song matching "${arg}" in ${MUSIC}`)
    return found.map((name) => join(MUSIC, name))
}

const mmss = (t: number) =>
    `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`

const files = songs(process.argv[2])
if (!files.length) console.log(`No songs in ${MUSIC}`)
for (const file of files) {
    const beats = analyse(decode(file), SAMPLE_RATE, { track: basename(file) })
    const out = join(dirname(file), beatsFileName(basename(file)))
    writeFileSync(out, `${JSON.stringify(beats, null, 1)}\n`)
    const bar = beats.beatPeriod * beats.beatsPerBar
    console.log(`${basename(file)} -> ${out}`)
    console.log(
        `  ${beats.bpm} bpm, beat ${beats.beatPeriod.toFixed(5)} s, ` +
            `bar ${bar.toFixed(5)} s, first downbeat ` +
            `${(beats.downbeats[0] ?? 0).toFixed(3)} s, ` +
            `${beats.downbeats.length} bars`
    )
    for (const s of beats.sections) {
        console.log(
            `  ${mmss(s.start)}–${mmss(s.end)}  bars ` +
                `${String(s.startBar).padStart(3)}–${String(s.endBar).padEnd(3)} ` +
                `${s.label.padEnd(9)} ${s.group}  energy ${s.energy.toFixed(2)}  ` +
                `confidence ${s.confidence.toFixed(2)}`
        )
    }
    console.log(
        `  strongest lift: ${mmss(beats.drop.time)} (bar ${beats.drop.bar})`
    )
}
