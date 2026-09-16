/**
 * Orthogonalizing perspective correction from user-drawn segments.
 *
 * The user draws N two-point segments over an image. Each one is (implicitly or explicitly)
 * "horizontal" or "vertical" in the real world. We look for the homography H that makes every
 * horizontal segment horizontal and every vertical segment vertical after transformation, while
 * minimizing the residual orthogonality error.
 *
 * Algorithm outline
 * -----------------
 *  1. Split segments into two families (H / V). "auto" segments are classified by their angle in
 *     the image, with an iterative re-classification once a first solution is known.
 *  2. For each family estimate its vanishing point v (a homogeneous 3-vector, may be at infinity):
 *       - initial guess: intersection of the two longest segments of the family
 *       - refinement: Levenberg-Marquardt on the unit sphere minimizing the geometric error
 *         (perpendicular distance from each endpoint to the line through the segment midpoint
 *         and v). Errors are proportional to segment length, so long segments weigh more.
 *  3. Affine rectification: the line at infinity of the world plane is l = vH x vV. The homography
 *     Ha = [1 0 0; 0 1 0; l1 l2 l3] sends it to infinity, so both families become parallel bundles.
 *  4. Orthogonalization: after Ha the two bundles have image directions dH and dV. The affine map
 *     A = [dH dV]^-1 sends them to the x and y axes. Signs are chosen so nothing gets mirrored.
 *  5. Metric step (aspect ratio): orthogonality alone leaves the x/y scale ratio free. Assuming a
 *     pinhole camera with principal point in the image center and square pixels, the focal length
 *     follows from the two finite vanishing points (f^2 = -(vH - c) . (vV - c)), and the true
 *     world scales along x and y from the columns of H^-1 (same derivation as aspectRatio.js).
 *     When the vanishing points do not allow this (parallel lines, wrong side of the camera) the
 *     ratio is left at 1, and the user can always override it.
 *  6. Similarity clean up: optional 90 deg rotations, and a uniform scale so that the transformed
 *     segments keep on average their original pixel length (so output resolution is sensible).
 *
 * All computations use normalized coordinates (image center at the origin, half the largest side
 * as the unit) for numerical conditioning, then the result is conjugated back to pixel space.
 */

/** @typedef {import('$lib/types').Point} Point */
/** @typedef {{p: number[], q: number[], orientation: string}} NormSegment */

/**
 * @typedef {Object} Segment
 * @property {Point} p first endpoint, relative image coords (0..1)
 * @property {Point} q second endpoint, relative image coords (0..1)
 * @property {'auto' | 'h' | 'v'} orientation
 */

/**
 * @typedef {Object} OrthoResult
 * @property {number[][]} H 3x3 homography in pixel coordinates (src pixel -> dest pixel)
 * @property {number[][]} Hinv
 * @property {number} aspectRatio estimated (or applied) x/y metric scale ratio
 * @property {number | null} estimatedAspectRatio the estimate from the vanishing points, null if unavailable
 * @property {('h' | 'v')[]} families effective family for every segment
 * @property {number[]} errors angular error (degrees) of each segment after transformation
 * @property {number} rmsError
 * @property {number} maxError
 * @property {number[] | null} vanishingH vanishing point (pixels, homogeneous) of the horizontal family
 * @property {number[] | null} vanishingV
 */

// ---------------------------------------------------------------------------------------------
// Small linear algebra helpers (3-vectors and 3x3 matrices)
// ---------------------------------------------------------------------------------------------

/** @param {number[]} a @param {number[]} b */
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** @param {number[]} a @param {number[]} b */
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** @param {number[]} a */
function norm(a) {
    return Math.hypot(a[0], a[1], a[2]);
}

/** @param {number[]} a */
function normalize(a) {
    const n = norm(a);
    return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}

