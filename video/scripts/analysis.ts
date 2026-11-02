// Beat and structure analysis of a song, as pure functions of its samples
// (mono, any sample rate), for scripts/analyze-track.ts. Tested on synthetic
// signals in analysis.test.ts.
//
// 1. Features: a short-time spectrum every `hop` samples; from it the
//    spectral flux (onsets), its low band (kicks) and mid band (vocals),
//    RMS, low-band energy, timbre bands and a chroma vector.
// 2. Tempo: autocorrelation of the onset envelope, weighted towards
//    120 bpm (a log-normal prior, an octave wide) against octave errors.
// 3. Grid: the period refined and the beat phase found by folding the
//    onset envelope over candidate periods: the right period stacks every
//    beat's onset in one place.
// 4. Downbeats: of the 4 phases of the bar, the one with the most kick,
//    onset strength and change in sound from the beat before.
// 5. Structure: per-bar features (chroma, timbre, drum pattern, loudness,
//    vocal density), a bar self-similarity matrix and its checkerboard
//    novelty, plus loudness novelty, give section boundaries on bars.
//    Sections that sound alike share a group letter; labels come from
//    loudness (drops, breakdowns, builds) and repetition (hooks, verses).
import type { Bar, BeatsFile, Section, SectionLabel } from "../src/beats.ts"

export type Features = {
    // Feature frames per second.
    rate: number
    // Per frame: onset strength (half-wave rectified log-spectral flux),
    // in all bands, below 150 Hz and in 300 Hz–3 kHz.
    flux: Float64Array
    lowFlux: Float64Array
    midFlux: Float64Array
    // Per frame: mean square of the samples, and of the low band.
    power: Float64Array
    lowPower: Float64Array
    // Per frame: log energies in TIMBRE_BANDS bands, and a 12-bin chroma.
    timbre: Float64Array[]
    chroma: Float64Array[]
    duration: number
}

const TIMBRE_EDGES = [0, 150, 300, 600, 1200, 2400, 4800, 8000, 11025]

// In-place radix-2 FFT (re, im of a power-of-two length).
export function fft(re: Float64Array, im: Float64Array): void {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) {
            ;[re[i], re[j]] = [re[j], re[i]]
            ;[im[i], im[j]] = [im[j], im[i]]
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len
        const wr = Math.cos(ang)
        const wi = Math.sin(ang)
        for (let i = 0; i < n; i += len) {
            let cr = 1
            let ci = 0
            for (let k = 0; k < len / 2; k++) {
                const a = i + k
                const b = a + len / 2
                const tr = re[b] * cr - im[b] * ci
                const ti = re[b] * ci + im[b] * cr
                re[b] = re[a] - tr
                im[b] = im[a] - ti
                re[a] += tr
                im[a] += ti
                const nr = cr * wr - ci * wi
                ci = cr * wi + ci * wr
                cr = nr
            }
        }
    }
}

