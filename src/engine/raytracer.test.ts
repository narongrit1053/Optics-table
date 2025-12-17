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
            params: { power: 1, color: 'red', glow: 0 }
        }];

        const { rays } = calculateRays(components);

        // Should have 1 ray (Core only, since glow=0)
        expect(rays.length).toBe(1);

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
                params: { power: 1, color: 'red', glow: 0 }
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
                params: { power: 1, glow: 0 }
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
                params: { power: 1, glow: 0 }
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
        expect(hits['det1']).toBeCloseTo(1.0, 1);
    });

    it('should split beam at AOM (0th and 1st order)', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 0,
                params: { power: 1, glow: 0 }
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

    it('should diverge beam with concave lens', () => {
        const lens: OpticalComponent = {
            id: 'lens1',
            type: 'lens',
            position: { x: 100, y: 0 },
            rotation: 0,
            params: { lensShape: 'concave', focalLength: 50 }
        };
        // Laser offset from axis to see divergence
        const laser: OpticalComponent = {
            id: 'laser1',
            type: 'laser',
            position: { x: 0, y: 10 },
            rotation: 0,
            params: { brightness: 1, glow: 0 }
        };

        const result = calculateRays([laser, lens]);
        const centerRay = result.rays.find(r => r.start.y === 10);

        if (!centerRay) throw new Error('No ray found');

        const path = centerRay.path;
        expect(path.length).toBeGreaterThan(2);

        const lastPoint = path[path.length - 1];
        const prevPoint = path[path.length - 2];

        // Slope = dy/dx
        const slope = (lastPoint.y - prevPoint.y) / (lastPoint.x - prevPoint.x);

        // Initial ray is horizontal (Slope 0).
        // Diverging lens: Ray at y=10 should bend UP (Slope > 0).
        // Standard Diverging lens behavior.
        expect(slope).toBeGreaterThan(0.01);
    });
    it('should couple light into fiber based on angle', () => {
        const fiber: OpticalComponent = {
            id: 'fib1',
            type: 'fiber',
            position: { x: 200, y: 0 },
            // At rotation=0, fiber normal points LEFT (-1,0) to face incoming light
            // Laser shoots RIGHT (1,0), so it hits the front of the fiber
            rotation: 0,
            params: { acceptanceAngle: 30, coreSize: 24 } // Large core to not block center ray
        };

        const laser: OpticalComponent = {
            id: 'laser1',
            type: 'laser',
            position: { x: 0, y: 0 },
            rotation: 0,
            params: { power: 1, brightness: 1, glow: 0 }
        };

        // Case 1: Perfect Alignment (0 deg incidence) - should get ~1.0 (Gaussian peak)
        const res1 = calculateRays([laser, fiber]);
        const eff1 = res1.hits['fib1'];
        expect(eff1).toBeCloseTo(1, 1);

        // Case 2: Angled Incidence (Rotate Fiber by 15 deg)
        // This tilts the fiber's acceptance cone away from the incoming light
        fiber.rotation = 15;
        const res2 = calculateRays([laser, fiber]);
        const eff2 = res2.hits['fib1'];

        // Gaussian efficiency at 15 deg with acceptance 30:
        // sigma = 30 / 2.355 ≈ 12.74
        // exp(-(15^2)/(2*12.74^2)) = exp(-225/324.6) ≈ 0.5
        expect(eff2).toBeGreaterThan(0.4);
        expect(eff2).toBeLessThan(0.7);

        // Case 3: Outside Acceptance (> 30 deg)
        fiber.rotation = 45; // 45 deg
        const res3 = calculateRays([laser, fiber]);
        const eff3 = res3.hits['fib1'] || 0;

        // At 45 deg, Gaussian ≈ 0.04 which is very low
        expect(eff3).toBeLessThan(0.1);
    });

    it('should block rays with iris aperture', () => {
        const iris: OpticalComponent = {
            id: 'iris1',
            type: 'iris',
            position: { x: 100, y: 0 },
            rotation: 0,
            params: { aperture: 10 } // Radius 5
        };
        const laserCenter: OpticalComponent = {
            id: 'l1', type: 'laser', position: { x: 0, y: 0 }, rotation: 0, params: { power: 1, glow: 0 }
        };
        const laserEdge: OpticalComponent = {
            id: 'l2', type: 'laser', position: { x: 0, y: 6 }, rotation: 0, params: { power: 1, glow: 0 }
        }; // y=6 is outside radius 5 (Aperture 10)

        // Center ray should pass (NOT hit iris? Or hit and pass transparently?)
        // Implementation: "Do not update minT -> Ignore hit". 
        // So ray should continue to infinity (Length > 200).
        // Or hit something else.

        const res1 = calculateRays([laserCenter, iris]);
        const path1 = res1.rays[0].path;
        // Should ignore iris. Path length 2 (Start, End).
        // If it hit iris as blocker, it would stop at x=100.
        expect(path1[path1.length - 1].x).toBeGreaterThan(150);

        // Edge ray should block.
        const res2 = calculateRays([laserEdge, iris]);
        const path2 = res2.rays[0].path;
        // Should stop at x=100.
        // Wait, Raytracer logic: `closestHit = { ... type: 'blocker' }`.
        // So path ends at hit point.
        expect(path2[path2.length - 1].x).toBeCloseTo(100, 0);
    });


    it('should rotate polarization with laser body', () => {
        const components: OpticalComponent[] = [
            {
                id: 'laser1',
                type: 'laser',
                position: { x: 0, y: 0 },
                rotation: 30, // Rotated 30 deg
                params: { power: 1, polarization: 0 } // Horizontal relative to body
            },
            {
                id: 'det1',
                type: 'poldetector',
                position: { x: 100, y: 50 }, // Positioned to catch ray (approx direction)
                // Actually ray goes at 30 deg. (0,0) -> (cos30*L, sin30*L)
                // Let's use a large detector or exact position
                rotation: 0,
                params: {}
            }
        ];

        // Use a wide detector or exact calculation
        // Ray dir: (0.866, 0.5)
        // At 200 units: (173, 100).
        components[1].position = { x: 173.2, y: 100 };
        components[1].rotation = 30; // Face the laser

        const { hits } = calculateRays(components);

        // Polarization should be 30 deg relative to global H
        const angle = hits['det1_pol'];

        expect(angle).toBeDefined();
        expect(angle).toBeCloseTo(30, 0);
    });



});
