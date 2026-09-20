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

import { SolidTexture } from './texture3d';

export const CAMERA = 3.4;   // eye distance in cube widths; smaller is wider-angle
export const TARGET = 49;    // half-extent the box is fitted to, of the 50 available

/**
 * The scale a tumbling box has to use: its widest attitude, so it never clips.
 * The extremes are always the eight corners, whatever the cell counts, so this
 * is one number rather than one per grid.
 */
export const WORST_FILL = 1.094;

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


/* ------------------------------------------------------------------ *
 *  The stimulus as a solid
 * ------------------------------------------------------------------ */

/**
 * The rotation as a matrix, built once a frame instead of per point.
 *
 * `view` recomputes six trigonometric functions every time it is called, which
 * is nothing for the lattice's few dozen corners and a great deal for the
 * thousand-odd the stimulus mesh needs at sixty frames a second.
 */
export type Mat3 = readonly number[];

export function rotMatrix(r: Rot): Mat3 {
    const cz = Math.cos(r.z), sz = Math.sin(r.z);
    const cy = Math.cos(r.y), sy = Math.sin(r.y);
    const cx = Math.cos(r.x), sx = Math.sin(r.x);
    // The same order `view` applies: z, then y, then x.
    return [
        cy * cz,                    -cy * sz,                   sy,
        cx * sz + sx * sy * cz,     cx * cz - sx * sy * sz,     -sx * cy,
        sx * sz - cx * sy * cz,     sx * cz + cx * sy * sz,     cx * cy,
    ];
}

const LIGHT_LEN = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
const LX = LIGHT.x / LIGHT_LEN, LY = LIGHT.y / LIGHT_LEN, LZ = LIGHT.z / LIGHT_LEN;

/** Lit by the face's own normal, with a small highlight so it reads as solid. */
const AMBIENT = 0.30;
/** Quantisation of the shading, so facets of equal colour can share one path. */
const SHADE_BANDS = 20;
const SPEC_BANDS = 10;

/** Roughly how many facets round the stimulus; rounded to a multiple of the
 *  vertex count so the shape's own corners land on facet edges. */
const LON_TARGET = 60;
/** Facet rows from pole to pole. */
const LAT = 30;

const TAU = Math.PI * 2;

/**
 * The outline's radius at an arbitrary angle, along the straight edge between
 * two of its vertices — so the solid's widest cross-section is exactly the
 * polygon the flat board draws, not a smoothed version of it.
 */
function edgeRadius(radii: number[], i: number, lon: number): number {
    const n = radii.length;
    if (n < 3) return 1;
    const t = (i * n) / lon;
    const k = Math.floor(t);
    const f = t - k;
    const d = TAU / n;
    const r0 = radii[k % n], r1 = radii[(k + 1) % n];
    const denom = r0 * Math.sin(f * d) + r1 * Math.sin((1 - f) * d);
    return denom > 1e-6 ? (r0 * r1 * Math.sin(d)) / denom : Math.max(r0, r1);
}

/** A run of facets that came out the same colour, merged into one path. */
export interface Patch { d: string; fill: string; }

/**
 * The stimulus as a closed, lit, textured solid.
 *
 * The body is the shape's own outline swept from pole to pole: the equator is
 * the polygon exactly, so face-on the silhouette is the one the flat board
 * draws, and every other attitude is that outline seen as an object. Colour
 * comes from the solid texture, sampled at each facet's position *in the
 * stimulus's own space* — which is what makes the pattern turn with the solid
 * instead of sliding across it.
 *
 * Back faces are dropped rather than sorted. The body is star-shaped about its
 * centre and gently enough sloped that no front facet can hide another — even
 * at the deepest dent a lure can put in it, the front faces of a tumbling solid
 * overlap each other over a ten-thousandth of the area they cover, which is the
 * slivers where they meet at the poles. So what is left needs no depth order at
 * all, and that in turn lets facets of equal colour be merged into a single
 * path: a few dozen elements a frame instead of nearly a thousand.
 */