export function features(
    samples: Float32Array,
    sampleRate: number,
    { hop = 256, size = 1024 }: { hop?: number; size?: number } = {}
): Features {
    const frames = Math.max(1, Math.floor(samples.length / hop))
    const bins = size / 2
    const window = new Float64Array(size)
    for (let i = 0; i < size; i++) {
        window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
    }
    const hz = (k: number) => (k * sampleRate) / size
    const lowTop = Math.ceil(150 / hz(1))
    const midFrom = Math.floor(300 / hz(1))
    const midTo = Math.ceil(3000 / hz(1))
    const bandOf = new Int8Array(bins)
    const pitchOf = new Int8Array(bins).fill(-1)
    for (let k = 0; k < bins; k++) {
        const f = hz(k)
        let band = 0
        while (band < TIMBRE_EDGES.length - 2 && f >= TIMBRE_EDGES[band + 1]) {
            band++
        }
        bandOf[k] = band
        if (f >= 55 && f <= 4000) {
            const midi = 69 + 12 * Math.log2(f / 440)
            pitchOf[k] = ((Math.round(midi) % 12) + 12) % 12
        }
    }
    const out: Features = {
        rate: sampleRate / hop,
        flux: new Float64Array(frames),
        lowFlux: new Float64Array(frames),
        midFlux: new Float64Array(frames),
        power: new Float64Array(frames),
        lowPower: new Float64Array(frames),
        timbre: [],
        chroma: [],
        duration: samples.length / sampleRate,
    }
    const re = new Float64Array(size)
    const im = new Float64Array(size)
    let prev = new Float64Array(bins)
    let logMag = new Float64Array(bins)
    for (let f = 0; f < frames; f++) {
        // Window centred on f * hop.
        const at = f * hop - size / 2
        let sq = 0
        for (let i = 0; i < size; i++) {
            const s = samples[at + i] ?? 0
            re[i] = s * window[i]
            im[i] = 0
        }
        for (let i = 0; i < hop; i++) {
            const s = samples[f * hop + i] ?? 0
            sq += s * s
        }
        out.power[f] = sq / hop
        fft(re, im)
        const timbre = new Float64Array(TIMBRE_EDGES.length - 1)
        const chroma = new Float64Array(12)
        let flux = 0
        let lowFlux = 0
        let midFlux = 0
        let low = 0
        for (let k = 1; k < bins; k++) {
            const p = (re[k] * re[k] + im[k] * im[k]) / (size * size)
            const m = Math.log(1 + 1000 * Math.sqrt(p))
            logMag[k] = m
            const d = m - prev[k]
            if (d > 0) {
                flux += d
                if (k <= lowTop) lowFlux += d
                if (k >= midFrom && k <= midTo) midFlux += d
            }
            if (k <= lowTop) low += p
            timbre[bandOf[k]] += p
            if (pitchOf[k] >= 0) chroma[pitchOf[k]] += p
        }
        out.flux[f] = flux
        out.lowFlux[f] = lowFlux
        out.midFlux[f] = midFlux
        out.lowPower[f] = low
        out.timbre.push(timbre)
        out.chroma.push(chroma)
        ;[prev, logMag] = [logMag, prev]
    }
    return out
}

// The onset envelope: `flux` less its local mean (over `width` frames),
// rectified, scaled to a peak of 1.
export function onsetEnvelope(flux: Float64Array, width: number): Float64Array {
    const n = flux.length
    const out = new Float64Array(n)
    const half = Math.max(1, Math.floor(width / 2))
    const prefix = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + flux[i]
    let max = 0
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - half)
        const hi = Math.min(n, i + half + 1)
        const v = flux[i] - (prefix[hi] - prefix[lo]) / (hi - lo)
        out[i] = v > 0 ? v : 0
        if (out[i] > max) max = out[i]
    }
    if (max > 0) for (let i = 0; i < n; i++) out[i] /= max
    return out
}

export type TempoOptions = { minBpm?: number; maxBpm?: number }

// The tempo of an onset envelope sampled at `rate` per second, by
// autocorrelation weighted with a log-normal prior around 120 bpm.
export function tempoByAutocorrelation(
    env: Float64Array,
    rate: number,
    { minBpm = 60, maxBpm = 200 }: TempoOptions = {}
): number {
    const n = env.length
    let mean = 0
    for (const v of env) mean += v
    mean /= n
    const lagMin = Math.floor((rate * 60) / maxBpm)
    const lagMax = Math.ceil((rate * 60) / minBpm)
    const ac = new Float64Array(lagMax + 2)
    for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
        let sum = 0
        for (let i = 0; i + lag < n; i++) {
            sum += (env[i] - mean) * (env[i + lag] - mean)
        }
        ac[lag] = sum / Math.max(1, n - lag)
    }
    let best = lagMin
    let bestScore = -Infinity
    for (let lag = lagMin; lag <= lagMax; lag++) {
        const bpm = (rate * 60) / lag
        const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2)
        const score = ac[lag] * prior
        // Only local maxima of the autocorrelation.
        if (ac[lag] < ac[lag - 1] || ac[lag] < ac[lag + 1]) continue
        if (score > bestScore) {
            bestScore = score
            best = lag
        }
    }
    // Parabolic interpolation of the peak.
    const a = ac[best - 1]
    const b = ac[best]
    const c = ac[best + 1]
    const den = a - 2 * b + c
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0
    return (rate * 60) / (best + Math.max(-0.5, Math.min(0.5, shift)))
}

