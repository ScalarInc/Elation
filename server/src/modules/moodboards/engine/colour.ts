/** Colour math for palette matching (sRGB hex → CIELAB, ΔE76 distance). */

type Lab = [number, number, number]

const cache = new Map<string, Lab>()

export function hexToLab(hex: string): Lab {
  const key = hex.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  const n = parseInt(key.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const r = lin((n >> 16) & 255)
  const g = lin((n >> 8) & 255)
  const b = lin(n & 255)
  // sRGB → XYZ (D65), normalised by the white point
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const lab: Lab = [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
  cache.set(key, lab)
  return lab
}

/** Perceptual distance; ~2 = barely visible, ~10 = clearly different, 50+ = unrelated. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a)
  const [l2, a2, b2] = hexToLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Names for concept titles ("— Ivory", "— Ember"). */
const NAMED: [string, string][] = [
  ['Ivory', '#F5EFD9'],
  ['Pearl', '#F2F0EC'],
  ['Blush', '#E3BFB9'],
  ['Rose', '#E991B4'],
  ['Fuchsia', '#D2337E'],
  ['Sage', '#9AB1AE'],
  ['Emerald', '#0F6B3A'],
  ['Gold', '#C9A23F'],
  ['Champagne', '#E6D3A3'],
  ['Marigold', '#F4A21E'],
  ['Ember', '#C8553D'],
  ['Terracotta', '#D79879'],
  ['Plum', '#7E2B5C'],
  ['Lilac', '#C6B4E3'],
  ['Sky', '#A8C7E8'],
  ['Noir', '#2A2A2E'],
]

export function colourName(hex: string): string {
  let best = NAMED[0]
  let bestD = Infinity
  for (const named of NAMED) {
    const d = deltaE(hex, named[1])
    if (d < bestD) {
      bestD = d
      best = named
    }
  }
  return best[0]
}
