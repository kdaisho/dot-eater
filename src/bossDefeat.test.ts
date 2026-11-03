import { describe, expect, it } from "vite-plus/test"
import {
    CELEBRATION_SECONDS,
    CHAIN,
    CHAIN_BLASTS,
    DEFEAT_ZOOM,
    HOP_HEIGHT,
    HOP_SECONDS,
    HOP_STAGGER,
    MOST_HOPS,
    defeatPhase,
    defeatSeconds,
    defeatTimeScale,
    defeatZoom,
    effectSeconds,
    hash01,
    heartOf,
    hopHeight,
    hopOrder,
    hopsOf,
    jingleAt,
    type BossDefeat,
    type Hopper,
} from "./bossDefeat"
import { vec2 } from "./vec2"

// The defeat timeline on its own (KDA-301, KDA-303): phases, lengths, the
// hit-stop, the hops and the hearts, from a BossDefeat made by hand. See
// game.bossDefeat.test.ts for it played out through step and settle.

const crowd: Hopper[] = [
    { kind: "player", index: 0 },
    { kind: "enemy", index: 0 },
    { kind: "enemy", index: 2 },
]

function defeat(finale: boolean, elapsed = 0): BossDefeat {
    return {
        effect: finale ? "chain" : "burst",
        celebrate: finale,
        at: vec2(3, 2),
        elapsed,
        hoppers: finale ? crowd : [],
    }
}

describe("the Kitsune's burst (stage 5)", () => {
    const burst = defeat(false)

    it("is a 0.4 s hit-stop, a 0.3 s shake and a 1.3 s shatter", () => {
        expect(defeatPhase(burst, 0).phase).toBe("hitStop")
        expect(defeatPhase(burst, 0.39).phase).toBe("hitStop")
        expect(defeatPhase(burst, 0.4).phase).toBe("shake")
        expect(defeatPhase(burst, 0.69).phase).toBe("shake")
        expect(defeatPhase(burst, 0.7).phase).toBe("shatter")
        expect(defeatPhase(burst, 1.99).phase).toBe("shatter")
        expect(defeatPhase(burst, 2).phase).toBe("over")
        expect(defeatPhase(burst, 1.35).progress).toBeCloseTo(0.5)
    })

    it("plays the jingle at 2.0 s and is over with it: no hops", () => {
        expect(effectSeconds("burst")).toBeCloseTo(2)
        expect(jingleAt(burst)).toBeCloseTo(2)
        expect(defeatSeconds(burst)).toBeCloseTo(2)
    })

    it("freezes the glides in the hit-stop only", () => {
        expect(defeatTimeScale(defeat(false, 0))).toBe(0)
        expect(defeatTimeScale(defeat(false, 0.39))).toBe(0)
        expect(defeatTimeScale(defeat(false, 0.4))).toBe(1)
        expect(defeatTimeScale(defeat(false, 1.5))).toBe(1)
    })

    it("has nobody hop and no hearts", () => {
        for (let t = 0; t < 5; t += 0.05) {
            expect(hopHeight(burst, 0, t)).toBe(0)
            expect(heartOf(burst, 0, t)).toBeNull()
        }
    })
})

describe("the final boss's explosion chain (stage 10)", () => {
    const chain = defeat(true)

    it("is a 1.45 s chain, a 0.55 s blast and 0.5 s of smoke, then the hops", () => {
        expect(defeatPhase(chain, 0).phase).toBe("chain")
        expect(defeatPhase(chain, 1.44).phase).toBe("chain")
        expect(defeatPhase(chain, 1.45).phase).toBe("blast")
        expect(defeatPhase(chain, 1.99).phase).toBe("blast")
        expect(defeatPhase(chain, 2).phase).toBe("smoke")
        expect(defeatPhase(chain, 2.49).phase).toBe("smoke")
        expect(defeatPhase(chain, 2.5).phase).toBe("celebrate")
        expect(defeatPhase(chain, 4.89).phase).toBe("celebrate")
        expect(defeatPhase(chain, 4.9).phase).toBe("over")
    })

    it("plays the jingle at 2.5 s, as the hops start, and ends after them", () => {
        expect(jingleAt(chain)).toBeCloseTo(2.5)
        expect(defeatSeconds(chain)).toBeCloseTo(2.5 + CELEBRATION_SECONDS)
    })

    it("never stops the glides", () => {
        for (let t = 0; t < 5; t += 0.05) {
            expect(defeatTimeScale(defeat(true, t))).toBe(1)
        }
    })

    it("pops its small blasts faster and faster, inside the chain and the footprint", () => {
        expect(CHAIN).toHaveLength(CHAIN_BLASTS)
        const gaps = CHAIN.slice(1).map((b, i) => b.at - CHAIN[i].at)
        for (let i = 1; i < gaps.length; i++) {
            expect(gaps[i]).toBeLessThan(gaps[i - 1])
        }
        for (const blast of CHAIN) {
            expect(blast.at).toBeGreaterThan(0)
            expect(blast.at).toBeLessThan(1.45)
            expect(Math.abs(blast.dx)).toBeLessThanOrEqual(0.8)
            expect(Math.abs(blast.dy)).toBeLessThanOrEqual(0.8)
        }
    })
})

