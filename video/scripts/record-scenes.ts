// Records the promo's directed scenes (see director.ts) and writes each to
// src/recordings/scenes/<name>.json.
//
//     pnpm --filter dot-eater-video record-scenes
//     pnpm --filter dot-eater-video record-scenes --search [n] [scene...]
//
// Everything is seeded, so it records the same runs every time. With
// --search it records nothing and instead tries seeds 1 to n (100 unless
// given) for each scene (all unless named) and prints the best, to pick a
// scene's seed in director.ts.
import { mkdirSync, writeFileSync } from "node:fs"
import { levels } from "../../src/levels/index.ts"
import { tickCount, verify } from "../../src/replay.ts"
import { heroMoment } from "../src/highlights.ts"
import { SCENE_NAMES, type SceneName } from "../src/scenes.ts"
import { playScene, SCENES, searchSeeds } from "./director.ts"

const OUT = new URL("../src/recordings/scenes/", import.meta.url)

const args = process.argv.slice(2)
if (args[0] === "--search") {
    const n = Number(args[1]) || 100
    const named = args.slice(Number(args[1]) ? 2 : 1) as SceneName[]
    for (const name of named.length > 0 ? named : SCENE_NAMES) {
        const best = searchSeeds(SCENES[name], n).slice(0, 5)
        console.log(
            `${name}: ${best.map((r) => `seed ${r.seed} score ${r.score.toFixed(0)} key ${r.keyTick}`).join(" | ")}`
        )
    }
} else {
    mkdirSync(OUT, { recursive: true })
    for (const name of SCENE_NAMES) {
        const { recording } = playScene(SCENES[name])
        if (!verify(recording, levels)) {
            throw new Error(`The replay of ${name} doesn't match`)
        }
        const hero = heroMoment(name, recording)
        if (!hero) throw new Error(`${name} has no hero moment`)
        writeFileSync(
            new URL(`${name}.json`, OUT),
            `${JSON.stringify(recording)}\n`
        )
        console.log(
            `${name}: stage ${recording.level + 1}, ${recording.animals.join("+")}, seed ${recording.seed}, ${tickCount(recording)} ticks, hero ${hero.kind} at ${hero.tick} (${hero.at.x},${hero.at.y})`
        )
    }
}
