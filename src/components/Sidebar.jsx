import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { tools } from '../data/tools';

const Sidebar = ({ setComponents, toggleTheme, theme }) => {
    // Fixed sidebar (not collapsible)

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
                rotation: ['mirror', 'lens', 'aom', 'beamsplitter', 'iris', 'cavity', 'hwp', 'qwp', 'polarizer', 'pbs'].includes(type) ? 90 : 0,
                params: { ...defaultParams }
            },
        ]);
    };

    const handleDragStart = (e, type) => {
        e.dataTransfer.setData('componentType', type);
    };

    return (
        <div className="sidebar-panel">
            <div className="panel-header">
                <span className="panel-title header" style={{ margin: 0 }}>Components</span>
                <button
                    className="collapse-btn"
                    onClick={toggleTheme}
                    title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                    style={{ marginRight: '8px' }}
                >
                    {theme === 'light' ? '🌙' : '☀️'}
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
                    • <b>Scroll</b> to zoom (Shift+Scroll to pan)
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
