// Records a demo run of stage 1 for the video, played by a simple bot, and
// writes it to src/recordings/demo.json. A stand-in until real recordings
// (made with the game's ?record mode) replace it.
//
//     pnpm --filter dot-eater-video record-demo
//
// The bot is in bot.ts. Everything is seeded, so it records the same run
// every time.
import { writeFileSync } from "node:fs"
import { stages as levels } from "../../src/levels/index.ts"
import { tickCount, verify } from "../../src/replay.ts"
import { playDemo } from "./bot.ts"

const OUT = new URL("../src/recordings/demo.json", import.meta.url)

const recording = playDemo()
if (!verify(recording, levels)) throw new Error("The replay doesn't match")
writeFileSync(OUT, `${JSON.stringify(recording)}\n`)
console.log(
    `Recorded ${tickCount(recording)} ticks, ended on ${recording.final.kind}, score ${recording.final.scores[0]}, health ${recording.final.health.join("/")}, ${recording.ticks.length} runs`
)
