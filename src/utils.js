export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const fmt = (n) => {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n/1e12).toFixed(2)+"T";
  if (abs >= 1e9)  return (n/1e9 ).toFixed(2)+"B";
  if (abs >= 1e6)  return (n/1e6 ).toFixed(2)+"M";
  if (abs >= 1e3)  return (n/1e3 ).toFixed(2)+"K";
  return Math.floor(n).toString();
};

export const nowMs = () => Date.now();

export const pickWeighted = (arr, wKey="weight") => {
  const total = arr.reduce((s,x)=>s+(x[wKey]||0), 0);
  let r = Math.random()*total;
  for (const x of arr){
    r -= (x[wKey]||0);
    if (r <= 0) return x;
  }
  return arr[arr.length-1];
};

export const uid = (prefix="id") => prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

export const safeJsonParse = (txt) => {
  try { return JSON.parse(txt); } catch { return null; }
};


// Deterministic RNG (xorshift32) for reproducible drops/enhance
export const nextSeed = (seed) => {
  let x = seed | 0;
  x ^= x << 13; x |= 0;
  x ^= x >>> 17;
  x ^= x << 5; x |= 0;
  return x | 0;
};

export const rand01 = (S) => {
  S.seed = nextSeed(S.seed || 123456789);
  // unsigned to [0,1)
  return ((S.seed >>> 0) / 4294967296);
};


export const pickWeightedByRand = (arr, r01, wKey="weight") => {
  const total = arr.reduce((s,x)=>s+(x[wKey]||0), 0);
  let r = r01 * total;
  for (const x of arr){
    r -= (x[wKey]||0);
    if (r <= 0) return x;
  }
  return arr[arr.length-1];
};