/** @param {number[][]} M @param {number[]} v */
function matVec(M, v) {
    return [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
}

/** @param {number[][]} A @param {number[][]} B */
function matMul(A, B) {
    const C = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
}

/** @param {number[][]} M */
function det3(M) {
    return (
        M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
        M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
        M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
    );
}

/** @param {number[][]} M */
function inv3(M) {
    const d = det3(M);
    if (Math.abs(d) < 1e-300) throw new Error('Singular matrix');
    const [[a, b, c], [d2, e, f], [g, h, i]] = M;
    return [
        [(e * i - f * h) / d, (c * h - b * i) / d, (b * f - c * e) / d],
        [(f * g - d2 * i) / d, (a * i - c * g) / d, (c * d2 - a * f) / d],
        [(d2 * h - e * g) / d, (b * g - a * h) / d, (a * e - b * d2) / d]
    ];
}

const identity = () => [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
];

/**
 * Apply a homography to an inhomogeneous 2D point
 * @param {number[][]} H
 * @param {number[]} p
 */
function applyH(H, [x, y]) {
    const r = matVec(H, [x, y, 1]);
    return [r[0] / r[2], r[1] / r[2]];
}

// ---------------------------------------------------------------------------------------------
// Vanishing point estimation for one family of segments
// ---------------------------------------------------------------------------------------------

/**
 * Geometric residuals of a vanishing point candidate for a set of segments.
 * For each segment, the residual is the perpendicular distance of its endpoints to the line that
 * passes through the segment midpoint and the vanishing point. This is zero when the segment
 * points exactly at v, and it is well-defined for v at infinity (v[2] = 0).
 * @param {number[]} v unit homogeneous vanishing point
 * @param {NormSegment[]} segs normalized coordinates
 * @param {number[] | null} [weights]
 */
function vpResiduals(v, segs, weights = null) {
    const res = new Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
        const { p, q } = segs[i];
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 1];
        const L = cross(m, v);
        const n = Math.hypot(L[0], L[1]);
        if (n < 1e-12) {
            // v coincides with the midpoint: maximal error, use half the segment length
            res[i] = Math.hypot(p[0] - q[0], p[1] - q[1]) / 2;
        } else {
            res[i] = (L[0] * p[0] + L[1] * p[1] + L[2]) / n;
        }
        if (weights) res[i] *= weights[i];
    }
    return res;
}

/** @param {number[]} r */
function sumSq(r) {
    let s = 0;
    for (const x of r) s += x * x;
    return s;
}

/**
 * Orthonormal basis of the tangent plane of the unit sphere at v
 * @param {number[]} v
 */
function tangentBasis(v) {
    const helper = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t1 = normalize(cross(v, helper));
    const t2 = normalize(cross(v, t1));
    return [t1, t2];
}

/**
 * Levenberg-Marquardt refinement of a vanishing point on the unit sphere, 2 parameters
 * (tangent plane coordinates), minimizing the (optionally weighted) geometric residuals.
 * @param {number[]} v
 * @param {NormSegment[]} segs
 * @param {number[] | null} weights
 */
