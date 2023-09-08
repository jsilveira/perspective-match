export function computeMatrix3DCss(coeffs, coeffsInv) {
  let t = coeffsInv;

  t = [t[0], t[3], 0, t[6],
    t[1], t[4], 0, t[7],
    0, 0, 1, 0,
    t[2], t[5], 0, t[8]];

  return "matrix3d(" + t.join(",") + ")";
}
