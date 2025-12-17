import React, { useState, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { calculateRays } from '../engine/raytracer';

const GRID_SIZE = 40;

const formatPower = (powerMW) => {
    if (powerMW >= 1000) return `${(powerMW / 1000).toFixed(2)} W`;
    if (powerMW >= 1) return `${powerMW.toFixed(2)} mW`;
    if (powerMW >= 0.001) return `${(powerMW * 1000).toFixed(1)} µW`;
    if (powerMW > 0) return `< 1 µW`;
    return '0 mW';
};

// --- Vector Math ---
const add = (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y });
const sub = (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y });
const mul = (v, s) => ({ x: v.x * s, y: v.y * s });
const mag = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
const normalize = (v) => {
    const m = mag(v);
    return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};

const getGaussianWidth = (z, w0, zR) => w0 * Math.sqrt(1 + (z / zR) ** 2);

// --- Beam Rendering ---
const generateBeamPolygon = (ray) => {
    if (!ray.gaussianParamsList || ray.gaussianParamsList.length === 0) {
        return null;
    }

    const leftPoints = [];
    const rightPoints = [];
    const STEPS = 10;

    for (let i = 0; i < ray.path.length - 1; i++) {
        const pStart = ray.path[i];
        const pEnd = ray.path[i + 1];
        const params = ray.gaussianParamsList[i];

        if (!params) continue; // Should not happen if aligned

        const dir = sub(pEnd, pStart);
        const len = mag(dir);
        const ndir = normalize(dir);
        const perp = { x: -ndir.y, y: ndir.x };

        for (let j = 0; j <= STEPS; j++) {
            const t = j / STEPS;
            // Avoid duplication at segment joins: skip first point if not first segment
            if (i > 0 && j === 0) continue;

            const currentPos = add(pStart, mul(dir, t));
            const currentDist = len * t;
            // params.z is the z-coordinate at the START of the segment
            const zAtPoint = params.z + currentDist;
            const w = getGaussianWidth(zAtPoint, params.w0, params.zR);

            // Visual scaling: ensure beam is visible. 
            // w0=1 unit (1mm). Visual width = 2*w.
            const visualW = Math.max(w, 0.5); // Min width for visibility

            leftPoints.push(add(currentPos, mul(perp, visualW)));
            rightPoints.push(sub(currentPos, mul(perp, visualW)));
        }
    }

    // Construct path: Left points forward, Right points backward
    const points = [
        ...leftPoints,
        ...rightPoints.reverse()
    ];

    if (points.length === 0) return '';

    return points.map(p => `${p.x},${p.y}`).join(' ');
};