function refineVanishingPoint(v, segs, weights) {
    let lambda = 1e-3;
    let cost = sumSq(vpResiduals(v, segs, weights));
    const h = 1e-6;

    for (let iter = 0; iter < 50; iter++) {
        const [t1, t2] = tangentBasis(v);
        const r0 = vpResiduals(v, segs, weights);
        const step = (a, b) => normalize([v[0] + a * t1[0] + b * t2[0], v[1] + a * t1[1] + b * t2[1], v[2] + a * t1[2] + b * t2[2]]);

        // Numerical Jacobian (N x 2)
        const ra = vpResiduals(step(h, 0), segs, weights);
        const rb = vpResiduals(step(0, h), segs, weights);
        let JtJ00 = 0,
            JtJ01 = 0,
            JtJ11 = 0,
            Jtr0 = 0,
            Jtr1 = 0;
        for (let i = 0; i < r0.length; i++) {
            const ja = (ra[i] - r0[i]) / h;
            const jb = (rb[i] - r0[i]) / h;
            JtJ00 += ja * ja;
            JtJ01 += ja * jb;
            JtJ11 += jb * jb;
            Jtr0 += ja * r0[i];
            Jtr1 += jb * r0[i];
        }

        let improved = false;
        for (let attempt = 0; attempt < 10 && !improved; attempt++) {
            const a00 = JtJ00 * (1 + lambda),
                a11 = JtJ11 * (1 + lambda),
                a01 = JtJ01;
            const d = a00 * a11 - a01 * a01;
            if (Math.abs(d) < 1e-30) break;
            const da = -(a11 * Jtr0 - a01 * Jtr1) / d;
            const db = -(-a01 * Jtr0 + a00 * Jtr1) / d;
            const vNew = step(da, db);
            const cNew = sumSq(vpResiduals(vNew, segs, weights));
            if (cNew < cost) {
                const rel = (cost - cNew) / (cost + 1e-30);
                v = vNew;
                cost = cNew;
                lambda = Math.max(lambda / 3, 1e-9);
                improved = true;
                if (rel < 1e-10 || Math.hypot(da, db) < 1e-12) return v;
            } else {
                lambda *= 5;
            }
        }
        if (!improved) break;
    }
    return v;
}

/**
 * Estimate the vanishing point of a family of (supposedly parallel in the world) segments.
 * @param {NormSegment[]} segs normalized coordinates
 * @returns {number[] | null} unit homogeneous vanishing point or null if the family is empty
 */
function estimateVanishingPoint(segs) {
    if (segs.length === 0) return null;

    const lines = segs.map(({ p, q }) => normalize(cross([p[0], p[1], 1], [q[0], q[1], 1])));
    const lengths = segs.map(({ p, q }) => Math.hypot(p[0] - q[0], p[1] - q[1]));

    if (segs.length === 1) {
        // A single segment: its vanishing point is its own direction at infinity
        const { p, q } = segs[0];
        return normalize([q[0] - p[0], q[1] - p[1], 0]);
    }

    // Initial guess: intersection of the two longest segments
    const order = lengths.map((l, i) => i).sort((a, b) => lengths[b] - lengths[a]);
    let v = normalize(cross(lines[order[0]], lines[order[1]]));
    if (norm(v) === 0) {
        const { p, q } = segs[order[0]];
        v = normalize([q[0] - p[0], q[1] - p[1], 0]);
    }

    v = refineVanishingPoint(v, segs, null);

    // Robust re-weighting (IRLS with Cauchy weights): a carelessly drawn segment that disagrees
    // with the rest of its family gets progressively less influence. Only meaningful with at
    // least 3 segments (with 2 the fit is always exact).
    if (segs.length >= 3) {
        for (let round = 0; round < 3; round++) {
            const r = vpResiduals(v, segs).map(Math.abs);
            const sorted = [...r].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            // Scale: 1.5 x median residual, never below ~1px on a 1000px image so plain noise
            // is not treated as outliers.
            const c = Math.max(1.5 * median, 0.002);
            const weights = r.map((ri) => 1 / Math.sqrt(1 + (ri / c) ** 2));
            v = refineVanishingPoint(v, segs, weights);
        }
    }
    return v;
}

/**
 * Split the segments into the two families. Forced orientations are respected; 'auto' segments
 * are clustered by their image direction (2-means on the doubled angle, so that 179 and 1 degrees
 * are neighbors). Clusters are seeded from the forced segments when available, otherwise from the
 * data itself (the longest segment and the direction most different from it), and are labeled
 * afterwards: the cluster closest to horizontal becomes 'h'. This is robust to the picture being
 * rolled by any amount, unlike a fixed 45 degree threshold.
 * @param {NormSegment[]} segs
 * @returns {('h' | 'v')[]}
 */
