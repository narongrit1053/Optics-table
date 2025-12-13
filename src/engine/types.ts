export type Vector2D = {
    x: number;
    y: number;
};

export type ComponentType = 'laser' | 'mirror' | 'lens' | 'beamsplitter' | 'detector' | 'aom' | 'fiber' | 'blocker' | 'iris' | 'cavity' | 'text' | 'hwp' | 'qwp' | 'polarizer' | 'pbs' | 'poldetector';

export interface OpticalComponent {
    id: string;
    type: ComponentType;
    position: Vector2D;
    rotation: number; // Degrees
    params?: {
        power?: number;
        color?: string; // Hex color for laser
        focalLength?: number; // For lens
        transmission?: number; // For beam splitter
        width?: number; // Physical dimensions
        height?: number;
        label?: string; // Text label
        brightness?: number; // Core beam intensity
        glow?: number; // Side beam intensity
        efficiency?: number; // AOM diffraction efficiency (0-1)
        deviation?: number; // AOM deflection angle (degrees)
        lensShape?: 'convex' | 'concave' | 'plano-convex' | 'plano-concave'; // Lens geometry
        acceptanceAngle?: number; // Fiber NA equivalent (degrees)
        coreSize?: number; // Fiber core/mode field diameter for spatial filtering
        aperture?: number; // Iris aperture diameter
        showReadout?: boolean; // Show power readout on detector/fiber
        // Cavity parameters
        reflectivity?: number; // Mirror reflectivity (0-1)
        cavityLength?: number; // Distance between mirrors
        // Text annotation parameters
        content?: string; // Text content
        fontSize?: number; // Font size
        textColor?: string; // Text color
        // Polarization parameters
        polarization?: number; // Polarization angle in degrees (0=H, 90=V)
        fastAxis?: number; // Waveplate fast axis angle (degrees)
        polarizerAxis?: number; // Polarizer transmission axis (degrees)
        pbsAxis?: number; // PBS splitting axis (degrees, 0=H transmitted)
    };
}

export interface Ray {
    start: Vector2D;
    direction: Vector2D;
    intensity: number;
    color: string;
    path: Vector2D[]; // Points along the ray path
    polarization?: number; // Polarization angle in degrees (0=H, 90=V, undefined=unpolarized)
}

