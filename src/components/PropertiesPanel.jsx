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
                    <div style={{ color: '#555', fontStyle: 'italic' }}>Select a component</div>
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
                            style={{ background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', width: '30px', cursor: 'pointer' }}
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
                                color: '#fff',
                                width: '50px',
                                textAlign: 'center',
                                fontWeight: 'bold'
                            }}
                        />
                        <button
                            onClick={() => updateRotation((selectedComp.rotation + 45) % 360)}
                            style={{ background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', width: '30px', cursor: 'pointer' }}
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
                            style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff' }}
                        />

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Power (Brightness)</label>
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

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '5px' }}>Glow (Side Rays)</label>
                        <input
                            type="range"
                            onMouseDown={saveCheckpoint}
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedComp.params?.glow ?? 0.4}
                            onChange={(e) => updateParam('glow', e.target.value)}
                            style={{ width: '100%' }}
                        />

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
                    </div>
                )}

                {selectedComp.type === 'fiber' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Acceptance Angle (Half-Angle)</label>
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
                    </div>
                )}

                {selectedComp.type === 'iris' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Aperture Size</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
                                onMouseDown={saveCheckpoint}
                                min="0" // Fully closed
                                max="40" // Fully open (assuming height 40)
                                step="1"
                                value={selectedComp.params?.aperture ?? 20} // Default 20
                                onChange={(e) => updateParam('aperture', e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.9rem' }}>
                                {selectedComp.params?.aperture ?? 20}px
                            </span>
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
                                background: '#222',
                                color: '#fff',
                                border: '1px solid #555',
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
