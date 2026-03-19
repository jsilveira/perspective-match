import PerspT from "./PerspT";

function sideLengthAspectRatio(p1, p2, p3, p4) {
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const topLen = dist(p1, p2);
    const bottomLen = dist(p4, p3);
    const leftLen = dist(p1, p4);
    const rightLen = dist(p2, p3);
    return ((topLen + bottomLen) / 2) / ((leftLen + rightLen) / 2);
}

function vanishingPointAspectRatio(p1, p2, p3, p4, imgW, imgH) {
    function toH(p) {
        return [p[0], p[1], 1];
    }
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    const l12 = cross(toH(p1), toH(p2));
    const l34 = cross(toH(p3), toH(p4));
    const l23 = cross(toH(p2), toH(p3));
    const l41 = cross(toH(p4), toH(p1));

    const v1raw = cross(l12, l34);
    const v2raw = cross(l23, l41);

    // If either vanishing point is near-infinity, signal failure
    if (Math.abs(v1raw[2]) < 1e-9 || Math.abs(v2raw[2]) < 1e-9) {
        return null;
    }

    const v1 = [v1raw[0] / v1raw[2], v1raw[1] / v1raw[2]];
    const v2 = [v2raw[0] / v2raw[2], v2raw[1] / v2raw[2]];

    const cx = imgW * 0.5;
    const cy = imgH * 0.5;

    const dx1 = v1[0] - cx, dy1 = v1[1] - cy;
    const dx2 = v2[0] - cx, dy2 = v2[1] - cy;
    const f2 = -(dx1 * dx2 + dy1 * dy2);

    if (f2 <= 0) {
        return null;
    }
    const f = Math.sqrt(f2);

    // Build H from unit square to quad
    const srcUnit = [0, 0, 1, 0, 1, 1, 0, 1];
    const dstQuad = [...p1, ...p2, ...p3, ...p4];
    const Hcoeff = new PerspT(srcUnit, dstQuad).coeffs;
    const H = [
        [Hcoeff[0], Hcoeff[1], Hcoeff[2]],
        [Hcoeff[3], Hcoeff[4], Hcoeff[5]],
        [Hcoeff[6], Hcoeff[7], 1]
    ];

    const Kinv = [
        [1 / f, 0, -cx / f],
        [0, 1 / f, -cy / f],
        [0, 0, 1]
    ];

    function matVec(M, v) {
        return [
            M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
            M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
            M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
        ];
    }

    const h1 = [H[0][0], H[1][0], H[2][0]];
    const h2 = [H[0][1], H[1][1], H[2][1]];
    const a1 = matVec(Kinv, h1);
    const a2 = matVec(Kinv, h2);

    return Math.hypot(a1[0], a1[1], a1[2]) / Math.hypot(a2[0], a2[1], a2[2]);
}

/**
 * Measure how strong the perspective effect is by looking at how close
 * the vanishing points are relative to the image diagonal.
 * Returns 0 (no perspective / parallel edges) to 1 (strong perspective).
 */
function perspectiveStrength(p1, p2, p3, p4, imgW, imgH) {
    function toH(p) { return [p[0], p[1], 1]; }
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    const diag = Math.hypot(imgW, imgH);
    const cx = imgW * 0.5, cy = imgH * 0.5;

    const l12 = cross(toH(p1), toH(p2));
    const l34 = cross(toH(p3), toH(p4));
    const l23 = cross(toH(p2), toH(p3));
    const l41 = cross(toH(p4), toH(p1));

    const v1raw = cross(l12, l34);
    const v2raw = cross(l23, l41);

    let strength = 0;
    let count = 0;

    for (const vr of [v1raw, v2raw]) {
        if (Math.abs(vr[2]) < 1e-9) continue; // parallel → no perspective signal
        const vx = vr[0] / vr[2] - cx;
        const vy = vr[1] / vr[2] - cy;
        const dist = Math.hypot(vx, vy);
        // The closer the vanishing point, the stronger the perspective.
        // Use a sigmoid-like mapping: strength = diag^2 / (diag^2 + dist^2)
        // At dist=0 → 1, at dist=diag → 0.5, at dist=10*diag → ~0.01
        strength += (diag * diag) / (diag * diag + dist * dist);
        count++;
    }

    return count > 0 ? strength / count : 0;
}

export function estimateSideLengthAspectRatio(conf) {
    const [p1, p2, p3, p4] = conf.boxA.map(([x, y]) => [x * conf.imageA.width, y * conf.imageA.height]);
    return sideLengthAspectRatio(p1, p2, p3, p4);
}

export function estimateOriginalAspectRatio(conf, forceBlend) {
    const [p1, p2, p3, p4] = conf.boxA.map(([x, y]) => [x * conf.imageA.width, y * conf.imageA.height]);
    const imgW = conf.imageA.width;
    const imgH = conf.imageA.height;

    const simple = sideLengthAspectRatio(p1, p2, p3, p4);
    const vp = vanishingPointAspectRatio(p1, p2, p3, p4, imgW, imgH);

    if (vp === null) {
        return simple;
    }

    // Blend: use vanishing-point method only when perspective is strong
    let t = forceBlend !== undefined ? forceBlend : perspectiveStrength(p1, p2, p3, p4, imgW, imgH);
    console.log("Perspective strength", t);
    return simple * (1 - t) + vp * t;
}