// How sharply `env` stacks up when folded over `period` seconds, and at
// which phase (seconds into the period) its peak is.
export function fold(
    env: Float64Array,
    rate: number,
    period: number,
    bins = 64
): { strength: number; phase: number } {
    const hist = new Float64Array(bins)
    for (let i = 0; i < env.length; i++) {
        if (env[i] === 0) continue
        const t = i / rate
        const p = (t / period) % 1
        // Linear interpolation into the two nearest bins.
        const x = p * bins
        const k = Math.floor(x)
        const w = x - k
        hist[k % bins] += env[i] * (1 - w)
        hist[(k + 1) % bins] += env[i] * w
    }
    let mean = 0
    let best = 0
    for (let k = 0; k < bins; k++) {
        mean += hist[k]
        if (hist[k] > hist[best]) best = k
    }
    mean /= bins
    const a = hist[(best - 1 + bins) % bins]
    const b = hist[best]
    const c = hist[(best + 1) % bins]
    const den = a - 2 * b + c
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0
    const phase = ((((best + shift) / bins) % 1) + 1) % 1
    return { strength: mean > 0 ? b / mean : 0, phase: phase * period }
}

// The beat period (seconds) near `period0` that folds `env` most sharply,
// and the first beat's time.
export function refineGrid(
    env: Float64Array,
    rate: number,
    period0: number
): { period: number; firstBeat: number } {
    let period = period0
    for (const [spread, steps] of [
        [0.03, 121],
        [0.002, 81],
    ] as const) {
        const centre = period
        let best = -Infinity
        for (let s = 0; s < steps; s++) {
            const p = centre * (1 - spread + (2 * spread * s) / (steps - 1))
            const { strength } = fold(env, rate, p)
            if (strength > best) {
                best = strength
                period = p
            }
        }
    }
    return { period, firstBeat: fold(env, rate, period, 128).phase }
}

// The mean of `values` over frames [from, to) (clamped), 0 when empty.
function meanOver(
    values: Float64Array,
    rate: number,
    from: number,
    to: number
) {
    const a = Math.max(0, Math.floor(from * rate))
    const b = Math.min(values.length, Math.ceil(to * rate))
    if (b <= a) return 0
    let sum = 0
    for (let i = a; i < b; i++) sum += values[i]
    return sum / (b - a)
}

function maxOver(values: Float64Array, rate: number, from: number, to: number) {
    const a = Math.max(0, Math.floor(from * rate))
    const b = Math.min(values.length, Math.ceil(to * rate))
    let max = 0
    for (let i = a; i < b; i++) max = Math.max(max, values[i])
    return max
}

function meanVector(
    rows: readonly Float64Array[],
    rate: number,
    from: number,
    to: number
): Float64Array {
    const a = Math.max(0, Math.floor(from * rate))
    const b = Math.min(rows.length, Math.ceil(to * rate))
    const out = new Float64Array(rows[0]?.length ?? 0)
    for (let i = a; i < b; i++) {
        for (let k = 0; k < out.length; k++) out[k] += rows[i][k]
    }
    if (b > a) for (let k = 0; k < out.length; k++) out[k] /= b - a
    return out
}