export function solidPatches(opts: {
    centre: Vec3;
    radii: number[];      // per-vertex radius multipliers, 0..1
    radius: number;       // cube units
    rot: Rot;
    fill: number;
    texture: SolidTexture;
}): Patch[] {
    const { centre, radii, radius, rot, fill, texture } = opts;
    const n = radii.length;
    const lon = n >= 3 ? n * Math.max(3, Math.round(LON_TARGET / n)) : LON_TARGET;
    const rows = LAT + 1;
    const count = lon * rows;

    const m = rotMatrix(rot);
    const cvx = m[0] * centre.x + m[1] * centre.y + m[2] * centre.z;
    const cvy = m[3] * centre.x + m[4] * centre.y + m[5] * centre.z;
    const cvz = m[6] * centre.x + m[7] * centre.y + m[8] * centre.z;

    const ox = new Float64Array(count), oy = new Float64Array(count), oz = new Float64Array(count);
    const vz = new Float64Array(count);
    const px = new Float64Array(count), py = new Float64Array(count);
    const vx = new Float64Array(count), vy = new Float64Array(count);

    const rho = new Float64Array(lon);
    const ca = new Float64Array(lon), sa = new Float64Array(lon);
    for (let i = 0; i < lon; i++) {
        const a = (i / lon) * TAU - Math.PI / 2;
        rho[i] = edgeRadius(radii, i, lon);
        ca[i] = Math.cos(a);
        sa[i] = Math.sin(a);
    }

    for (let j = 0; j < rows; j++) {
        const phi = -Math.PI / 2 + (j / LAT) * Math.PI;
        // A touch fuller than a sphere, so more of the texture faces the eye.
        const ring = Math.pow(Math.max(0, Math.cos(phi)), 0.8);
        const zc = Math.sin(phi);
        for (let i = 0; i < lon; i++) {
            const k = j * lon + i;
            const ux = rho[i] * ring * ca[i];
            const uy = rho[i] * ring * sa[i];
            ox[k] = ux; oy[k] = uy; oz[k] = zc;
            const wx = m[0] * ux + m[1] * uy + m[2] * zc;
            const wy = m[3] * ux + m[4] * uy + m[5] * zc;
            const wz = m[6] * ux + m[7] * uy + m[8] * zc;
            const X = cvx + wx * radius, Y = cvy + wy * radius, Z = cvz + wz * radius;
            vx[k] = X; vy[k] = Y; vz[k] = Z;
            const scale = CAMERA / (CAMERA - Z);
            px[k] = 50 + X * scale * 50 * fill;
            py[k] = 50 + Y * scale * 50 * fill;
        }
    }

    const groups = new Map<string, { fill: string; parts: string[]; depth: number; count: number }>();

    for (let j = 0; j < LAT; j++) {
        for (let i = 0; i < lon; i++) {
            const i2 = (i + 1) % lon;
            const a = j * lon + i, b = j * lon + i2, c = (j + 1) * lon + i2, d = (j + 1) * lon + i;

            // The two diagonals: robust where a pole row collapses to a point.
            const e1x = vx[c] - vx[a], e1y = vy[c] - vy[a], e1z = vz[c] - vz[a];
            const e2x = vx[d] - vx[b], e2y = vy[d] - vy[b], e2z = vz[d] - vz[b];
            let nx = e1y * e2z - e1z * e2y;
            let ny = e1z * e2x - e1x * e2z;
            let nz = e1x * e2y - e1y * e2x;
            const nlen = Math.hypot(nx, ny, nz);
            if (nlen < 1e-12) continue;
            nx /= nlen; ny /= nlen; nz /= nlen;

            const gx = (vx[a] + vx[b] + vx[c] + vx[d]) / 4;
            const gy = (vy[a] + vy[b] + vy[c] + vy[d]) / 4;
            const gz = (vz[a] + vz[b] + vz[c] + vz[d]) / 4;

            // Toward the eye, exactly rather than approximately: the box is
            // drawn in perspective, so "facing the camera" depends on where in
            // the frame the facet sits.
            let ex = -gx, ey = -gy, ez = CAMERA - gz;
            if (nx * ex + ny * ey + nz * ez <= 0) continue;
            const elen = Math.hypot(ex, ey, ez) || 1;
            ex /= elen; ey /= elen; ez /= elen;

            const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
            let hx = LX + ex, hy = LY + ey, hz = LZ + ez;
            const hlen = Math.hypot(hx, hy, hz) || 1;
            const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hlen), 28) * 0.55;

            const pi = texture.sample(
                (ox[a] + ox[b] + ox[c] + ox[d]) / 4,
                (oy[a] + oy[b] + oy[c] + oy[d]) / 4,
                (oz[a] + oz[b] + oz[c] + oz[d]) / 4,
            );

            const sb = Math.round((AMBIENT + (1 - AMBIENT) * diff) * SHADE_BANDS);
            const pb = Math.round(spec * SPEC_BANDS);
            const key = `${pi}|${sb}|${pb}`;
            let g = groups.get(key);
            if (!g) {
                const base = texture.palette[pi] ?? texture.palette[0];
                const sp = pb / SPEC_BANDS;
                const lit = base.l * (sb / SHADE_BANDS);
                const l = Math.max(0, Math.min(100, lit + sp * (100 - lit)));
                const s = Math.max(0, Math.min(100, base.s * (1 - 0.55 * sp)));
                g = { fill: `hsl(${base.h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(1)}%)`, parts: [], depth: 0, count: 0 };
                groups.set(key, g);
            }
            g.parts.push(
                `M${px[a].toFixed(2)} ${py[a].toFixed(2)}L${px[b].toFixed(2)} ${py[b].toFixed(2)}` +
                `L${px[c].toFixed(2)} ${py[c].toFixed(2)}L${px[d].toFixed(2)} ${py[d].toFixed(2)}Z`,
            );
            g.depth += gz;
            g.count++;
        }
    }

    return [...groups.values()]
        .sort((p, q) => p.depth / p.count - q.depth / q.count)
        .map(g => ({ d: g.parts.join(''), fill: g.fill }));
}
