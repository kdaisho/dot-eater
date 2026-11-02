import { energyHud } from "./breath"
import { DIFFICULTY_LABELS } from "./difficulty"
import { runTotal, type Screen } from "./flow"
import { bossHud, healthHud, totalScore, type GameState } from "./game"
import type { Jab } from "./jab"
import type { LevelRules, Stage } from "./level"
import type { Particle } from "./particles"
import type { Effects, Hud } from "./render"
import type { FacingGuide } from "./settings"
import type { Vec2 } from "./vec2"
import { stunned, tallyText } from "./versus"

// What the renderer is given besides the game for a screen: the HUD, the
// level's rules and the effects. Pure, no DOM: main.ts's render() draws
// with these, and so does the promo video (video/), which replays
// recordings through the real renderer and must draw what a player sees.

// The level's rules (fog) for a screen with a game: every screen with one
// says which level it is.
export function rulesOf(
    screen: Screen,
    stages: readonly Stage[]
): LevelRules | undefined {
    if (!("level" in screen)) return undefined
    return stages[screen.level]?.[screen.difficulty]?.rules
}

// The HUD for `game` on `screen`: the players' HUD, plus the boss's health,
// the difficulty and, in a story run, the run total.
export function hudOf(game: GameState, screen: Screen): Hud {
    const hud = game.mode === "versus" ? versusHud(game, screen) : coopHud(game)
    const boss = bossHud(game)
    if (boss) hud.boss = boss
    if ("difficulty" in screen) {
        hud.difficulty = DIFFICULTY_LABELS[screen.difficulty]
    }
    if ("run" in screen && screen.run) {
        // On game over, the total Retry plays on from, as the card says:
        // the failed stage's score is lost.
        const total =
            screen.kind === "gameOver"
                ? screen.run.total
                : runTotal({ run: screen.run, game })
        withRunTotal(hud, total)
    }
    return hud
}

// In a story run (KDA-271) the HUD shows the run total so far, this
// stage's score included: in place of the score with one player, and in
// the middle (above the difficulty) with two, whose own scores stay.
function withRunTotal(hud: Hud, total: number) {
    if (hud.players) hud.round = `Total ${total}`
    else hud.score = total
}

// The versus HUD: each player's dots, meter, stun or respawn countdown,
// health, and the round tally. The result screens keep showing the round
// just played as it was during play.
function versusHud(game: GameState, s: Screen): Hud {
    const match =
        s.kind === "roundResult" || s.kind === "matchResult"
            ? s.match.slice(0, -1)
            : "match" in s
              ? (s.match ?? [])
              : []
    return {
        round: tallyText(match),
        players: game.players.map((p, i) => ({
            score: p.score,
            dots: p.dots,
            energy: energyHud(game, i),
            health: healthHud(p),
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
            ...(stunned(p) ? { stunned: p.stunnedFor } : {}),
        })),
    }
}

// The HUD: with one player its score, meter and health; with two, each
// one's.
function coopHud(game: GameState): Hud {
    if (game.players.length === 1) {
        return {
            score: totalScore(game),
            health: healthHud(game.players[0]),
            energy: energyHud(game),
        }
    }
    return {
        players: game.players.map((p, i) => ({
            score: p.score,
            energy: energyHud(game, i),
            health: healthHud(p),
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
        })),
    }
}

// Where the effects come from (see particles.ts, shake.ts, jab.ts,
// settings.ts).
export type EffectSources = {
    // The particles alive.
    particles: readonly Particle[]
    // The punches being thrown.
    jabs: readonly Jab[]
    // This frame's shake offset; only asked for while the game moves.
    shake: () => Vec2
    // The Facing guide setting.
    guide: FacingGuide
    // A guarding enemy doesn't crouch with reduced motion.
    reducedMotion: boolean
}

// The effects drawn on `screen`: particles, punches and shake show while
// the game is played, paused or ending (none on other screens); a paused
// game doesn't shake. The facing arrow shows with the rings, paused and
// ending too; the aim preview only while playing. The boss's wind-up (its
// glow and warning tint) shows on the board as the rings do.
export function screenEffects(s: Screen, sources: EffectSources): Effects {
    if (s.kind !== "playing" && s.kind !== "ending" && s.kind !== "paused") {
        return {}
    }
    const moving = s.kind !== "paused"
    return {
        particles: sources.particles,
        jabs: sources.jabs,
        reducedMotion: sources.reducedMotion,
        ...(moving ? { shake: sources.shake() } : {}),
        guide: sources.guide,
        ...(s.kind === "playing" ? { aim: true } : {}),
        bossBreath: true,
    }
}
