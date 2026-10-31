import {
    AiType,
    CharacterId,
    ENEMY_SPEED,
    PHANTOM_SPEED,
    PLAYER_SPEED,
} from "./constants"
import type { ActiveStatus } from "./breath"
import type { SplitterPart } from "./splitter"
import { vec2, type Vec2 } from "./vec2"

export type Character = {
    id: CharacterId
    pos: Vec2
    // The cell it came from on its latest move.
    lastPos: Vec2
    ai: AiType
    // Movement speed in cells per second.
    speed: number
    // Progress towards the next move, from 0 (just moved) to 1 (ready to
    // move). It grows by speed * dt each tick and stays at 1 while the
    // character can't or doesn't want to move. Just after a move it can be a
    // little above 0: the progress left over past 1, so slow ticks don't
    // round speeds down. An enemy a punch knocked back from short of its
    // cell starts below 0 (down to -0.5; see knockEnemy in punch.ts): it is
    // drawn that far before lastPos, and its glide in is that much longer.
    moveProgress: number
    // Patrollers only: the waypoints walked in a loop, and the index of the
    // one it is heading for. Other characters have no route.
    route?: readonly Vec2[]
    routeIndex: number
    // Timed statuses a breath has put on it (frozen and so on; see breath.ts).
    // Empty for none. Cleared when it is defeated or respawns.
    statuses: ActiveStatus[]
    // Seconds until a defeated enemy is back at its spawn; 0 while it is in
    // play. While above 0 the enemy is out of the game: it doesn't move or
    // catch, and is only drawn (blinking) near the end (see enemyVisible).
    // Infinity (GONE in splitter.ts) is out of play with no timer: a
    // Splitter's half that is gone, or its spare slot before a split.
    respawnIn: number
    // Seconds in a row a chaser, ambusher or Splitter has held its move so
    // as not to stack on one of its kind (see spreadChoice in ai.ts); 0
    // on any tick it doesn't hold (it moves, stays put for another reason,
    // glides, is frozen or is out of play).
    heldFor: number
    // Splitters only: which of the Splitter's two enemy slots this is, and
    // whether it is whole or a half (see splitter.ts).
    part?: SplitterPart
    // The punch (KDA-288; see punch.ts). Enemies only: a player's stay at
    // their starting values.
    //
    // Landed punches counting towards the knockback's decay (see
    // knockLevel), from 0 (a full cell) up to the last of the game's decay
    // steps (GameState.knock), and the seconds since the latest of them. 0
    // and 0 to start with, and again once it is defeated.
    knocks: number
    sinceKnock: number
    // While a short knock (less than a cell) glides it out, the move
    // progress at which it turns round and glides back into the cell it
    // was knocked from (see turnKnock); null otherwise.
    knockTurn: number | null
    // Whether its next move may turn back into the cell it came from, the
    // no-reverse rule aside (see candidateMoves in ai.ts): set by a full
    // knock, so it comes straight back at the player, until it next makes
    // a move of its own.
    turnsBack: boolean
    // Its guard skill, the chance it blocks a quick punch (see guard.ts):
    // 0 for none, null until it is rolled, as it comes into play.
    guard: number | null
    // Seconds left of its guard stance after a block (KDA-293; see
    // GUARD_STANCE in guard.ts), while it holds still; 0 for none.
    stance: number
}

export function createCharacter(
    id: CharacterId,
    pos: Vec2,
    ai: AiType = AiType.random,
    // Cells per second. Omitted means the default speed for the id: the one
    // place the default speeds are applied.
    speed?: number,
    route?: readonly Vec2[]
): Character {
    return {
        id,
        pos,
        // Until its first move a character has not come from anywhere else.
        lastPos: vec2(pos.x, pos.y),
        ai,
        speed: speed ?? defaultSpeed(id, ai),
        moveProgress: 0,
        ...(route === undefined
            ? {}
            : { route: route.map((p) => vec2(p.x, p.y)) }),
        routeIndex: 0,
        statuses: [],
        respawnIn: 0,
        heldFor: 0,
        knocks: 0,
        sinceKnock: 0,
        knockTurn: null,
        turnsBack: false,
        guard: null,
        stance: 0,
    }
}

// Stop any knock `character` is in the middle of (see punch.ts), for when
// something else moves it: it no longer turns round or turns back.
export function endKnock(character: Character) {
    character.knockTurn = null
    character.turnsBack = false
}

// Call off the turn a short knock (see punch.ts) has `character` make, for
// when the cell it would turn back into won't do: it carries on into the
// cell it was knocked towards as a full knock would, and may turn back on
// its next move (turnsBack), if that cell is open then.
export function skipKnockTurn(character: Character) {
    if (character.knockTurn === null) return
    character.knockTurn = null
    character.turnsBack = true
}

// Forget the punches `character` has taken (see punch.ts), its guard roll
// and any guard stance (see guard.ts), as when it is defeated: it comes
// back fresh and rolls again.
export function freshFromPunches(character: Character) {
    endKnock(character)
    character.knocks = 0
    character.sinceKnock = 0
    character.guard = null
    character.stance = 0
}

function defaultSpeed(id: CharacterId, ai: AiType): number {
    if (id === CharacterId.player) return PLAYER_SPEED
    return ai === AiType.phantom ? PHANTOM_SPEED : ENEMY_SPEED
}
