import { OpticalComponent, Ray, Vector2D, Complex, JonesVector, GaussianParams } from './types';


// Distance the ray travels if it hits nothing
// Distance the ray travels if it hits nothing
const MAX_RAY_LENGTH = 2000;
const MAX_BOUNCES = 20;
const MAX_TOTAL_RAYS = 2000; // Hard cap to prevent freezing
const MIN_INTENSITY = 0.0001; // Updated to 0.1 uW for better sensitivity
const EPSILON = 0.001;
const REFRACTIVE_INDEX_AIR = 1.0;
const REFRACTIVE_INDEX_GLASS = 1.5;

// --- Vector Math Utilities ---
const add = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });
const sub = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x - v2.x, y: v1.y - v2.y });
const mul = (v: Vector2D, s: number): Vector2D => ({ x: v.x * s, y: v.y * s });
const dot = (v1: Vector2D, v2: Vector2D): number => v1.x * v2.x + v1.y * v2.y;
const mag = (v: Vector2D): number => Math.sqrt(v.x * v.x + v.y * v.y);
const normalize = (v: Vector2D): Vector2D => {
    const m = mag(v);
    return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};

// Rotate a point around a center
const rotatePoint = (point: Vector2D, center: Vector2D, angleDeg: number): Vector2D => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos
    };
};

// --- Complex & Jones Math (Inline to avoid extra files/imports for now) ---
const cAdd = (c1: Complex, c2: Complex): Complex => ({ re: c1.re + c2.re, im: c1.im + c2.im });
const cSub = (c1: Complex, c2: Complex): Complex => ({ re: c1.re - c2.re, im: c1.im - c2.im });
const cMul = (c1: Complex, c2: Complex): Complex => ({ re: c1.re * c2.re - c1.im * c2.im, im: c1.re * c2.im + c1.im * c2.re });
const cMulScalar = (c: Complex, s: number): Complex => ({ re: c.re * s, im: c.im * s });
const cAbs = (c: Complex): number => Math.sqrt(c.re * c.re + c.im * c.im);
const cExp = (theta: number): Complex => ({ re: Math.cos(theta), im: Math.sin(theta) });

const getLinearPolarization = (angleDeg: number): JonesVector => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
        ex: { re: Math.cos(rad), im: 0 },
        ey: { re: Math.sin(rad), im: 0 }
    };
};

const rotateJonesVector = (jv: JonesVector, angleDeg: number): JonesVector => {
    const rad = (angleDeg * Math.PI) / 180;
    const cosNode = { re: Math.cos(rad), im: 0 };
    const sinNode = { re: Math.sin(rad), im: 0 };
    const ex_cos = cMul(jv.ex, cosNode);
    const ey_sin = cMul(jv.ey, sinNode);
    const newEx = cAdd(ex_cos, ey_sin);
    const minus_sin = { re: -Math.sin(rad), im: 0 };
    const ex_msin = cMul(jv.ex, minus_sin);
    const ey_cos = cMul(jv.ey, cosNode);
    const newEy = cAdd(ex_msin, ey_cos);
    return { ex: newEx, ey: newEy };
};

const applyWaveplate = (jv: JonesVector, fastAxisDeg: number, retardanceRad: number): JonesVector => {
    const rotatedInput = rotateJonesVector(jv, -fastAxisDeg);
    const phaseShift = cExp(-retardanceRad);
    const newEx = rotatedInput.ex;
    const newEy = cMul(rotatedInput.ey, phaseShift);
    const processedRotated = { ex: newEx, ey: newEy };
    return rotateJonesVector(processedRotated, fastAxisDeg);
};

const applyPolarizer = (jv: JonesVector, axisDeg: number): JonesVector => {
    const rotatedInput = rotateJonesVector(jv, -axisDeg);
    const newEx = rotatedInput.ex;
    const newEy = { re: 0, im: 0 };
    const processedRotated = { ex: newEx, ey: newEy };
    return rotateJonesVector(processedRotated, axisDeg);
};

const getIntensity = (jv: JonesVector): number => {
    return (cAbs(jv.ex) ** 2) + (cAbs(jv.ey) ** 2);
};

const getStokes = (jv: JonesVector) => {
    const ax = cAbs(jv.ex);
    const ay = cAbs(jv.ey);
    const s0 = ax * ax + ay * ay;
    const s1 = ax * ax - ay * ay;

    // S2 = 2 Re(Ex Ey*)
    // S3 = 2 Im(Ex Ey*)
    const ex = jv.ex;
    const ey = jv.ey;
    // Ey*
    const eyConj = { re: ey.re, im: -ey.im };
    const prod = cMul(ex, eyConj);
    const s2 = 2 * prod.re;
    const s3 = 2 * prod.im;

    return { s0, s1, s2, s3 };
    return { s0, s1, s2, s3 };
};

const normalizeJones = (jv: JonesVector): JonesVector => {
    const m = Math.sqrt(getIntensity(jv));
    if (m < 1e-9) return { ex: { re: 0, im: 0 }, ey: { re: 0, im: 0 } };
    const s = 1.0 / m;
    return {
        ex: cMulScalar(jv.ex, s),
        ey: cMulScalar(jv.ey, s)
    };
};


// --- Gaussian Beam Helpers ---
const WAVELENGTH = 532e-9; // Green (m) - typical
const SCALE = 1e-3; // 1 unit = 1 mm. So wavelength in units = 532e-6 units.

const getRayleighRange = (w0: number, wavelength: number): number => {
    return (Math.PI * w0 * w0) / wavelength;
};

const propagateGaussian = (params: GaussianParams, distance: number): GaussianParams => {
    if (!params) return { w0: 0, z: 0, zR: 1, wavelength: 532e-9 }; // Safety fallback
    return { ...params, z: params.z + distance };
};

