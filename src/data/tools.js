export const tools = [
    { id: 'laser', label: 'Laser Source', icon: '🔦', params: { power: 100, color: '#ff0000', label: 'Laser', polarization: 0 } },
    { id: 'mirror', label: 'Mirror', icon: '🪞' },
    { id: 'lens', label: 'Lens', icon: '🔍', params: { focalLength: 100, lensShape: 'convex' } },
    { id: 'beamsplitter', label: 'Beam Splitter', icon: '◪', params: { transmission: 0.5 } },
    { id: 'pbs', label: 'Polarizing BS', icon: '⬔', params: { pbsAxis: 0 } },
    { id: 'cavity', label: 'Optical Cavity', icon: '⟪⟫', params: { reflectivity: 0.95, cavityLength: 100 } },
    { id: 'hwp', label: 'Half-Wave Plate', icon: 'λ/2', params: { fastAxis: 0 } },
    { id: 'qwp', label: 'Quarter-Wave Plate', icon: 'λ/4', params: { fastAxis: 45 } },
    { id: 'polarizer', label: 'Polarizer', icon: '⟂', params: { polarizerAxis: 0 } },
    { id: 'iris', label: 'Iris', icon: '◎', params: { aperture: 20 } },
    { id: 'detector', label: 'Detector', icon: '📡' },
    { id: 'poldetector', label: 'Pol. Detector', icon: '📊', params: { showReadout: true } },
    { id: 'aom', label: 'AOM', icon: '🔮', params: { efficiency: 0.5, deviation: 5 } },
    { id: 'fiber', label: 'Fiber Coupler', icon: '🧶', params: { acceptanceAngle: 15 } },
    { id: 'text', label: 'Text Label', icon: '📝', params: { content: 'Label', fontSize: 16, textColor: '#ffffff' } },
    { id: 'vaporcell', label: 'Vapor Cell', icon: '🧪', params: { shape: 'cylindrical', element: 'Rb-87' } },
    { id: 'breadboard', label: 'Breadboard', icon: '▦', params: {} }
];
