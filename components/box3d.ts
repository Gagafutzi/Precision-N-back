/**
 * The box and the stimulus, projected by hand.
 *
 * Quad Box (MIT, Copyright (c) 2025 The Quad Box Project Contributors,
 * github.com/soamsy/quad-box) builds this picture out of CSS 3D planes and
 * tumbles the whole scene on all three axes at once. The look here is the same;
 * the arithmetic is done in this file instead of by the browser, which buys one
 * thing that matters: every coordinate is a number, so the box can be checked
 * rather than looked at, and nothing can wander outside the board.
 */

export const CAMERA = 3.4;   // eye distance in cube widths; smaller is wider-angle
export const TARGET = 48;    // half-extent the box is fitted to, of the 50 available

/**
 * The scale a tumbling box has to use: its widest attitude, so it never clips.
 * The extremes are always the eight corners, whatever the cell counts, so this
 * is one number rather than one per grid.
 */
export const WORST_FILL = 1.05;

/** Where the light sits, in view space. Screen y points down. */
const LIGHT = { x: 0.30, y: -0.55, z: 0.78 };

export interface Rot { x: number; y: number; z: number; }
export interface Vec3 { x: number; y: number; z: number; }
export interface Pt { x: number; y: number; z: number; scale: number; }

/** The resting attitude when rotation is switched off: a three-quarter view. */
export const REST_ROT: Rot = { x: -0.42, y: 0.55, z: 0.10 };

/** Rotate about z, then y, then x — the order `rotateX rotateY rotateZ` applies. */
export function view(x: number, y: number, z: number, r: Rot): Vec3 {
    let c = Math.cos(r.z), s = Math.sin(r.z);
    const x1 = x * c - y * s, y1 = x * s + y * c;
    c = Math.cos(r.y); s = Math.sin(r.y);
    const x2 = x1 * c + z * s, z2 = z * c - x1 * s;
    c = Math.cos(r.x); s = Math.sin(r.x);
    const y3 = y1 * c - z2 * s, z3 = y1 * s + z2 * c;
    return { x: x2, y: y3, z: z3 };
}

/** View space into the 0..100 viewBox, divided for perspective. */
export function toScreen(v: Vec3, fill: number): Pt {
    const scale = CAMERA / (CAMERA - v.z);
    return {
        x: 50 + v.x * scale * 50 * fill,
        y: 50 + v.y * scale * 50 * fill,
        z: v.z,
        scale,
    };
}

export const project = (x: number, y: number, z: number, r: Rot, fill: number): Pt =>
    toScreen(view(x, y, z, r), fill);

/**
 * The scale that makes the box fill the board at one particular attitude.
 *
 * Worth doing because a box that is not turning has no worst case to reserve
 * room for: fitting it to the attitude it is actually in is the difference
 * between a box that sits in the middle of the board and one that is the board.
 */
export function fitFill(r: Rot, target = TARGET): number {
    let extent = 0;
    for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5])
            for (const z of [-0.5, 0.5]) {
                const p = project(x, y, z, r, 1);
                extent = Math.max(extent, Math.abs(p.x - 50), Math.abs(p.y - 50));
            }
    return target / (extent || 1);
}

/** A lattice node index turned into a cube coordinate, centred on the origin. */
export const at = (i: number, n: number) => (n === 0 ? 0 : i / n - 0.5);

/** Lambert on the face's own normal, two-sided so winding never matters. */
function shade(a: Vec3, b: Vec3, c: Vec3): number {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = Math.abs((nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / len);
    return 0.45 + 0.55 * d;
}

export interface Line { x1: number; y1: number; x2: number; y2: number; near: number; depth: number; }

/** Every edge of the cell lattice: the twelve grid planes Quad Box stacks. */
export function latticeLines(cols: number, rows: number, layers: number, r: Rot, fill: number): Line[] {
    const out: Line[] = [];
    const push = (a: Pt, b: Pt) => out.push({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        near: Math.min(a.scale, b.scale),
        depth: (a.z + b.z) / 2,
    });
    for (let row = 0; row <= rows; row++)
        for (let l = 0; l <= layers; l++)
            push(project(at(0, cols), at(row, rows), at(l, layers), r, fill),
                 project(at(cols, cols), at(row, rows), at(l, layers), r, fill));
    for (let col = 0; col <= cols; col++)
        for (let l = 0; l <= layers; l++)
            push(project(at(col, cols), at(0, rows), at(l, layers), r, fill),
                 project(at(col, cols), at(rows, rows), at(l, layers), r, fill));
    for (let col = 0; col <= cols; col++)
        for (let row = 0; row <= rows; row++)
            push(project(at(col, cols), at(row, rows), at(0, layers), r, fill),
                 project(at(col, cols), at(row, rows), at(layers, layers), r, fill));
    return out;
}

export interface Face {
    points: string;                 // ready for an SVG polygon
    depth: number;                  // mean view z; the painter's key
    light: number;                  // 0..1
    kind: 'cap' | 'side';
    index: number;                  // which side, for picking a hue
    box: { x: number; y: number; s: number };  // square the cap's pattern is drawn into
}

/**
 * The stimulus as a solid: the shape's own outline extruded into a prism.
 *
 * A sprite facing the camera would stay a sprite however the box turned. Giving
 * the outline a depth means the sides come into view as it rotates, which is
 * what makes it read as an object sitting in the box rather than on top of it.
 */
export function prismFaces(opts: {
    centre: Vec3;
    radii: number[];    // per-vertex radius multipliers, 0..1
    radius: number;     // cube units
    depth: number;      // cube units, the full extrusion
    rot: Rot;
    fill: number;
}): Face[] {
    const { centre, radii, radius, depth, rot, fill } = opts;
    const n = radii.length;
    const front: Vec3[] = [], back: Vec3[] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const dx = radius * radii[i] * Math.cos(a);
        const dy = radius * radii[i] * Math.sin(a);
        front.push(view(centre.x + dx, centre.y + dy, centre.z + depth / 2, rot));
        back.push(view(centre.x + dx, centre.y + dy, centre.z - depth / 2, rot));
    }

    const faces: Face[] = [];
    const add = (vs: Vec3[], kind: 'cap' | 'side', index: number) => {
        const ps = vs.map(v => toScreen(v, fill));
        const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        // A square box, so the pattern is never stretched by the projection.
        const s = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
        faces.push({
            points: ps.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
            depth: vs.reduce((t, v) => t + v.z, 0) / vs.length,
            light: shade(vs[0], vs[1], vs[2]),
            kind,
            index,
            box: { x: x0 + (Math.max(...xs) - x0 - s) / 2, y: y0 + (Math.max(...ys) - y0 - s) / 2, s },
        });
    };

    add(back, 'cap', -1);
    for (let i = 0; i < n; i++) add([front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]], 'side', i);
    add(front, 'cap', -1);

    return faces.sort((a, b) => a.depth - b.depth);   // far first
}