// Which of the `beatsPerBar` beat phases is the downbeat. In 4/4 the kick
// falls on beats 1 and 3 and the backbeat on 2 and 4, so the kick picks
// the pair; of the pair, beat 1 is where the sound changes: sections and
// phrases start on downbeats, so the peaks of a beat-level novelty curve
// (timbre, a 4-bar kernel) fall on it. With another metre, novelty and
// kick pick from all phases.
export function downbeatPhase(
    f: Features,
    beats: readonly number[],
    period: number,
    beatsPerBar = 4
): number {
    if (beats.length < beatsPerBar * 2) return 0
    const near = 0.05
    const kick = beats.map((t) =>
        maxOver(f.lowFlux, f.rate, t - near, t + near)
    )
    const spectra = zscoreColumns(
        beats.map((t) =>
            Array.from(meanVector(f.timbre, f.rate, t, t + period), (v) =>
                Math.log(1e-10 + v)
            )
        )
    )
    const sim = spectra.map((a) => spectra.map((b) => cosine(a, b)))
    const kernel = beatsPerBar * 4
    const novelty = checkerboardNovelty(sim, kernel)
    const peaks = pickPeaks(novelty, beatsPerBar, 0, kernel)
        .sort((a, b) => novelty[b] - novelty[a])
        .slice(0, Math.max(8, Math.round(beats.length / beatsPerBar / 4)))
    const perPhase = (values: readonly number[], at: readonly number[]) => {
        const sums = Array.from({ length: beatsPerBar }, () => 0)
        for (const i of at) sums[i % beatsPerBar] += values[i]
        return sums
    }
    const all = beats.map((_, i) => i)
    const kicks = perPhase(kick, all)
    const changes = perPhase(novelty, peaks)
    let candidates = all.slice(0, beatsPerBar)
    if (beatsPerBar === 4) {
        candidates =
            kicks[0] + kicks[2] >= kicks[1] + kicks[3] ? [0, 2] : [1, 3]
    }
    const share = (sums: number[], j: number) => {
        const total = candidates.reduce((s, c) => s + sums[c], 0)
        return total > 0 ? sums[j] / total : 0
    }
    let best = candidates[0]
    let bestScore = -Infinity
    for (const j of candidates) {
        const score = share(changes, j) + 0.25 * share(kicks, j)
        if (score > bestScore) {
            bestScore = score
            best = j
        }
    }
    return best
}

