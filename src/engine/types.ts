export type Vector2D = {
    x: number;
    y: number;
};

export type Complex = {
    re: number;
    im: number;
};

export type JonesVector = {
    ex: Complex;
    ey: Complex;
};

export type ComponentType = 'laser' | 'mirror' | 'lens' | 'beamsplitter' | 'detector' | 'aom' | 'fiber' | 'blocker' | 'iris' | 'cavity' | 'text' | 'hwp' | 'qwp' | 'polarizer' | 'pbs' | 'poldetector' | 'breadboard';

export interface OpticalComponent {
    id: string;
    type: ComponentType;
    position: Vector2D;
    rotation: number; // Degrees
    params?: {
        power?: number;
        profile?: 'simple' | 'gaussian'; // Beam profile
        beamDiameter?: number; // Beam width parameter
        color?: string; // Hex color for laser
        focalLength?: number; // For lens
        transmission?: number; // For beam splitter
        width?: number; // Physical dimensions
        height?: number;
        label?: string; // Text label
        brightness?: number; // Core beam intensity
        w0_um?: number; // Laser beam diameter in microns
        glow?: number; // Side beam intensity (Legacy, removed from UI)
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
        catalogId?: string; // ID from Thorlabs catalog (e.g., 'KM100')
        physicalDim?: {
            length: number;
            width: number;
            height: number;
        };
    };
}

export interface GaussianParams {
    w0: number; // Beam waist radius
    z: number;  // Distance from waist (z position)
    zR: number; // Rayleigh range
    wavelength: number;
}

export interface Ray {
    start: Vector2D;
    direction: Vector2D;
    intensity: number;
    color: string;
    path: Vector2D[]; // Points along the ray path
    polarization: JonesVector; // Jones Vector for full state
    gaussian?: GaussianParams; // Initial gaussian param (for PendingRay)
    renderAsGaussian?: boolean; // Flag to force Gaussian rendering (Polygon vs Polyline)
    gaussianParamsList: GaussianParams[]; // Parameters for each segment (length = path.length - 1)
}

export interface PendingRay {
    origin: Vector2D;
    dir: Vector2D;
    intensity: number;
    color: string;
    bounces: number;
    polarization: JonesVector;
    gaussian: GaussianParams; // Now required or we handle optional? Raytracer assumes it exists.
    renderAsGaussian?: boolean;
}

// Force re-index
