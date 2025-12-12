export type Vector2D = {
    x: number;
    y: number;
};

export type ComponentType = 'laser' | 'mirror' | 'lens' | 'beamsplitter' | 'detector';

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
    };
}

export interface Ray {
    start: Vector2D;
    direction: Vector2D;
    intensity: number;
    color: string;
    path: Vector2D[]; // Points along the ray path
}
