import confetti from "canvas-confetti"

function genConfetti(interval: number = 20) {
    return (count: number = 10) => {
        // Per celebration, so every win sweeps across the screen from x = 0.
        let counter = 0
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

// Show the end-of-game message. Any message already on screen is replaced, so
// at most one exists at a time. Restarting is handled by main's key handler.
export function displayMessage(dead: boolean) {
    hideMessage()

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
    document.body.appendChild(msg)
}

export function hideMessage() {
    document.getElementById("backdrop")?.remove()
    document.getElementById("msg")?.remove()
}
