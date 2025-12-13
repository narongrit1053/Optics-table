import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const tools = [
    { id: 'laser', label: 'Laser Source', icon: '🔦', params: { power: 100, color: '#ff0000', label: 'Laser' } },
    { id: 'mirror', label: 'Mirror', icon: '🪞' },
    { id: 'lens', label: 'Lens', icon: '🔍', params: { focalLength: 100, lensShape: 'convex' } },
    { id: 'beamsplitter', label: 'Beam Splitter', icon: '◪', params: { transmission: 0.5 } },
    { id: 'iris', label: 'Iris', icon: '◎', params: { aperture: 20 } },
    { id: 'detector', label: 'Detector', icon: '📡' },
    { id: 'aom', label: 'AOM', icon: '🔮', params: { efficiency: 0.5, deviation: 5 } },
    { id: 'fiber', label: 'Fiber Coupler', icon: '🧶', params: { acceptanceAngle: 15 } }
];

const Sidebar = ({ setComponents }) => {
    const [collapsed, setCollapsed] = useState(false);

    const addComponent = (type) => {
        const tool = tools.find(t => t.id === type);
        // Default params from tool definition or empty object
        const defaultParams = tool?.params || {};

        setComponents((prev) => [
            ...prev,
            {
                id: uuidv4(),
                type,
                position: { x: 400, y: 300 },
                rotation: type === 'mirror' || type === 'lens' || type === 'aom' || type === 'beamsplitter' || type === 'iris' ? 90 : 0,
                params: { ...defaultParams }
            },
        ]);
    };

    const handleDragStart = (e, type) => {
        e.dataTransfer.setData('componentType', type);
    };

    return (
        <div className={`overlay-panel sidebar-overlay ${collapsed ? 'collapsed' : ''}`}>
            <div className="panel-header">
                <span className="panel-title header" style={{ margin: 0 }}>Components</span>
                <button
                    className="collapse-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? "Expand" : "Collapse"}
                >
                    {collapsed ? '▶' : '◀'}
                </button>
            </div>

            <div className="overlay-content">
                {tools.map((item) => (
                    <div
                        key={item.id}
                        className="component-item"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onClick={() => addComponent(item.id)}
                        title="Drag to table or Click to add"
                    >
                        <span style={{ marginRight: '10px', fontSize: '1.2em' }}>{item.icon}</span>
                        {item.label}
                    </div>
                ))}

                <div className="header" style={{ marginTop: '2rem' }}>Controls</div>
                <div style={{ fontSize: '0.8rem', color: '#888', lineHeight: '1.6' }}>
                    • <b>Drag</b> items to add<br />
                    • <b>Click</b> items to add<br />
                    • <b>Right-click</b> to pan<br />
                    • <b>Scroll</b> to zoom
                </div>
            </div>

            {collapsed && (
                <div
                    className="collapsed-label"
                    onClick={() => setCollapsed(false)}
                    style={{ cursor: 'pointer' }}
                >
                    COMPONENTS
                </div>
            )}
        </div>
    );
};

export default Sidebar;