function clusterFamilies(segs) {
    const dir2 = segs.map(({ p, q }) => {
        const a = 2 * Math.atan2(q[1] - p[1], q[0] - p[0]);
        return [Math.cos(a), Math.sin(a)];
    });
    const lengths = segs.map(({ p, q }) => Math.hypot(p[0] - q[0], p[1] - q[1]));
    const forced = (s) => s.orientation === 'h' || s.orientation === 'v';
    const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

    const weightedMean = (indices) => {
        let x = 0,
            y = 0;
        for (const i of indices) {
            x += dir2[i][0] * lengths[i];
            y += dir2[i][1] * lengths[i];
        }
        const len = Math.hypot(x, y);
        return len > 1e-9 ? [x / len, y / len] : null;
    };

    // Index of the segment whose direction is farthest (in doubled angle) from a given center
    const farthestFrom = (center) => {
        let best = -1,
            bestDot = Infinity;
        segs.forEach((s, i) => {
            if (forced(s)) return;
            const d = dot2(dir2[i], center);
            if (d < bestDot) {
                bestDot = d;
                best = i;
            }
        });
        return best;
    };

    // --- Seeds. Cluster 0 / 1 are unlabeled until the end unless forced segments define them.
    const idxH = segs.map((s, i) => (s.orientation === 'h' ? i : -1)).filter((i) => i >= 0);
    const idxV = segs.map((s, i) => (s.orientation === 'v' ? i : -1)).filter((i) => i >= 0);
    /** @type {number[] | null} */
    let c0 = weightedMean(idxH);
    /** @type {number[] | null} */
    let c1 = weightedMean(idxV);
    let labeled = !!(c0 || c1); // when any forced segment exists, cluster 0 is 'h' and cluster 1 is 'v'

    if (!c0 && !c1) {
        let longest = -1;
        segs.forEach((s, i) => {
            if (!forced(s) && (longest < 0 || lengths[i] > lengths[longest])) longest = i;
        });
        if (longest < 0) return segs.map((s) => /** @type {'h' | 'v'} */ (s.orientation));
        c0 = dir2[longest];
        const far = farthestFrom(c0);
        c1 = far >= 0 && dot2(dir2[far], c0) < 0.99 ? dir2[far] : [-c0[0], -c0[1]];
    } else if (!c0) {
        const far = farthestFrom(c1);
        c0 = far >= 0 && dot2(dir2[far], c1) < 0.99 ? dir2[far] : [-c1[0], -c1[1]];
    } else if (!c1) {
        const far = farthestFrom(c0);
        c1 = far >= 0 && dot2(dir2[far], c0) < 0.99 ? dir2[far] : [-c0[0], -c0[1]];
    }

    // --- 2-means iterations (forced segments stay in their cluster)
    const cluster = segs.map((s) => (s.orientation === 'v' ? 1 : 0));
    if (!c0 || !c1) return cluster.map((c) => (c === 0 ? 'h' : 'v'));
    for (let iter = 0; iter < 10; iter++) {
        let changed = false;
        segs.forEach((s, i) => {
            if (forced(s)) return;
            const c = dot2(dir2[i], c0) >= dot2(dir2[i], c1) ? 0 : 1;
            if (c !== cluster[i]) changed = true;
            cluster[i] = c;
        });
        const n0 = weightedMean(cluster.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0)) || c0;
        const n1 = weightedMean(cluster.map((c, i) => (c === 1 ? i : -1)).filter((i) => i >= 0)) || c1;
        if (dot2(n0, n1) > 0.9) break; // clusters collapsing: keep the current assignment
        c0 = n0;
        c1 = n1;
        if (!changed) break;
    }

    // --- Label the clusters: the one closest to horizontal (doubled angle 0 -> (1, 0)) is 'h'
    let hCluster = 0;
    if (!labeled) hCluster = c0[0] >= c1[0] ? 0 : 1;
    return cluster.map((c) => (c === hCluster ? 'h' : 'v'));
}

// ---------------------------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------------------------

/**
 * Direction (unit 2D vector) of a segment, oriented so that it points right (for h) or down (for v)
 */
/**
 * @param {number[][]} H
 * @param {{p: number[], q: number[]}} seg
 * @param {'h' | 'v'} family
 */
