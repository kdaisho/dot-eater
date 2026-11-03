import { Cell, ENEMY_DAMAGE } from "./constants"
import { damageBoss, inFootprint } from "./boss"
import { defeatEnemy, inPlay, playersInPlay } from "./breath"
import type { Character } from "./character"
import { emit } from "./events"
import { eatDot, hurtPlayer, type GameState, type Player } from "./game"
import { loopPos } from "./level"
import { samePos, vec2, type Vec2 } from "./vec2"

// Knocked flying (KDA-304, the Boar's Rush; see BreathHit.knock in
// breath.ts). Pure, no DOM.
//
// The enemies the Rush rams fly off along the rush line, a few cells, and
// are defeated when they slam to a stop: into a wall, into the boss, or at
// the end of their flight. Whatever is in their way is carried along in
// front of them, a chain: each thing pushed shoves the next, so the whole
// row moves on together, a cell at a time, until the one in front meets a
// wall or the boss or the flight runs out. Decided with the user:
//
// - enemies shoved down the chain are only pushed, never defeated
//   (regular enemies have no health);
// - a player shoved down it takes no damage in solo and co-op (a push
//   only), but in versus it is a real hit (see hurtPlayer);
// - the boss is too big to shove (2x2): the chain stops at it, and it
//   takes a little damage, `bossDamage`.
//
// Everyone moved arrives at rest on its new cell, not gliding in from the
// cell before: they all move at different speeds, and a chain glided in
// would let a fast enemy catch up with the player shoved just ahead of it
// on the way. The flight is only drawn (KDA-307, see rushView.ts): from
// the knockedFlying event, the flier flies along it and the chain slides
// in front of it, a moment after the logic is done with them. Shoved
// enemies still wait a whole move before they move on, a moment's daze.

// One cell's worth of the chain: who is on it, and the cell it started on.
type Car = {
    cell: Vec2
    from: Vec2
    // How many cells it has been carried.
    moved: number
    enemies: Character[]
    players: Player[]
}

// Knock `enemies` (in play, all on one cell) flying up to `distance` cells
// along the unit `step`, for `by`, the player whose Rush rammed them, as
// the top of this file says: the chain in front is carried along, they are
// defeated where they slam (scoring for `by`), and the boss, if the chain
// meets it, takes `bossDamage`. `by` itself is never in the chain (it
// stands behind them; only a tunnel could bring the chain round to it).
// Returns the cell the fliers slammed on, or null if none was in play.
export function knockFlying(
    state: GameState,
    by: Player,
    enemies: readonly Character[],
    step: Vec2,
    distance: number,
    bossDamage: number
): Vec2 | null {
    const fliers = enemies.filter(inPlay)
    if (fliers.length === 0) return null
    const start = vec2(fliers[0].pos.x, fliers[0].pos.y)
    const boss = state.boss && !state.boss.defeated ? state.boss : null
    const ahead = (p: Vec2) =>
        loopPos(state.cells, vec2(p.x + step.x, p.y + step.y))
    const cars: Car[] = [
        { cell: start, from: start, moved: 0, enemies: fliers, players: [] },
    ]
    const taken = new Set<Character>(fliers)
    const others = playersInPlay(state).filter((p) => p !== by)
    // Take whatever stands right in front of the chain into it, as the new
    // front car, until the cell in front is clear of characters.
    const pickUp = () => {
        for (;;) {
            const cell = ahead(cars[cars.length - 1].cell)
            const shovedEnemies = state.enemies.filter(
                (e) => inPlay(e) && !taken.has(e) && samePos(e.pos, cell)
            )
            const shovedPlayers = others.filter(
                (p) => !taken.has(p.character) && samePos(p.character.pos, cell)
            )
            if (shovedEnemies.length === 0 && shovedPlayers.length === 0) {
                return
            }
            for (const e of shovedEnemies) taken.add(e)
            for (const p of shovedPlayers) taken.add(p.character)
            cars.push({
                cell,
                from: cell,
                moved: 0,
                enemies: shovedEnemies,
                players: shovedPlayers,
            })
        }
    }
    pickUp()
    let hitBoss = false
    for (let moved = 0; moved < distance; moved++) {
        const next = ahead(cars[cars.length - 1].cell)
        if (state.cells[next.y][next.x] === Cell.wall) break
        if (boss && inFootprint(boss.pos, next)) {
            hitBoss = true
            break
        }
        for (const car of cars) {
            car.cell = ahead(car.cell)
            car.moved++
        }
        pickUp()
    }
    const slam = cars[0].cell
    if (!samePos(slam, start)) {
        emit(state, {
            type: "knockedFlying",
            player: state.players.indexOf(by),
            from: start,
            to: vec2(slam.x, slam.y),
            facing: vec2(step.x, step.y),
            distance: cars[0].moved,
            shoved: cars.slice(1).flatMap((car) =>
                car.moved === 0
                    ? []
                    : [
                          {
                              from: vec2(car.from.x, car.from.y),
                              to: vec2(car.cell.x, car.cell.y),
                              distance: car.moved,
                              enemies: car.enemies.map((e) =>
                                  state.enemies.indexOf(e)
                              ),
                              players: car.players.map((p) =>
                                  state.players.indexOf(p)
                              ),
                          },
                      ]
            ),
        })
    }
    // The shoved first, front to back, so the dots they pass are eaten and
    // their hits land before the fliers leave.
    for (const car of cars.slice(1).reverse()) {
        const moved = !samePos(car.cell, car.from)
        for (const enemy of car.enemies) {
            if (!moved) continue
            enemy.pos = vec2(car.cell.x, car.cell.y)
            enemy.lastPos = vec2(car.cell.x, car.cell.y)
            enemy.moveProgress = 0
        }
        for (const player of car.players) {
            if (moved) shove(state, player, car.from, car.cell, step)
            // In versus the chain is a real hit, from the car behind it.
            if (state.mode === "versus") {
                const behind = vec2(car.cell.x - step.x, car.cell.y - step.y)
                hurtPlayer(state, player, ENEMY_DAMAGE, behind)
            }
        }
    }
    for (const enemy of fliers) {
        // Defeated where it slammed, so its defeat is reported there.
        enemy.pos = vec2(slam.x, slam.y)
        enemy.lastPos = vec2(slam.x, slam.y)
        defeatEnemy(state, enemy, by)
    }
    if (hitBoss) damageBoss(state, bossDamage, by)
    return vec2(slam.x, slam.y)
}

// Move `player` from `from` to `to` along `step`, at rest on arrival (see
// the top of this file), eating every dot it is carried over. Its facing
// and tap buffer stay: being shoved doesn't turn it round.
function shove(
    state: GameState,
    player: Player,
    from: Vec2,
    to: Vec2,
    step: Vec2
) {
    let p = from
    while (!samePos(p, to)) {
        p = loopPos(state.cells, vec2(p.x + step.x, p.y + step.y))
        eatDot(state, player, p)
    }
    const c = player.character
    c.pos = vec2(to.x, to.y)
    c.lastPos = vec2(to.x, to.y)
    c.moveProgress = 1
    player.rate = 1
    player.eatenAt = null
}
