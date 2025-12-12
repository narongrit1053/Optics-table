import { describe, it, expect } from 'vitest';
import { calculateRays } from './raytracer';
import { OpticalComponent } from './types';

describe('Raytracer Engine', () => {

    it('should trace a simple laser beam in air', () => {
        const components: OpticalComponent[] = [{
            id: 'laser1',
            type: 'laser',
            position: { x: 0, y: 0 },
            rotation: 0,
            params: { power: 1, color: 'red' }
        }];

        const { rays } = calculateRays(components);

        // Should have 3 rays (Center + 2 Side)
        expect(rays.length).toBe(3);

        const centerRay = rays[0];
        expect(centerRay.intensity).toBe(1);
        expect(centerRay.path.length).toBeGreaterThan(1);

        // Direction check: 0 deg = (1, 0)
        expect(centerRay.direction.x).toBeCloseTo(1);
        expect(centerRay.direction.y).toBeCloseTo(0);
    });

    it('should reflect off a mirror', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 0, // Pointing Right
                params: { power: 1, color: 'red' }
            },
            {
                id: 'mirror1',
                type: 'mirror',
                position: { x: 200, y: 0 },
                rotation: 135, // 45 degree angle relative to vertical/horizontal? 
                // In our engine: 90 is vertical |
                // 135 is \ diagonal?
                // Light comes from left (1,0). Normal of 135 deg mirror?
                // Normal angle = 135.
                // Incident = (1,0). Normal = (-0.707, 0.707).
                // Reflected should be Up or Down?
                params: {}
            }
        ];

        const { rays } = calculateRays(components);
        const centerRay = rays[0];

        // Path: Start -> Mirror -> End
        expect(centerRay.path.length).toBe(3);

        // Mirror Hit Point
        const hit = centerRay.path[1];
        expect(hit.x).toBeCloseTo(200, 0); // Should hit x=200

        // Check bounce direction
        // If normal is (-0.7,0.7), incident is (1,0).
        // R = D - 2(D.N)N
        // D.N = -0.707
        // R = (1,0) - 2(-0.707)*(-0.707, 0.707)
        // R = (1,0) + 1.414*(-0.707, 0.707) = (1,0) + (-1, 1) = (0, 1) -> UP
        const lastPoint = centerRay.path[2];
        const dx = lastPoint.x - hit.x;
        const dy = lastPoint.y - hit.y;

        // Should go roughly UP (Positive Y?)
        // Wait, SVG Y is Down. (0,0) is top left?
        // Let's check math only.
        // If it goes (0,1) that is Down in SVG coords.
        // Wait, if rotation is 135, Normal is cos(135), sin(135) = (-0.7, 0.7).
        // If Y is down:
        // Ray (1,0). Normal (-0.7, 0.7).
        // Dot = -0.7.
        // R = (1,0) - 2(-0.7)*Normal = (1,0) + 1.4*(-0.7, 0.7) = (1-1, 1*1) = (0, 1).
        // So reflection is (0, 1) -> +Y -> Down.

        expect(dy).toBeGreaterThan(0);
        expect(Math.abs(dx)).toBeLessThan(1); // Should be vertical
    });

    it('should split beam at beamsplitter', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 0,
                params: { power: 1 }
            },
            {
                id: 'bs1',
                type: 'beamsplitter',
                position: { x: 100, y: 0 },
                rotation: 90, // 90 deg rotation makes it a / diagonal (reflects Down)
                params: { transmission: 0.5 }
            }
        ];

        const { rays } = calculateRays(components);

        // Expecting multiple rays now (Visual rays returned)
        // calculateRays returns FLATTENED visual rays.
        // A single source ray that hits BS splits into 2.
        // Our engine: Returns the segment UP TO the split, and then spawns NEW rays.
        // So we should see:
        // 1. Source Ray (Start -> BS)
        // 2. Transmitted Ray (BS -> Right)
        // 3. Reflected Ray (BS -> Down)

        // Since we emit 3 source rays, and each splits... we might get many.
        // Let's filter for just the center ray (intensity ~ 1 or 0.5).

        const strongRays = rays.filter(r => r.intensity >= 0.4);
        // Original source (1.0), Transmitted (0.5), Reflected (0.5).

        expect(strongRays.length).toBeGreaterThanOrEqual(3);

        const hasReflected = strongRays.some(r => Math.abs(r.direction.x) < 0.1 && r.direction.y > 0.9);
        const hasTransmitted = strongRays.some(r => r.direction.x > 0.9 && Math.abs(r.direction.y) < 0.1);

        expect(hasReflected).toBe(true);
        expect(hasTransmitted).toBe(true);
    });

    it('should detect light at detector', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 0,
                params: { power: 1 }
            },
            {
                id: 'det1',
                type: 'detector',
                position: { x: 200, y: 0 },
                rotation: 0,
                params: {}
            }
        ];

        const { hits } = calculateRays(components);

        expect(hits['det1']).toBeGreaterThan(0);
        expect(hits['det1']).toBeCloseTo(1.8, 1);
    });

    it('should split beam at AOM (0th and 1st order)', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 0,
                params: { power: 1 }
            },
            {
                id: 'aom1',
                type: 'aom',
                position: { x: 100, y: 0 },
                rotation: 90,
                params: { efficiency: 0.5, deviation: 30 } // 50/50 split, 30deg deviation
            }
        ];

        const { rays } = calculateRays(components);

        // Filter strong rays
        const strongRays = rays.filter(r => r.intensity >= 0.4);

        // Should have:
        // 1. Source (1.0)
        // 2. 0th Order (Straight) -> (1, 0)
        // 3. 1st Order (Deflected) -> Rotated 30 deg

        const hasZeroOrder = strongRays.some(r => r.direction.x > 0.9 && Math.abs(r.direction.y) < 0.1 && r.start.x > 100);

        // 30 deg vector: (0.866, 0.5)
        const hasFirstOrder = strongRays.some(r =>
            Math.abs(r.direction.x - 0.866) < 0.1 &&
            Math.abs(r.direction.y - 0.5) < 0.1 &&
            r.start.x > 100
        );

        expect(hasZeroOrder).toBe(true);
        expect(hasFirstOrder).toBe(true);
    });

});
