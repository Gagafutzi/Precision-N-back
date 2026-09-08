
import React, { useId } from 'react';
import { Shape, ColorPattern } from '../types';

interface ShapeDisplayProps {
  shape: Shape;
  hues: [number, number, number];
  size: number;
  colorEnabled: boolean;
  shapeEnabled: boolean;
  colorPattern: ColorPattern;
  bubbleData?: { cx: number; cy: number; r: number; }[];
  topoData?: { points: {x: number, y: number}[] }[];
}

/**
 * The colour pattern on its own, in a size x size box.
 *
 * Pulled out of ShapeDisplay so the 3D board can paint the same pattern onto a
 * projected face, clipped to the face's own outline rather than to a square.
 */
export const ColorPatternSvg: React.FC<{
  hues: [number, number, number];
  size: number;
  colorPattern: ColorPattern;
  bubbleData?: { cx: number; cy: number; r: number; }[];
  topoData?: { points: {x: number, y: number}[] }[];
}> = ({ hues, size, colorPattern, bubbleData, topoData }) => {
    const aztecPatternId = useId();
    const color1 = `hsl(${hues[0]}, 80%, 50%)`;
    const color2 = `hsl(${hues[1]}, 80%, 50%)`;
    const color3 = `hsl(${hues[2]}, 80%, 50%)`;
    const colors = [color1, color2, color3];

    switch (colorPattern) {
      case 'horizontal':
        const stripeHeight = size / 3;
        return (
          <>
            <rect x="0" y="0" width={size} height={stripeHeight} fill={color1} />
            <rect x="0" y={stripeHeight} width={size} height={stripeHeight} fill={color2} />
            <rect x="0" y={stripeHeight * 2} width={size} height={stripeHeight} fill={color3} />
          </>
        );
      case 'triangles':
        const s = size;
        const c = size / 2;
        return (
          <>
            <polygon points={`0,0 ${s},0 ${c},${c}`} fill={color1} />
            <polygon points={`0,0 0,${s} ${c},${c}`} fill={color2} />
            <polygon points={`${s},0 ${s},${s} 0,${s} ${c},${c}`} fill={color3} />
          </>
        );
      case 'radial':
        return (
          <>
            <circle cx={size / 2} cy={size / 2} r={size / 2} fill={color3} />
            <circle cx={size / 2} cy={size / 2} r={size / 3} fill={color2} />
            <circle cx={size / 2} cy={size / 2} r={size / 6} fill={color1} />
          </>
        );
      case 'blocky':
        // Fix: Rename numRows to numBrickRows to avoid scope collision with 'hexagons' case.
        const numBrickRows = 4;
        const bricksPerRow = 2;
        const rowHeight = size / numBrickRows;
        const brickWidth = size / bricksPerRow;
        const brickColors = [color1, color2, color3, color2, color1, color3];

        const bricks = [];
        for (let row = 0; row < numBrickRows; row++) {
            const y = row * rowHeight;
            const offset = (row % 2) * (brickWidth / 2);
            const numBricksInRow = bricksPerRow + (row % 2);

            for (let col = 0; col < numBricksInRow; col++) {
                const x = col * brickWidth - offset;
                bricks.push(
                    <rect
                        key={`brick-${row}-${col}`}
                        x={x}
                        y={y}
                        width={brickWidth}
                        height={rowHeight}
                        fill={brickColors[(row * bricksPerRow + col) % brickColors.length]}
                    />
                );
            }
        }
        return <>{bricks}</>;
      case 'aztec':
        // Cleaner, less saturated background
        const darkBg = `hsl(${hues[1]}, 25%, 20%)`;
        
        // Softer, less saturated foreground colors
        const cleanColor1 = `hsl(${hues[0]}, 65%, 55%)`;
        const cleanColor2 = `hsl(${hues[1]}, 65%, 55%)`;
        const cleanColor3 = `hsl(${hues[2]}, 65%, 55%)`;
        
        // Paths decoded and adapted from user-provided CSS inspiration
        const path1 = 'M0 28h20V16h-4v8H4V4h28v28h-4V8H8v12h4v-8h12v20H0v-4z';
        const path2 = 'M12 36h20v4H16v24H0v-4h12V36z';
        const path3 = 'M28 48h-4v12h8v4H20V44h12v12h-4v-8z';
        const path4 = 'M0 36h8v20H0v-4h4V40H0v-4z';
        
        return (
            <>
                <defs>
                    <pattern id={aztecPatternId} patternUnits="userSpaceOnUse" width="32" height="64">
                        <rect width="32" height="64" fill={darkBg} />
                        {/* More balanced color distribution */}
                        <path d={path1} fill={cleanColor1} />
                        <path d={path2} fill={cleanColor2} />
                        <path d={path3} fill={cleanColor3} />
                        <path d={path4} fill={cleanColor2} />
                    </pattern>
                </defs>
                <rect x="0" y="0" width={size} height={size} fill={`url(#${aztecPatternId})`} />
            </>
        );
      case 'grid':
        const gridSize = 3;
        const cellSize = size / gridSize;
        const gridElements = [];
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            const x = col * cellSize;
            const y = row * cellSize;
            const bgColor = colors[(row + col) % 3];
            const circleColor = colors[(row + col + 1) % 3];
            gridElements.push(<rect key={`s-${row}-${col}`} x={x} y={y} width={cellSize} height={cellSize} fill={bgColor} />);
            gridElements.push(<circle key={`c-${row}-${col}`} cx={x + cellSize / 2} cy={y + cellSize / 2} r={cellSize / 3} fill={circleColor} />);
          }
        }
        return <>{gridElements}</>;
      case 'hexagons':
        const hexRadius = size / 6; // Larger hexagons for clarity
        const hexWidth = Math.sqrt(3) * hexRadius;
        const hexHeight = 2 * hexRadius;
        const vertDist = hexHeight * 0.75;
        const strokeColor = `hsl(${hues[1]}, 30%, 15%)`;

        const hexagons = [];
        const numCols = Math.ceil(size / hexWidth) + 2;
        // Fix: Rename numRows to numHexRows to avoid scope collision with 'blocky' case.
        const numHexRows = Math.ceil(size / vertDist) + 2;

        for (let row = -1; row < numHexRows; row++) {
            for (let col = -1; col < numCols; col++) {
                const cx = col * hexWidth + (row % 2) * (hexWidth / 2);
                const cy = row * vertDist;

                let points = "";
                for (let side = 0; side < 6; side++) {
                    const angle = (Math.PI / 3) * side + Math.PI / 6; // Pointy-top
                    points += `${cx + hexRadius * Math.cos(angle)},${cy + hexRadius * Math.sin(angle)} `;
                }

                const colorIndex = (Math.abs(row + col)) % 3;
                hexagons.push(
                    <polygon
                        key={`hex-${row}-${col}`}
                        points={points.trim()}
                        fill={colors[colorIndex]}
                        stroke={strokeColor}
                        strokeWidth={size / 150} // Subtle stroke for definition
                    />
                );
            }
        }
        return <g>{hexagons}</g>;
      case 'bubbles':
        if (!bubbleData) return null;
        const bgColorBubbles = `hsl(${hues[1]}, 60%, 25%)`;
        const bubbles = bubbleData.map((b, i) => (
            <circle key={`bubble-${i}`} cx={b.cx * size} cy={b.cy * size} r={b.r * size} fill={colors[i % 3]} fillOpacity="0.7" />
        ));
        return (
          <>
            <rect x="0" y="0" width={size} height={size} fill={bgColorBubbles} />
            {bubbles}
          </>
        );
      case 'topo':
          if (!topoData) return null;
          const bgColorTopo = `hsl(${hues[1]}, 60%, 25%)`;
          const pointsToPath = (points: {x: number, y: number}[]) => {
              if (points.length < 2) return "";
              let path = `M ${points[0].x},${points[0].y}`;
              for (let i = 0; i < points.length - 1; i++) {
                  const p1 = points[i];
                  const p2 = points[i+1];
                  const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                  path += ` Q ${p1.x},${p1.y} ${midPoint.x},${midPoint.y}`;
              }
              path += ` Q ${points[points.length-1].x},${points[points.length-1].y} ${(points[points.length-1].x + points[0].x)/2},${(points[points.length-1].y + points[0].y)/2}`;
              return path + " Z";
          };
          
          const paths = topoData.map((line, i) => {
              const scaledPoints = line.points.map(p => ({ x: p.x * size, y: p.y * size }));
              return <path key={`topo-${i}`} d={pointsToPath(scaledPoints)} fill="none" stroke={colors[i % 3]} strokeWidth={size / 40} />;
          });
          return (
            <>
              <rect x="0" y="0" width={size} height={size} fill={bgColorTopo} />
              {paths}
            </>
          );
      case 'vertical':
      default:
        const stripeWidth = size / 3;
        return (
          <>
            <rect x="0" y="0" width={stripeWidth} height={size} fill={color1} />
            <rect x={stripeWidth} y="0" width={stripeWidth} height={size} fill={color2} />
            <rect x={stripeWidth * 2} y="0" width={stripeWidth} height={size} fill={color3} />
          </>
        );
    }
};

