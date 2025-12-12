import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const COMPONENT_TYPES = [
    { type: 'laser', label: 'Laser Source', icon: '🔦' },
    { type: 'mirror', label: 'Mirror', icon: '🪞' },
    { type: 'beamsplitter', label: 'Beam Splitter', icon: '◫' },
    { type: 'lens', label: 'Lens', icon: '🔍' },
    { type: 'detector', label: 'Detector', icon: '📡' },
    { type: 'aom', label: 'AOM', icon: '⚡' },
];

const Sidebar = ({ setComponents }) => {
    const [collapsed, setCollapsed] = useState(false);

    const addComponent = (type) => {
        const defaultParams = {
            power: 1,
            color: type === 'laser' ? '#ff0000' : undefined,
            focalLength: type === 'lens' ? 100 : undefined,
            transmission: type === 'beamsplitter' ? 0.5 : undefined,
        };

        setComponents((prev) => [
            ...prev,
            {
                id: uuidv4(),
                type,
                position: { x: 400, y: 300 },
                rotation: type === 'mirror' || type === 'lens' ? 90 : 0,
                params: defaultParams
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
                {COMPONENT_TYPES.map((item) => (
                    <div
                        key={item.type}
                        className="component-item"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.type)}
                        onClick={() => addComponent(item.type)}
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
