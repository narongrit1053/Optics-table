# Optical Table Simulation

A web-based interactive optics experiment simulator. This project allows users to build and run optical setups using a variety of components like lasers, lenses, mirrors, and modulators, simulating the behavior of light using ray tracing.

## Features

*   **Interactive Sandbox**: Drag, drop, and rotate optical components.
*   **Real-time Ray Tracing**: Visualize beam paths, reflections, and refractions instantly.
*   **Advanced Components**: Includes Modulators (AOM), Fibers, and Polarization optics.
*   **Physics-based Simulation**: Approximates real-world optical behaviors.

## Physics Implementation vs. Real World

This simulation uses **Geometric Optics (Ray Tracing)** as its core engine. Below is a comparison of how different physical phenomena are handled in this simulation versus real-world physics.

| Phenomenon | Real Physics | Simulation Implementation |
| :--- | :--- | :--- |
| **Light Propagation** | Electromagnetic waves propagating through space (Wave Optics). Subject to diffraction and interference. | **Ray Optics**: Light travels in straight lines (rays) until it hits an object. Diffraction is generally ignored. |
| **Reflection** | Interaction of EM waves with conductive/dielectric boundaries. Phase shifts may occur. | **Vector Reflection**: Uses the law of reflection $\mathbf{R} = \mathbf{D} - 2(\mathbf{D} \cdot \mathbf{N})\mathbf{N}$. |
| **Refraction (Lenses)** | Change in phase velocity at interfaces (Snell's Law). Dispersion (wavelength dependence) occurs. | **Snell's Law**: Calculated at geometric boundaries. Constant refractive index (Air=1.0, Glass=1.5) assumed (no dispersion simulation). |
| **Polarization** | Vector nature of the E-field (Jones/Stokes vectors). Can be Elliptical, Circular, or Linear. | **Simplified Model**: Rays carry a polarization angle ($0^\circ-180^\circ$). HWP/QWP/Polarizers manipulate this angle. Circular polarization is approximated. |
| **Fiber Coupling** | Mode matching of the Gaussian beam profile to the fiber's fundamental mode (Overlap Integral). | ** Geometric & Gaussian Approximation**: Checks spatial overlap (core size) and angular acceptance (NA). Uses a Gaussian falloff for coupling efficiency based on angle. |
| **Acousto-Optic Modulator (AOM)** | Bragg diffraction from a sound wave grating. Frequency shifting and momentum conservation. | **Ray Splitting**: Splits ray into 0th and 1st order based on efficiency and deviation parameters. No frequency shift simulated. |
| **Interference** | Superposition of coherent waves. | **Not Simulated**: Rays intensities add up incoherently. No phase tracking for interference patterns. |

## Component Reference

### Light Sources
*   **Laser**: Emits a ray with defined power and color.

### Geometric Optics
*   **Mirror**: Reflects light 100% (ideal mirror).
*   **Lens**: Refracts light. Supports Convex, Concave, Plano-Convex, and Plano-Concave shapes. Handles Total Internal Reflection (TIR).
*   **Beam Splitter**: Splits light into transmitted and reflected paths (50/50).
*   **Iris / Blocker**: Blocks rays that hit the physical material. Iris aperture is adjustable.

### Polarization
*   **Polarizer**: Filters light using Malus's Law ($I \propto \cos^2\theta$).
*   **Half-Wave Plate (HWP)**: Rotates linear polarization by $2(\theta - \phi)$.
*   **Quarter-Wave Plate (QWP)**: Modeled to shift linear polarization axes (simplified).
*   **Polarizing Beam Splitter (PBS)**: Transmits p-polarization (horizontal) and reflects s-polarization (vertical).
*   **Polarization Detector**: Measures total intensity and detects polarization angle.

### Advanced
*   **AOM**: Deflects a portion of the beam (1st order) based on an efficiency parameter.
*   **Fiber Coupler**: Absorbs light if it enters the core within the acceptance angle. Displays coupling efficiency.
*   **Optical Cavity**: A pair of mirrors that traps light, simulating multiple bounces (ring-down).

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Run the development server**:
    ```bash
    npm run dev
    ```
3.  **Build for production**:
    ```bash
    npm run build
    ```

## Development

The core physics engine is located in `src/engine/raytracer.ts`. It runs a trace loop that:
1.  Takes a set of "pending rays" (starting with lasers).
2.  Intersects them with all components in the scene.
3.  Finds the closest hit.
4.  Calculates the interaction (reflect, refract, split, absorb).
5.  Adds new rays to the queue (e.g., reflection/transmission) and repeats up to `MAX_BOUNCES`.
