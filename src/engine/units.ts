export const PIXELS_PER_MM = 1.6; // 40px (1 grid) = 25mm

export const toMM = (pixels: number): number => pixels / PIXELS_PER_MM;
export const toPixels = (mm: number): number => mm * PIXELS_PER_MM;

export const DEFAULT_DIMENSIONS_MM = {
    laser: { length: 240, width: 95, height: 95 },
    mirror: { length: 10, width: 52.8, height: 52.8 }, // Thin mount, 25mm dia
    lens: { length: 25.4, width: 40, height: 50.2 },
    beamsplitter: { length: 12.7, width: 12.7, height: 12.7 }, // 1/2-inch cube approx
    aom: { length: 22.34, width: 50.76, height: 16 },
    detector: { length: 22.5, width: 50, height: 71 },
    fiber: { length: 20, width: 10, height: 10 },
    iris: { length: 5, width: 30, height: 30 },
    blocker: { length: 5, width: 30, height: 30 },
    cavity: { length: 100, width: 25, height: 25 }, // Variable length really
    text: { length: 50, width: 20, height: 0 },
    hwp: { length: 15.5, width: 50, height: 50 },
    qwp: { length: 15.5, width: 50, height: 50 },
    polarizer: { length: 15.5, width: 50, height: 50 },
    pbs: { length: 12.7, width: 12.7, height: 12.7 },
    poldetector: { length: 12, width: 12, height: 12 },
    vaporcell: { length: 108, width: 25, height: 25 },
    camera: { length: 15, width: 47.2, height: 47.2 }, // Default to CCD (Zelux)
    emccd: { length: 200, width: 150, height: 120 },
    breadboard: { length: 300, width: 300, height: 10 }
};
