import { Cell, CharacterId } from "./constants"
import type { GameState } from "./game"

const cellAA: Record<Cell, string> = {
    [Cell.none]: '<span class="none"></span>',
    [Cell.wall]: '<span class="wall"></span>',
    [Cell.dot]: '<span class="dot"><span></span></span>',
}

const characterAA: Record<CharacterId, string> = {
    [CharacterId.player]: '<span class="character"><span>🪰</span></span>',
    [CharacterId.enemy1]: '<span class="character"><span>👹</span></span>',
    [CharacterId.enemy2]: '<span class="character"><span>👺</span></span>',
}

export function draw(state: GameState) {
    const root = document.getElementById("root")
    // Later characters are drawn on top of earlier ones.
    const characters = [state.player, ...state.enemies]
    let html = ""
    let str = ""
    for (let i = 0; i < state.cells.length; i++) {
        for (let j = 0; j < state.cells[i].length; j++) {
            str = cellAA[state.cells[i][j]]
            for (let k = 0; k < characters.length; k++) {
                if (i === characters[k].pos.y && j === characters[k].pos.x) {
                    str = characterAA[characters[k].id]
                }
            }
            html += str
        }
        html += "<br>"
    }

    if (!root) return
    root.innerHTML = html
}
