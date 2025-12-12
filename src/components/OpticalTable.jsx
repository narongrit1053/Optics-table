import React, { useState, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { calculateRays } from '../engine/raytracer';

const GRID_SIZE = 20;

const OpticalTable = ({ components, setComponents, onSelect }) => {
    const [viewBox, setViewBox] = useState({ x: -1000, y: -500, w: 2000, h: 1000 });
    const [isPanning, setIsPanning] = useState(false);
    const [draggedCompId, setDraggedCompId] = useState(null);
    const [snapToGrid, setSnapToGrid] = useState(true); // Default to on
    const lastMousePos = useRef({ x: 0, y: 0 });
    const svgRef = useRef(null);

    // Calculate Rays
    const { rays, hits } = useMemo(() => calculateRays(components), [components]);

    // --- View Navigation (Pan/Zoom) ---
    const handleWheel = (e) => {
        e.preventDefault();
        const zoomFactor = 1.05;
        const direction = e.deltaY > 0 ? 1 : -1;
        if (!svgRef.current) return;

        const point = svgRef.current.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svgRef.current.getScreenCTM().inverse());

        const newW = direction > 0 ? viewBox.w * zoomFactor : viewBox.w / zoomFactor;
        const newH = direction > 0 ? viewBox.h * zoomFactor : viewBox.h / zoomFactor;

        const newX = svgPoint.x - (svgPoint.x - viewBox.x) * (newW / viewBox.w);
        const newY = svgPoint.y - (svgPoint.y - viewBox.y) * (newH / viewBox.h);

        setViewBox({ x: newX, y: newY, w: newW, h: newH });
    };

    const handleMouseDown = (e) => {
        // If clicking on background (not a component), start panning
        e.preventDefault(); // Prevent text selection on background drag
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        onSelect(null); // Deselect when clicking background
    };

    const handleMouseMove = (e) => {
        // e.preventDefault(); // Can interfere with other interactions, use sparingly
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;

        if (isPanning) {
            if (!svgRef.current) return;
            const clientW = svgRef.current.clientWidth;
            const scale = viewBox.w / clientW;
            setViewBox(prev => ({ ...prev, x: prev.x - dx * scale, y: prev.y - dy * scale }));
        }

        if (draggedCompId) {
            if (!svgRef.current) return;
            const scale = viewBox.w / svgRef.current.clientWidth;
            // Calculate delta in SVG coordinates
            const svgDx = dx * scale;
            const svgDy = dy * scale;

            setComponents(prev => prev.map(c => {
                if (c.id === draggedCompId) {
                    const rawX = c.position.x + svgDx;
                    const rawY = c.position.y + svgDy;

                    if (snapToGrid) {
                        const snappedX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
                        const snappedY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
                        return { ...c, position: { x: snappedX, y: snappedY } };
                    } else {
                        return { ...c, position: { x: rawX, y: rawY } };
                    }
                }
                return c;
            }));
        }

        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        setDraggedCompId(null);
    };

    // --- Drag and Drop (New Components) ---
    const handleDragOver = (e) => e.preventDefault();

    const handleDrop = (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('componentType');
        if (!type || !svgRef.current) return;

        const point = svgRef.current.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svgRef.current.getScreenCTM().inverse());

        const defaultParams = {
            power: 1,
            color: type === 'laser' ? '#ff0000' : undefined,
            focalLength: type === 'lens' ? 100 : undefined,
            transmission: type === 'beamsplitter' ? 0.5 : undefined,
        };

        const finalX = snapToGrid ? Math.round(svgPoint.x / GRID_SIZE) * GRID_SIZE : svgPoint.x;
        const finalY = snapToGrid ? Math.round(svgPoint.y / GRID_SIZE) * GRID_SIZE : svgPoint.y;

        const newComp = {
            id: uuidv4(),
            type,
            position: {
                x: finalX,
                y: finalY
            },
            rotation: type === 'mirror' || type === 'lens' ? 90 : 0,
            params: defaultParams
        };

        setComponents(prev => [...prev, newComp]);
        onSelect(newComp.id);
    };

    // --- Component Interactions ---
    const handleCompMouseDown = (e, id) => {
        e.stopPropagation(); // Stop background pan
        e.preventDefault();  // Stop native drag/select
        setDraggedCompId(id);
        onSelect(id);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const resetView = () => {
        setViewBox({ x: -1000, y: -500, w: 2000, h: 1000 });
    };

    return (
        <div
            className="main-stage"
            style={{
                width: '100%',
                height: '100%',
                cursor: isPanning ? 'grabbing' : (draggedCompId ? 'grabbing' : 'default'),
                position: 'relative',
                userSelect: 'none',       // Prevent text selection
                WebkitUserSelect: 'none', // Safari
                MozUserSelect: 'none',    // Firefox
                msUserSelect: 'none'      // IE/Edge
            }}
        >
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                preserveAspectRatio="xMidYMid slice"
                style={{ touchAction: 'none' }} // Prevent touch scrolling gestures
            >
                <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    </pattern>
                    <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                        <rect width="100" height="100" fill="url(#grid)" />
                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                    </pattern>
                    {/* Laser Glow Filter - Tighter glow to prevent disappearing lines */}
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Infinite Background Grid */}
                <rect
                    x={viewBox.x - viewBox.w}
                    y={viewBox.y - viewBox.h}
                    width={viewBox.w * 3}
                    height={viewBox.h * 3}
                    fill="url(#grid-large)"
                />

                {/* Center Marker */}
                <path d="M -10 0 L 10 0 M 0 -10 L 0 10" stroke="#00ff9d" strokeWidth="2" strokeOpacity="0.5" />

                {/* Draw Rays */}
                {rays.map((ray, i) => (
                    <polyline
                        key={`ray-${i}`}
                        points={ray.path.map(p => `${p.x},${p.y}`).join(' ')}
                        stroke={ray.color || 'red'}
                        strokeWidth="4"
                        fill="none"
                        opacity={ray.intensity}
                        strokeLinecap="round"
                    />
                ))}

                {/* Draw Components */}
                {components.map(comp => (
                    <g
                        key={comp.id}
                        transform={`translate(${comp.position.x}, ${comp.position.y}) rotate(${comp.rotation})`}
                        onMouseDown={(e) => handleCompMouseDown(e, comp.id)}
                        style={{ cursor: draggedCompId === comp.id ? 'grabbing' : 'grab' }}
                        className="component-group"
                    >
                        {/* Component Visuals */}
                        {comp.type === 'laser' && (
                            <g>
                                {/* Laser Body */}
                                <rect x="-20" y="-10" width="40" height="20" rx="2" fill="#333" stroke="#555" strokeWidth="1" />
                                {/* Aperture / Front */}
                                <rect x="18" y="-4" width="4" height="8" fill={comp.params?.color || 'red'} />
                                {/* Label/Icon */}
                                {/* Label/Icon */}
                                {comp.params?.label ? (
                                    <text
                                        x="0"
                                        y="4"
                                        fontSize="10"
                                        fill="#fff"
                                        textAnchor="middle"
                                        fontWeight="bold"
                                        style={{ userSelect: 'none', pointerEvents: 'none', textShadow: '0 0 2px black' }}
                                    >
                                        {comp.params.label}
                                    </text>
                                ) : (
                                    <text x="-5" y="5" fontSize="10" fill="#888" style={{ userSelect: 'none', pointerEvents: 'none' }}>🔦</text>
                                )}
                            </g>
                        )}

                        {comp.type === 'mirror' && (
                            <g>
                                {/* Glass/Reflective Surface */}
                                <rect x="-2" y="-25" width="4" height="50" fill="#aaccff" fillOpacity="0.4" stroke="#aaccff" strokeWidth="1" />
                                {/* Backing/Silver */}
                                <line x1="0" y1="-25" x2="0" y2="25" stroke="silver" strokeWidth="2" />
                            </g>
                        )}

                        {comp.type === 'lens' && (
                            <g>
                                {/* Hit Area (Transparent) */}
                                <rect x="-15" y="-30" width="30" height="60" fill="transparent" stroke="none" />
                                {/* Lens Glass Body (Biconvex) */}
                                {/* Draws two arcs meeting at top and bottom points (0, -30) and (0, 30) */}
                                <path
                                    d="M 0 -30 Q 15 0 0 30 Q -15 0 0 -30"
                                    fill="rgba(100, 200, 255, 0.3)"
                                    stroke="rgba(100, 200, 255, 0.8)"
                                    strokeWidth="1"
                                />
                            </g>
                        )}

                        {comp.type === 'beamsplitter' && (
                            <g>
                                {/* Glass Cube Body */}
                                <rect x="-15" y="-15" width="30" height="30" fill="rgba(200, 220, 255, 0.3)" stroke="rgba(200, 220, 255, 0.6)" strokeWidth="1" />
                                {/* Diagonal Splitter Surface (Bottom-Left to Top-Right) */}
                                <line x1="-15" y1="15" x2="15" y2="-15" stroke="silver" strokeWidth="2" strokeDasharray="2,1" />
                            </g>
                        )}

                        {comp.type === 'detector' && (
                            <g>
                                {/* Sensor Body */}
                                <rect x="-5" y="-20" width="10" height="40" fill="#222" stroke="#555" strokeWidth="1" />
                                {/* Active Area */}
                                <rect x="-5" y="-18" width="4" height="36" fill="#111" />
                                {/* Readout Overlay (always horizontal) */}
                                <g transform={`rotate(${-comp.rotation}) translate(15, 0)`}>
                                    <rect x="-5" y="-10" width="45" height="20" rx="4" fill="rgba(0,0,0,0.8)" stroke="#555" />
                                    <text x="17" y="4" fill="#0f0" fontSize="10" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                                        {(hits[comp.id] || 0).toFixed(2)}
                                    </text>
                                </g>
                            </g>
                        )}

                        {/* Placeholder for others */}
                        {comp.type !== 'laser' && comp.type !== 'mirror' && comp.type !== 'lens' && comp.type !== 'beamsplitter' && comp.type !== 'detector' && (
                            <circle r="10" fill="#444" stroke="#888" />
                        )}
                    </g>
                ))}

            </svg>

            {/* View Controls */}
            <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '10px' }}>
                <button
                    onClick={() => setSnapToGrid(!snapToGrid)}
                    style={{
                        background: snapToGrid ? 'rgba(0, 255, 157, 0.15)' : 'rgba(20, 20, 26, 0.8)',
                        border: `1px solid ${snapToGrid ? '#00ff9d' : '#333'}`,
                        color: snapToGrid ? '#00ff9d' : '#e0e0e0',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backdropFilter: 'blur(4px)',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <span style={{ fontSize: '1.1em' }}>{snapToGrid ? '🕸️' : '🕸️'}</span>
                    Snap {snapToGrid ? 'On' : 'Off'}
                </button>

                <button
                    onClick={resetView}
                    style={{
                        background: 'rgba(20, 20, 26, 0.8)',
                        border: '1px solid #333',
                        color: '#e0e0e0',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backdropFilter: 'blur(4px)',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#00ff9d'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#333'}
                >
                    Reset View
                </button>
            </div>
        </div>
    );
};

export default OpticalTable;
