import PerspT from "./PerspT";

export function estimateOriginalAspectRatio(conf) {
    // Your image-space corner points, in pixels
    let [p1, p2, p3, p4] = conf.boxA.map(([x, y]) => [x * conf.imageA.width, y * conf.imageA.height]);

    // IMPORTANT: model (source) is a unit square, not a guessed size
    const srcUnit = [0, 0, 1, 0, 1, 1, 0, 1];

    // Destination is your observed quad (image points)
    const dstQuad = [...p1, ...p2, ...p3, ...p4];

    // Build H that maps (0,0),(1,0),(1,1),(0,1) -> (p1,p2,p3,p4)
    const Hcoeff = new PerspT(srcUnit, dstQuad).coeffs; // coeffs for forward transform
    // Hcoeff is [a,b,c, d,e,f, g,h,1] meaning H = [[a,b,c],[d,e,f],[g,h,1]]
    const H = [
        [Hcoeff[0], Hcoeff[1], Hcoeff[2]],
        [Hcoeff[3], Hcoeff[4], Hcoeff[5]],
        [Hcoeff[6], Hcoeff[7], 1]
    ];

    function toH(p) {
        return [p[0], p[1], 1];
    }
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function norm2(v) {
        return Math.hypot(v[0], v[1], v[2]);
    }
    function normalizeH(v) {
        const s = v[2];
        return [v[0] / s, v[1] / s, 1];
    }

    // Lines (homogeneous) from points
    const l12 = cross(toH(p1), toH(p2));
    const l34 = cross(toH(p3), toH(p4));
    const l23 = cross(toH(p2), toH(p3));
    const l41 = cross(toH(p4), toH(p1));

    // Vanishing points = line intersections
    let v1 = cross(l12, l34);
    v1 = normalizeH(v1);
    let v2 = cross(l23, l41);
    v2 = normalizeH(v2);

    // Principal point (assume image center)
    const cx = conf.imageA.width * 0.5;
    const cy = conf.imageA.height * 0.5;

    // Estimate focal length
    const dx1 = v1[0] - cx,
        dy1 = v1[1] - cy;
    const dx2 = v2[0] - cx,
        dy2 = v2[1] - cy;
    const f2 = -(dx1 * dx2 + dy1 * dy2);
    if (f2 <= 0) {
        console.warn('Focal length estimate invalid (check corners/vanishing points and distortion).');
        return 1;
    }
    const f = Math.sqrt(f2);

    // Camera matrix and its inverse
    const K = [
        [f, 0, cx],
        [0, f, cy],
        [0, 0, 1]
    ];
    function invK(K) {
        const [f, , cx] = K[0];
        const [, f2, cy] = K[1];
        // here f2==f
        return [
            [1 / f, 0, -cx / f],
            [0, 1 / f, -cy / f],
            [0, 0, 1]
        ];
    }
    const Kinv = invK(K);

    function matVec(M, v) {
        return [
            M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
            M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
            M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
        ];
    }

    // First two columns of H as 3-vectors
    const h1 = [H[0][0], H[1][0], H[2][0]];
    const h2 = [H[0][1], H[1][1], H[2][1]];

    // Apply K^{-1}
    const a1 = matVec(Kinv, h1);
    const a2 = matVec(Kinv, h2);

    // Aspect ratio = ||a1|| / ||a2||  (width / height)
    const aspect = Math.hypot(a1[0], a1[1], a1[2]) / Math.hypot(a2[0], a2[1], a2[2]);

    // console.log('Estimated aspect ratio (W/H):', aspect);
    return aspect;
}
