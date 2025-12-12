import { OpticalComponent, Ray, Vector2D } from './types';

// Distance the ray travels if it hits nothing
const MAX_RAY_LENGTH = 2000;
const MAX_BOUNCES = 20;
const MIN_INTENSITY = 0.01;
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

// --- Shape Definitions ---

// Mirror: Line Segment
const getMirrorSegment = (mirror: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 50;
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: mirror.position.x + p1Local.x, y: mirror.position.y + p1Local.y }, mirror.position, mirror.rotation);
    const p2 = rotatePoint({ x: mirror.position.x + p2Local.x, y: mirror.position.y + p2Local.y }, mirror.position, mirror.rotation);

    const normRad = (mirror.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Detector: Similar to mirror but different logic
const getDetectorSegment = (det: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const width = 40;
    const halfWidth = width / 2;
    const p1Local = { x: 0, y: -halfWidth };
    const p2Local = { x: 0, y: halfWidth };

    const p1 = rotatePoint({ x: det.position.x + p1Local.x, y: det.position.y + p1Local.y }, det.position, det.rotation);
    const p2 = rotatePoint({ x: det.position.x + p2Local.x, y: det.position.y + p2Local.y }, det.position, det.rotation);

    const normRad = (det.rotation * Math.PI) / 180;
    const normal = { x: Math.cos(normRad), y: Math.sin(normRad) };

    return { p1, p2, normal };
};

// Beam Splitter: Diagonal Line Segment
const getBeamSplitterSegment = (bs: OpticalComponent): { p1: Vector2D, p2: Vector2D, normal: Vector2D } => {
    const size = 30;
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

// Lens: Two Circle Segments (Spherical surfaces)
const getLensSurfaces = (lens: OpticalComponent): { center1: Vector2D, r1: number, center2: Vector2D, r2: number } => {
    const f = lens.params?.focalLength || 100;
    const n = REFRACTIVE_INDEX_GLASS;
    const R = 2 * (n - 1) * f;
    const T = 15; // Lens thickness

    const cx1 = R - T / 2;
    const cx2 = -(R - T / 2);

    const center1 = rotatePoint({ x: lens.position.x + cx1, y: lens.position.y }, lens.position, lens.rotation);
    const center2 = rotatePoint({ x: lens.position.x + cx2, y: lens.position.y }, lens.position, lens.rotation);

    return { center1, r1: R, center2, r2: R };
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
}

interface TraceResult {
    visualRay: Ray;
    nextRays: PendingRay[];
    hits: Record<string, number>; // Map component ID to intensity hit
}

interface HitRecord {
    t: number;
    point: Vector2D;
    normal: Vector2D;
    type: string;
    component: OpticalComponent;
}

// --- Single Ray Trace Function ---
const tracePolyline = (pending: PendingRay, components: OpticalComponent[]): TraceResult => {
    let currentOrigin = pending.origin;
    let currentDir = pending.dir;
    let path = [currentOrigin];
    let currentRefractiveIndex = REFRACTIVE_INDEX_AIR;
    let nextRays: PendingRay[] = [];
    let hits: Record<string, number> = {};

    let loopLimit = MAX_BOUNCES;

    while (loopLimit > 0) {
        loopLimit--;
        let closestHit: HitRecord | null = null;
        let minT = Infinity;

        // Unified loop for better TS Control Flow Analysis
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

            // Lens
            else if (comp.type === 'lens') {
                const shapes = getLensSurfaces(comp);
                const surfaces = [{ c: shapes.center1, r: shapes.r1 }, { c: shapes.center2, r: shapes.r2 }];
                for (const surface of surfaces) {
                    const hit = intersectRayCircle(currentOrigin, currentDir, surface.c, surface.r);
                    if (hit) {
                        const distFromLensCenter = mag(sub(hit.point, comp.position));
                        if (distFromLensCenter < 35 && hit.t < minT) {
                            minT = hit.t;
                            closestHit = { t: hit.t, point: hit.point, normal: hit.normal, type: 'lens', component: comp };
                        }
                    }
                }
            }
        }

        if (closestHit) {
            // TS now definitely knows closestHit is not null here if assigned in the loop
            // But to be absolutely safe with "possibly undefined" in some configs, we check again or rely on the type.
            const hit = closestHit as HitRecord;

            path.push(hit.point);
            currentOrigin = hit.point;

            if (hit.type === 'mirror') {
                const N = hit.normal;
                const dotDN = dot(currentDir, N);
                const R = sub(currentDir, mul(N, 2 * dotDN));
                currentDir = normalize(R);
                currentOrigin = add(currentOrigin, mul(currentDir, EPSILON * 2));
            }
            else if (hit.type === 'detector') {
                const id = hit.component.id;
                hits[id] = (hits[id] || 0) + pending.intensity;
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
                        bounces: pending.bounces + 1
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
                        bounces: pending.bounces + 1
                    });
                }
                break;
            }
        }
        else {
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
            path: path
        },
        nextRays,
        hits
    };
};


export const calculateRays = (components: OpticalComponent[]): { rays: Ray[], hits: Record<string, number> } => {
    const finalRays: Ray[] = [];
    const totalHits: Record<string, number> = {};
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
        const basePower = laser.params?.power || 1;
        const perp = { x: -dir.y, y: dir.x };
        const offset = 2.5;

        // Queue 3 Rays
        queue.push({
            origin: { ...laser.position },
            dir,
            intensity: basePower,
            color: baseColor,
            bounces: 0
        });
        queue.push({
            origin: add(laser.position, mul(perp, offset)),
            dir,
            intensity: basePower * 0.4,
            color: baseColor,
            bounces: 0
        });
        queue.push({
            origin: sub(laser.position, mul(perp, offset)),
            dir,
            intensity: basePower * 0.4,
            color: baseColor,
            bounces: 0
        });
    });

    // Process Queue
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        const result = tracePolyline(current, components);
        finalRays.push(result.visualRay);

        // Accumulate hits
        Object.entries(result.hits).forEach(([id, val]) => {
            totalHits[id] = (totalHits[id] || 0) + val;
        });

        result.nextRays.forEach(child => {
            if (child.bounces < MAX_BOUNCES) {
                queue.push(child);
            }
        });
    }

    return { rays: finalRays, hits: totalHits };
};
