import React, { useState, useEffect } from 'react';

const PropertiesPanel = ({ selectedCompId, components, setComponents }) => {
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
        ));
    };

    const updateRotation = (value) => {
        setComponents(prev => prev.map(c =>
            c.id === selectedCompId ? { ...c, rotation: parseFloat(value) } : c
        ));
    };

    const deleteComponent = () => {
        setComponents(prev => prev.filter(c => c.id !== selectedCompId));
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
                        <span style={{ fontWeight: 'bold' }}>{Math.round(selectedComp.rotation)}°</span>
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
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Power</label>
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={selectedComp.params?.power || 1}
                            onChange={(e) => updateParam('power', e.target.value)}
                            style={{ width: '100%' }}
                        />

                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', marginTop: '10px' }}>Color</label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={selectedComp.params?.color || '#ff0000'}
                                onChange={(e) => updateParam('color', e.target.value)}
                                style={{ width: '50px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.8em', color: '#aaa' }}>{selectedComp.params?.color || '#ff0000'}</span>
                        </div>
                    </div>
                )}

                {selectedComp.type === 'lens' && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>Focal Length</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="range"
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
