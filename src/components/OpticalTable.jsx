import React, { useState, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { calculateRays } from '../engine/raytracer';
import { add, sub, mul, mag, normalize, getGaussianWidth } from '../engine/mathUtils';
import { PIXELS_PER_MM, toPixels, toMM, DEFAULT_DIMENSIONS_MM } from '../engine/units';

const GRID_SIZE = 40;

const formatPower = (powerMW) => {
    if (powerMW >= 1000) return `${(powerMW / 1000).toFixed(2)} W`;
    if (powerMW >= 1) return `${powerMW.toFixed(2)} mW`;
    if (powerMW >= 0.001) return `${(powerMW * 1000).toFixed(1)} µW`;
    if (powerMW > 0) return `< 1 µW`;
    return '0 mW';
};


// --- Vector Math ---
// Imported from ../engine/mathUtils

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
    const { rays, hits, hitColors } = useMemo(() => {
        try {
            if (!components) return { rays: [], hits: {}, hitColors: {} };
            return calculateRays(components);
        } catch (err) {
            console.error("Critical Raytracer Error:", err);
            return { rays: [], hits: {}, hitColors: {} };
        }
    }, [components]);

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
            physicalDim: DEFAULT_DIMENSIONS_MM[type] || { length: 25, width: 25, height: 25 },
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

                {/* Grid Labels (Coordinate System) */}
                {/* Grid Labels (Coordinate System) */}
                <g className="no-export" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {(() => {
                        const majorGridSize = 200; // 125mm
                        const startX = Math.floor(viewBox.x / majorGridSize) * majorGridSize;
                        const endX = Math.ceil((viewBox.x + viewBox.w) / majorGridSize) * majorGridSize;
                        const startY = Math.floor(viewBox.y / majorGridSize) * majorGridSize;
                        const endY = Math.ceil((viewBox.y + viewBox.h) / majorGridSize) * majorGridSize;

                        const labels = [];
                        // X Labels
                        for (let x = startX; x <= endX; x += majorGridSize) {
                            if (x === 0) continue; // Skip center
                            labels.push(
                                <text
                                    key={`x-${x}`}
                                    x={x}
                                    y={viewBox.y + 20}
                                    fill="var(--text-dim)"
                                    fontSize="12"
                                    textAnchor="middle"
                                    opacity="0.6"
                                >
                                    {Math.round(toMM(x))} mm
                                </text>
                            );
                        }
                        // Y Labels
                        for (let y = startY; y <= endY; y += majorGridSize) {
                            if (y === 0) continue; // Skip center
                            labels.push(
                                <text
                                    key={`y-${y}`}
                                    x={viewBox.x + 10}
                                    y={y + 4}
                                    fill="var(--text-dim)"
                                    fontSize="12"
                                    textAnchor="start"
                                    opacity="0.6"
                                >
                                    {Math.round(toMM(y))} mm
                                </text>
                            );
                        }
                        return labels;
                    })()}
                </g>

                {/* Draw Breadboards (Background Layer - Below Rays) */}
                {components.filter(c => c.type === 'breadboard').map(comp => (
                    <g
                        key={comp.id}
                        transform={`translate(${comp.position.x}, ${comp.position.y}) rotate(${comp.rotation})`}
                        onMouseDown={(e) => handleCompMouseDown(e, comp.id)}
                        style={{ cursor: draggedCompId === comp.id ? 'grabbing' : 'grab' }}
                        className="component-group"
                    >
                        {(() => {
                            const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.breadboard.length);
                            const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.breadboard.width);
                            const spacing = toPixels(25); // 25mm spacing

                            // Generate holes
                            const holes = [];
                            const cols = Math.floor(L / spacing);
                            const rows = Math.floor(W / spacing);

                            // Center the grid
                            const offsetX = (L - (cols * spacing)) / 2;
                            const offsetY = (W - (rows * spacing)) / 2;

                            for (let i = 0; i < cols; i++) {
                                for (let j = 0; j < rows; j++) {
                                    holes.push(
                                        <circle
                                            key={`${i}-${j}`}
                                            cx={-L / 2 + offsetX + i * spacing + spacing / 2}
                                            cy={-W / 2 + offsetY + j * spacing + spacing / 2}
                                            r="4"
                                            fill="#111"
                                            opacity="0.5"
                                        />
                                    );
                                }
                            }

                            return (
                                <>
                                    {/* Plate Body */}
                                    <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="#282828" stroke="#444" strokeWidth="2" rx="4" />
                                    {/* Holes */}
                                    {holes}
                                    {/* Screw corners (Visual) */}
                                    <circle cx={-L / 2 + 12} cy={-W / 2 + 12} r="6" fill="#444" />
                                    <circle cx={L / 2 - 12} cy={-W / 2 + 12} r="6" fill="#444" />
                                    <circle cx={-L / 2 + 12} cy={W / 2 - 12} r="6" fill="#444" />
                                    <circle cx={L / 2 - 12} cy={W / 2 - 12} r="6" fill="#444" />
                                </>
                            );
                        })()}
                    </g>
                ))}

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

                {/* Draw Components (Foreground - Above Rays) */}
                {components.filter(c => c.type !== 'breadboard').map(comp => (
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
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.laser.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.laser.width);
                                    return (
                                        <>
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} rx="4" fill="#333" stroke="#555" strokeWidth="2" />
                                            {/* Aperture / Front */}
                                            <rect x={L / 2 - 4} y={-4} width={4} height={8} fill={comp.params?.color || 'red'} />
                                        </>
                                    );
                                })()}

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
                                {(() => {
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.mirror.width);
                                    const T = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.mirror.length); // Thickness
                                    return (
                                        <>
                                            {/* Glass/Reflective Surface */}
                                            <rect x={-T / 2} y={-W / 2} width={T} height={W} fill="#aaccff" fillOpacity="0.4" stroke="#aaccff" strokeWidth="2" />
                                            {/* Backing/Silver */}
                                            <line x1="0" y1={-W / 2} x2="0" y2={W / 2} stroke="silver" strokeWidth={T} />
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'lens' && (
                            <g>
                                {(() => {
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.lens.width);
                                    const H = W; // Lens is usually circular/height match
                                    const R = H / 2;
                                    const T = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.lens.length);

                                    // Construct paths based on W/H
                                    // Convex: Q curve control point? 
                                    // d="M 0 -60 Q 30 0 0 60 Q -30 0 0 -60"
                                    // 60 => R. 30 => Thickness factor? 
                                    // Let's approximate curvature.

                                    const curve = R * 0.5; // Curvature amount

                                    return (
                                        <>
                                            {/* Hit Area (Transparent) */}
                                            <rect x={-T * 2} y={-R} width={T * 4} height={H} fill="transparent" stroke="none" />

                                            {/* Lens Glass Body */}
                                            {(!comp.params?.lensShape || comp.params.lensShape === 'convex') && (
                                                <path
                                                    d={`M 0 ${-R} Q ${curve} 0 0 ${R} Q ${-curve} 0 0 ${-R}`}
                                                    fill="rgba(100, 200, 255, 0.3)"
                                                    stroke="rgba(100, 200, 255, 0.8)"
                                                    strokeWidth="2"
                                                />
                                            )}
                                            {comp.params?.lensShape === 'concave' && (
                                                <path
                                                    d={`M ${-curve * 0.6} ${-R} Q 0 0 ${-curve * 0.6} ${R} L ${curve * 0.6} ${R} Q 0 0 ${curve * 0.6} ${-R} Z`}
                                                    fill="rgba(100, 200, 255, 0.3)"
                                                    stroke="rgba(100, 200, 255, 0.8)"
                                                    strokeWidth="2"
                                                />
                                            )}
                                            {comp.params?.lensShape === 'plano-convex' && (
                                                <path
                                                    d={`M ${-curve * 0.3} ${-R} L ${-curve * 0.3} ${R} Q ${curve} 0 ${-curve * 0.3} ${-R}`}
                                                    fill="rgba(100, 200, 255, 0.3)"
                                                    stroke="rgba(100, 200, 255, 0.8)"
                                                    strokeWidth="2"
                                                />
                                            )}
                                            {comp.params?.lensShape === 'plano-concave' && (
                                                <path
                                                    d={`M ${-curve * 0.3} ${-R} L ${-curve * 0.3} ${R} L ${curve * 0.6} ${R} Q 0 0 ${curve * 0.6} ${-R} Z`}
                                                    fill="rgba(100, 200, 255, 0.3)"
                                                    stroke="rgba(100, 200, 255, 0.8)"
                                                    strokeWidth="2"
                                                />
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'beamsplitter' && (
                            <g>
                                {(() => {
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.beamsplitter.width);
                                    const half = W / 2;
                                    return (
                                        <>
                                            {/* Glass Cube Body */}
                                            <rect x={-half} y={-half} width={W} height={W} fill="rgba(200, 220, 255, 0.3)" stroke="rgba(200, 220, 255, 0.6)" strokeWidth="2" />
                                            {/* Diagonal Splitter Surface (Bottom-Left to Top-Right) */}
                                            <line x1={-half} y1={half} x2={half} y2={-half} stroke="silver" strokeWidth="4" strokeDasharray="4,2" />
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'aom' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.aom.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.aom.width);
                                    return (
                                        <>
                                            {/* Crystal Body */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="rgba(200, 200, 255, 0.4)" stroke="#88f" strokeWidth="2" />
                                            {/* Transducer (Piezo) on Top (relative) */}
                                            <rect x={-L / 2} y={-W / 2 - 12} width={L} height={12} fill="#d4af37" stroke="#b8860b" />
                                            {/* RF Cable / Symbol */}
                                            <path d={`M 0 ${-W / 2 - 12} L 0 ${-W / 2 - 30}`} stroke="#888" strokeWidth="2" />
                                            <circle cx="0" cy={-W / 2 - 30} r="4" fill="#888" />
                                            {/* Internal Gratings (Decoration) */}
                                            <path d={`M ${-L * 0.3} ${-W * 0.4} L ${L * 0.3} ${-W * 0.4} M ${-L * 0.3} 0 L ${L * 0.3} 0 M ${-L * 0.3} ${W * 0.4} L ${L * 0.3} ${W * 0.4}`} stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'detector' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.detector.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.detector.width);
                                    return (
                                        <>
                                            {/* Sensor Body */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="#222" stroke="#555" strokeWidth="2" />
                                            {/* Active Area */}
                                            <rect x={-L / 2} y={-W / 2 + 2} width={L > 4 ? L - 4 : L} height={W > 4 ? W - 4 : W} fill="#111" />
                                            {/* Readout Overlay (always horizontal) - conditional */}
                                            {(comp.params?.showReadout ?? true) && (
                                                <g transform={`rotate(${-comp.rotation}) translate(${W / 2 + 20}, 0)`}>
                                                    <rect x="-10" y="-20" width="90" height="40" rx="8" fill="rgba(0,0,0,0.8)" stroke="#555" />
                                                    <text x="34" y="8" fill="#0f0" fontSize="20" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                                                        {formatPower(hits[comp.id] || 0)}
                                                    </text>
                                                </g>
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        )}


                        {(comp.type === 'iris' || comp.type === 'blocker') && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.iris.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.iris.width);
                                    // Aperture is relative to visual size or just open?
                                    // Visual aperture max is W.
                                    const aperture = Math.min((comp.params?.aperture ?? 20), W); // aperture in pixels? No, param is likely mm or px?
                                    // Let's assume params.aperture is in pixels for now as I didn't verify that param logic change.
                                    // But really it should be proportional to W.

                                    return (
                                        <>
                                            {/* Iris Housing (Square/Rect like mount) */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="#222" stroke="#555" strokeWidth="2" />
                                            {/* Aperture Blades visual */}
                                            <circle cx={0} cy={0} r={W / 2 - 2} fill="#111" stroke="#333" />
                                            {/* The actual opening (Hole) */}
                                            <circle cx={0} cy={0} r={aperture / 2} fill="#333" stroke="none" />
                                            {/* Blade lines (Symbolic) */}
                                            {[0, 60, 120, 180, 240, 300].map(rot => (
                                                <path key={rot} d={`M 0 ${-W / 2} L 0 ${-W / 2 + 12} M ${W / 2 - 10} ${-W / 2 + 10} L ${W / 2 - 18} ${-W / 2 + 18}`} stroke="#444" transform={`rotate(${rot})`} />
                                            ))}
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'fiber' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.fiber.length); // 20mm
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.fiber.width); // 10mm
                                    // Visual scaling:
                                    // Body x: -L/2 to L/2? 
                                    // Previous: -16 to 16 (32 wide). Height 60 (-30 to 30).
                                    // Wait, fiber is rotated? 
                                    // If W=10 (16px), it's thin.

                                    return (
                                        <>
                                            {/* Fiber Coupler Body (Collimator) */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} rx="4" fill="#333" stroke="#666" strokeWidth="2" />
                                            {/* Lens / Entrance - front is -L/2 */}
                                            <circle cx={-L / 2} cy="0" r={W / 2 - 2} fill="#555" stroke="#888" strokeWidth="2" />
                                            {/* Fiber Boot - back is L/2 */}
                                            <rect x={L / 2} y={-W / 4} width={W / 2} height={W / 2} fill="#222" />
                                            {/* Fiber Cable (Yellow, curved) */}
                                            <path
                                                d={`M ${L / 2 + W / 2} 0 Q ${L / 2 + W * 2} 0, ${L / 2 + W * 2} ${W} T ${L / 2 + W * 4} ${W * 1.5}`}
                                                fill="none"
                                                stroke={hitColors?.[comp.id] || 'orange'}
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                            />
                                            {/* Power Readout - conditional */}
                                            {(comp.params?.showReadout ?? true) && (
                                                <g transform={`rotate(${-comp.rotation}) translate(${L}, ${-W})`}>
                                                    <text x="0" y="0" fill="var(--text-dim)" fontSize="16" fontFamily="monospace" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                                        {formatPower(hits[comp.id] || 0)}
                                                    </text>
                                                </g>
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Optical Cavity - two parallel mirrors */}
                        {comp.type === 'cavity' && (
                            <g>
                                {(() => {
                                    const H = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.cavity.width);
                                    const LParams = comp.params?.cavityLength ?? 100; // Keep as params? Or convert? 
                                    // cavityLength param is likely pixels in old code. 
                                    // I should probably treat it as pixels for now, or scale it if I want proper units.
                                    // Let's assume params are still raw for now, but frame height is H.

                                    return (
                                        <>
                                            {/* Cavity frame/body */}
                                            <rect
                                                x={-LParams / 2 - 10}
                                                y={-H / 2 - 10}
                                                width={LParams + 20}
                                                height={H + 20}
                                                fill="none"
                                                stroke="#444"
                                                strokeWidth="2"
                                                strokeDasharray="8,4"
                                                rx="8"
                                            />
                                            {/* Left mirror (curved) */}
                                            <path
                                                d={`M ${-LParams / 2} ${-H / 2} Q ${-LParams / 2 - H * 0.2} 0 ${-LParams / 2} ${H / 2}`}
                                                fill="none"
                                                stroke="#aaccff"
                                                strokeWidth="6"
                                            />
                                            <path
                                                d={`M ${-LParams / 2} ${-H / 2} Q ${-LParams / 2 - H * 0.2} 0 ${-LParams / 2} ${H / 2}`}
                                                fill="none"
                                                stroke="silver"
                                                strokeWidth="3"
                                            />
                                            {/* Right mirror (curved) */}
                                            <path
                                                d={`M ${LParams / 2} ${-H / 2} Q ${LParams / 2 + H * 0.2} 0 ${LParams / 2} ${H / 2}`}
                                                fill="none"
                                                stroke="#aaccff"
                                                strokeWidth="6"
                                            />
                                            <path
                                                d={`M ${LParams / 2} ${-H / 2} Q ${LParams / 2 + H * 0.2} 0 ${LParams / 2} ${H / 2}`}
                                                fill="none"
                                                stroke="silver"
                                                strokeWidth="3"
                                            />
                                            {/* Center axis line */}
                                            <line
                                                x1={-LParams / 2 + 10}
                                                y1="0"
                                                x2={LParams / 2 - 10}
                                                y2="0"
                                                stroke="#333"
                                                strokeWidth="2"
                                                strokeDasharray="4,8"
                                            />
                                        </>
                                    );
                                })()}
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
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.hwp.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.hwp.width);
                                    return (
                                        <>
                                            {/* Plate body */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="rgba(100, 255, 150, 0.4)" stroke="#4a4" strokeWidth="2" rx="2" />
                                            {/* Fast axis indicator */}
                                            <line
                                                x1="0" y1={-W / 2 + 4} x2="0" y2={W / 2 - 4}
                                                stroke="#4a4"
                                                strokeWidth="2"
                                                strokeDasharray="4,4"
                                                transform={`rotate(${comp.params?.fastAxis ?? 0})`}
                                            />
                                            {/* Label */}
                                            <text x="0" y={W / 2 + 12} fill="#8f8" fontSize="12" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>λ/2</text>
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Quarter-Wave Plate */}
                        {comp.type === 'qwp' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.qwp.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.qwp.width);
                                    return (
                                        <>
                                            {/* Plate body */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="rgba(100, 180, 255, 0.4)" stroke="#48f" strokeWidth="2" rx="2" />
                                            {/* Fast axis indicator */}
                                            <line
                                                x1="0" y1={-W / 2 + 4} x2="0" y2={W / 2 - 4}
                                                stroke="#48f"
                                                strokeWidth="2"
                                                strokeDasharray="4,4"
                                                transform={`rotate(${comp.params?.fastAxis ?? 45})`}
                                            />
                                            {/* Label */}
                                            <text x="0" y={W / 2 + 12} fill="#8af" fontSize="12" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>λ/4</text>
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Polarizer */}
                        {comp.type === 'polarizer' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.polarizer.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.polarizer.width);
                                    return (
                                        <>
                                            {/* Body */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="#333" stroke="#666" strokeWidth="2" rx="2" />
                                            {/* Polarization stripes */}
                                            <line x1="0" y1={-W / 2 + 6} x2="0" y2={W / 2 - 6} stroke="#888" strokeWidth="1" />
                                            <line x1={-L / 4} y1={-W / 2 + 6} x2={-L / 4} y2={W / 2 - 6} stroke="#888" strokeWidth="1" />
                                            <line x1={L / 4} y1={-W / 2 + 6} x2={L / 4} y2={W / 2 - 6} stroke="#888" strokeWidth="1" />
                                            {/* Axis indicator arrow */}
                                            <line
                                                x1="0" y1={-W / 2 - 6} x2="0" y2={-W / 2 - 14}
                                                stroke="#ff0"
                                                strokeWidth="4"
                                                transform={`rotate(${comp.params?.polarizerAxis ?? 0})`}
                                            />
                                            <circle cx="0" cy={-W / 2 - 14} r="4" fill="#ff0" transform={`rotate(${comp.params?.polarizerAxis ?? 0})`} />
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Polarizing Beam Splitter */}
                        {comp.type === 'pbs' && (
                            <g>
                                {(() => {
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.pbs.width);
                                    const half = W / 2;
                                    return (
                                        <>
                                            {/* Cube body */}
                                            <rect x={-half} y={-half} width={W} height={W} fill="rgba(200, 220, 255, 0.3)" stroke="rgba(200, 220, 255, 0.6)" strokeWidth="2" />
                                            {/* Diagonal coating (polarizing surface) */}
                                            <line x1={-half} y1={half} x2={half} y2={-half} stroke="#8af" strokeWidth="4" />
                                            {/* PBS label */}
                                            <text x="0" y={half + 14} fill="#8af" fontSize="12" textAnchor="middle" fontFamily="Arial" style={{ userSelect: 'none' }}>PBS</text>
                                            {/* Axis indicator */}
                                            <line
                                                x1="0" y1={-half - 6} x2="0" y2={-half - 20}
                                                stroke="#ff0"
                                                strokeWidth="4"
                                                transform={`rotate(${comp.params?.pbsAxis ?? 0})`}
                                            />
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Polarization Detector */}
                        {comp.type === 'poldetector' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.poldetector.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.poldetector.width);
                                    return (
                                        <>
                                            {/* Sensor Body (similar to detector but different color) */}
                                            <rect x={-L / 2} y={-W / 2} width={L} height={W} fill="#234" stroke="#68f" strokeWidth="2" />
                                            {/* Active Area with polarization stripes */}
                                            <rect x={-L / 2} y={-W / 2 + 2} width={L > 4 ? L - 4 : L} height={W > 4 ? W - 4 : W} fill="#123" />
                                            <line x1={-L / 2 + 2} y1={-W / 2 + 6} x2={-L / 2 + 2} y2={W / 2 - 6} stroke="#68f" strokeWidth="1" />
                                            <line x1={0} y1={-W / 2 + 6} x2={0} y2={W / 2 - 6} stroke="#68f" strokeWidth="1" />
                                            {/* Readout Overlay (shows polarization) */}
                                            {(comp.params?.showReadout ?? true) && (
                                                <g transform={`rotate(${-comp.rotation}) translate(${W / 2 + 20}, 0)`}>
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

                                                            const chiRad = (ellipticity * Math.PI) / 180;
                                                            const size = 25;
                                                            // Limit minor axis
                                                            const b = Math.min(size, Math.abs(size * Math.tan(chiRad)));
                                                            const a = size;

                                                            // Rotation transform
                                                            return (
                                                                <g transform={`rotate(${angle})`}>
                                                                    <ellipse cx="0" cy="0" rx={a} ry={b} fill="none" stroke="#ff0055" strokeWidth="2" />
                                                                    {b < 5 && (
                                                                        <line x1={-a} y1={0} x2={a} y2={0} stroke="#ff0055" strokeWidth="2" markerEnd="url(#arrow)" />
                                                                    )}
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
                                        </>
                                    );
                                })()}
                            </g>
                        )}



                        {/* Placeholder for others */}
                        {!['laser', 'mirror', 'lens', 'beamsplitter', 'detector', 'fiber', 'iris', 'blocker', 'aom', 'cavity', 'text', 'hwp', 'qwp', 'polarizer', 'pbs', 'poldetector', 'breadboard'].includes(comp.type) && (
                            <circle r="10" fill="#444" stroke="#888" />
                        )}
                    </g>
                ))}

            </svg>

            {/* Scale Bar Indicator */}
            <div style={{
                position: 'absolute',
                bottom: '80px',
                left: '20px',
                background: 'rgba(20, 20, 26, 0.6)',
                backdropFilter: 'blur(4px)',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
                fontSize: '0.8rem',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '40px', // One grid unit
                        height: '2px',
                        background: 'var(--text-dim)',
                        position: 'relative'
                    }}>
                        <div style={{ position: 'absolute', left: 0, top: '-4px', bottom: '-4px', width: '1px', background: 'var(--text-dim)' }} />
                        <div style={{ position: 'absolute', right: 0, top: '-4px', bottom: '-4px', width: '1px', background: 'var(--text-dim)' }} />
                    </div>
                    <span>25 mm</span>
                </div>
            </div>

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