function segmentAngleDeg(H, seg, family) {
    const a = applyH(H, seg.p);
    const b = applyH(H, seg.q);
    let dx = b[0] - a[0],
        dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return 0;
    // Angle to the target axis, in [0, 90]
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI; // angle to the x axis
    return family === 'h' ? angle : 90 - angle;
}

/**
 * @param {Segment[]} segments relative (0..1) coordinates
 * @param {number} imgW
 * @param {number} imgH
 * @param {Object} [options]
 * @param {number | null} [options.aspectRatio] override for the x/y scale ratio (null = estimate)
 * @param {number} [options.rotation] number of 90 degree clockwise rotations to apply
 * @returns {OrthoResult}
 */
export function orthogonalize(segments, imgW, imgH, options = {}) {
    const { aspectRatio: aspectOverride = null, rotation = 0 } = options;

    // --- Normalization: pixel -> centered coordinates with half the max side as unit
    const s = Math.max(imgW, imgH) / 2;
    const cx = imgW / 2,
        cy = imgH / 2;
    const T = [
        [1 / s, 0, -cx / s],
        [0, 1 / s, -cy / s],
        [0, 0, 1]
    ];
    const Tinv = [
        [s, 0, cx],
        [0, s, cy],
        [0, 0, 1]
    ];

    /** @type {NormSegment[]} */
    const normSegs = segments.map((seg) => ({
        p: [(seg.p[0] * imgW - cx) / s, (seg.p[1] * imgH - cy) / s],
        q: [(seg.q[0] * imgW - cx) / s, (seg.q[1] * imgH - cy) / s],
        orientation: seg.orientation || 'auto'
    }));

    // --- Solve for a given family assignment. Returns the normalized homography, the vanishing
    //     points, the metric aspect estimate and the total fitting cost (sum of squared geometric
    //     residuals of both families), used to compare alternative assignments.
    const solveWithFamilies = (families) => {
        const hSegs = normSegs.filter((_, i) => families[i] === 'h');
        const vSegs = normSegs.filter((_, i) => families[i] === 'v');

        /** @type {number[] | null} */
        let vH = estimateVanishingPoint(hSegs);
        /** @type {number[] | null} */
        let vV = estimateVanishingPoint(vSegs);
        const cost = (vH ? sumSq(vpResiduals(vH, hSegs)) : 0) + (vV ? sumSq(vpResiduals(vV, vSegs)) : 0);

        // Missing family: assume it is perpendicular (in the image) to the other one, at infinity
        if (!vH && !vV) {
            vH = [1, 0, 0];
            vV = [0, 1, 0];
        } else if (!vH) {
            vH = Math.hypot(vV[0], vV[1]) < 1e-9 ? [1, 0, 0] : normalize([-vV[1], vV[0], 0]);
        } else if (!vV) {
            vV = Math.hypot(vH[0], vH[1]) < 1e-9 ? [0, 1, 0] : normalize([-vH[1], vH[0], 0]);
        }
        if (!vH || !vV) throw new Error('unreachable');

        // --- Affine rectification: send the line at infinity of the plane to infinity
        let l = normalize(cross(vH, vV));
        if (norm(l) < 1e-12 || Math.abs(l[2]) < 1e-9) {
            // Degenerate (identical vanishing points, or horizon through the image center):
            // skip the perspective part, keep the affine part only.
            l = [0, 0, 1];
        }
        if (l[2] < 0) l = [-l[0], -l[1], -l[2]];
        const Ha = [
            [1, 0, 0],
            [0, 1, 0],
            [l[0], l[1], l[2]]
        ];

        // --- Orthogonalization: after Ha the families are parallel bundles with directions
        //     (vH[0], vH[1]) and (vV[0], vV[1]). Map them to the x and y axes, without mirroring.
        let dH = [vH[0], vH[1]];
        let dV = [vV[0], vV[1]];
        if (Math.hypot(dH[0], dH[1]) < 1e-12) dH = [1, 0];
        if (Math.hypot(dV[0], dV[1]) < 1e-12) dV = [0, 1];
        if (dH[0] < 0) dH = [-dH[0], -dH[1]];
        if (dH[0] * dV[1] - dH[1] * dV[0] < 0) dV = [-dV[0], -dV[1]];

        const crossHV = dH[0] * dV[1] - dH[1] * dV[0];
        let A;
        if (Math.abs(crossHV) < 1e-9) {
            A = identity(); // both families parallel in the image: nothing sensible to do
        } else {
            A = [
                [dV[1] / crossHV, -dV[0] / crossHV, 0],
                [-dH[1] / crossHV, dH[0] / crossHV, 0],
                [0, 0, 1]
            ];
        }

        const Hn = matMul(A, Ha);

        // --- Metric step: estimate the x/y scale ratio from a pinhole camera model
        let estimatedAspect = null;
        const finiteH = Math.abs(vH[2]) > 1e-7,
            finiteV = Math.abs(vV[2]) > 1e-7;
        if (finiteH && finiteV) {
            const pH = [vH[0] / vH[2], vH[1] / vH[2]];
            const pV = [vV[0] / vV[2], vV[1] / vV[2]];
            const f2 = -(pH[0] * pV[0] + pH[1] * pV[1]);
            if (f2 > 1e-6) {
                const f = Math.sqrt(f2);
                let Hinv;
                try {
                    Hinv = inv3(Hn);
                } catch (e) {
                    Hinv = null;
                }
                if (Hinv) {
                    const h1 = [Hinv[0][0], Hinv[1][0], Hinv[2][0]];
                    const h2 = [Hinv[0][1], Hinv[1][1], Hinv[2][1]];
                    const a1 = Math.hypot(h1[0] / f, h1[1] / f, h1[2]);
                    const a2 = Math.hypot(h2[0] / f, h2[1] / f, h2[2]);
                    if (a1 > 0 && a2 > 0 && isFinite(a1 / a2)) estimatedAspect = a1 / a2;
                }
            }
        }

        return { families, Hn, vH, vV, estimatedAspect, cost };
    };

    // --- Family assignment: pass 1 clusters 'auto' segments by image direction; pass 2 re-labels
    //     them by their direction after rectification and is kept only if it fits better.
    let solution = solveWithFamilies(clusterFamilies(normSegs));
    {
        const reclassified = normSegs.map((seg, i) => {
            if (seg.orientation === 'h' || seg.orientation === 'v') return seg.orientation;
            const a = applyH(solution.Hn, seg.p),
                b = applyH(solution.Hn, seg.q);
            return Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'h' : 'v';
        });
        if (reclassified.some((f, i) => f !== solution.families[i])) {
            const alt = solveWithFamilies(reclassified);
            if (alt.cost < solution.cost) solution = alt;
        }
    }

    const { families, vH, vV, estimatedAspect } = solution;
    let Hn = solution.Hn;
    const aspect = aspectOverride && aspectOverride > 0 ? aspectOverride : estimatedAspect ?? 1;
    Hn = matMul(
        [
            [aspect, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ],
        Hn
    );

    // --- Optional 90 degree rotations
    const k = ((rotation % 4) + 4) % 4;
    for (let i = 0; i < k; i++) {
        Hn = matMul(
            [
                [0, -1, 0],
                [1, 0, 0],
                [0, 0, 1]
            ],
            Hn
        );
    }

    // --- Back to pixels and uniform scale so that segments keep their mean pixel length
    let H = matMul(Tinv, matMul(Hn, T));
    if (segments.length > 0) {
        let lenSrc = 0,
            lenDst = 0;
        for (const seg of segments) {
            const p = [seg.p[0] * imgW, seg.p[1] * imgH],
                q = [seg.q[0] * imgW, seg.q[1] * imgH];
            lenSrc += Math.hypot(p[0] - q[0], p[1] - q[1]);
            const tp = applyH(H, p),
                tq = applyH(H, q);
            lenDst += Math.hypot(tp[0] - tq[0], tp[1] - tq[1]);
        }
        if (lenDst > 1e-9 && isFinite(lenDst)) {
            const sc = lenSrc / lenDst;
            H = matMul(
                [
                    [sc, 0, 0],
                    [0, sc, 0],
                    [0, 0, 1]
                ],
                H
            );
        }
    }

    // Normalize so that H[2][2] = 1 (required by the pixel worker), then invert
    if (Math.abs(H[2][2]) > 1e-12) {
        const w = H[2][2];
        H = H.map((row) => row.map((x) => x / w));
    }
    let Hinv;
    try {
        Hinv = inv3(H);
        if (Math.abs(Hinv[2][2]) > 1e-12) {
            const w = Hinv[2][2];
            Hinv = Hinv.map((row) => row.map((x) => x / w));
        }
    } catch (e) {
        H = identity();
        Hinv = identity();
    }

    // --- Residual orthogonality error per segment (angle to its target axis after transformation)
    const pixSegs = segments.map((seg) => ({
        p: [seg.p[0] * imgW, seg.p[1] * imgH],
        q: [seg.q[0] * imgW, seg.q[1] * imgH]
    }));
    // With an odd number of 90 degree rotations, horizontal segments end up vertical and vice versa
    const flipFamily = (f) => (k % 2 === 1 ? (f === 'h' ? 'v' : 'h') : f);
    const errors = pixSegs.map((seg, i) => segmentAngleDeg(H, seg, flipFamily(families[i])));
    const rmsError = errors.length ? Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length) : 0;
    const maxError = errors.length ? Math.max(...errors) : 0;

    const toPixelVP = (v) => (v ? matVec(Tinv, v) : null);

    return {
        H,
        Hinv,
        aspectRatio: aspect,
        estimatedAspectRatio: estimatedAspect,
        families,
        errors,
        rmsError,
        maxError,
        vanishingH: toPixelVP(vH),
        vanishingV: toPixelVP(vV)
    };
}

