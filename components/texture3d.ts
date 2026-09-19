/**
 * The colour patterns as solid textures.
 *
 * `ColorPatternSvg` draws each pattern as a picture: a square of SVG that the
 * 3D board used to stamp onto the front of the stimulus. However carefully that
 * square is projected, it stays a picture — it does not turn with the solid, it
 * has nothing to say about the sides, and the moment the stimulus rotates the
 * eye reads it as a sticker rather than as what the object is made of.
 *
 * Here the same ten patterns are written as fields over space instead: a
 * function from a point inside the stimulus to a colour. The pattern is then a
 * property of the material, so a surface takes its colour from where that patch
 * of surface *is*. Turn the solid and the pattern turns with it, exactly, at
 * every angle, on every face, with no seam and no pole — because there is no
 * mapping to go wrong. Cut the solid anywhere and the cut would be patterned
 * too.
 *
 * Each field is the 2D pattern's own idea carried into three dimensions rather
 * than extruded: `radial` becomes nested cylinders, `grid` a lattice of cells
 * with a ball in each, `bubbles` real spheres suspended in the body, `blocky` a
 * staggered brick bond that runs front to back. Seen face-on they read as their
 * flat counterparts, which is what keeps them learnable as the same stimulus.
 */
import { ColorPattern } from '../types';

export interface Hsl { h: number; s: number; l: number; }

export interface SolidTexture {
  /** Every colour the field can return, so a renderer can group by it. */
  palette: Hsl[];
  /**
   * A point in the stimulus's own space — the unit ball, before any rotation —
   * to an index into `palette`.
   */
  sample(x: number, y: number, z: number): number;
}

/**
 * The stimulus colour when the colour channel is switched off.
 *
 * `--color-primary` (#22d3ee) as hue, saturation and lightness, because the
 * shading multiplies the lightness and so needs the parts, not a CSS variable
 * it cannot take apart. Keep it in step with the theme in `index.html`.
 */
export const PLAIN: Hsl = { h: 188, s: 86, l: 53 };

export const plainTexture = (): SolidTexture => ({ palette: [PLAIN], sample: () => 0 });

export const hsl = (c: Hsl): string => `hsl(${c.h.toFixed(0)}, ${c.s.toFixed(0)}%, ${c.l.toFixed(0)}%)`;

/** Deterministic noise on a lattice: the same cell is always the same colour. */
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;

/**
 * Build the field for one stimulus.
 *
 * `bubbleData` and `topoData` are the same per-trial arrays the flat board
 * uses, so a trial's texture is the trial's own, not a fresh random one each
 * frame.
 */
