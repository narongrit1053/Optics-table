export const PIXELS_PER_MM = 1.6; // 40px (1 grid) = 25mm

export const toMM = (pixels: number): number => pixels / PIXELS_PER_MM;
export const toPixels = (mm: number): number => mm * PIXELS_PER_MM;

export const DEFAULT_DIMENSIONS_MM = {
    laser: { length: 50, width: 25, height: 25 },
    mirror: { length: 6, width: 25, height: 25 }, // Thin mount, 25mm dia
    lens: { length: 6, width: 25, height: 25 },
    beamsplitter: { length: 30, width: 30, height: 30 }, // 1-inch cube approx
    aom: { length: 30, width: 15, height: 15 },
    detector: { length: 12, width: 12, height: 12 },
    fiber: { length: 20, width: 10, height: 10 },
    iris: { length: 5, width: 30, height: 30 },
    blocker: { length: 5, width: 30, height: 30 },
    cavity: { length: 100, width: 25, height: 25 }, // Variable length really
    text: { length: 50, width: 20, height: 0 },
    hwp: { length: 6, width: 25, height: 25 },
    qwp: { length: 6, width: 25, height: 25 },
    polarizer: { length: 6, width: 25, height: 25 },
    pbs: { length: 30, width: 30, height: 30 },
    poldetector: { length: 12, width: 12, height: 12 },
    breadboard: { length: 300, width: 300, height: 10 }
};