const lensTransformGaussian = (params: GaussianParams, f: number): GaussianParams => {
    // 1/q_out = 1/q_in - 1/f
    // q = z + i*zR

    // q_in complex
    const z = params.z;
    const zR = params.zR;
    const den = z * z + zR * zR;

    // 1/q_in = (z - i*zR) / den
    const invQ_re = z / den;
    const invQ_im = -zR / den;

    // 1/q_out
    const out_invQ_re = invQ_re - 1 / f;
    const out_invQ_im = invQ_im; // Width doesn't change instantly, Im part relates to width

    // q_out = 1 / (out_invQ_re + i*out_invQ_im)
    //       = (out_invQ_re - i*out_invQ_im) / (out_invQ_re^2 + out_invQ_im^2)
    const out_den = out_invQ_re * out_invQ_re + out_invQ_im * out_invQ_im;
    const q_out_re = out_invQ_re / out_den;
    const q_out_im = -out_invQ_im / out_den;

    const newZ = q_out_re;
    const newZR = q_out_im;

    // Recalculate w0
    // zR = pi * w0^2 / lambda => w0 = sqrt(zR * lambda / pi)
    const newW0 = Math.sqrt((newZR * params.wavelength) / Math.PI);

    return {
        z: newZ,
        zR: newZR,
        w0: newW0,
        wavelength: params.wavelength
    };
};

// --- Shape Definitions ---// --- Shape Definitions ---