/**
 * Minimal PerspT-compatible wrapper around a 3x3 homography, so the rest of the app (worker,
 * crop box, bounds) can use it exactly like a PerspT built from 4 point correspondences.
 */
export class HomographyT {
    /**
     * @param {number[][]} H pixel homography with H[2][2] = 1
     * @param {number[][]} Hinv its inverse with Hinv[2][2] = 1
     */
    constructor(H, Hinv) {
        this.H = H;
        this.Hinv = Hinv;
        this.coeffs = [...H[0], ...H[1], ...H[2]];
        this.coeffsInv = [...Hinv[0], ...Hinv[1], ...Hinv[2]];
    }

    transform(x, y) {
        const c = this.coeffs;
        const w = c[6] * x + c[7] * y + c[8];
        return [(c[0] * x + c[1] * y + c[2]) / w, (c[3] * x + c[4] * y + c[5]) / w];
    }

    /**
     * A copy of this transform whose output is shifted by (tx, ty). Both matrices are
     * renormalized so their [2][2] element stays 1, as the pixel worker requires.
     */
    translated(tx, ty) {
        const H = this.H.map((row, i) => (i < 2 ? row.map((v, j) => v + (i === 0 ? tx : ty) * this.H[2][j]) : [...row]));
        // Hinv' = Hinv · T^-1, with T^-1 = translation by (-tx, -ty)
        const Hinv = this.Hinv.map((row) => [row[0], row[1], row[2] - row[0] * tx - row[1] * ty]);
        const w = Hinv[2][2];
        const HinvN = Math.abs(w) > 1e-12 ? Hinv.map((row) => row.map((v) => v / w)) : Hinv;
        return new HomographyT(H, HinvN);
    }

    transformInverse(x, y) {
        const c = this.coeffsInv;
        const w = c[6] * x + c[7] * y + c[8];
        return [(c[0] * x + c[1] * y + c[2]) / w, (c[3] * x + c[4] * y + c[5]) / w];
    }
}
