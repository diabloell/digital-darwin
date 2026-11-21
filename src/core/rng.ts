// xoshiro128** v1, initialized with FNV-1a + splitmix32. State is explicit.
export class Rng {
  state: number[];
  constructor(seed: string) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    this.state = Array.from({ length: 4 }, () => {
      h = (h + 0x9e3779b9) >>> 0;
      let z = h;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    });
  }
  next(): number {
    const s = this.state;
    const r = Math.imul(s[1], 5);
    const result = Math.imul((r << 7) | (r >>> 25), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    for (let i = 0; i < 4; i++) s[i] >>>= 0;
    return result / 4294967296;
  }
}