export function buildTexture(
  pattern: ColorPattern,
  hues: [number, number, number],
  bubbleData?: { cx: number; cy: number; r: number }[],
  topoData?: { points: { x: number; y: number }[] }[],
): SolidTexture {
  const colors: Hsl[] = [
    { h: hues[0], s: 80, l: 50 },
    { h: hues[1], s: 80, l: 50 },
    { h: hues[2], s: 80, l: 50 },
  ];

  switch (pattern) {
    /* Three slabs, cut across the stimulus rather than painted on it: the
       stripes run all the way through, so the far side is striped too. */
    case 'horizontal':
      return {
        palette: colors,
        // Screen y points down, so the first colour is the top slab.
        sample: (_x, y) => (y < -1 / 3 ? 0 : y < 1 / 3 ? 1 : 2),
      };

    /* The flat version cuts the square into a top wedge, a left wedge and the
       remainder. The same three wedges taken about the axis through the face
       give an orange-segment solid that reads identically face-on. */
    case 'triangles':
      return {
        palette: colors,
        sample: (x, y) => {
          const a = Math.atan2(y, x);
          if (a > -3 * Math.PI / 4 && a < -Math.PI / 4) return 0;
          if (a >= 3 * Math.PI / 4 || a <= -3 * Math.PI / 4) return 1;
          return 2;
        },
      };

    /* Nested cylinders, not nested shells: shells would all be hidden inside
       one another and only ever show the outermost colour on the surface. A
       cylinder about the viewing axis is the one reading that still gives a
       bullseye face-on and still wraps right round the body. */
    case 'radial':
      return {
        palette: colors,
        sample: (x, y, z) => {
          const len = Math.hypot(x, y, z) || 1;
          const q = Math.hypot(x, y) / len;
          return q < 1 / 3 ? 0 : q < 2 / 3 ? 1 : 2;
        },
      };

    /* A brick bond with courses running front to back, staggered by depth as
       well as by row, and mortar in the joints. */
    case 'blocky': {
      const mortar: Hsl = { h: hues[1], s: 20, l: 12 };
      const order = [0, 1, 2, 1, 0, 2];
      /* Sized against the facets that have to draw them: the body carries
         roughly sixty facets round and thirty from pole to pole, so a joint
         thinner than about a tenth of the body is a dotted line rather than a
         line. Everything here is kept comfortably above that. */
      const rowH = 0.6, brickW = 1.2, slabD = 0.7, joint = 0.10;
      return {
        palette: [...colors, mortar],
        sample: (x, y, z) => {
          const slab = Math.floor((z + 1) / slabD);
          const rowF = (y + 1) / rowH;
          const row = Math.floor(rowF);
          const colF = (x + 1 + ((row + slab) % 2) * brickW / 2) / brickW;
          const col = Math.floor(colF);
          const fy = (rowF - row) * rowH, fx = (colF - col) * brickW;
          if (fy < joint || fy > rowH - joint || fx < joint || fx > brickW - joint) return 3;
          return order[(((row * 2 + col + slab) % 6) + 6) % 6];
        },
      };
    }

    /* Nested square shells inside each cell of a coarse lattice: the stepped
       frames of the flat pattern, given the third dimension they imply. */
    case 'aztec': {
      const bg: Hsl = { h: hues[1], s: 25, l: 20 };
      const clean = colors.map(c => ({ h: c.h, s: 65, l: 55 }));
      const cell = 0.85, ring = 1 / 6;
      return {
        palette: [bg, ...clean],
        sample: (x, y, z) => {
          const gx = Math.floor((x + 1) / cell), gy = Math.floor((y + 1) / cell), gz = Math.floor((z + 1) / cell);
          const fx = (x + 1) / cell - gx - 0.5;
          const fy = (y + 1) / cell - gy - 0.5;
          const fz = (z + 1) / cell - gz - 0.5;
          const d = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
          const band = Math.floor(d / ring);
          if (band % 2 === 1) return 0;
          return 1 + (((band >> 1) + Math.floor(hash3(gx, gy, gz) * 3)) % 3);
        },
      };
    }

    /* The flat grid is a chequer of squares each holding a circle. In space it
       is a chequer of cells each holding a ball. */
    case 'grid': {
      const cell = 2 / 3;
      return {
        palette: colors,
        sample: (x, y, z) => {
          const gx = Math.floor((x + 1) / cell), gy = Math.floor((y + 1) / cell), gz = Math.floor((z + 1) / cell);
          const base = (((gx + gy + gz) % 3) + 3) % 3;
          const dx = x + 1 - (gx + 0.5) * cell;
          const dy = y + 1 - (gy + 0.5) * cell;
          const dz = z + 1 - (gz + 0.5) * cell;
          return Math.hypot(dx, dy, dz) < cell * 0.34 ? (base + 1) % 3 : base;
        },
      };
    }

    /* A honeycomb of hexagonal columns running through the body, the courses
       re-coloured every slab so the far side is not the near side repeated. */
    case 'hexagons': {
      const stroke: Hsl = { h: hues[1], s: 30, l: 15 };
      const R = 0.30, slabD = 0.9, inradius = R * Math.sqrt(3) / 2, edge = 0.05;
      return {
        palette: [...colors, stroke],
        sample: (x, y, z) => {
          // Pointy-top axial coordinates, then cube-rounded to the nearest cell.
          const q = (Math.sqrt(3) / 3 * x - y / 3) / R;
          const r = (2 / 3 * y) / R;
          let cx = q, cz = r, cy = -cx - cz;
          let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
          const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
          if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
          const hx = R * Math.sqrt(3) * (rx + rz / 2), hy = R * 1.5 * rz;
          const ex = x - hx, ey = y - hy;
          const m = Math.max(
            Math.abs(ex),
            Math.abs(ex * 0.5 + ey * Math.sqrt(3) / 2),
            Math.abs(ex * 0.5 - ey * Math.sqrt(3) / 2),
          );
          if (m > inradius - edge) return 3;
          const slab = Math.floor((z + 1) / slabD);
          return ((Math.abs(rx + rz + slab) % 3) + 3) % 3;
        },
      };
    }

    /* Real spheres suspended in the body, given the depth the flat discs never
       had. */
    case 'bubbles': {
      const bg: Hsl = { h: hues[1], s: 60, l: 25 };
      const seed = bubbleData && bubbleData.length
        ? bubbleData
        : Array.from({ length: 25 }, (_, i) => ({
            cx: hash3(i, 7, 1), cy: hash3(i, 7, 2), r: 0.1 + hash3(i, 7, 3) * 0.2,
          }));
      const spheres = seed.map((b, i) => ({
        x: b.cx * 2 - 1,
        y: b.cy * 2 - 1,
        z: hash3(i, 11, 5) * 2 - 1,
        r: b.r * 1.5,
        r2: (b.r * 1.5) * (b.r * 1.5),
        c: (i % 3) + 1,
      }));
      return {
        palette: [bg, ...colors.map(c => ({ h: c.h, s: 70, l: 45 }))],
        sample: (x, y, z) => {
          /* The smallest bubble covering the point wins, so a small one still
             shows against a large one it happens to sit inside. */
          let best = 0, bestR = Infinity;
          for (const s of spheres) {
            if (s.r >= bestR) continue;
            const dx = x - s.x, dy = y - s.y, dz = z - s.z;
            if (dx * dx + dy * dy + dz * dz < s.r2) { best = s.c; bestR = s.r; }
          }
          return best;
        },
      };
    }

    /* Contours, kept as contours: bands of equal angular distance from a few
       seeds on the body, so the lines close round the solid the way they close
       round the flat square. The wobble keeps them from reading as latitude. */
    case 'topo': {
      const bg: Hsl = { h: hues[1], s: 60, l: 25 };
      const pts = topoData?.slice(0, 2).map(l => l.points[0]) ?? [];
      const seeds = Array.from({ length: 2 }, (_, i) => {
        const p = pts[i];
        const t = p ? p.x * TAU : hues[i] / 360 * TAU;
        const u = p ? (p.y - 0.5) * Math.PI : (i - 0.5) * 1.4;
        return { x: Math.cos(u) * Math.cos(t), y: Math.cos(u) * Math.sin(t), z: Math.sin(u) };
      });
      const bandW = 0.40;
      return {
        palette: [bg, ...colors],
        sample: (x, y, z) => {
          const len = Math.hypot(x, y, z) || 1;
          const nx = x / len, ny = y / len, nz = z / len;
          let best = Math.PI;
          for (const s of seeds) {
            const a = Math.acos(Math.max(-1, Math.min(1, nx * s.x + ny * s.y + nz * s.z)));
            if (a < best) best = a;
          }
          const d = best + 0.06 * Math.sin(3 * x) * Math.sin(3 * y) * Math.sin(3 * z);
          const band = d / bandW;
          const frac = band - Math.floor(band);
          if (frac > 0.35) return 0;
          return 1 + ((Math.floor(band) % 3) + 3) % 3;
        },
      };
    }

    case 'vertical':
    default:
      return {
        palette: colors,
        sample: x => (x < -1 / 3 ? 0 : x < 1 / 3 ? 1 : 2),
      };
  }
}