describe("the hops (KDA-303)", () => {
    const chain = defeat(true)
    const start = jingleAt(chain)

    it("staggers each hopper HOP_STAGGER after the one before", () => {
        for (let order = 0; order < crowd.length; order++) {
            const off = start + order * HOP_STAGGER
            expect(hopHeight(chain, order, off - 0.01)).toBe(0)
            expect(hopHeight(chain, order, off + HOP_SECONDS / 2)).toBeCloseTo(
                HOP_HEIGHT
            )
        }
    })

    it("hops MOST_HOPS times, and lands each hop", () => {
        const at = (n: number) => start + n * HOP_SECONDS
        expect(hopHeight(chain, 0, at(1))).toBeCloseTo(0)
        expect(hopHeight(chain, 0, at(MOST_HOPS - 0.5))).toBeCloseTo(HOP_HEIGHT)
        expect(hopHeight(chain, 0, at(MOST_HOPS + 0.5))).toBe(0)
    })

    it("lands every hop within the celebration, however late its turn", () => {
        for (let order = 0; order < 12; order++) {
            const ends = order * HOP_STAGGER + hopsOf(order) * HOP_SECONDS
            expect(ends).toBeLessThanOrEqual(CELEBRATION_SECONDS + 1e-9)
            expect(hopsOf(order)).toBeGreaterThan(0)
        }
    })

    it("pops a heart over each enemy, none over a player", () => {
        const late = start + 2
        expect(heartOf(chain, 0, late)).toBeNull()
        expect(heartOf(chain, 1, late)).toEqual({
            scale: 1,
            rise: expect.any(Number),
        })
        expect(heartOf(chain, 2, late)).not.toBeNull()
        // Not before its hops start.
        expect(heartOf(chain, 2, start + 2 * HOP_STAGGER)).toBeNull()
    })

    it("finds a character's place in the order", () => {
        expect(hopOrder(chain, "player", 0)).toBe(0)
        expect(hopOrder(chain, "enemy", 2)).toBe(2)
        expect(hopOrder(chain, "enemy", 1)).toBe(-1)
    })
})

describe("defeatZoom", () => {
    it("eases in 6% and holds through the burst", () => {
        const burst = defeat(false)
        expect(defeatZoom(burst, 0)).toBe(1)
        expect(defeatZoom(burst, 0.3)).toBeCloseTo(1 + DEFEAT_ZOOM)
        expect(defeatZoom(burst, 2)).toBeCloseTo(1 + DEFEAT_ZOOM)
    })

    it("eases back out during the final boss's hops", () => {
        const chain = defeat(true)
        expect(defeatZoom(chain, 2.5)).toBeCloseTo(1 + DEFEAT_ZOOM)
        expect(defeatZoom(chain, 3)).toBe(1)
    })
})

describe("hash01", () => {
    it("is the same every time, in [0, 1)", () => {
        for (let n = 0; n < 200; n++) {
            const h = hash01(n)
            expect(h).toBe(hash01(n))
            expect(h).toBeGreaterThanOrEqual(0)
            expect(h).toBeLessThan(1)
        }
        expect(
            new Set(Array.from({ length: 50 }, (_, n) => hash01(n))).size
        ).toBe(50)
    })
})