const OpticalTable = ({ components, setComponents, onSelect, saveCheckpoint }) => {
    const [viewBox, setViewBox] = useState({ x: -1000, y: -500, w: 2000, h: 1000 });
    const [isPanning, setIsPanning] = useState(false);
    const [draggedCompId, setDraggedCompId] = useState(null);
    // const [snapToGrid, setSnapToGrid] = useState(true); // Removed

    const lastMousePos = useRef({ x: 0, y: 0 });
    const svgRef = useRef(null);

    // Calculate Rays
    const { rays, hits, hitColors } = useMemo(() => calculateRays(components), [components]);

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
        const DEFAULT_W = 2000;
        const DEFAULT_H = 1000;
        const SCREEN_COVERAGE = 0.8; // 80%
        const COMP_RADIUS = 100; // Estimated max radius of a component

        if (!components || components.length === 0) {
            setViewBox({ x: -1000, y: -500, w: DEFAULT_W, h: DEFAULT_H });
            return;
        }

        // Calculate bounding box containing all components
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        components.forEach(c => {
            if (c.position) {
                minX = Math.min(minX, c.position.x - COMP_RADIUS);
                maxX = Math.max(maxX, c.position.x + COMP_RADIUS);
                minY = Math.min(minY, c.position.y - COMP_RADIUS);
                maxY = Math.max(maxY, c.position.y + COMP_RADIUS);
            }
        });

        // Fallback for weird data
        if (!isFinite(minX)) {
            setViewBox({ x: -1000, y: -500, w: DEFAULT_W, h: DEFAULT_H });
            return;
        }

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        // "Boundary set as 80% of the screen"
        // Target dimension = Content dimension / 0.8
        const autoW = contentW / SCREEN_COVERAGE;
        const autoH = contentH / SCREEN_COVERAGE;

        // "Minimum is default reset view"
        const targetW = Math.max(DEFAULT_W, autoW);
        const targetH = Math.max(DEFAULT_H, autoH);

        // Center on the content
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        setViewBox({
            x: centerX - targetW / 2,
            y: centerY - targetH / 2,
            w: targetW,
            h: targetH
        });
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
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid-color)" strokeWidth="1" />
                    </pattern>
                    <pattern id="grid-large" width="200" height="200" patternUnits="userSpaceOnUse">
                        <rect width="200" height="200" fill="url(#grid)" />
                        <path d="M 200 0 L 0 0 0 200" fill="none" stroke="var(--grid-color-large)" strokeWidth="2" />
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
                {rays.map((ray, i) => {
                    const polygonPoints = generateBeamPolygon(ray);
                    return polygonPoints ? (
                        <polygon
                            key={`ray-${i}`}
                            points={polygonPoints}
                            fill={ray.color || 'red'}
                            fillOpacity={Math.min(1, ray.intensity * 2 + 0.2)}
                            stroke={ray.color || 'red'}
                            strokeWidth="1"
                            strokeOpacity={Math.min(1, ray.intensity * 2 + 0.2)}
                        />
                    ) : (
                        <polyline
                            key={`ray-${i}`}
                            points={ray.path.map(p => `${p.x},${p.y}`).join(' ')}
                            stroke={ray.color || 'red'}
                            strokeWidth="4"
                            fill="none"
                            opacity={Math.min(1, ray.intensity * 2 + 0.2)}
                            strokeLinecap="round"
                        />
                    );
                })}

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
                                <rect x="-40" y="-20" width="80" height="40" rx="4" fill="#333" stroke="#555" strokeWidth="2" />
                                {/* Aperture / Front */}
                                <rect x="36" y="-8" width="8" height="16" fill={comp.params?.color || 'red'} />
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
                                <rect x="-4" y="-50" width="8" height="100" fill="#aaccff" fillOpacity="0.4" stroke="#aaccff" strokeWidth="2" />
                                {/* Backing/Silver */}
                                <line x1="0" y1="-50" x2="0" y2="50" stroke="silver" strokeWidth="4" />
                            </g>
                        )}

                        {comp.type === 'lens' && (
                            <g>
                                {/* Hit Area (Transparent) */}
                                <rect x="-30" y="-60" width="60" height="120" fill="transparent" stroke="none" />


                                {/* Lens Glass Body */}
                                {(!comp.params?.lensShape || comp.params.lensShape === 'convex') && (
                                    <path
                                        d="M 0 -60 Q 30 0 0 60 Q -30 0 0 -60"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="2"
                                    />
                                )}
                                {comp.params?.lensShape === 'concave' && (
                                    <path
                                        d="M -20 -60 Q 0 0 -20 60 L 20 60 Q 0 0 20 -60 Z"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="2"
                                    />
                                )}
                                {comp.params?.lensShape === 'plano-convex' && (
                                    <path
                                        d="M -10 -60 L -10 60 Q 30 0 -10 -60"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="2"
                                    />
                                )}
                                {comp.params?.lensShape === 'plano-concave' && (
                                    <path
                                        d="M -10 -60 L -10 60 L 20 60 Q 0 0 20 -60 Z"
                                        fill="rgba(100, 200, 255, 0.3)"
                                        stroke="rgba(100, 200, 255, 0.8)"
                                        strokeWidth="2"
                                    />
                                )}
                            </g>
                        )}

                        {comp.type === 'beamsplitter' && (
                            <g>
                                {/* Glass Cube Body */}
                                <rect x="-30" y="-30" width="60" height="60" fill="rgba(200, 220, 255, 0.3)" stroke="rgba(200, 220, 255, 0.6)" strokeWidth="2" />
                                {/* Diagonal Splitter Surface (Bottom-Left to Top-Right) */}
                                <line x1="-30" y1="30" x2="30" y2="-30" stroke="silver" strokeWidth="4" strokeDasharray="4,2" />
                            </g>
                        )}

                        {comp.type === 'aom' && (
                            <g>
                                {/* Crystal Body */}
                                <rect x="-20" y="-40" width="40" height="80" fill="rgba(200, 200, 255, 0.4)" stroke="#88f" strokeWidth="2" />
                                {/* Transducer (Piezo) on Top */}
                                <rect x="-20" y="-52" width="40" height="12" fill="#d4af37" stroke="#b8860b" />
                                {/* RF Cable / Symbol */}
                                <path d="M 0 -52 L 0 -70" stroke="#888" strokeWidth="2" />
                                <circle cx="0" cy="-70" r="4" fill="#888" />
                                {/* Internal Gratings (Decoration) */}
                                <path d="M -12 -30 L 12 -30 M -12 -10 L 12 -10 M -12 10 L 12 10 M -12 30 L 12 30" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                            </g>
                        )}

                        {comp.type === 'detector' && (
                            <g>
                                {/* Sensor Body */}
                                <rect x="-10" y="-40" width="20" height="80" fill="#222" stroke="#555" strokeWidth="2" />
                                {/* Active Area */}
                                <rect x="-10" y="-36" width="8" height="72" fill="#111" />
                                {/* Readout Overlay (always horizontal) - conditional */}
                                {(comp.params?.showReadout ?? true) && (
                                    <g transform={`rotate(${-comp.rotation}) translate(30, 0)`}>
                                        <rect x="-10" y="-20" width="90" height="40" rx="8" fill="rgba(0,0,0,0.8)" stroke="#555" />
                                        <text x="34" y="8" fill="#0f0" fontSize="20" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                                            {formatPower(hits[comp.id] || 0)}
                                        </text>
                                    </g>
                                )}
                            </g>
                        )}


                        {(comp.type === 'iris' || comp.type === 'blocker') && (
                            <g>
                                {/* Iris Housing (Square/Rect like mount) */}
                                <rect x="-20" y="-40" width="40" height="80" fill="#222" stroke="#555" strokeWidth="2" />
                                {/* Aperture Blades visual */}
                                <circle cx="0" cy="0" r="32" fill="#111" stroke="#333" />
                                {/* The actual opening (Hole) */}
                                {/* Size depends on aperture param. Max 40 = Radius 20? Let's say max aperture 20 -> radius 10. */}
                                {/* Param is diameter? If param 20 (default), radius 10. */}
                                <circle cx="0" cy="0" r={(comp.params?.aperture ?? 40) / 2} fill="#333" stroke="none" />
                                {/* Blade lines (Symbolic) */}
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(0)" />
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(60)" />
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(120)" />
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(180)" />
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(240)" />
                                <path d="M 0 -32 L 0 -20 M 22 -22 L 14 -14 M 32 0 L 20 0" stroke="#444" transform="rotate(300)" />
                            </g>
                        )}

                        {comp.type === 'fiber' && (
                            <g>
                                {/* Fiber Coupler Body (Collimator) */}
                                <rect x="-16" y="-30" width="32" height="60" rx="8" fill="#333" stroke="#666" strokeWidth="2" />
                                {/* Lens / Entrance */}
                                <circle cx="-16" cy="0" r="12" fill="#555" stroke="#888" strokeWidth="2" />
                                {/* Fiber Boot */}
                                <rect x="16" y="-8" width="12" height="16" fill="#222" />
                                {/* Fiber Cable (Yellow, curved) */}
                                <path
                                    d="M 28 0 Q 60 0, 60 40 T 100 60"
                                    fill="none"
                                    stroke={hitColors?.[comp.id] || 'orange'}
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                />
                                <path
                                    d="M 28 0 Q 60 0, 60 40 T 100 60"
                                    fill="none"
                                    stroke={hitColors?.[comp.id] ? 'white' : 'gold'}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    style={{ opacity: hitColors?.[comp.id] ? 0.3 : 0.8 }}
                                />
                                {/* Power Readout - conditional */}
                                {(comp.params?.showReadout ?? true) && (
                                    <g transform={`rotate(${-comp.rotation}) translate(30, -50)`}>
                                        <text x="0" y="0" fill="var(--text-dim)" fontSize="20" fontFamily="monospace" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                            {formatPower(hits[comp.id] || 0)}
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
                                    x={-(comp.params?.cavityLength ?? 100) / 2 - 10}
                                    y="-50"
                                    width={(comp.params?.cavityLength ?? 100) + 20}
                                    height="100"
                                    fill="none"
                                    stroke="#444"
                                    strokeWidth="2"
                                    strokeDasharray="8,4"
                                    rx="8"
                                />
                                {/* Left mirror (curved) */}
                                <path
                                    d={`M ${-(comp.params?.cavityLength ?? 100) / 2} -40 Q ${-(comp.params?.cavityLength ?? 100) / 2 - 16} 0 ${-(comp.params?.cavityLength ?? 100) / 2} 40`}
                                    fill="none"
                                    stroke="#aaccff"
                                    strokeWidth="6"
                                />
                                <path
                                    d={`M ${-(comp.params?.cavityLength ?? 100) / 2} -40 Q ${-(comp.params?.cavityLength ?? 100) / 2 - 16} 0 ${-(comp.params?.cavityLength ?? 100) / 2} 40`}
                                    fill="none"
                                    stroke="silver"
                                    strokeWidth="3"
                                />
                                {/* Right mirror (curved) */}
                                <path
                                    d={`M ${(comp.params?.cavityLength ?? 100) / 2} -40 Q ${(comp.params?.cavityLength ?? 100) / 2 + 16} 0 ${(comp.params?.cavityLength ?? 100) / 2} 40`}
                                    fill="none"
                                    stroke="#aaccff"
                                    strokeWidth="6"
                                />
                                <path
                                    d={`M ${(comp.params?.cavityLength ?? 100) / 2} -40 Q ${(comp.params?.cavityLength ?? 100) / 2 + 16} 0 ${(comp.params?.cavityLength ?? 100) / 2} 40`}
                                    fill="none"
                                    stroke="silver"
                                    strokeWidth="3"
                                />
                                {/* Center axis line */}
                                <line
                                    x1={-(comp.params?.cavityLength ?? 100) / 2 + 10}
                                    y1="0"
                                    x2={(comp.params?.cavityLength ?? 100) / 2 - 10}
                                    y2="0"
                                    stroke="#333"
                                    strokeWidth="2"
                                    strokeDasharray="4,8"
                                />
                            </g>
                        )}

                        {/* Text Label */}
                        {comp.type === 'text' && (
                            <g>
                                {/* Transparent hit area for click/drag - sized based on text */}
                                <rect
                                    x={-((comp.params?.content?.length || 5) * (comp.params?.fontSize || 32) * 0.35)}
                                    y={-((comp.params?.fontSize || 32) * 0.6)}
                                    width={(comp.params?.content?.length || 5) * (comp.params?.fontSize || 32) * 0.7}
                                    height={(comp.params?.fontSize || 32) * 1.2}
                                    fill="transparent"
                                    stroke="none"
                                    style={{ cursor: 'grab' }}
                                />
                                <text
                                    x="0"
                                    y="0"
                                    fill={comp.params?.textColor && comp.params.textColor !== '#ffffff' ? comp.params.textColor : 'var(--text-main)'}
                                    fontSize={comp.params?.fontSize || 32}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontFamily="Arial, sans-serif"
                                    style={{ userSelect: 'none' }}
                                >
                                    {comp.params?.content || 'Label'}
                                </text>
                            </g>
                        )}

                        {/* Half-Wave Plate */}
                        {comp.type === 'hwp' && (
                            <g>
                                {/* Plate body */}
                                <rect x="-6" y="-30" width="12" height="60" fill="rgba(100, 255, 150, 0.4)" stroke="#4a4" strokeWidth="2" rx="2" />
                                {/* Fast axis indicator */}
                                <line
                                    x1="0" y1="-24" x2="0" y2="24"
                                    stroke="#4a4"
                                    strokeWidth="2"
                                    strokeDasharray="4,4"
                                    transform={`rotate(${comp.params?.fastAxis ?? 0})`}
                                />
                                {/* Label */}
                                <text x="0" y="44" fill="#8f8" fontSize="16" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>λ/2</text>
                            </g>
                        )}

                        {/* Quarter-Wave Plate */}
                        {comp.type === 'qwp' && (
                            <g>
                                {/* Plate body */}
                                <rect x="-6" y="-30" width="12" height="60" fill="rgba(100, 180, 255, 0.4)" stroke="#48f" strokeWidth="2" rx="2" />
                                {/* Fast axis indicator */}
                                <line
                                    x1="0" y1="-24" x2="0" y2="24"
                                    stroke="#48f"
                                    strokeWidth="2"
                                    strokeDasharray="4,4"
                                    transform={`rotate(${comp.params?.fastAxis ?? 45})`}
                                />
                                {/* Label */}
                                <text x="0" y="44" fill="#8af" fontSize="16" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>λ/4</text>
                            </g>
                        )}

                        {/* Polarizer */}
                        {comp.type === 'polarizer' && (
                            <g>
                                {/* Body */}
                                <rect x="-8" y="-30" width="16" height="60" fill="#333" stroke="#666" strokeWidth="2" rx="2" />
                                {/* Polarization stripes */}
                                <line x1="0" y1="-24" x2="0" y2="24" stroke="#888" strokeWidth="1" />
                                <line x1="-4" y1="-24" x2="-4" y2="24" stroke="#888" strokeWidth="1" />
                                <line x1="4" y1="-24" x2="4" y2="24" stroke="#888" strokeWidth="1" />
                                {/* Axis indicator arrow */}
                                <line
                                    x1="0" y1="-36" x2="0" y2="-44"
                                    stroke="#ff0"
                                    strokeWidth="4"
                                    transform={`rotate(${comp.params?.polarizerAxis ?? 0})`}
                                />
                                <circle cx="0" cy="-44" r="4" fill="#ff0" transform={`rotate(${comp.params?.polarizerAxis ?? 0})`} />
                            </g>
                        )}

                        {/* Polarizing Beam Splitter */}
                        {comp.type === 'pbs' && (
                            <g>
                                {/* Cube body */}
                                <rect x="-30" y="-30" width="60" height="60" fill="rgba(200, 220, 255, 0.3)" stroke="rgba(200, 220, 255, 0.6)" strokeWidth="2" />
                                {/* Diagonal coating (polarizing surface) */}
                                <line x1="-30" y1="30" x2="30" y2="-30" stroke="#8af" strokeWidth="4" />
                                {/* PBS label */}
                                <text x="0" y="44" fill="#8af" fontSize="16" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>PBS</text>
                                {/* Axis indicator */}
                                <line
                                    x1="0" y1="-36" x2="0" y2="-50"
                                    stroke="#ff0"
                                    strokeWidth="4"
                                    transform={`rotate(${comp.params?.pbsAxis ?? 0})`}
                                />
                            </g>
                        )}

                        {/* Polarization Detector */}
                        {comp.type === 'poldetector' && (
                            <g>
                                {/* Sensor Body (similar to detector but different color) */}
                                <rect x="-10" y="-40" width="20" height="80" fill="#234" stroke="#68f" strokeWidth="2" />
                                {/* Active Area with polarization stripes */}
                                <rect x="-10" y="-36" width="8" height="72" fill="#123" />
                                <line x1="-8" y1="-30" x2="-8" y2="30" stroke="#68f" strokeWidth="1" />
                                <line x1="-4" y1="-30" x2="-4" y2="30" stroke="#68f" strokeWidth="1" />
                                {/* Readout Overlay (shows polarization) */}
                                {(comp.params?.showReadout ?? true) && (
                                    <g transform={`rotate(${-comp.rotation}) translate(30, 0)`}>
                                        <rect x="-10" y="-50" width="100" height="100" rx="8" fill="rgba(20, 20, 26, 0.9)" stroke="#68f" strokeWidth="1" />

                                        {/* Visualization Area */}
                                        <g transform="translate(40, 0)">
                                            {/* Axis */}
                                            <line x1="-30" y1="0" x2="30" y2="0" stroke="#444" strokeWidth="1" />
                                            <line x1="0" y1="-30" x2="0" y2="30" stroke="#444" strokeWidth="1" />

                                            {(() => {
                                                const intensity = hits[comp.id] || 0;
                                                const angle = hits[comp.id + '_pol'] ?? 0; // Orientation
                                                const ellipticity = hits[comp.id + '_ellipticity'] ?? 0; // -45 to 45 (0=Linear, 45=Circ)

                                                if (intensity < 0.05) return <text x="0" y="5" fill="#555" fontSize="10" textAnchor="middle">No Signal</text>;

                                                // Draw Ellipse
                                                // Convert ellipticity to minor/major axis ratio
                                                // eta = tan(chi). minor/major = tan(chi)
                                                // For chi=0, ratio=0 (Line). For chi=45, ratio=1 (Circle)

                                                const chiRad = (ellipticity * Math.PI) / 180;
                                                const angleRad = (-angle * Math.PI) / 180; // SVG Y is down, so negate angle for visual

                                                // Parametric equation for general ellipse with orientation `angle` and ellipticity `chi`
                                                // x(t) = A (cos t cos theta - sin t sin theta sin chi) ?? 
                                                // Easier: Draw ellipse aligned to axes then rotate.

                                                const size = 25;
                                                const minor = size * Math.tan(Math.abs(chiRad)); // b = a * tan(chi) ??
                                                // Actually: tan(chi) = b/a. So b = a * tan(chi). 
                                                // If chi=45, tan=1 -> b=a. If chi=0 -> b=0.

                                                // Limit minor axis
                                                const b = Math.min(size, Math.abs(size * Math.tan(chiRad)));
                                                const a = size;

                                                // Rotation transform
                                                return (
                                                    <g transform={`rotate(${angle})`}>
                                                        <ellipse cx="0" cy="0" rx={a} ry={b} fill="none" stroke="#ff0055" strokeWidth="2" />
                                                        {/* Arrow for direction? Complexity high. */}
                                                        {/* Draw line for linear part if elliptical */}
                                                        {b < 5 && (
                                                            <line x1={-a} y1={0} x2={a} y2={0} stroke="#ff0055" strokeWidth="2" markerEnd="url(#arrow)" />
                                                        )}
                                                        {/* Circular arrow if circular? */}
                                                    </g>
                                                );
                                            })()}
                                        </g>

                                        <text x="40" y="36" fill="#8cf" fontSize="12" textAnchor="middle" fontFamily="monospace">
                                            {formatPower(hits[comp.id] || 0)}
                                        </text>
                                        <text x="40" y="-38" fill="#fc8" fontSize="12" textAnchor="middle" fontFamily="monospace">
                                            {(hits[comp.id + '_pol'] ?? 0).toFixed(0)}°
                                        </text>
                                    </g>
                                )}
                            </g>
                        )}

                        {/* Placeholder for others */}
                        {!['laser', 'mirror', 'lens', 'beamsplitter', 'detector', 'fiber', 'iris', 'blocker', 'aom', 'cavity', 'text', 'hwp', 'qwp', 'polarizer', 'pbs', 'poldetector'].includes(comp.type) && (
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
