import React, { useState, useEffect } from 'react';

const PropertiesPanel = ({ selectedCompId, components, setComponents, saveCheckpoint }) => {
    const [collapsed, setCollapsed] = useState(false);
    const selectedComp = components.find(c => c.id === selectedCompId);

    // Auto-expand when a component is selected
    useEffect(() => {
        if (selectedCompId) {
            setCollapsed(false);
        }
    }, [selectedCompId]);

    const updateParam = (key, value) => {
        const isNumeric = !isNaN(parseFloat(value)) && isFinite(value) && !value.startsWith('#');
        const finalValue = isNumeric ? parseFloat(value) : value;

        setComponents(prev => prev.map(c =>
            c.id === selectedCompId ? { ...c, params: { ...c.params, [key]: finalValue } } : c
        ), false); // Transient update
    };

    const updateRotation = (value) => {
        setComponents(prev => prev.map(c =>
            c.id === selectedCompId ? { ...c, rotation: parseFloat(value) } : c
        ), false);
    };

    const deleteComponent = () => {
        setComponents(prev => prev.filter(c => c.id !== selectedCompId), true); // Commit delete
    };

    if (!selectedComp) {
        return (
            <div className={`overlay-panel properties-overlay ${collapsed ? 'collapsed' : ''}`}>
                <div className="panel-header">
                    <span className="panel-title header" style={{ margin: 0 }}>Properties</span>
                    <button
                        className="collapse-btn"
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? "Expand" : "Collapse"}
                    >
                        {collapsed ? '◀' : '▶'}
                    </button>
                </div>
                <div className="overlay-content">
                    <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Select a component</div>
                </div>
                {collapsed && (
                    <div className="collapsed-label" onClick={() => setCollapsed(false)} style={{ cursor: 'pointer' }}>PROPS</div>
                )}
            </div>
        );
    }

    return (
        <div className={`overlay-panel properties-overlay ${collapsed ? 'collapsed' : ''}`}>
            <div className="panel-header">
                <span className="panel-title header" style={{ margin: 0 }}>{selectedComp.type.toUpperCase()}</span>
                <button
                    className="collapse-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? "Expand" : "Collapse"}
                >
                    {collapsed ? '◀' : '▶'}
                </button>
            </div>

            <div className="overlay-content">
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Rotation</label>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px' }}>
                        <button
                            onClick={() => updateRotation((selectedComp.rotation - 45 + 360) % 360)}
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', borderRadius: '4px', width: '30px', cursor: 'pointer' }}
                        >
                            ↺
                        </button>
                        <input
                            type="number"
                            onFocus={saveCheckpoint}
                            value={Math.round(selectedComp.rotation)}
                            onChange={(e) => updateRotation(e.target.value)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-main)',
                                width: '50px',
                                textAlign: 'center',
                                fontWeight: 'bold'
                            }}
                        />
                        <button
                            onClick={() => updateRotation((selectedComp.rotation + 45) % 360)}
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', borderRadius: '4px', width: '30px', cursor: 'pointer' }}
                        >
                            ↻
                        </button>
                    </div>
                </div>

                {selectedComp.type === 'laser' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Label</label>
                        <input
                            type="text"
                            onFocus={saveCheckpoint}
                            value={selectedComp.params?.label || ''}
                            onChange={(e) => updateParam('label', e.target.value)}
                            placeholder="Optional text..."
                            style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Power (Total) [mW]</label>
                        <input
                            type="range"
                            onMouseDown={saveCheckpoint}
                            min="0"
                            max="2"
                            step="0.1"
                            value={selectedComp.params?.brightness ?? 1}
                            onChange={(e) => updateParam('brightness', e.target.value)}
                            style={{ width: '100%' }}
                        />

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '5px' }}>Beam Diameter (µm)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="100"
                                max="5000"
                                step="100"
                                value={selectedComp.params?.w0_um ?? 2000} // Default 2mm
                                onChange={(e) => updateParam('w0_um', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.w0_um ?? 2000}
                            </span>
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Color</label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="color"
                                onFocus={saveCheckpoint}
                                value={selectedComp.params?.color || '#ff0000'}
                                onChange={(e) => updateParam('color', e.target.value)}
                                style={{ width: '50px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.8em', color: '#aaa' }}>{selectedComp.params?.color || '#ff0000'}</span>
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Polarization Angle</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="180"
                                step="1"
                                value={selectedComp.params?.polarization ?? 0}
                                onChange={(e) => updateParam('polarization', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.polarization ?? 0}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            0° = Horizontal, 90° = Vertical
                        </div>
                    </div>
                )}

                {selectedComp.type === 'hwp' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Fast Axis Angle</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="180"
                                step="1"
                                value={selectedComp.params?.fastAxis ?? 0}
                                onChange={(e) => updateParam('fastAxis', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.fastAxis ?? 0}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            Rotates polarization by 2×(fast axis - input)
                        </div>
                    </div>
                )}

                {selectedComp.type === 'qwp' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Fast Axis Angle</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="180"
                                step="1"
                                value={selectedComp.params?.fastAxis ?? 45}
                                onChange={(e) => updateParam('fastAxis', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.fastAxis ?? 45}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            Converts linear ↔ circular polarization
                        </div>
                    </div>
                )}

                {selectedComp.type === 'polarizer' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Polarizer Axis</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="180"
                                step="1"
                                value={selectedComp.params?.polarizerAxis ?? 0}
                                onChange={(e) => updateParam('polarizerAxis', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.polarizerAxis ?? 0}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            I = I₀ cos²(θ) - Malus's Law
                        </div>
                    </div>
                )}

                {selectedComp.type === 'pbs' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>PBS Axis (p-pol transmission)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="180"
                                step="1"
                                value={selectedComp.params?.pbsAxis ?? 0}
                                onChange={(e) => updateParam('pbsAxis', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.pbsAxis ?? 0}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            p-pol (aligned) transmits, s-pol (⊥) reflects
                        </div>
                    </div>
                )}

                {selectedComp.type === 'poldetector' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={selectedComp.params?.showReadout ?? true}
                                onChange={(e) => updateParam('showReadout', e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            Show Readout
                        </label>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '8px' }}>
                            Displays intensity (I) and polarization angle (θ)
                        </div>
                    </div>
                )}

                {selectedComp.type === 'fiber' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Acceptance Angle (NA Half-Angle)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="1"
                                max="45"
                                step="1"
                                value={selectedComp.params?.acceptanceAngle || 15}
                                onChange={(e) => updateParam('acceptanceAngle', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.acceptanceAngle || 15}°
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            Angular acceptance (Gaussian falloff)
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '12px' }}>Core Size (Mode Field)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="4"
                                max="24"
                                step="2"
                                value={selectedComp.params?.coreSize || 12}
                                onChange={(e) => updateParam('coreSize', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.coreSize || 12}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            Spatial filtering diameter
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em', marginTop: '12px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={selectedComp.params?.showReadout ?? true}
                                onChange={(e) => updateParam('showReadout', e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            Show Power Readout
                        </label>
                    </div>
                )}

                {selectedComp.type === 'detector' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={selectedComp.params?.showReadout ?? true}
                                onChange={(e) => updateParam('showReadout', e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            Show Power Readout
                        </label>
                    </div>
                )}

                {selectedComp.type === 'iris' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Aperture Diameter</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="32"
                                step="1"
                                value={selectedComp.params?.aperture ?? 20}
                                onChange={(e) => updateParam('aperture', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.aperture ?? 20}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            0 = closed, 32 = fully open
                        </div>
                    </div>
                )}

                {selectedComp.type === 'cavity' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Reflectivity</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0.5"
                                max="0.99"
                                step="0.01"
                                value={selectedComp.params?.reflectivity ?? 0.95}
                                onChange={(e) => updateParam('reflectivity', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '45px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {Math.round((selectedComp.params?.reflectivity ?? 0.95) * 100)}%
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '3px' }}>
                            Mirror reflectivity (higher = more bounces)
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '12px' }}>Cavity Length</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="40"
                                max="200"
                                step="10"
                                value={selectedComp.params?.cavityLength ?? 100}
                                onChange={(e) => updateParam('cavityLength', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '45px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.cavityLength ?? 100}
                            </span>
                        </div>
                    </div>
                )}

                {selectedComp.type === 'text' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Text Content</label>
                        <input
                            type="text"
                            onFocus={saveCheckpoint}
                            value={selectedComp.params?.content || ''}
                            onChange={(e) => updateParam('content', e.target.value)}
                            placeholder="Enter text..."
                            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '12px' }}>Font Size</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="8"
                                max="48"
                                step="2"
                                value={selectedComp.params?.fontSize ?? 16}
                                onChange={(e) => updateParam('fontSize', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.fontSize ?? 16}px
                            </span>
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '12px' }}>Text Color</label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="color"
                                onFocus={saveCheckpoint}
                                value={selectedComp.params?.textColor || '#ffffff'}
                                onChange={(e) => updateParam('textColor', e.target.value)}
                                style={{ width: '50px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.8em', color: '#aaa' }}>{selectedComp.params?.textColor || '#ffffff'}</span>
                        </div>
                    </div>
                )}

                {selectedComp.type === 'lens' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Shape</label>
                        <select
                            value={selectedComp.params?.lensShape || 'convex'}
                            onChange={(e) => updateParam('lensShape', e.target.value)}
                            style={{
                                width: '100%',
                                background: 'var(--bg-main)',
                                color: 'var(--text-main)',
                                border: '1px solid var(--border)',
                                padding: '4px',
                                borderRadius: '4px',
                                marginBottom: '10px'
                            }}
                        >
                            <option value="convex">Biconvex (Converging)</option>
                            <option value="concave">Biconcave (Diverging)</option>
                            <option value="plano-convex">Plano-Convex</option>
                            <option value="plano-concave">Plano-Concave</option>
                        </select>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Focal Length / Power</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="50"
                                max="300"
                                step="10"
                                value={selectedComp.params?.focalLength || 100}
                                onChange={(e) => updateParam('focalLength', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.focalLength || 100}
                            </span>
                        </div>
                    </div>
                )}

                {selectedComp.type === 'beamsplitter' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Transmission Ratio</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="1"
                                step="0.1"
                                value={selectedComp.params?.transmission ?? 0.5}
                                onChange={(e) => updateParam('transmission', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.transmission ?? 0.5}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.8em', color: '#888', marginTop: '5px' }}>
                            0 = Mirror | 1 = Glass
                        </div>
                    </div>
                )}

                {selectedComp.type === 'aom' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>RF Power (Efficiency)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0"
                                max="1"
                                step="0.05"
                                value={selectedComp.params?.efficiency ?? 0.5}
                                onChange={(e) => updateParam('efficiency', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {Math.round((selectedComp.params?.efficiency ?? 0.5) * 100)}%
                            </span>
                        </div>

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Deviation Angle</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="-15"
                                max="15"
                                step="1"
                                value={selectedComp.params?.deviation ?? 5}
                                onChange={(e) => updateParam('deviation', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.deviation ?? 5}°
                            </span>
                        </div>
                    </div>
                )}

                <button
                    onClick={deleteComponent}
                    style={{ width: '100%', marginTop: '2rem', borderColor: '#ff0055', color: '#ff0055', background: 'transparent' }}
                >
                    Remove
                </button>
            </div>

            {collapsed && (
                <div
                    className="collapsed-label"
                    onClick={() => setCollapsed(false)}
                    style={{ cursor: 'pointer' }}
                >
                    PROPS
                </div>
            )}
        </div>
    );
};

export default PropertiesPanel;
