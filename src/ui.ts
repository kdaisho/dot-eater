import confetti from "canvas-confetti"

function genConfetti(interval: number = 20) {
    let counter = 0
    return (count: number = 10) => {
        const intId = setInterval(() => {
            void confetti({ origin: { x: 0.1 * counter, y: 0.65 } })
            counter++

            if (counter > count) {
                clearInterval(intId)
            }
        }, interval)
    }
}

export const celebrate = genConfetti()

export function displayMessage(dead: boolean, onRestart: () => void) {
    const backdrop = document.createElement("div")
    backdrop.setAttribute("id", "backdrop")
    backdrop.setAttribute("class", "backdrop")
    document.body.appendChild(backdrop)

    const msg = document.createElement("div")
    const txt = dead
        ? document.createTextNode("💀 Press Space to restart.")
        : document.createTextNode("Congrats! Press Space to restart.")

    msg.appendChild(txt)
    msg.setAttribute("id", "msg")
    msg.setAttribute("class", "msg")

    addEventListener("keydown", (event) => {
        if (event.key === " ") restore()
    })

    document.body.appendChild(msg)

    function restore() {
        const backdrop = document.getElementById("backdrop")
        const msg = document.getElementById("msg")
        if (!backdrop || !msg) return
        document.body.removeChild(backdrop)
        document.body.removeChild(msg)
        onRestart()
    }
}
