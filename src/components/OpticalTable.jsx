import React, { useState, useRef, useMemo, useEffect } from 'react';
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

    const segments = [];
    const STEPS = 10;

    // Pass 1: Generate Raw Segments
    for (let i = 0; i < ray.path.length - 1; i++) {
        const pStart = ray.path[i];
        const pEnd = ray.path[i + 1];
        const params = ray.gaussianParamsList[i];

        if (!params) continue;

        const dir = sub(pEnd, pStart);
        const len = mag(dir);
        if (len < 0.001) continue;

        const ndir = normalize(dir);
        const perp = { x: -ndir.y, y: ndir.x };

        const segLeft = [];
        const segRight = [];

        for (let j = 0; j <= STEPS; j++) {
            const t = j / STEPS;
            const currentPos = add(pStart, mul(dir, t));
            const currentDist = len * t;

            const zAtPoint = params.z + currentDist;
            const w = getGaussianWidth(zAtPoint, params.w0, params.zR);
            const visualW = Math.max(w, 0.5);

            segLeft.push(add(currentPos, mul(perp, visualW)));
            segRight.push(sub(currentPos, mul(perp, visualW)));
        }
        segments.push({
            left: segLeft,
            right: segRight,
            dir: ndir,
            pStart,
            pEnd,
            perp
        });
    }

    // Pass 2: Stitch Joints
    const finalLeft = [];
    const finalRight = [];

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        // Add body points (excluding last point if we are going to stitch it, but here we modify in place)

        if (i < segments.length - 1) {
            const nextSeg = segments[i + 1];

            // Calculate angle
            const dotP = seg.dir.x * nextSeg.dir.x + seg.dir.y * nextSeg.dir.y;

            // "Blend when touching at the lens only"
            // Lenses deflect by small angles (dotP close to 1). 
            // Mirrors deflect by large angles (dotP < 0 usually, or close to -1).
            // Threshold: dotP > 0.9 (approx < 25 degrees deflection) => Smooth Stitch

            if (dotP > 0.9) {
                // Smooth Stitch (Bisector)
                // Calculate bisector normal
                // Tangent = normalize(dir1 + dir2)
                const sumDir = add(seg.dir, nextSeg.dir);
                const tangent = normalize(sumDir);
                const bisector = { x: -tangent.y, y: tangent.x };

                // Project width? 
                // Using average width at the vertex
                // seg.left[last] and nextSeg.left[0] are typically at the same spatial vertex
                const vLast = seg.left[seg.left.length - 1];
                const vFirst = nextSeg.left[0];

                // Get w from distance logic?
                // Approximation: take the midpoint of the current endpoints magnitude
                // Better: we calculated 'visualW' in Pass 1.
                // We can reconstruct it or just use the raw calculation logic again if needed, 
                // but simpler is to infer 'w' from the existing points deviation from center.
                // Center is seg.pEnd
                const wApprox = mag(sub(vLast, seg.pEnd));

                // Correction for miter scale: w / dot(perp, bisector)
                const cosHalfAngle = seg.perp.x * bisector.x + seg.perp.y * bisector.y;
                const miterScale = 1 / Math.max(0.1, Math.abs(cosHalfAngle));
                const finalW = wApprox * miterScale;

                const fusedLeft = add(seg.pEnd, mul(bisector, finalW));
                const fusedRight = sub(seg.pEnd, mul(bisector, finalW));

                // Snap endpoints
                seg.left[seg.left.length - 1] = fusedLeft;
                seg.right[seg.right.length - 1] = fusedRight;
                nextSeg.left[0] = fusedLeft;
                nextSeg.right[0] = fusedRight;

            } else {
                // Sharp Stitch (Fan / Bevel) for Mirrors or sharp turns
                // Add interpolation points to the END of current segment
                const lastPerp = seg.perp;
                const nextPerp = nextSeg.perp;
                const center = seg.pEnd;
                // Re-calc w at joint
                const vLast = seg.left[seg.left.length - 1];
                const wAtJoint = mag(sub(vLast, center));

                const fanPointsLeft = [];
                const fanPointsRight = [];
                const FAN = 5;
                for (let k = 1; k < FAN; k++) {
                    const t = k / FAN;
                    const mx = lastPerp.x * (1 - t) + nextPerp.x * t;
                    const my = lastPerp.y * (1 - t) + nextPerp.y * t;
                    const mlen = Math.sqrt(mx * mx + my * my);
                    const mperp = { x: mx / mlen, y: my / mlen };

                    fanPointsLeft.push(add(center, mul(mperp, wAtJoint)));
                    fanPointsRight.push(sub(center, mul(mperp, wAtJoint)));
                }

                // Append fan to current segment arrays
                seg.left.push(...fanPointsLeft);
                seg.right.push(...fanPointsRight);
            }
        }

        // Append to final list
        // Note: For smooth stitch, nextSeg[0] is blended, so we add all points.
        // There will be a duplicate point at the joint (seg[last] == nextSeg[0]).
        // SVG handles duplicate points fine (zero length segment).
        finalLeft.push(...seg.left);
        finalRight.push(...seg.right);
    }

    const points = [
        ...finalLeft,
        ...finalRight.reverse()
    ];

    if (points.length === 0) return '';

    return points.map(p => `${p.x},${p.y}`).join(' ');
};

