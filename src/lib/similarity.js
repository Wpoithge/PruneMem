export function jaccard(a = [], b = []) {
  const A = new Set(a);
  const B = new Set(b);
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  const u = new Set([...A, ...B]).size;
  return u ? i / u : 0;
}
