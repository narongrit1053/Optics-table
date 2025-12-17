import { Vector2D } from './types';

// --- Vector Math Utilities ---
export const add = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });
export const sub = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x - v2.x, y: v1.y - v2.y });
export const mul = (v: Vector2D, s: number): Vector2D => ({ x: v.x * s, y: v.y * s });
export const dot = (v1: Vector2D, v2: Vector2D): number => v1.x * v2.x + v1.y * v2.y;
export const mag = (v: Vector2D): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const normalize = (v: Vector2D): Vector2D => {
    const m = mag(v);
    return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};

// Rotate a point around a center
export const rotatePoint = (point: Vector2D, center: Vector2D, angleDeg: number): Vector2D => {
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

export const getGaussianWidth = (z: number, w0: number, zR: number): number => w0 * Math.sqrt(1 + (z / zR) ** 2);
