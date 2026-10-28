import { energyHud } from "../../src/breath"
import type { Screen } from "../../src/flow"
import { totalScore, type GameState } from "../../src/game"
import { levels } from "../../src/levels"
import type { LevelRules } from "../../src/level"
import type { Hud } from "../../src/render"
import { stunned, tallyText } from "../../src/versus"

// What the renderer is given besides the game, built the way src/main.ts's
// render() builds it. Copied from main.ts (hudOf, versusHud), which isn't
// importable: it wires up the page on import. Keep the two in step.

// The level's rules (fog), as main passes them to draw.
export function rulesOf(screen: Screen): LevelRules | undefined {
    return "level" in screen ? levels[screen.level]?.rules : undefined
}

// The HUD for `game` on `screen`.
export function hudFor(game: GameState, screen: Screen): Hud {
    return game.mode === "versus" ? versusHud(game, screen) : hudOf(game)
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
function hudOf(game: GameState): Hud {
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