// Mirror: Line Segment
const getMirrorSegment = (mirror: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 100;
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: mirror.position.x + p1Local.x, y: mirror.position.y + p1Local.y }, mirror.position, mirror.rotation);
    const p2 = rotatePoint({ x: mirror.position.x + p2Local.x, y: mirror.position.y + p2Local.y }, mirror.position, mirror.rotation);

    const normRad = (mirror.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Detector
const getDetectorSegment = (det: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 80;
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: det.position.x + p1Local.x, y: det.position.y + p1Local.y }, det.position, det.rotation);
    const p2 = rotatePoint({ x: det.position.x + p2Local.x, y: det.position.y + p2Local.y }, det.position, det.rotation);

    const normRad = (det.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Iris - dedicated segment with width matching visual (diameter 64 = 2 * radius 32)
const getIrisSegment = (iris: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 64; // Match visual circle radius 32 * 2
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: iris.position.x + p1Local.x, y: iris.position.y + p1Local.y }, iris.position, iris.rotation);
    const p2 = rotatePoint({ x: iris.position.x + p2Local.x, y: iris.position.y + p2Local.y }, iris.position, iris.rotation);

    const normRad = (iris.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Fiber Coupler - segment for the coupling lens/aperture
const getFiberSegment = (fiber: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 60; // Match visual coupler body height
    const halfWidth = width / 2;
    // Fiber lens is at x=-16 in local coordinates (front of coupler)
    const p1Local = { x: -16, y: -halfWidth };
    const p2Local = { x: -16, y: halfWidth };

    const p1 = rotatePoint({ x: fiber.position.x + p1Local.x, y: fiber.position.y + p1Local.y }, fiber.position, fiber.rotation);
    const p2 = rotatePoint({ x: fiber.position.x + p2Local.x, y: fiber.position.y + p2Local.y }, fiber.position, fiber.rotation);

    // Normal points toward the incoming light direction (LEFT in default orientation)
    // At rotation=0, normal should point LEFT (-1, 0) to face incoming light
    const normRad = ((fiber.rotation + 180) * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// AOM: Rectangular Crystal (Interaction Line)
const getAOMSegment = (aom: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 80;
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: aom.position.x + p1Local.x, y: aom.position.y + p1Local.y }, aom.position, aom.rotation);
    const p2 = rotatePoint({ x: aom.position.x + p2Local.x, y: aom.position.y + p2Local.y }, aom.position, aom.rotation);

    const normRad = (aom.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Optical Cavity - two parallel mirrors
const getCavitySegments = (cavity: OpticalComponent): { left: { p1: Vector2D, p2: Vector2D, normal: Vector2D }, right: { p1: Vector2D, p2: Vector2D, normal: Vector2D } } => {
    const height = 80; // Mirror height
    const halfHeight = height / 2;
    const length = cavity.params?.cavityLength ?? 100;
    const halfLength = length / 2;

    // Left mirror (entrance)
    const leftP1Local = { x: -halfLength, y: -halfHeight };
    const leftP2Local = { x: -halfLength, y: halfHeight };
    const leftP1 = rotatePoint({ x: cavity.position.x + leftP1Local.x, y: cavity.position.y + leftP1Local.y }, cavity.position, cavity.rotation);
    const leftP2 = rotatePoint({ x: cavity.position.x + leftP2Local.x, y: cavity.position.y + leftP2Local.y }, cavity.position, cavity.rotation);

    // Right mirror (back)
    const rightP1Local = { x: halfLength, y: -halfHeight };
    const rightP2Local = { x: halfLength, y: halfHeight };
    const rightP1 = rotatePoint({ x: cavity.position.x + rightP1Local.x, y: cavity.position.y + rightP1Local.y }, cavity.position, cavity.rotation);
    const rightP2 = rotatePoint({ x: cavity.position.x + rightP2Local.x, y: cavity.position.y + rightP2Local.y }, cavity.position, cavity.rotation);

    const normRad = (cavity.rotation * Math.PI) / 180;
    // Left mirror normal points right (into cavity), right mirror normal points left (into cavity)
    const normalRight = { x: Math.cos(normRad), y: Math.sin(normRad) };
    const normalLeft = { x: -Math.cos(normRad), y: -Math.sin(normRad) };

    return {
        left: { p1: leftP1, p2: leftP2, normal: normalRight }, // Normal points INTO cavity
        right: { p1: rightP1, p2: rightP2, normal: normalLeft } // Normal points INTO cavity
    };
};

// Waveplate/Polarizer segment (HWP, QWP, Polarizer)
const getWaveplateSegment = (wp: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 60; // Waveplate width
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: wp.position.x + p1Local.x, y: wp.position.y + p1Local.y }, wp.position, wp.rotation);
    const p2 = rotatePoint({ x: wp.position.x + p2Local.x, y: wp.position.y + p2Local.y }, wp.position, wp.rotation);

    const normRad = (wp.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Beam Splitter: Diagonal Line Segment
const getBeamSplitterSegment = (bs: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const size = 60;
    const half = size / 2;
    const p1Local = { x: -half, y: half };
    const p2Local = { x: half, y: -half };

    const p1 = rotatePoint({ x: bs.position.x + p1Local.x, y: bs.position.y + p1Local.y }, bs.position, bs.rotation);
    const p2 = rotatePoint({ x: bs.position.x + p2Local.x, y: bs.position.y + p2Local.y }, bs.position, bs.rotation);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const normal = normalize({ x: -dy, y: dx });

    return { p1, p2, normal };
};

// --- Shape Definitions Refactor ---
// Return a set of boundary surfaces (Circles or Segments)
type Surface =
    | { type: 'circle', center: Vector2D, radius: number, normalFlip: number }
    | { type: 'line', p1: Vector2D, p2: Vector2D };

const getLensBoundaries = (lens: OpticalComponent): Surface[] => {
    const f = lens.params?.focalLength || 100;
    const shape = lens.params?.lensShape || 'convex';
    const n = REFRACTIVE_INDEX_GLASS;
    const T = 15; // Thickness

    // Biconvex: R = 2(n-1)f. Centers on opposite sides.
    // Biconcave: R = 2(n-1)f. Centers on same sides (outward).
    // Plano: R = (n-1)f. One surface flat.

    let R = 2 * (n - 1) * f;
    if (shape.includes('plano')) {
        R = (n - 1) * f;
    }

    // Position offsets relative to lens center (0,0) before rotation
    const surfaces: Surface[] = [];
    const pos = lens.position;

    const transform = (localC: Vector2D) => rotatePoint(add(pos, localC), pos, lens.rotation);

    if (shape === 'convex') {
        const cxLocal = R - T / 2;
        // Face 1 (Left): Center at (+cx, 0). Bulges Left. Normal points Out (Left).
        // Hit point P. Normal = P - C. If P is left of C, Normal points Left. Correct.
        surfaces.push({ type: 'circle', center: transform({ x: cxLocal, y: 0 }), radius: R, normalFlip: 1 });
        // Face 2 (Right): Center at (-cx, 0). Bulges Right. Normal points Out (Right).
        surfaces.push({ type: 'circle', center: transform({ x: -cxLocal, y: 0 }), radius: R, normalFlip: 1 });
    } else if (shape === 'concave') {
        // Face 1 (Left): Center at Left. Bulges Right (Inward). 
        // Center (-R - T/2). P is at -T/2. P-C points Right. We want Normal Left (Out). So Flip -1.
        surfaces.push({ type: 'circle', center: transform({ x: -R - T / 2, y: 0 }), radius: R, normalFlip: -1 });
        // Face 2 (Right): Center at Right (+R + T/2). P is at +T/2. P-C points Left. We want Normal Right (Out). Flip -1.
        surfaces.push({ type: 'circle', center: transform({ x: R + T / 2, y: 0 }), radius: R, normalFlip: -1 });
    } else if (shape === 'plano-convex') {
        // Left: Flat. Right: Convex.
        // Flat (Left at -T/2). 
        surfaces.push({
            type: 'line',
            p1: transform({ x: -T / 2, y: -80 }),
            p2: transform({ x: -T / 2, y: 80 })
        });
        // Convex (Right). Center at (-R + T/2).
        surfaces.push({ type: 'circle', center: transform({ x: -R + T / 2, y: 0 }), radius: R, normalFlip: 1 });
    } else if (shape === 'plano-concave') {
        // Left: Flat. Right: Concave.
        surfaces.push({
            type: 'line',
            p1: transform({ x: -T / 2, y: -80 }),
            p2: transform({ x: -T / 2, y: 80 })
        });
        // Concave (Right). Center at Right (+R + T/2). Flip -1.
        surfaces.push({ type: 'circle', center: transform({ x: R + T / 2, y: 0 }), radius: R, normalFlip: -1 });
    }

    return surfaces;
};

// --- Intersection Logic ---

const intersectRaySegment = (rayOrigin: Vector2D, rayDir: Vector2D, p1: Vector2D, p2: Vector2D): { t: number, point: Vector2D, normal: Vector2D } | null => {
    const v1 = rayOrigin;
    const v2 = add(rayOrigin, rayDir);
    const v3 = p1;
    const v4 = p2;

    const den = (v1.x - v2.x) * (v3.y - v4.y) - (v1.y - v2.y) * (v3.x - v4.x);
    if (den === 0) return null;

    const t = ((v1.x - v3.x) * (v3.y - v4.y) - (v1.y - v3.y) * (v3.x - v4.x)) / den;
    const u = -((v1.x - v2.x) * (v1.y - v3.y) - (v1.y - v2.y) * (v1.x - v3.x)) / den;

    if (t > EPSILON && u >= 0 && u <= 1) {
        return {
            t: t,
            point: { x: v1.x + t * (v2.x - v1.x), y: v1.y + t * (v2.y - v1.y) },
            normal: { x: 0, y: 0 }
        };
    }
    return null;
};

const intersectRayCircle = (rayOrigin: Vector2D, rayDir: Vector2D, center: Vector2D, radius: number): { t: number, point: Vector2D, normal: Vector2D } | null => {
    const oc = sub(rayOrigin, center);
    const a = dot(rayDir, rayDir);
    const b = 2 * dot(oc, rayDir);
    const c = dot(oc, oc) - radius * radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    let t = null;
    if (t1 > EPSILON) t = t1;
    else if (t2 > EPSILON) t = t2;

    if (t !== null) {
        const point = add(rayOrigin, mul(rayDir, t));
        const normal = normalize(sub(point, center));
        return { t, point, normal };
    }
    return null;
};

// --- Tracer Structures ---

interface PendingRay {
    origin: Vector2D;
    dir: Vector2D;
    intensity: number;
    color: string;
    bounces: number;
    polarization: JonesVector; // Jones Vector
    gaussian: GaussianParams; // Gaussian params at origin
}

interface TraceResult {
    visualRay: Ray;
    nextRays: PendingRay[];
    hits: Record<string, number>; // Map component ID to intensity hit
    hitColors: Record<string, string>; // Map component ID to light color
}

interface HitRecord {
    t: number;
    point: Vector2D;
    normal: Vector2D;
    type: string;
    component: OpticalComponent;
}

// --- Single Ray Trace Function ---
const tracePolyline = (pending: PendingRay, components: OpticalComponent[]): { visualRay: Ray, nextRays: PendingRay[], hits: Record<string, number>, hitColors: Record<string, string> } => {
    let currentOrigin = pending.origin;
    let currentDir = pending.dir;
    let currentIntensity = pending.intensity;
    let currentPol = pending.polarization; // Jones Vector
    let currentGaussian = pending.gaussian;
    let path = [currentOrigin];
    let gaussianList: GaussianParams[] = []; // Params for each segment

    // Push initial gaussian params for the first segment (which doesn't exist yet but will be created)
    // Wait, gaussianList aligns with segments. Segment i connects point i and i+1.
    // So we push `currentGaussian` when we start a new segment.

    let currentRefractiveIndex = REFRACTIVE_INDEX_AIR;
    let nextRays: PendingRay[] = [];
    let hits: Record<string, number> = {};
    let hitColors: Record<string, string> = {};

    let loopLimit = MAX_BOUNCES;

    while (loopLimit > 0) {
        // Safety: Check for NaNs
        if (isNaN(currentOrigin.x) || isNaN(currentOrigin.y) || isNaN(currentDir.x) || isNaN(currentDir.y)) {
            console.warn('Raytracer: NaN detected, aborting ray.');
            break;
        }

        let roundedOrigin = {
            x: Math.round(currentOrigin.x * 100) / 100,
            y: Math.round(currentOrigin.y * 100) / 100
        };
        loopLimit--;
        let closestHit: HitRecord | null = null;
        let minT = Infinity;

        // Unified loop
        for (const comp of components) {

            // Mirror
            if (comp.type === 'mirror') {
                const seg = getMirrorSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    let N = seg.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hit.t, point: hit.point, normal: N, type: 'mirror', component: comp };
                }
            }

            // Detector
            else if (comp.type === 'detector') {
                const seg = getDetectorSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    // Absorb
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'detector', component: comp };
                }
            }

            // AOM
            else if (comp.type === 'aom') {
                const seg = getAOMSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    let N = seg.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hit.t, point: hit.point, normal: N, type: 'aom', component: comp };
                }
            }

            // Beam Splitter
            else if (comp.type === 'beamsplitter') {
                const seg = getBeamSplitterSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    let N = seg.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hit.t, point: hit.point, normal: N, type: 'beamsplitter', component: comp };
                }
            }

            // Fiber Coupler
            if (comp.type === 'fiber') {
                const seg = getFiberSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);

                if (hit && hit.t < minT) {
                    const N = seg.normal;
                    const D = currentDir;

                    // Check if light is coming from the front (hitting the coupling lens)
                    // Normal points toward incoming light, so dot(D, N) < 0 means front hit
                    const cosIncident = -dot(D, N); // Negate because D points toward surface

                    if (cosIncident > 0) {
                        // Front hit - check core aperture first (spatial filtering)
                        const coreRadius = (comp.params?.coreSize ?? 12) / 2;

                        // Calculate face center (midpoint of p1 and p2)
                        const faceCenter = {
                            x: (seg.p1.x + seg.p2.x) / 2,
                            y: (seg.p1.y + seg.p2.y) / 2
                        };
                        const distFromFaceCenter = mag(sub(hit.point, faceCenter));

                        if (distFromFaceCenter > coreRadius) {
                            // Hit outside core - blocked by cladding/housing
                            minT = hit.t;
                            closestHit = { t: hit.t, point: hit.point, normal: N, type: 'blocker', component: comp };
                        } else {
                            // Inside core - check angular acceptance
                            minT = hit.t;
                            closestHit = { t: hit.t, point: hit.point, normal: N, type: 'fiber', component: comp };
                        }
                    } else {
                        // Back hit - blocked
                        minT = hit.t;
                        closestHit = { t: hit.t, point: hit.point, normal: N, type: 'blocker', component: comp };
                    }
                }
            }

            // Iris / Blocker
            else if (comp.type === 'iris' || comp.type === 'blocker') {
                const seg = getIrisSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);

                if (hit && hit.t < minT) {
                    // Check Aperture - cap at max visual size (64)
                    const aperture = Math.min(comp.params?.aperture ?? 40, 64);
                    const dist = mag(sub(hit.point, comp.position));

                    if (dist > aperture / 2) {
                        // Hit blade -> Block
                        minT = hit.t;
                        closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'blocker', component: comp };
                    } else {
                        // Pass through (Inside hole).
                        // Do NOT update minT -> Light continues.
                    }
                }
            }

            // Optical Cavity - two parallel mirrors
            else if (comp.type === 'cavity') {
                const segs = getCavitySegments(comp);

                // Check left mirror (entrance)
                const hitLeft = intersectRaySegment(currentOrigin, currentDir, segs.left.p1, segs.left.p2);
                if (hitLeft && hitLeft.t < minT) {
                    minT = hitLeft.t;
                    let N = segs.left.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hitLeft.t, point: hitLeft.point, normal: N, type: 'cavity', component: comp };
                }

                // Check right mirror (back)
                const hitRight = intersectRaySegment(currentOrigin, currentDir, segs.right.p1, segs.right.p2);
                if (hitRight && hitRight.t < minT) {
                    minT = hitRight.t;
                    let N = segs.right.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hitRight.t, point: hitRight.point, normal: N, type: 'cavity', component: comp };
                }
            }

            // Half-Wave Plate (rotates polarization)
            else if (comp.type === 'hwp') {
                const seg = getWaveplateSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'hwp', component: comp };
                }
            }

            // Quarter-Wave Plate (linear to circular)
            else if (comp.type === 'qwp') {
                const seg = getWaveplateSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'qwp', component: comp };
                }
            }

            // Polarizer (filters by polarization angle)
            else if (comp.type === 'polarizer') {
                const seg = getWaveplateSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'polarizer', component: comp };
                }
            }

            // Polarizing Beam Splitter (splits by polarization)
            else if (comp.type === 'pbs') {
                // PBS uses same geometry as regular beam splitter
                const seg = getBeamSplitterSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    let N = seg.normal;
                    if (dot(currentDir, N) > 0) N = mul(N, -1);
                    closestHit = { t: hit.t, point: hit.point, normal: N, type: 'pbs', component: comp };
                }
            }

            // Polarization Detector (measures polarization angle)
            else if (comp.type === 'poldetector') {
                const seg = getDetectorSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'poldetector', component: comp };
                }
            }
            // Simple Detector (Restore)
            else if (comp.type === 'detector') {
                const seg = getDetectorSegment(comp);
                const hit = intersectRaySegment(currentOrigin, currentDir, seg.p1, seg.p2);
                if (hit && hit.t < minT) {
                    minT = hit.t;
                    closestHit = { t: hit.t, point: hit.point, normal: seg.normal, type: 'detector', component: comp };
                }
            }


            // Lens
            else if (comp.type === 'lens') {
                const surfaces = getLensBoundaries(comp);
                for (const sf of surfaces) {
                    let hit = null;
                    let N = { x: 0, y: 0 };

                    if (sf.type === 'circle') {
                        const h = intersectRayCircle(currentOrigin, currentDir, sf.center, sf.radius);
                        if (h) {
                            hit = h;
                            if (sf.normalFlip === -1) {
                                N = mul(h.normal, -1);
                            } else {
                                N = h.normal;
                            }
                        }
                    } else {
                        const h = intersectRaySegment(currentOrigin, currentDir, sf.p1, sf.p2);
                        if (h) {
                            hit = h;
                            // Line normal
                            const dx = sf.p2.x - sf.p1.x;
                            const dy = sf.p2.y - sf.p1.y;
                            N = normalize({ x: -dy, y: dx });
                        }
                    }

                    if (hit) {
                        const distFromLensCenter = mag(sub(hit.point, comp.position));
                        // Increased bounds for different shapes
                        if (distFromLensCenter < 90 && hit.t < minT) {
                            minT = hit.t;
                            closestHit = { t: hit.t, point: hit.point, normal: N, type: 'lens', component: comp };
                        }
                    }
                }
            }
        }

        if (closestHit) {
            const hit = closestHit as HitRecord;

            // Store params for the segment we just finished (origin -> hit)
            gaussianList.push({ ...currentGaussian });

            // Update beam phase (z propagation)
            const dist = mag(sub(hit.point, currentOrigin));
            currentGaussian = propagateGaussian(currentGaussian, dist);

            path.push(hit.point);
            currentOrigin = hit.point;

            if (hit.type === 'mirror') {
                const N = hit.normal;
                const dotDN = dot(currentDir, N);
                const R = sub(currentDir, mul(N, 2 * dotDN));
                currentDir = normalize(R);
                currentOrigin = add(currentOrigin, mul(currentDir, EPSILON * 2));
            }
            else if (hit.type === 'poldetector') {
                const id = hit.component.id;
                hits[id] = (hits[id] || 0) + currentIntensity; // Use currentIntensity

                // Store Stoke parameters or raw Jones vector for visualization
                // Store Stoke parameters for aggregation
                const stokes = getStokes(currentPol);
                // We accumulate these in the hits map
                hits[id + '_s1'] = stokes.s1;
                hits[id + '_s2'] = stokes.s2;
                hits[id + '_s3'] = stokes.s3;

                break;
            }
            else if (hit.type === 'detector') {
                const id = hit.component.id;
                hits[id] = (hits[id] || 0) + currentIntensity;
                break;
            }
            else if (hit.type === 'fiber') {
                const id = hit.component.id;
                const N = hit.normal;
                const D = currentDir;

                // Calculate incidence angle (cosTheta = -dot because D points into surface)
                const cosTheta = -dot(D, N);

                // Clamp cosTheta to valid range for acos
                const clampedCos = Math.max(-1, Math.min(1, cosTheta));
                const thetaDeg = (Math.acos(clampedCos) * 180) / Math.PI;

                const acceptance = hit.component.params?.acceptanceAngle ?? 15;
                let coupling = 0;

                if (cosTheta > 0 && thetaDeg <= acceptance) {
                    // Gaussian coupling efficiency (realistic fiber behavior)
                    // sigma = acceptance / 2.355 converts half-angle to Gaussian sigma (FWHM)
                    const sigma = acceptance / 2.355;
                    coupling = Math.exp(-(thetaDeg * thetaDeg) / (2 * sigma * sigma));
                    coupling = Math.max(0, coupling);
                }

                // Store coupled power
                if (coupling > 0) {
                    hits[id] = (hits[id] || 0) + (currentIntensity * coupling); // Use currentIntensity
                    // Store color if significant power
                    if (currentIntensity * coupling > MIN_INTENSITY) {
                        hitColors[id] = pending.color;
                    }
                }
                break;
            }
            else if (hit.type === 'blocker') {
                break; // Just stop
            }
            else if (hit.type === 'cavity') {
                // Cavity mirror - reflects most light, transmits some
                const reflectivity = hit.component.params?.reflectivity ?? 0.95;
                const N = hit.normal;
                const dotDN = dot(currentDir, N);

                // Reflected ray
                if (currentIntensity * reflectivity > MIN_INTENSITY) {
                    const R = sub(currentDir, mul(N, 2 * dotDN));
                    nextRays.push({
                        origin: add(hit.point, mul(normalize(R), EPSILON * 2)),
                        dir: normalize(R),
                        intensity: currentIntensity * reflectivity,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }

                // Transmitted ray (leakage through mirror)
                if (currentIntensity * (1 - reflectivity) > MIN_INTENSITY) {
                    nextRays.push({
                        origin: add(hit.point, mul(currentDir, EPSILON * 2)),
                        dir: currentDir,
                        intensity: currentIntensity * (1 - reflectivity),
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }
                break;
            }
            else if (hit.type === 'aom') {
                const efficiency = hit.component.params?.efficiency ?? 0.5; // 0 to 1
                const deviation = hit.component.params?.deviation ?? 5; // Degrees

                // 0th Order (Straight)
                if (currentIntensity * (1 - efficiency) > MIN_INTENSITY) {
                    nextRays.push({
                        origin: add(hit.point, mul(currentDir, EPSILON * 5)),
                        dir: currentDir,
                        intensity: currentIntensity * (1 - efficiency),
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }

                // 1st Order (Deflected)
                if (currentIntensity * efficiency > MIN_INTENSITY) {
                    const rad = (deviation * Math.PI) / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    const newDir = {
                        x: currentDir.x * cos - currentDir.y * sin,
                        y: currentDir.x * sin + currentDir.y * cos
                    };
                    nextRays.push({
                        origin: add(hit.point, mul(normalize(newDir), EPSILON * 5)),
                        dir: normalize(newDir),
                        intensity: currentIntensity * efficiency,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }
                break;
            }
            // Half-Wave Plate: Rotates polarization by 2*(fast axis - polarization)
            else if (hit.type === 'hwp') {
                // Half-wave plate: Retardance = PI
                const fastAxis = hit.component.params?.fastAxis ?? 0;
                currentPol = applyWaveplate(currentPol, fastAxis, Math.PI);

                // HWP is lossless (Unit->Unit), but good practice to maintain norm
                const trans = getIntensity(currentPol);
                currentIntensity = pending.intensity * trans;
                currentPol = normalizeJones(currentPol);

                // Transmission (assume perfect)
                currentOrigin = add(hit.point, mul(currentDir, EPSILON * 2));
                // currentIntensity = getIntensity(currentPol); // REMOVED
                nextRays.push({
                    origin: currentOrigin,
                    dir: currentDir,
                    intensity: currentIntensity,
                    color: pending.color,
                    bounces: pending.bounces + 1,
                    polarization: currentPol,
                    gaussian: currentGaussian
                });
                break;
            }
            // Quarter-Wave Plate: Converts linear to circular (or vice versa)
            // For simulation, we just pass through with a phase shift marker
            else if (hit.type === 'qwp') {
                // Quarter-wave plate: Retardance = PI/2
                const fastAxis = hit.component.params?.fastAxis ?? 45;
                currentPol = applyWaveplate(currentPol, fastAxis, Math.PI / 2);

                const trans = getIntensity(currentPol);
                currentIntensity = pending.intensity * trans;
                currentPol = normalizeJones(currentPol);

                currentOrigin = add(hit.point, mul(currentDir, EPSILON * 2));
                // currentIntensity = getIntensity(currentPol); // REMOVED
                nextRays.push({
                    origin: currentOrigin,
                    dir: currentDir,
                    intensity: currentIntensity,
                    color: pending.color,
                    bounces: pending.bounces + 1,
                    polarization: currentPol,
                    gaussian: currentGaussian
                });
                break;
            }
            // Polarizer: Filters by polarization angle using Malus's Law
            else if (hit.type === 'polarizer') {
                const axis = hit.component.params?.polarizerAxis ?? 0;
                currentPol = applyPolarizer(currentPol, axis);

                // Intensity drops
                const trans = getIntensity(currentPol);
                currentIntensity = pending.intensity * trans;
                // Normalize for propagation
                currentPol = normalizeJones(currentPol);

                if (currentIntensity > MIN_INTENSITY) {
                    currentOrigin = add(hit.point, mul(currentDir, EPSILON * 2));
                    nextRays.push({
                        origin: currentOrigin,
                        dir: currentDir,
                        intensity: currentIntensity,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }
                break;
            }
            // Polarizing Beam Splitter: splits by polarization
            else if (hit.type === 'pbs') {
                const id = hit.component.id;
                hits[id] = (hits[id] || 0) + pending.intensity;

                // PBS Axis (Transmission Axis). Default 0 (Horizontal)
                // Note: In real PBS, this is tied to the physical geometry, but here we allow parametric control
                const axis = hit.component.params?.pbsAxis ?? 0;

                // 1. Transmitted Ray (Parallel to axis) (T)
                let transPol = applyPolarizer(currentPol, axis);
                const transFactor = getIntensity(transPol);
                const transInt = pending.intensity * transFactor;

                if (transInt > MIN_INTENSITY) {
                    transPol = normalizeJones(transPol);
                    nextRays.push({
                        origin: add(hit.point, mul(currentDir, EPSILON * 2)),
                        dir: currentDir,
                        intensity: transInt,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: transPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }

                // 2. Reflected Ray (Perpendicular to axis) (R)
                let reflPol = applyPolarizer(currentPol, axis + 90);
                const reflFactor = getIntensity(reflPol);
                const reflInt = pending.intensity * reflFactor;

                if (reflInt > MIN_INTENSITY) {
                    const N = hit.normal;
                    const dotDN = dot(currentDir, N);
                    const R_dir = normalize(sub(currentDir, mul(N, 2 * dotDN)));
                    reflPol = normalizeJones(reflPol);

                    nextRays.push({
                        origin: add(hit.point, mul(R_dir, EPSILON * 2)),
                        dir: R_dir,
                        intensity: reflInt,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: reflPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }

                break;
            }
            else if (hit.type === 'lens') {
                const N = hit.normal;
                let n1 = currentRefractiveIndex;
                let n2 = REFRACTIVE_INDEX_GLASS;
                let normal = N;

                if (dot(currentDir, N) < 0) { // Entering
                    n2 = REFRACTIVE_INDEX_GLASS;
                } else { // Exiting
                    normal = mul(N, -1);
                    n1 = REFRACTIVE_INDEX_GLASS;
                    n2 = REFRACTIVE_INDEX_AIR;
                }

                const r = n1 / n2;
                const c = -dot(normal, currentDir);
                const discrim = 1.0 - r * r * (1.0 - c * c);

                if (discrim < 0) { // TIR
                    const R = sub(currentDir, mul(normal, -2 * c));
                    currentDir = normalize(R);
                } else { // Refract
                    const term1 = mul(currentDir, r);
                    const term2 = mul(normal, r * c - Math.sqrt(discrim));
                    currentDir = normalize(add(term1, term2));
                    currentRefractiveIndex = n2;
                }


                // Lens Interaction: Transform Gaussian
                let f = hit.component.params?.focalLength || 100;
                const shape = hit.component.params?.lensShape || 'convex';

                if (shape.includes('concave')) {
                    f = -f;
                }
                // If exiting lens (back to air), or entering?
                // Thin lens approx: apply transformation ONCE at the lens plane.
                // Our intersection logic hits discrete surfaces?
                // Lens boundary function returns 'surfaces'.
                // If we treat it as thin lens, we should only apply phase mask once.
                // But tracer hits "Left Face" then "Right Face" for real thick lens?
                // Simulation uses `getLensBoundaries` -> 2 circles.
                // It is a thick lens.
                // For simplicity, we can apply the focusing power at the SECOND interface (exit)?
                // Or just apply ideal thin lens at the center?
                // The ray tracer actually hits the SURFACE.
                // If we want "Physically correct Gaussian", we need ABCD for dielectric interface (curved).
                // Matrix for curved interface radius R, index n1->n2:
                // A=1, B=0, C=(n1-n2)/(R*n2), D=n1/n2.
                // This is getting complex.
                // SIMPLIFICATION: We only care about the visual "focusing effect". 
                // We'll trust the ray direction change (Snell's law) which is already handled above!
                // Wait, if ray direction changes, it converges.
                // If we simply propagate Gaussian Z along the new converging rays, does the width shrink?
                // In Ray interpretation: Yes, converging rays define the envelope.
                // In Gaussian interpretation: We calculate width analytically $w(z)$.
                // If we rely on Snell's law for `dir`, the rays converge geometrically.
                // But Gaussian `w(z)` is calculated from `w0` and `z`.
                // If we don't update `gaussianParams`, `w(z)` will just keep expanding (diffracting).
                // So we MUST update `gaussianParams` to reflect that we are now "focusing".
                // Simplest approach: Reset `z` to correspond to the new focal point?
                // Better: Apply ABCD for the curved interface.
                // C (power) = (n1 - n2) / (R * n2).
                // D = n1 / n2.
                // Let's implement this interface transform.

                // Raytracer calculated refraction n1->n2.
                // Surface curvature:
                // We need R of the surface we hit.
                // `getLensBoundaries` returns surfaces. We don't easily know R here without re-checking.
                // Hack: We can just use the Focal Length `f` of the lens and apply a Thin Lens transform
                // ONLY when hitting a specific part (e.g. center)? Or splitting it?
                // Or, since implementation plan mentioned Thin Lens ABCD:
                // Let's stick to Thin Lens approx applied ONCE.
                // But the ray hits TWO surfaces.
                // We can apply half power at each? Or just apply at exit?
                // Let's apply at EXIT (n2 = Air).

                if (n2 === REFRACTIVE_INDEX_AIR) {
                    // Exiting lens -> Apply focusing
                    // Thin lens f is total focal length.
                    currentGaussian = lensTransformGaussian(currentGaussian, f);
                }

                currentOrigin = add(currentOrigin, mul(currentDir, EPSILON * 2));
            }
            else if (hit.type === 'beamsplitter') {
                const ratio = hit.component.params?.transmission ?? 0.5;

                // 1. Reflected Ray
                const N = hit.normal;
                const dotDN = dot(currentDir, N);
                const R_dir = normalize(sub(currentDir, mul(N, 2 * dotDN)));

                if (pending.intensity * (1 - ratio) > MIN_INTENSITY) {
                    nextRays.push({
                        origin: add(hit.point, mul(R_dir, EPSILON * 2)),
                        dir: R_dir,
                        intensity: pending.intensity * (1 - ratio),
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }

                // 2. Transmitted Ray
                const T_dir = currentDir;
                if (pending.intensity * ratio > MIN_INTENSITY) {
                    nextRays.push({
                        origin: add(hit.point, mul(T_dir, EPSILON * 2)),
                        dir: T_dir,
                        intensity: pending.intensity * ratio,
                        color: pending.color,
                        bounces: pending.bounces + 1,
                        polarization: currentPol,
                        gaussian: currentGaussian,
                        isGaussian: pending.isGaussian
                    });
                }
                break;
            }
        }
        else {
            gaussianList.push({ ...currentGaussian });
            path.push(add(currentOrigin, mul(currentDir, MAX_RAY_LENGTH)));
            break;
        }
    }

    return {
        visualRay: {
            start: pending.origin,
            direction: pending.dir,
            intensity: pending.intensity,
            color: pending.color,
            path: path,
            polarization: pending.polarization,
            gaussianParamsList: pending.isGaussian ? gaussianList : [], // Only populate if Gaussian
            isGaussian: pending.isGaussian
        },
        nextRays,
        hits,
        hitColors
    };
};

export const calculateRays = (components: OpticalComponent[]): { rays: Ray[], hits: Record<string, number>, hitColors: Record<string, string> } => {
    const finalRays: Ray[] = [];
    const totalHits: Record<string, number> = {};
    const totalHitColors: Record<string, string> = {}; // Initialize hitColors
    const queue: PendingRay[] = [];

    const lasers = components.filter(c => c.type === 'laser');

    lasers.forEach(laser => {
        const rad = (laser.rotation * Math.PI) / 180;
        const rot = Math.round(laser.rotation) % 360;
        let dir: Vector2D = { x: Math.cos(rad), y: Math.sin(rad) };
        if (rot === 0) dir = { x: 1, y: 0 };
        else if (rot === 90) dir = { x: 0, y: 1 };
        else if (rot === 180) dir = { x: -1, y: 0 };
        else if (rot === 270) dir = { x: 0, y: -1 };

        const baseColor = laser.params?.color || '#ff0000';
        const totalPower = laser.params?.brightness ?? 1; // Default 1.0 (Assume mW)
        const glowRatio = laser.params?.glow ?? 0.4;      // Ratio 0-1 (Fraction of power in glow)

        const profile = laser.params?.profile ?? 'simple';
        const beamDiameter = laser.params?.beamDiameter ?? 5.0; // microns or pixels equivalent

        // Calculate power distribution
        const polarizationAngle = laser.params?.polarization ?? 0;
        const localPol = getLinearPolarization(polarizationAngle);
        const polarization = rotateJonesVector(localPol, -laser.rotation);

        // Initial Gaussian Parameters
        const w0 = beamDiameter / 2; // Radius in microns
        // Approximate Rayleigh range for 532nm (Green) default
        const lambda = 0.532;
        const zR = (Math.PI * w0 * w0) / lambda;

        const initialGaussian: GaussianParams = {
            w0: w0,
            z: 0,
            zR: zR,
            wavelength: lambda
        };


        const perp = { x: -dir.y, y: dir.x };

        if (profile === 'gaussian') {
            const beamRadiusMm = (beamDiameter / 2) / 1000; // Convert micron diameter to mm radius
            const distributionRangeMm = 4 * beamRadiusMm; // Spread over +/- 2*w0 (98% power)

            const numRays = 19; // Odd number
            const step = distributionRangeMm / (numRays - 1);

            // Calculate unnormalized intensities
            const rayProps: { offset: number, intens: number }[] = [];
            let sumIntens = 0;

            for (let i = 0; i < numRays; i++) {
                const offset = -(distributionRangeMm / 2) + i * step;
                const r2 = offset * offset;
                const w2 = beamRadiusMm * beamRadiusMm;
                const val = Math.exp(-2 * r2 / w2);
                rayProps.push({ offset, intens: val });
                sumIntens += val;
            }

            // Normalize and queue
            rayProps.forEach(prop => {
                const realIntensity = (prop.intens / sumIntens) * totalPower;

                if (realIntensity > MIN_INTENSITY) {
                    queue.push({
                        origin: add(laser.position, mul(perp, prop.offset)),
                        dir,
                        intensity: realIntensity,
                        color: baseColor,
                        bounces: 0,
                        bounces: 0,
                        bounces: 0,
                        polarization,
                        gaussian: initialGaussian,
                        isGaussian: false // Render as simple lines, not envelopes
                    });
                }
            });
        } else {
            // Simple Mode
            // Calculate power distribution
            // Core gets the remaining power after glow is removed
            const coreIntensity = totalPower * (1 - glowRatio);

            // Glow power is split between two side rays
            const sideIntensity = (totalPower * glowRatio) / 2;

            const offset = 2.5;

            // Queue 3 Rays with polarization
            // 1. Core Ray
            if (coreIntensity > MIN_INTENSITY) {
                queue.push({
                    origin: { ...laser.position },
                    dir,
                    intensity: coreIntensity,
                    color: baseColor,
                    bounces: 0,
                    color: baseColor,
                    bounces: 0,
                    polarization,
                    gaussian: initialGaussian,
                    isGaussian: false
                });
            }

            // 2. Side Ray 1
            if (sideIntensity > MIN_INTENSITY) {
                queue.push({
                    origin: add(laser.position, mul(perp, offset)),
                    dir,
                    intensity: sideIntensity,
                    color: baseColor,
                    bounces: 0,
                    color: baseColor,
                    bounces: 0,
                    polarization,
                    gaussian: initialGaussian,
                    isGaussian: false
                });
            }

            // 3. Side Ray 2
            if (sideIntensity > MIN_INTENSITY) {
                queue.push({
                    origin: sub(laser.position, mul(perp, offset)),
                    dir,
                    intensity: sideIntensity,
                    color: baseColor,
                    bounces: 0,
                    color: baseColor,
                    bounces: 0,
                    polarization,
                    gaussian: initialGaussian,
                    isGaussian: false
                });
            }
        }
    });

    // Process Queue
    while (queue.length > 0) {
        // Safety break
        if (finalRays.length >= MAX_TOTAL_RAYS) {
            console.warn('Ray limit reached!');
            break;
        }

        const current = queue.shift();
        if (!current) continue;

        const result = tracePolyline(current, components);
        finalRays.push(result.visualRay);

        // Accumulate hits
        Object.entries(result.hits).forEach(([id, val]) => {
            totalHits[id] = (totalHits[id] || 0) + val;
        });

        // Aggregate colors (last one wins for now)
        Object.entries(result.hitColors).forEach(([id, color]) => {
            totalHitColors[id] = color;
        });

        result.nextRays.forEach(child => {
            if (child.bounces < MAX_BOUNCES) {
                queue.push(child);
            }
        });
    }

    // Post-process Stokes parameters for polarization detectors
    const detectors = components.filter(c => c.type === 'poldetector');
    detectors.forEach(det => {
        const id = det.id;
        const s0 = totalHits[id] || 0; // S0 is intensity (summed)
        const s1 = totalHits[id + '_s1'] || 0;
        const s2 = totalHits[id + '_s2'] || 0;
        const s3 = totalHits[id + '_s3'] || 0;

        if (s0 > 0) {
            // Angle psi = 0.5 * atan2(S2, S1)
            const psiRad = 0.5 * Math.atan2(s2, s1);
            const psiDeg = (psiRad * 180) / Math.PI;
            const angle = ((psiDeg % 180) + 180) % 180; // Strictly 0-180
            totalHits[id + '_pol'] = angle;

            // Ellipticity chi = 0.5 * asin(S3 / S0)
            const ratio = Math.max(-1, Math.min(1, s3 / s0)); // Clamp
            const chiRad = 0.5 * Math.asin(ratio);
            const chiDeg = (chiRad * 180) / Math.PI;
            totalHits[id + '_ellipticity'] = chiDeg;
        }
    });

    return { rays: finalRays, hits: totalHits, hitColors: totalHitColors };
};
