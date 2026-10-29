import { energyHud } from "./breath"
import type { Screen } from "./flow"
import { totalScore, type GameState } from "./game"
import type { Level, LevelRules } from "./level"
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
    levels: readonly Level[]
): LevelRules | undefined {
    return "level" in screen ? levels[screen.level]?.rules : undefined
}

// The HUD for `game` on `screen`.
export function hudOf(game: GameState, screen: Screen): Hud {
    return game.mode === "versus" ? versusHud(game, screen) : coopHud(game)
}

// The versus HUD: each player's dots, meter, stun or respawn countdown, and
// the round tally (no lives). The result screens keep showing the round
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
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
            ...(stunned(p) ? { stunned: p.stunnedFor } : {}),
        })),
    }
}

// The HUD: with one player its score and meter; with two, each one's.
function coopHud(game: GameState): Hud {
    if (game.players.length === 1) {
        return {
            score: totalScore(game),
            lives: game.lives,
            energy: energyHud(game),
        }
    }
    return {
        lives: game.lives,
        players: game.players.map((p, i) => ({
            score: p.score,
            energy: energyHud(game, i),
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
        })),
    }
}

// Where the effects come from (see particles.ts, shake.ts, settings.ts).
export type EffectSources = {
    // The particles alive.
    particles: readonly Particle[]
    // This frame's shake offset; only asked for while the game moves.
    shake: () => Vec2
    // The Facing guide setting.
    guide: FacingGuide
}

// The effects drawn on `screen`: particles and shake show while the game
// is played, paused or ending (none on other screens); a paused game
// doesn't shake. The facing arrow shows with the rings, paused and ending
// too; the aim preview only while playing.
export function screenEffects(s: Screen, sources: EffectSources): Effects {
    if (s.kind !== "playing" && s.kind !== "ending" && s.kind !== "paused") {
        return {}
    }
    const moving = s.kind !== "paused"
    return {
        particles: sources.particles,
        ...(moving ? { shake: sources.shake() } : {}),
        guide: sources.guide,
        ...(s.kind === "playing" ? { aim: true } : {}),
    }
}