function percentile(values: readonly number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    if (!sorted.length) return 0
    const i = Math.min(sorted.length - 1, Math.max(0, p * (sorted.length - 1)))
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function zscoreColumns(rows: number[][]): number[][] {
    if (!rows.length) return rows
    const dims = rows[0].length
    const mean = Array.from({ length: dims }, () => 0)
    const sd = Array.from({ length: dims }, () => 0)
    for (const r of rows) for (let k = 0; k < dims; k++) mean[k] += r[k]
    for (let k = 0; k < dims; k++) mean[k] /= rows.length
    for (const r of rows) {
        for (let k = 0; k < dims; k++) sd[k] += (r[k] - mean[k]) ** 2
    }
    for (let k = 0; k < dims; k++) sd[k] = Math.sqrt(sd[k] / rows.length) || 1
    return rows.map((r) => r.map((v, k) => (v - mean[k]) / sd[k]))
}

function cosine(a: readonly number[], b: readonly number[]): number {
    let ab = 0
    let aa = 0
    let bb = 0
    for (let k = 0; k < a.length; k++) {
        ab += a[k] * b[k]
        aa += a[k] * a[k]
        bb += b[k] * b[k]
    }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0
}

// Checkerboard (Foote) novelty along the diagonal of a self-similarity
// matrix, with a kernel `half` rows on each side: high where the past and
// the future are each self-similar but unlike each other.
export function checkerboardNovelty(sim: number[][], half: number): number[] {
    const n = sim.length
    return sim.map((_, c) => {
        // Near the ends the kernel shrinks to what fits on both sides, so
        // a cut-off kernel doesn't read as change.
        const w = Math.min(half, c, n - c)
        let sum = 0
        let weight = 0
        for (let i = -w; i < w; i++) {
            for (let j = -w; j < w; j++) {
                const a = c + i
                const b = c + j
                const sign = i < 0 === j < 0 ? 1 : -1
                // Gaussian taper away from the centre.
                const g = Math.exp(
                    -((i + 0.5) ** 2 + (j + 0.5) ** 2) / (2 * (half / 2) ** 2)
                )
                sum += sign * g * sim[a][b]
                weight += g
            }
        }
        return weight ? Math.max(0, sum / weight) : 0
    })
}

// Peaks of `curve` at least `minGap` apart and above `threshold`,
// strongest first, then sorted by position.
export function pickPeaks(
    curve: readonly number[],
    minGap: number,
    threshold: number,
    edgeGap = minGap
): number[] {
    const order = curve
        .map((v, i) => ({ v, i }))
        .filter(
            ({ v, i }) =>
                v >= threshold &&
                v >= (curve[i - 1] ?? -Infinity) &&
                v >= (curve[i + 1] ?? -Infinity)
        )
        .sort((a, b) => b.v - a.v)
    const chosen: number[] = []
    for (const { i } of order) {
        if (i < edgeGap || i > curve.length - edgeGap) continue
        if (chosen.every((c) => Math.abs(c - i) >= minGap)) chosen.push(i)
    }
    return chosen.sort((a, b) => a - b)
}

export type BarFeatures = {
    bars: Bar[]
    // Per bar: z-scored chroma, timbre and vocal-band density, for the
    // self-similarity; the drum pattern (onset strength in 16 steps); and
    // the level in dB (RMS and low band averaged).
    vectors: number[][]
    patterns: number[][]
    levels: number[]
}

// Loudness is scaled over at least this many dB, so a steadily loud song
// doesn't stretch a 2 dB wobble into "quiet" and "loud".
const MIN_LOUDNESS_SPAN = 6

// Per-bar loudness and the vectors the structure is found from.
export function barFeatures(
    f: Features,
    downbeats: readonly number[],
    period: number,
    beatsPerBar: number
): BarFeatures {
    const barLength = period * beatsPerBar
    const db = (v: number) => 10 * Math.log10(1e-10 + v)
    const raw = downbeats.map((start, b) => {
        const end = downbeats[b + 1] ?? Math.min(f.duration, start + barLength)
        const rms = db(meanOver(f.power, f.rate, start, end))
        const low = db(meanOver(f.lowPower, f.rate, start, end))
        const mid = meanOver(f.midFlux, f.rate, start, end)
        const chroma = Array.from(meanVector(f.chroma, f.rate, start, end))
        const cmax = Math.max(...chroma, 1e-12)
        const timbre = Array.from(meanVector(f.timbre, f.rate, start, end), db)
        const steps = 16
        const pattern = Array.from({ length: steps }, (_, s) => {
            const t = start + ((end - start) * s) / steps
            return maxOver(f.flux, f.rate, t - 0.02, t + 0.02)
        })
        const pmax = Math.max(...pattern, 1e-12)
        return {
            start,
            rms,
            low,
            mid,
            vector: [...chroma.map((v) => v / cmax), ...timbre, mid],
            pattern: pattern.map((v) => v / pmax),
        }
    })
    const levels = raw.map((r) => (r.rms + r.low) / 2)
    const scaler = (values: number[]) => {
        const lo = percentile(values, 0.05)
        const hi = percentile(values, 0.95)
        const span = Math.max(hi - lo, MIN_LOUDNESS_SPAN)
        // Centred: a steady song sits around the middle.
        const from = (lo + hi) / 2 - span / 2
        return (v: number) => Math.min(1, Math.max(0, (v - from) / span))
    }
    const rmsScale = scaler(raw.map((r) => r.rms))
    const lowScale = scaler(raw.map((r) => r.low))
    const midMean = raw.reduce((s, r) => s + r.mid, 0) / Math.max(1, raw.length)
    return {
        bars: raw.map((r) => ({
            start: r.start,
            loudness: 0.5 * rmsScale(r.rms) + 0.5 * lowScale(r.low),
            rms: r.rms,
            low: r.low,
            density: midMean > 0 ? r.mid / midMean : 0,
        })),
        vectors: zscoreColumns(raw.map((r) => r.vector)),
        patterns: raw.map((r) => r.pattern),
        levels,
    }
}

export type StructureOptions = {
    // Shortest section, in bars.
    minBars?: number
    // Half-width of the novelty kernel, in bars.
    kernel?: number
}

// Where the sound changes, per bar (0 to about 1): timbre and harmony
// (checkerboard novelty of the bar self-similarity), the drum pattern
// (two bars before against two after) and the level (dB, four bars before
// against four after, a 2 dB step counting fully).
export function barNovelty(
    { vectors, patterns, levels }: BarFeatures,
    kernel = 4
): number[] {
    const n = vectors.length
    const sim = vectors.map((a) => vectors.map((b) => cosine(a, b)))
    const raw = checkerboardNovelty(sim, kernel)
    // The kernel is cut off at the ends, which reads as change: skip them.
    const timbre = raw.map((v, b) => (b < 2 || b > n - 2 ? 0 : v))
    const tmax = Math.max(...timbre, 1e-9)
    const drums = patterns.map((_, b) => {
        if (b < 2 || b > n - 2) return 0
        const before = [...patterns[b - 2], ...patterns[b - 1]]
        const after = [...patterns[b], ...(patterns[b + 1] ?? patterns[b])]
        return 1 - cosine(before, after)
    })
    const dmax = Math.max(...drums, 1e-9)
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
    const level = levels.map((_, b) => {
        const before = levels.slice(Math.max(0, b - kernel), b)
        const after = levels.slice(b, b + kernel)
        if (before.length < 2 || after.length < 2) return 0
        return Math.min(1, Math.abs(mean(after) - mean(before)) / 2)
    })
    return timbre.map(
        (t, b) => 0.6 * (t / tmax) + 0.2 * (drums[b] / dmax) + 0.4 * level[b]
    )
}

export type Repeats = {
    // The passage length, in bars.
    length: number
    // The best match's similarity: the hook and its first return.
    best: number
    // Where the passage starts each time it comes (bars), with how alike
    // it is to the best pair there.
    windows: { start: number; score: number }[]
}

// The passage of `length` bars (starting on one of `starts`) that repeats
// most alike, and every return of it: the hook of a song. Alike is the
// mean similarity of the two passages' bars, side by side (a diagonal
// stripe of the self-similarity matrix). No windows when nothing repeats
// clearly (best below `min`); returns must be `keep` times as alike as
// the best pair.
export function findRepeats(
    vectors: readonly number[][],
    starts: readonly number[],
    { length = 8, min = 0.3, keep = 0.6 } = {}
): Repeats {
    const n = vectors.length
    const sim = vectors.map((a) => vectors.map((b) => cosine(a, b)))
    const alike = (a: number, b: number) => {
        let sum = 0
        for (let k = 0; k < length; k++) sum += sim[a + k][b + k]
        return sum / length
    }
    const fits = [...new Set(starts)]
        .filter((a) => a >= 0 && a + length <= n)
        .sort((a, b) => a - b)
    let pair: [number, number] | undefined
    let best = -Infinity
    for (const a of fits) {
        for (const b of fits) {
            if (b < a + length) continue
            const s = alike(a, b)
            if (s > best) {
                best = s
                pair = [a, b]
            }
        }
    }
    if (!pair || best < min) return { length, best, windows: [] }
    const [a, b] = pair
    const scored = fits
        .map((start) => ({
            start,
            // Against the pair's passages it doesn't overlap.
            score:
                start === a || start === b
                    ? best
                    : Math.max(
                          ...[a, b]
                              .filter((p) => Math.abs(p - start) >= length)
                              .map((p) => alike(start, p)),
                          -Infinity
                      ),
        }))
        .filter((w) => w.score >= keep * best)
        .sort((x, y) => y.score - x.score)
    const windows: { start: number; score: number }[] = []
    for (const w of scored) {
        if (windows.every((o) => Math.abs(o.start - w.start) >= length)) {
            windows.push(w)
        }
    }
    return { length, best, windows: windows.sort((x, y) => x.start - y.start) }
}

// Section boundaries, groups and labels from per-bar features.
//
// Boundaries are the peaks of the bar novelty (barNovelty). A song whose
// quietest sections sit well below its loudest is labelled as a dance
// track by loudness: drops, breakdowns, builds. A steady song (most
// hip-hop and pop) is labelled by repetition: the passage that comes back
// most alike (findRepeats) is the hook, with its own boundaries, and the
// rest are verses.
export function structure(
    features: BarFeatures,
    { minBars = 4, kernel = 4 }: StructureOptions = {}
): Section[] {
    const { bars, vectors, levels } = features
    const n = bars.length
    if (n === 0) return []
    const novelty = barNovelty(features, kernel)
    // Sections start on 4-bar phrases more often than not.
    const phrased = novelty.map((v, b) => (b % 4 === 0 ? v * 1.15 : v))
    const peak = Math.max(...phrased, 1e-9)
    const mean = phrased.reduce((s, v) => s + v, 0) / n
    const sd = Math.sqrt(phrased.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
    const changes = pickPeaks(phrased, minBars, mean + 0.5 * sd, minBars)
    const median = percentile(levels, 0.5)
    const avg = (xs: readonly number[]) =>
        xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length)
    // dB against the song's median bar, over bars [a, b).
    const rel = (a: number, b: number) => avg(levels.slice(a, b)) - median
    const spans = (starts: readonly number[]) =>
        starts.map((a, i) => [a, starts[i + 1] ?? n] as const)

    // Dance or steady: from the plain segmentation's levels.
    const plain = spans([0, ...changes])
    const plainRel = plain.map(([a, b]) => rel(a, b))
    // Sections of a bar or so (a tail, a fill) don't count.
    const quietest = Math.min(
        ...plainRel.filter((_, i) => plain[i][1] - plain[i][0] >= 2)
    )
    const loudest = Math.max(...plainRel)
    const dance = quietest < -1.5 && loudest - quietest >= 2.5

    const hooks = dance
        ? { length: 8, best: 0, windows: [] }
        : findRepeats(vectors, [
              ...changes,
              ...Array.from({ length: Math.ceil(n / 4) }, (_, i) => i * 4),
          ])
    const inside = (b: number) =>
        hooks.windows.some(
            (w) => b > w.start - 2 && b < w.start + hooks.length + 2
        )
    const edges = hooks.windows.flatMap((w) => [
        w.start,
        w.start + hooks.length,
    ])
    const starts = [
        0,
        ...changes.filter((b) => !inside(b)),
        ...edges.filter((e) => e > 0 && e < n),
    ]
        .filter((b, i, all) => all.indexOf(b) === i)
        .sort((a, b) => a - b)

    const raw = spans(starts).map(([startBar, endBar], i) => {
        const level = levels.slice(startBar, endBar)
        const mine = vectors.slice(startBar, endBar)
        const boundary = i === 0 ? 1 : Math.min(1, phrased[startBar] / peak)
        const hook = hooks.windows.find((w) => w.start === startBar)
        return {
            startBar,
            endBar,
            energy: avg(bars.slice(startBar, endBar).map((b) => b.loudness)),
            rel: rel(startBar, endBar),
            rise: level.length > 1 ? level[level.length - 1] - level[0] : 0,
            centroid: vectors[0].map((_, k) => avg(mine.map((v) => v[k]))),
            hook: hook !== undefined,
            // A hook's: how alike it is to the best repeat, with how clear
            // its start is.
            confidence: hook
                ? (Math.min(1, hook.score / hooks.best) + boundary) / 2
                : boundary,
        }
    })

    // Alike sections share a group: the hooks one, and each other section
    // joins the group whose sections it is most like on average, if alike
    // enough, or starts a new one.
    const groups: number[] = []
    let count = 0
    const hookGroup = raw.some((s) => s.hook) ? count++ : -1
    for (const section of raw) {
        if (section.hook) {
            groups.push(hookGroup)
            continue
        }
        let group = -1
        let best = 0.45
        for (let g = 0; g < count; g++) {
            const members = raw.filter(
                (_, j) => groups[j] === g && !raw[j].hook
            )
            if (!members.length) continue
            const like = avg(
                members.map((m) => cosine(m.centroid, section.centroid))
            )
            if (like > best) {
                best = like
                group = g
            }
        }
        groups.push(group >= 0 ? group : count++)
    }

    // A dance track's drop: the sections as loud as the loudest repeated
    // group (or the loudest section).
    let dropLevel = Infinity
    if (dance) {
        dropLevel = Math.max(...raw.map((s) => s.rel)) - 0.75
    }
    const labels = raw.map((s, i): SectionLabel => {
        const last = i === raw.length - 1
        const next = raw[i + 1]
        if (s.hook && i > 0) return "hook"
        if (i === 0) return "intro"
        if (last && (s.rel < -0.5 || s.energy < raw[i - 1].energy - 0.15)) {
            return "outro"
        }
        if (dance) {
            if (s.rel >= dropLevel) return "drop"
            if (s.rel < -1.5) return "breakdown"
            if (next && next.rel >= dropLevel && s.endBar - s.startBar <= 8) {
                return "build"
            }
            return "groove"
        }
        if (next?.hook && s.endBar - s.startBar <= 4 && s.rise > 0.5) {
            return "build"
        }
        return "verse"
    })
    // A dance track's drop comes back as a drop, even if quieter (e.g.
    // fading out at the end).
    const dropGroups = new Set(groups.filter((_, i) => labels[i] === "drop"))
    for (let i = 1; i < labels.length; i++) {
        if (dropGroups.has(groups[i]) && labels[i] === "groove") {
            labels[i] = "drop"
        }
    }
    const end = (b: number) => {
        if (b < n) return bars[b].start
        const last = bars[n - 1].start
        return last + (last - (bars[n - 2]?.start ?? last - 2))
    }
    return raw.map((s, i) => ({
        label: labels[i],
        group: String.fromCharCode(65 + groups[i]),
        start: round4(bars[s.startBar].start),
        end: round4(end(s.endBar)),
        startBar: s.startBar,
        endBar: s.endBar,
        energy: round4(s.energy),
        confidence: round4(s.confidence),
    }))
}

function round4(v: number): number {
    return Math.round(v * 1e4) / 1e4
}

// The strongest drop: of the drops and hooks (or any section when there
// are none), the loudest, lifting most from the section before, with a
// sure start, the first time it comes.
export function strongestDrop(sections: readonly Section[]): number {
    let best = 0
    let bestScore = -Infinity
    for (let i = 1; i < sections.length; i++) {
        const s = sections[i]
        const lift = s.energy - sections[i - 1].energy
        const top = s.label === "drop" || s.label === "hook" ? 1 : 0
        // The first time a passage lands beats its returns.
        const returns = sections
            .slice(0, i)
            .filter((o) => o.group === s.group).length
        const score =
            top + 2 * s.energy + lift + 0.3 * s.confidence - 0.1 * returns
        if (score > bestScore) {
            bestScore = score
            best = i
        }
    }
    return best
}

export type AnalyseOptions = TempoOptions & {
    beatsPerBar?: number
    track?: string
} & StructureOptions

// The whole analysis of a mono song.
export function analyse(
    samples: Float32Array,
    sampleRate: number,
    options: AnalyseOptions = {}
): BeatsFile {
    const { beatsPerBar = 4, track = "track" } = options
    const f = features(samples, sampleRate)
    const env = onsetEnvelope(f.flux, Math.round(f.rate * 0.5))
    const bpm0 = tempoByAutocorrelation(env, f.rate, options)
    const { period, firstBeat } = refineGrid(env, f.rate, 60 / bpm0)
    const beats: number[] = []
    for (let t = firstBeat; t < f.duration; t += period) beats.push(t)
    const phase = downbeatPhase(f, beats, period, beatsPerBar)
    const downbeats = beats.filter(
        (_, i) => i >= phase && (i - phase) % beatsPerBar === 0
    )
    const barData = barFeatures(f, downbeats, period, beatsPerBar)
    const sections = structure(barData, options)
    const dropIndex = strongestDrop(sections)
    const drop = sections[dropIndex]
    return {
        version: 1,
        track,
        duration: round4(f.duration),
        bpm: Math.round((60 / period) * 1000) / 1000,
        beatPeriod: Math.round(period * 1e6) / 1e6,
        beatsPerBar,
        beats: beats.map(round4),
        downbeats: downbeats.map(round4),
        bars: barData.bars.map((b) => ({
            start: round4(b.start),
            loudness: round4(b.loudness),
            rms: Math.round(b.rms * 10) / 10,
            low: Math.round(b.low * 10) / 10,
            density: Math.round(b.density * 100) / 100,
        })),
        sections,
        drop: drop
            ? { time: drop.start, bar: drop.startBar, section: dropIndex }
            : { time: 0, bar: 0, section: 0 },
    }
}