const OpticalTable = ({ components, setComponents, onSelect, saveCheckpoint }) => {
    // --- Viewport State ---
    // viewBox: { x, y, w, h }
    // x, y: Top-left corner in world coordinates
    // w, h: Width/Height in world coordinates
    const [viewBox, setViewBox] = useState({ x: -100, y: -100, w: 1000, h: 600 });
    const svgRef = useRef(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Track current scale (screen pixels per world unit) to preserve it during resize
    const scaleRef = useRef(1.0);

    // Update scaleRef whenever viewBox changes (in render or effect)
    useEffect(() => {
        if (svgRef.current) {
            const clientW = svgRef.current.clientWidth;
            if (clientW > 0 && viewBox.w > 0) {
                scaleRef.current = clientW / viewBox.w;
            }
        }
    }, [viewBox.w, svgRef.current]); // Depend on viewBox.w and svgRef.current

    // Resize Observer to handle container size changes (e.g. sidebar collapse/expand or window resize)
    useEffect(() => {
        const el = svgRef.current;
        if (!el) return;

        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width === 0 || height === 0) continue;

                // Maintain current zoom level (scaleRef)
                // newViewW = newClientW / scale
                // newViewH = newClientH / scale

                setViewBox(prev => {
                    // Start with current scale, or fallback
                    const currentScale = scaleRef.current || 1;
                    const newW = width / currentScale;
                    const newH = height / currentScale;

                    // Pin Top-Left (x, y) - content stays stable relative to top-left
                    return { ...prev, w: newW, h: newH };
                });
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, [svgRef.current]); // Depend on svgRef.current

    const [isPanning, setIsPanning] = useState(false);
    const [draggedCompId, setDraggedCompId] = useState(null);
    // const [snapToGrid, setSnapToGrid] = useState(true); // Removed

    const fileInputRef = useRef(null);

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

    const saveSetup = () => {
        const json = JSON.stringify(components, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `optical-setup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const loadSetup = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (Array.isArray(data)) {
                    setComponents(data, true); // Commit to history
                } else {
                    alert('Invalid setup file format.');
                }
            } catch (err) {
                console.error('Error parsing setup file:', err);
                alert('Failed to load setup file.');
            }
        };
        reader.readAsText(file);

        // Reset input so same file can be selected again
        e.target.value = '';
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
                        // Default snap: Center to Grid
                        let snapOffsetX = 0;
                        let snapOffsetY = 0;

                        // Breadboard snap: Corner to Grid (Bolt position)
                        // Bolt at nominal corner = Center +/- NominalDim/2
                        // Snap condition: (Center - Offset) % Grid == 0
                        if (c.type === 'breadboard') {
                            const L_nominal = toPixels(c.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.breadboard.length);
                            const W_nominal = toPixels(c.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.breadboard.width);
                            snapOffsetX = L_nominal / 2;
                            snapOffsetY = W_nominal / 2;
                        }

                        // Formula: Round((Pos - Offset) / Grid) * Grid + Offset
                        const snappedX = Math.round((rawX - snapOffsetX) / GRID_SIZE) * GRID_SIZE + snapOffsetX;
                        const snappedY = Math.round((rawY - snapOffsetY) / GRID_SIZE) * GRID_SIZE + snapOffsetY;

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

        // Calculate Snap Offset for Drop
        let snapOffsetX = 0;
        let snapOffsetY = 0;
        if (type === 'breadboard') {
            const L_nominal = toPixels(defaultParams.physicalDim.length);
            const W_nominal = toPixels(defaultParams.physicalDim.width);
            snapOffsetX = L_nominal / 2;
            snapOffsetY = W_nominal / 2;
        }

        const finalX = shouldSnap ? Math.round((svgPoint.x - snapOffsetX) / GRID_SIZE) * GRID_SIZE + snapOffsetX : svgPoint.x;
        const finalY = shouldSnap ? Math.round((svgPoint.y - snapOffsetY) / GRID_SIZE) * GRID_SIZE + snapOffsetY : svgPoint.y;

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

        onSelect(id); // Always select on click

        const comp = components.find(c => c.id === id);
        if (comp && comp.locked) return; // Prevent drag if locked

        saveCheckpoint();    // Save state before drag starts
        setDraggedCompId(id);
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

        // Default to a reasonable startup view if no components
        if (!isFinite(minX)) {
            minX = -400; maxX = 400; minY = -300; maxY = 300;
        }

        const contentW = Math.max(100, maxX - minX); // Ensure non-zero
        const contentH = Math.max(100, maxY - minY);

        // Get actual screen size to ensure aspect ratio match
        const clientW = svgRef.current?.clientWidth || 1000;
        const clientH = svgRef.current?.clientHeight || 600;

        // Calculate scale to fit content with padding (80% coverage)
        // scale = ScreenPixels / WorldUnits
        const scaleX = clientW / (contentW / SCREEN_COVERAGE);
        const scaleY = clientH / (contentH / SCREEN_COVERAGE);
        const scale = Math.min(scaleX, scaleY); // Fit entirely

        // Calculate new World W/H based on this scale to match screen Aspect Ratio
        // This prevents "slice" from cropping edges
        const newW = clientW / scale;
        const newH = clientH / scale;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        setViewBox({
            x: centerX - newW / 2,
            y: centerY - newH / 2,
            w: newW,
            h: newH
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
                preserveAspectRatio="none"
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

                    {/* Breadboard Pattern (M6 @ 12.5mm, M4 @ 6.25mm grid - Staggered/Center-Only) */}
                    <pattern id="breadboard-dense-grid" x="0" y="0" width={toPixels(12.5)} height={toPixels(12.5)} patternUnits="userSpaceOnUse">
                        {/* M6 Holes at Corners (Origin) - Spacing 12.5mm */}
                        <circle cx={toPixels(0)} cy={toPixels(0)} r={toPixels(3)} fill="#111" opacity="0.6" />
                        <circle cx={toPixels(12.5)} cy={toPixels(0)} r={toPixels(3)} fill="#111" opacity="0.6" />
                        <circle cx={toPixels(0)} cy={toPixels(12.5)} r={toPixels(3)} fill="#111" opacity="0.6" />
                        <circle cx={toPixels(12.5)} cy={toPixels(12.5)} r={toPixels(3)} fill="#111" opacity="0.6" />

                        {/* M4 Hole at Center (Offset 6.25mm) - Spacing effectively 12.5mm staggered */}
                        <circle cx={toPixels(6.25)} cy={toPixels(6.25)} r={toPixels(2)} fill="#111" opacity="0.5" />
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
                <g className="no-export" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {(() => {
                        // Adaptive Scale Calculation
                        // We need the ratio of ViewBox Width (World Units) to Client Width (Screen Pixels)
                        const clientW = svgRef.current?.clientWidth || 1000;
                        const pixelScale = viewBox.w / clientW;

                        // Adaptive Font Size (e.g. 12px on screen)
                        const fontSize = 12 * pixelScale;
                        const xOffset = 15 * pixelScale;
                        const yOffset = 25 * pixelScale;

                        const majorGridSize = 200; // 125mm
                        const startX = Math.floor(viewBox.x / majorGridSize) * majorGridSize;
                        const endX = Math.ceil((viewBox.x + viewBox.w) / majorGridSize) * majorGridSize;
                        const startY = Math.floor(viewBox.y / majorGridSize) * majorGridSize;
                        const endY = Math.ceil((viewBox.y + viewBox.h) / majorGridSize) * majorGridSize;

                        const labels = [];
                        // X Labels (Top edge)
                        for (let x = startX; x <= endX; x += majorGridSize) {
                            if (x === 0) continue; // Skip center
                            labels.push(
                                <text
                                    key={`x-${x}`}
                                    x={x}
                                    y={viewBox.y + yOffset}
                                    fill="var(--text-dim)"
                                    fontSize={fontSize}
                                    textAnchor="middle"
                                    opacity="0.8"
                                    style={{ textShadow: `0 0 ${4 * pixelScale}px rgba(0,0,0,0.5)` }}
                                >
                                    {Math.round(toMM(x))} mm
                                </text>
                            );
                        }
                        // Y Labels (Left edge)
                        for (let y = startY; y <= endY; y += majorGridSize) {
                            if (y === 0) continue; // Skip center
                            labels.push(
                                <text
                                    key={`y-${y}`}
                                    x={viewBox.x + xOffset}
                                    y={y + (4 * pixelScale)}
                                    fill="var(--text-dim)"
                                    fontSize={fontSize}
                                    textAnchor="start"
                                    opacity="0.8"
                                    style={{ textShadow: `0 0 ${4 * pixelScale}px rgba(0,0,0,0.5)` }}
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
                            // Nominal Dimensions (e.g. 500x500) - Corresponds to Mounting Hole Centers
                            const L_nominal = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.breadboard.length);
                            const W_nominal = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.breadboard.width);

                            // Actual Dimensions (Expanded by 12.5mm each side -> 25mm total)
                            // "overall breadboard if 500x500 will be 525x525"
                            const expansion = toPixels(25);
                            const L_actual = L_nominal + expansion;
                            const W_actual = W_nominal + expansion;

                            return (
                                <>
                                    {/* Plate Body (Dark) */}
                                    <rect
                                        x={-L_actual / 2}
                                        y={-W_actual / 2}
                                        width={L_actual}
                                        height={W_actual}
                                        fill="#282828"
                                        stroke="#444"
                                        strokeWidth="2"
                                        rx="4"
                                    />

                                    {/* Hole Pattern */}
                                    {/* M6 Grid at edge (e.g. 250) aligns with Nominal spec. */}
                                    {/* We extend the render rect slightly (4mm > 3mm radius) to ensure edge holes are fully round circles, not clipped D-shapes. */}
                                    {/* Physical board is expanded (525mm) so we have space. */}
                                    <rect
                                        x={-L_nominal / 2 - toPixels(4)}
                                        y={-W_nominal / 2 - toPixels(4)}
                                        width={L_nominal + toPixels(8)}
                                        height={W_nominal + toPixels(8)}
                                        fill="url(#breadboard-dense-grid)"
                                        stroke="none"
                                    />

                                    {/* Table Mounting Holes (M6 Clearance - 4 Corners) */}
                                    <circle cx={-L_nominal / 2} cy={-W_nominal / 2} r={toPixels(3.5)} fill="#222" stroke="#555" strokeWidth="2" />
                                    <circle cx={L_nominal / 2} cy={-W_nominal / 2} r={toPixels(3.5)} fill="#222" stroke="#555" strokeWidth="2" />
                                    <circle cx={-L_nominal / 2} cy={W_nominal / 2} r={toPixels(3.5)} fill="#222" stroke="#555" strokeWidth="2" />
                                    <circle cx={L_nominal / 2} cy={W_nominal / 2} r={toPixels(3.5)} fill="#222" stroke="#555" strokeWidth="2" />
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
                                            <rect x={-T / 2} y={-R} width={T} height={H} fill="transparent" stroke="none" />

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

                                            {/* Decorative Power Meter Circles (Visual only) */}
                                            {/* Top Circle */}
                                            <circle cx={0} cy={-W / 4} r={Math.min(L, W) * 0.3} fill="none" stroke="#444" strokeWidth="2" />
                                            <circle cx={0} cy={-W / 4} r={Math.min(L, W) * 0.2} fill="none" stroke="#333" strokeWidth="1" />
                                            <line x1={0} y1={-W / 4 - 4} x2={0} y2={-W / 4 + 4} stroke="#444" strokeWidth="1" />
                                            <line x1={-4} y1={-W / 4} x2={4} y2={-W / 4} stroke="#444" strokeWidth="1" />

                                            {/* Bottom Circle */}
                                            <circle cx={0} cy={W / 4} r={Math.min(L, W) * 0.3} fill="none" stroke="#444" strokeWidth="2" />
                                            <circle cx={0} cy={W / 4} r={Math.min(L, W) * 0.2} fill="none" stroke="#333" strokeWidth="1" />
                                            <line x1={0} y1={W / 4 - 4} x2={0} y2={W / 4 + 4} stroke="#444" strokeWidth="1" />
                                            <line x1={-4} y1={W / 4} x2={4} y2={W / 4} stroke="#444" strokeWidth="1" />
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



                        {/* Camera (CCD) */}
                        {comp.type === 'camera' && (
                            <g>
                                {(() => {
                                    // CCD (Zelux): 15mm (Length/Depth) x 47.2mm (Width)
                                    const L = toPixels(comp.params?.physicalDim?.length ?? 15);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? 47.2);

                                    const power = hits[comp.id] || 0;

                                    return (
                                        <>
                                            {/* Body */}
                                            <rect
                                                x={-L / 2}
                                                y={-W / 2}
                                                width={L}
                                                height={W}
                                                fill="#1a1a1a"
                                                stroke="#444"
                                                strokeWidth="2"
                                                rx="2"
                                            />

                                            {/* Screen/Sensor Area Indication (Front Face) */}
                                            <line x1={-L / 2} y1={-W / 2 + 4} x2={-L / 2} y2={W / 2 - 4} stroke="#00ff9d" strokeWidth="3" opacity="0.6" />

                                            {/* Label Text */}
                                            <g transform={`rotate(-90)`}>
                                                <text
                                                    x="0"
                                                    y={L / 4}
                                                    fill="#ccc"
                                                    fontSize="10"
                                                    textAnchor="middle"
                                                    fontFamily="monospace"
                                                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                                                >
                                                    THORLABS
                                                </text>
                                                <text
                                                    x="0"
                                                    y={-L / 4 + 10}
                                                    fill="#fff"
                                                    fontSize="12"
                                                    fontWeight="bold"
                                                    textAnchor="middle"
                                                    fontFamily="sans-serif"
                                                    style={{ userSelect: 'none', pointerEvents: 'none', letterSpacing: '1px' }}
                                                >
                                                    Zelux
                                                </text>
                                            </g>

                                            {/* Probe Readout (if hit) */}
                                            {power > 0 && (
                                                <g transform={`translate(${L / 2 + 20}, 0)`}>
                                                    <rect x="-10" y="-15" width="100" height="30" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00ff9d" />
                                                    <text x="40" y="5" fill="#00ff9d" fontSize="14" textAnchor="middle" fontFamily="monospace">
                                                        {formatPower(power)}
                                                    </text>
                                                </g>
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* EMCCD Camera */}
                        {comp.type === 'emccd' && (
                            <g>
                                {(() => {
                                    // EMCCD: 150mm (Length) x 200mm (Width)
                                    const L = toPixels(comp.params?.physicalDim?.length ?? 150);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? 200);

                                    const power = hits[comp.id] || 0;

                                    return (
                                        <>
                                            {/* Body */}
                                            <rect
                                                x={-L / 2}
                                                y={-W / 2}
                                                width={L}
                                                height={W}
                                                fill="#101010"
                                                stroke="#444"
                                                strokeWidth="2"
                                                rx="4"
                                            />

                                            {/* Screen/Sensor Area Indication */}
                                            <line x1={-L / 2} y1={-W / 2 + 4} x2={-L / 2} y2={W / 2 - 4} stroke="#00ff9d" strokeWidth="4" opacity="0.6" />

                                            {/* Label Text */}
                                            <g transform={`rotate(-90)`}>
                                                <text
                                                    x="0"
                                                    y={0}
                                                    fill="#ccc"
                                                    fontSize="24"
                                                    textAnchor="middle"
                                                    fontFamily="monospace"
                                                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                                                >
                                                    EMCCD
                                                </text>
                                            </g>

                                            {/* Probe Readout (if hit) */}
                                            {power > 0 && (
                                                <g transform={`translate(${L / 2 + 20}, 0)`}>
                                                    <rect x="-10" y="-15" width="100" height="30" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00ff9d" />
                                                    <text x="40" y="5" fill="#00ff9d" fontSize="14" textAnchor="middle" fontFamily="monospace">
                                                        {formatPower(power)}
                                                    </text>
                                                </g>
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {comp.type === 'vaporcell' && (
                            <g>
                                {(() => {
                                    const L = toPixels(comp.params?.physicalDim?.length ?? DEFAULT_DIMENSIONS_MM.vaporcell.length);
                                    const W = toPixels(comp.params?.physicalDim?.width ?? DEFAULT_DIMENSIONS_MM.vaporcell.width);
                                    // Height would be W for cylinder/box usually match.
                                    const isCylindrical = (comp.params?.shape || 'cylindrical') === 'cylindrical';
                                    const element = comp.params?.element || 'Rb-87';

                                    // Color based on element? (Optional)
                                    // Rb: reddish/violet, Cs: orangey/gold. Just subtle tint.
                                    const tint = element.includes('Rb') ? 'rgba(200, 100, 200, 0.2)' :
                                        element.includes('Cs') ? 'rgba(200, 150, 50, 0.2)' :
                                            'rgba(200, 220, 255, 0.2)';

                                    return (
                                        <>
                                            {isCylindrical ? (
                                                <>
                                                    {/* Tube Body */}
                                                    <rect x={-L / 2} y={-W / 2} width={L} height={W} fill={tint} stroke="rgba(200,220,255,0.6)" strokeWidth="1" />
                                                    {/* End Caps / Windows (Ellipses for simple 2D cylinder look, or just lines) */}
                                                    <line x1={-L / 2} y1={-W / 2} x2={-L / 2} y2={W / 2} stroke="rgba(200,220,255,0.8)" strokeWidth="2" />
                                                    <line x1={L / 2} y1={-W / 2} x2={L / 2} y2={W / 2} stroke="rgba(200,220,255,0.8)" strokeWidth="2" />
                                                    {/* Highlights */}
                                                    <line x1={-L / 2 + 5} y1={-W / 4} x2={L / 2 - 5} y2={-W / 4} stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                                                </>
                                            ) : (
                                                <>
                                                    {/* Box Body */}
                                                    <rect x={-L / 2} y={-W / 2} width={L} height={W} fill={tint} stroke="rgba(200,220,255,0.8)" strokeWidth="1" />
                                                    {/* Inner volume hint */}
                                                    <rect x={-L / 2 + 4} y={-W / 2 + 4} width={L - 8} height={W - 8} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                                                </>
                                            )}

                                            {/* Element Label */}
                                            <text
                                                x="0"
                                                y="4"
                                                fontSize="12"
                                                fill="rgba(255,255,255,0.8)"
                                                textAnchor="middle"
                                                fontWeight="bold"
                                                style={{ userSelect: 'none', pointerEvents: 'none', textShadow: '0 0 2px black' }}
                                            >
                                                {element}
                                            </text>
                                        </>
                                    );
                                })()}
                            </g>
                        )}

                        {/* Placeholder for others */}
                        {!['laser', 'mirror', 'lens', 'beamsplitter', 'detector', 'fiber', 'iris', 'blocker', 'aom', 'cavity', 'text', 'hwp', 'qwp', 'polarizer', 'pbs', 'poldetector', 'breadboard', 'vaporcell', 'camera', 'emccd'].includes(comp.type) && (
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
                    onClick={saveSetup}
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
                    <span style={{ fontSize: '1.1em' }}>📄</span>
                    Save JSON
                </button>

                <button
                    onClick={() => fileInputRef.current?.click()}
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
                    <span style={{ fontSize: '1.1em' }}>📂</span>
                    Load JSON
                </button>

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={loadSetup}
                    accept=".json"
                    style={{ display: 'none' }}
                />

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
