import React, { useState, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { calculateRays } from '../engine/raytracer';

const GRID_SIZE = 20;

const OpticalTable = ({ components, setComponents, onSelect, saveCheckpoint }) => {
    const [viewBox, setViewBox] = useState({ x: -1000, y: -500, w: 2000, h: 1000 });
    const [isPanning, setIsPanning] = useState(false);
    const [draggedCompId, setDraggedCompId] = useState(null);
    // const [snapToGrid, setSnapToGrid] = useState(true); // Removed

    const lastMousePos = useRef({ x: 0, y: 0 });
    const svgRef = useRef(null);

    // Calculate Rays
    const { rays, hits } = useMemo(() => calculateRays(components), [components]);

    // --- View Navigation (Pan/Zoom) ---
    const handleWheel = (e) => {
        // Allow zoom without Ctrl (or restore standard behavior)
        // If user wants standard pan/zoom behavior:
        // Wheel = Zoom (classic simple tool behavior)
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.05 : 0.95;

        // Adjust mouse coordinates for the sidebar (320px)
        const mouseX = (e.clientX - 320) * (viewBox.w / (window.innerWidth - 320)) + viewBox.x;
        const mouseY = e.clientY * (viewBox.h / window.innerHeight) + viewBox.y;

        const newW = viewBox.w * zoomFactor;
        const newH = viewBox.h * zoomFactor;
        const newX = mouseX - (mouseX - viewBox.x) * zoomFactor;
        const newY = mouseY - (mouseY - viewBox.y) * zoomFactor;

        setViewBox({ x: newX, y: newY, w: newW, h: newH });
    };

    const downloadSVG = () => {
        if (!svgRef.current) return;

        // Clone the SVG to clean it up
        const clone = svgRef.current.cloneNode(true);

        // Remove elements marked as no-export (UI helpers, Center Marker)
        const helpers = clone.querySelectorAll('.no-export');
        helpers.forEach(el => el.remove());

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(clone);

        // Add namespace if missing (browsers usually add it but good to be safe for external tools)
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Add XML declaration
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);

        const link = document.createElement("a");
        link.href = url;
        link.download = `optical-setup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

                    const shouldSnap = e.ctrlKey || e.metaKey;
                    if (shouldSnap) {
                        const snappedX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
                        const snappedY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
                        return { ...c, position: { x: snappedX, y: snappedY } };
                    } else {
                        return { ...c, position: { x: rawX, y: rawY } };
                    }
                }
                return c;
            }), false); // False = Transient update (don't commit to history yet)
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
            efficiency: type === 'aom' ? 0.9 : undefined,
            deviation: type === 'aom' ? 5 : undefined,
        };

        const shouldSnap = e.ctrlKey || e.metaKey;
        const finalX = shouldSnap ? Math.round(svgPoint.x / GRID_SIZE) * GRID_SIZE : svgPoint.x;
        const finalY = shouldSnap ? Math.round(svgPoint.y / GRID_SIZE) * GRID_SIZE : svgPoint.y;

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

        setComponents(prev => [...prev, newComp], true); // True = Commit to history
        onSelect(newComp.id);
    };

    // --- Component Interactions ---
    const handleCompMouseDown = (e, id) => {
        e.stopPropagation(); // Stop background pan
        e.preventDefault();  // Stop native drag/select
        saveCheckpoint();    // Save state before drag starts
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
                    className="no-export"
                />

                {/* Center Marker */}
                <path className="no-export" d="M -10 0 L 10 0 M 0 -10 L 0 10" stroke="#00ff9d" strokeWidth="2" strokeOpacity="0.5" />

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


                                {/* Lens Glass Body */}
                                {(!comp.params?.lensShape || comp.params.lensShape === 'convex') && (
                                    <path
                                        d="M 0 -30 Q 15 0 0 30 Q -15 0 0 -30"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="1"
                                    />
                                )}
                                {comp.params?.lensShape === 'concave' && (
                                    <path
                                        d="M -10 -30 Q 0 0 -10 30 L 10 30 Q 0 0 10 -30 Z"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="1"
                                    />
                                )}
                                {comp.params?.lensShape === 'plano-convex' && (
                                    <path
                                        d="M -5 -30 L -5 30 Q 15 0 -5 -30"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="1"
                                    />
                                )}
                                {comp.params?.lensShape === 'plano-concave' && (
                                    <path
                                        d="M -5 -30 L -5 30 L 10 30 Q 0 0 10 -30 Z"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="1"
                                    />
                                )}
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

                        {comp.type === 'aom' && (
                            <g>
                                {/* Crystal Body */}
                                <rect x="-10" y="-20" width="20" height="40" fill="rgba(200, 200, 255, 0.4)" stroke="#88f" strokeWidth="1" />
                                {/* Transducer (Piezo) on Top */}
                                <rect x="-10" y="-26" width="20" height="6" fill="#d4af37" stroke="#b8860b" />
                                {/* RF Cable / Symbol */}
                                <path d="M 0 -26 L 0 -35" stroke="#888" strokeWidth="1" />
                                <circle cx="0" cy="-35" r="2" fill="#888" />
                                {/* Internal Gratings (Decoration) */}
                                <path d="M -6 -15 L 6 -15 M -6 -5 L 6 -5 M -6 5 L 6 5 M -6 15 L 6 15" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                            </g>
                        )}

                        {comp.type === 'detector' && (
                            <g>
                                {/* Sensor Body */}
                                <rect x="-5" y="-20" width="10" height="40" fill="#222" stroke="#555" strokeWidth="1" />
                                {/* Active Area */}
                                <rect x="-5" y="-18" width="4" height="36" fill="#111" />
                                {/* Readout Overlay (always horizontal) - conditional */}
                                {(comp.params?.showReadout ?? true) && (
                                    <g transform={`rotate(${-comp.rotation}) translate(15, 0)`}>
                                        <rect x="-5" y="-10" width="45" height="20" rx="4" fill="rgba(0,0,0,0.8)" stroke="#555" />
                                        <text x="17" y="4" fill="#0f0" fontSize="10" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                                            {(hits[comp.id] || 0).toFixed(2)}
                                        </text>
                                    </g>
                                )}
                            </g>
                        )}


                        {(comp.type === 'iris' || comp.type === 'blocker') && (
                            <g>
                                {/* Iris Housing (Square/Rect like mount) */}
                                <rect x="-10" y="-20" width="20" height="40" fill="#222" stroke="#555" strokeWidth="1" />
                                {/* Aperture Blades visual */}
                                <circle cx="0" cy="0" r="16" fill="#111" stroke="#333" />
                                {/* The actual opening (Hole) */}
                                {/* Size depends on aperture param. Max 40 = Radius 20? Let's say max aperture 20 -> radius 10. */}
                                {/* Param is diameter? If param 20 (default), radius 10. */}
                                <circle cx="0" cy="0" r={(comp.params?.aperture ?? 20) / 2} fill="#333" stroke="none" />
                                {/* Blade lines (Symbolic) */}
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(0)" />
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(60)" />
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(120)" />
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(180)" />
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(240)" />
                                <path d="M 0 -16 L 0 -10 M 11 -11 L 7 -7 M 16 0 L 10 0" stroke="#444" transform="rotate(300)" />
                            </g>
                        )}

                        {comp.type === 'fiber' && (
                            <g>
                                {/* Fiber Coupler Body (Collimator) */}
                                <rect x="-8" y="-15" width="16" height="30" rx="4" fill="#333" stroke="#666" strokeWidth="1" />
                                {/* Lens / Entrance */}
                                <circle cx="-8" cy="0" r="6" fill="#555" stroke="#888" strokeWidth="1" />
                                {/* Fiber Boot */}
                                <rect x="8" y="-4" width="6" height="8" fill="#222" />
                                {/* Fiber Cable (Yellow, curved) */}
                                <path
                                    d="M 14 0 Q 30 0, 30 20 T 50 30"
                                    fill="none"
                                    stroke="orange"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                />
                                <path
                                    d="M 14 0 Q 30 0, 30 20 T 50 30"
                                    fill="none"
                                    stroke="gold"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    style={{ opacity: 0.8 }}
                                />
                                {/* Power Readout - conditional */}
                                {(comp.params?.showReadout ?? true) && (
                                    <g transform={`rotate(${-comp.rotation}) translate(15, -25)`}>
                                        <text x="0" y="0" fill="#aaa" fontSize="10" fontFamily="monospace" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                            {(hits[comp.id] || 0).toFixed(2)}
                                        </text>
                                    </g>
                                )}
                            </g>
                        )}

                        {/* Optical Cavity - two parallel mirrors */}
                        {comp.type === 'cavity' && (
                            <g>
                                {/* Cavity frame/body */}
                                <rect
                                    x={-(comp.params?.cavityLength ?? 100) / 2 - 5}
                                    y="-25"
                                    width={(comp.params?.cavityLength ?? 100) + 10}
                                    height="50"
                                    fill="none"
                                    stroke="#444"
                                    strokeWidth="1"
                                    strokeDasharray="4,2"
                                    rx="4"
                                />
                                {/* Left mirror (curved) */}
                                <path
                                    d={`M ${-(comp.params?.cavityLength ?? 100) / 2} -20 Q ${-(comp.params?.cavityLength ?? 100) / 2 - 8} 0 ${-(comp.params?.cavityLength ?? 100) / 2} 20`}
                                    fill="none"
                                    stroke="#aaccff"
                                    strokeWidth="3"
                                />
                                <path
                                    d={`M ${-(comp.params?.cavityLength ?? 100) / 2} -20 Q ${-(comp.params?.cavityLength ?? 100) / 2 - 8} 0 ${-(comp.params?.cavityLength ?? 100) / 2} 20`}
                                    fill="none"
                                    stroke="silver"
                                    strokeWidth="1.5"
                                />
                                {/* Right mirror (curved) */}
                                <path
                                    d={`M ${(comp.params?.cavityLength ?? 100) / 2} -20 Q ${(comp.params?.cavityLength ?? 100) / 2 + 8} 0 ${(comp.params?.cavityLength ?? 100) / 2} 20`}
                                    fill="none"
                                    stroke="#aaccff"
                                    strokeWidth="3"
                                />
                                <path
                                    d={`M ${(comp.params?.cavityLength ?? 100) / 2} -20 Q ${(comp.params?.cavityLength ?? 100) / 2 + 8} 0 ${(comp.params?.cavityLength ?? 100) / 2} 20`}
                                    fill="none"
                                    stroke="silver"
                                    strokeWidth="1.5"
                                />
                                {/* Center axis line */}
                                <line
                                    x1={-(comp.params?.cavityLength ?? 100) / 2 + 5}
                                    y1="0"
                                    x2={(comp.params?.cavityLength ?? 100) / 2 - 5}
                                    y2="0"
                                    stroke="#333"
                                    strokeWidth="1"
                                    strokeDasharray="2,4"
                                />
                            </g>
                        )}

                        {/* Text Label */}
                        {comp.type === 'text' && (
                            <g>
                                {/* Transparent hit area for click/drag - sized based on text */}
                                <rect
                                    x={-((comp.params?.content?.length || 5) * (comp.params?.fontSize || 16) * 0.35)}
                                    y={-((comp.params?.fontSize || 16) * 0.6)}
                                    width={(comp.params?.content?.length || 5) * (comp.params?.fontSize || 16) * 0.7}
                                    height={(comp.params?.fontSize || 16) * 1.2}
                                    fill="transparent"
                                    stroke="none"
                                    style={{ cursor: 'grab' }}
                                />
                                <text
                                    x="0"
                                    y="0"
                                    fill={comp.params?.textColor || '#ffffff'}
                                    fontSize={comp.params?.fontSize || 16}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontFamily="Arial, sans-serif"
                                    style={{ userSelect: 'none' }}
                                >
                                    {comp.params?.content || 'Label'}
                                </text>
                            </g>
                        )}

                        {/* Placeholder for others */}
                        {!['laser', 'mirror', 'lens', 'beamsplitter', 'detector', 'fiber', 'iris', 'blocker', 'aom', 'cavity', 'text'].includes(comp.type) && (
                            <circle r="10" fill="#444" stroke="#888" />
                        )}
                    </g>
                ))}

            </svg>

            {/* View Controls */}
            < div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '10px' }}>
                <button
                    onClick={downloadSVG}
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
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <span style={{ fontSize: '1.1em' }}>💾</span>
                    Save SVG
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
        </div >
    );
};

export default OpticalTable;
