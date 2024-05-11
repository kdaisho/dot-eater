const cell = {
    none: 0,
    wall: 1,
    dot: 2,
    max: 3,
    maxHeight: 8,
}

const direction = {
    up: 0,
    left: 1,
    down: 2,
    right: 3,
}

class Vec2 {
    x: number
    y: number

    constructor(x: number, y: number) {
        this.x = x
        this.y = y
    }
}

const directions = [
    new Vec2(0, -1),
    new Vec2(-1, 0),
    new Vec2(0, 1),
    new Vec2(1, 0),
]

const cells = [
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
]

const ai = {
    random: 0,
    chase: 1,
}

const character = {
    player: 0,
    enemy1: 1,
    enemy2: 2,
}

const cellAA = [
    '<span class="none"></span>',
    '<span class="wall"></span>',
    '<span class="dot"><span></span></span>',
]

class Character {
    pos = new Vec2(0, 0)
    ai = ai.random
    lastPos = new Vec2(0, 0)
    constructor(public aa: string) {}
}

const characters = [
    new Character('<span class="character"><span>Od</span></span>'),
    new Character('<span class="character"><span>👹</span></span>'),
    new Character('<span class="character"><span>👺</span></span>'),
]

const player = characters[character.player]
const enemies: Character[] = []
let intervalId: undefined | number
let lock = false

function init() {
    lock = false
    player.pos = new Vec2(4, 1)
    setDots()
    enemies[0] = characters[character.enemy1]
    enemies[1] = characters[character.enemy2]
    enemies[0].pos = new Vec2(1, 4)
    enemies[1].pos = new Vec2(7, 4)
    enemies[0].ai = ai.random
    enemies[1].ai = ai.chase

    for (let i = 0; i < enemies.length; i++) {
        enemies[i].lastPos = new Vec2(enemies[i].pos.x, enemies[i].pos.y)
    }

    if (intervalId) {
        clearInterval(intervalId)
    }

    intervalId = setInterval(interval, 1000)
    addEventListener("keydown", onKeyDown)
    draw()
}

function setDots() {
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            if (
                !(player.pos.y === i && player.pos.x === j) &&
                cells[i][j] === cell.none
            ) {
                cells[i][j] = cell.dot
            }
        }
    }
}

function onKeyDown(event: KeyboardEvent) {
    if (lock) return
    let targetPos = new Vec2(player.pos.x, player.pos.y)

    switch (event.key) {
        case "ArrowUp":
            targetPos.y--
            break
        case "ArrowDown":
            targetPos.y++
            break
        case "ArrowLeft":
            targetPos.x--
            break
        case "ArrowRight":
            targetPos.x++
            break
    }

    loopPos(targetPos)

    if (cells[targetPos.y][targetPos.x] >= cell.max) {
        return
    }

    switch (cells[targetPos.y][targetPos.x]) {
        case cell.none:
            player.pos = new Vec2(targetPos.x, targetPos.y)
        case cell.wall:
            break
        case cell.dot:
            cells[targetPos.y][targetPos.x] = cell.none
            player.pos = new Vec2(targetPos.x, targetPos.y)
            break
        default:
            console.log("No element found")
    }

    isEnd()
    draw()
}

function interval() {
    for (let i = 0; i < enemies.length; i++) {
        enemyMove(enemies[i])
    }
    draw()
}

function enemyMove(enemy: Character) {
    const pos = []
    let v: Vec2 | null = null
    for (let i = 0; i < Object.keys(direction).length; i++) {
        v = new Vec2(
            enemy.pos.x + directions[i].x,
            enemy.pos.y + directions[i].y
        )
        loopPos(v)
        if (cells[v.y][v.x] === cell.wall) {
            continue
        }
        if (v.x === enemy.lastPos.x && v.y === enemy.lastPos.y) {
            continue
        }
        pos.push(v)
    }

    enemy.lastPos = new Vec2(enemy.pos.x, enemy.pos.y)

    switch (enemy.ai) {
        case ai.random:
            const r = Math.floor(Math.random() * pos.length)
            enemy.pos = pos[r]
            break
        case ai.chase:
            let nearest = pos[0]
            for (let i = 1; i < pos.length; i++) {
                if (distanceToPlayer(nearest) > distanceToPlayer(pos[i])) {
                    nearest = pos[i]
                }
            }
            if (v === null) return
            distanceToPlayer(v)
            enemy.pos = nearest
        default:
            console.log("No AI type found")
    }

    isEnd()

    function distanceToPlayer(v: Vec2) {
        return Math.sqrt(
            Math.pow(player.pos.x - v.x, 2) + Math.pow(player.pos.y - v.y, 2)
        )
    }
}

function loopPos(v: Vec2) {
    if (v.x < 0) {
        v.x = cells[0].length - 1
    }
    if (v.x >= cells[0].length) {
        v.x = 0
    }
    if (v.y < 0) {
        v.y = cells.length - 1
    }
    if (v.y >= cells.length) {
        v.y = 0
    }
}

// const confettiOptions = {
//     particleCount: 100,
//     startVelocity: 30,
//     spread: 360,
//     origin: {
//         x: 1,
//         y: 1,
//     },
// }

function genConfetti(interval: number = 20) {
    let counter = 0
    return (count: number = 10) => {
        const intId = setInterval(() => {
            confetti({ origin: { x: 0.1 * counter, y: 0.65 } })
            counter++

            if (counter > count) {
                clearInterval(intId)
            }
        }, interval)
    }
}

const celebrate = genConfetti()

function isEnd() {
    if (lock) return
    for (let i = 0; i < enemies.length; i++) {
        if (
            enemies[i].pos.x === player.pos.x &&
            enemies[i].pos.y === player.pos.y
        ) {
            displayMessage(true)
            return true
        }
    }
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            if (cells[i][j] === cell.dot) {
                return false
            }
        }
    }
    celebrate(10)
    displayMessage()
    return true
}

function displayMessage(dead?: boolean) {
    if (lock) return
    clearInterval(intervalId)
    const backdrop = document.createElement("div")
    backdrop.setAttribute("id", "backdrop")
    backdrop.setAttribute("class", "backdrop")
    document.body.appendChild(backdrop)

    const msg = document.createElement("div")
    const txt = dead
        ? document.createTextNode("You're dead. Click to restart.")
        : document.createTextNode("Congrats! Click to restart.")

    msg.appendChild(txt)
    msg.setAttribute("id", "msg")
    msg.setAttribute("class", "msg")

    backdrop.addEventListener("click", restore)

    document.body.appendChild(msg)

    function restore() {
        const backdrop = document.getElementById("backdrop")
        const msg = document.getElementById("msg")
        if (!backdrop || !msg) return
        document.body.removeChild(backdrop)
        document.body.removeChild(msg)
        init()
    }
    lock = true
}

function draw() {
    const root = document.getElementById("root")
    let html = ""
    let str = ""
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            str = cellAA[cells[i][j]]
            for (let k = 0; k < characters.length; k++) {
                if (i === characters[k].pos.y && j === characters[k].pos.x) {
                    str = characters[k].aa
                }
            }
            html += str
        }
        html += "<br>"
    }

    if (!root) return
    root.innerHTML = html
}

init()