const ShapeDisplay: React.FC<ShapeDisplayProps> = ({ shape, hues, size, colorEnabled, shapeEnabled, colorPattern, bubbleData, topoData }) => {
  const uniqueClipId = useId();

  // Define the shape polygon path if shape is enabled
  const shapePoints = shapeEnabled ? shape.vertices.map((vertex, i) => {
    const angle = (i / shape.vertices.length) * 2 * Math.PI - (Math.PI / 2);
    const radius = (size / 2) * vertex.radius;
    const x = size / 2 + radius * Math.cos(angle);
    const y = size / 2 + radius * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ') : '';
  
  // Define the color pattern elements

  // Main rendering logic based on which modalities are active
  if (colorEnabled && shapeEnabled) {
    // Both enabled: color pattern clipped by shape
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id={uniqueClipId}>
            <polygon points={shapePoints} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uniqueClipId})`}>
          <ColorPatternSvg hues={hues} size={size} colorPattern={colorPattern} bubbleData={bubbleData} topoData={topoData} />
        </g>
      </svg>
    );
  } else if (colorEnabled) {
    // Only color enabled: pattern fills the square
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <ColorPatternSvg hues={hues} size={size} colorPattern={colorPattern} bubbleData={bubbleData} topoData={topoData} />
      </svg>
    );
  } else if (shapeEnabled) {
    // Only shape enabled: solid color shape
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={shapePoints} fill={'var(--color-primary)'} />
      </svg>
    );
  } else {
    // Neither enabled: solid color circle (default stimulus)
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={size / 2} fill={'var(--color-primary)'} />
      </svg>
    );
  }
};

export default ShapeDisplay;
