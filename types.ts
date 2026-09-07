
export enum GameState {
  Start,
  Calibrating,
  Playing,
  Finished,
  Settings,
  Performance,
}

export enum CalibrationState {
  Instructions,
  Audio,
  Spatial,
  Color,
  Shape,
  Finished,
}

export type CalibrationResult = {
  audioThreshold: number; // in cents
  colorThreshold: number; // in hue degrees
  shapeThreshold: number; // in vertex displacement %
};

export type Shape = {
  vertices: { radius: number }[]; // radius is 0-1
};

export type ColorPattern = 'vertical' | 'horizontal' | 'triangles' | 'radial' | 'blocky' | 'aztec' | 'grid' | 'hexagons' | 'bubbles' | 'topo';

export type NBackEvent = {
  id: number;
  /* `layer` is the depth index. It is always present and is 0 whenever the 3D
     mode is off, so every comparison can read it unconditionally. */
  spatial: { row: number; col: number; layer: number };
  audio: number; // frequency in Hz
  hues: [number, number, number]; // hue in degrees for 3-part stimulus
  shape: Shape;
  /* Index into SYLLABLES. Categorical, unlike every other channel here:
     there is no threshold to tighten, only whether you heard which one. */
  syllable: number;
  isMatch: { audio: boolean, spatial: boolean, color: boolean, shape: boolean, syllable: boolean };
  lureType: 'none' | 'audio' | 'spatial' | 'color' | 'shape' | 'syllable';
  n: number; // The n-level for this specific trial
  bubbleData?: { cx: number; cy: number; r: number; }[];
  topoData?: { points: {x: number, y: number}[] }[];
};

export type Modality = 'spatial' | 'audio' | 'color' | 'shape' | 'syllable';

export type Score = {
  hits: Record<Modality, number>;
  misses: number;
  audioFalseAlarms: number;
  spatialFalseAlarms: number;
  colorFalseAlarms: number;
  shapeFalseAlarms: number;
  syllableFalseAlarms: number;
};

export type Settings = {
  nLevel: number;
  matchRate: number;
  lureRate: number;
  isi: number;
  gridRows: number;
  gridCols: number;
  /* A separate mode rather than a replacement: the 2D grid is what the spatial
     threshold was calibrated against, so switching to depth is a different task
     and not a harder setting of the same one. */
  spatial3dEnabled: boolean;
  gridLayers: number;
  /**
   * Turn the box, so screen position stops identifying a cell.
   *
   * Off, the box is still *tilted* — a stack of planes seen face-on separates
   * only by the size difference perspective gives them, which at the middle of
   * the board is nearly nothing. Tilting is what makes depth visible at all;
   * rotating is what stops it being memorised as a flat picture.
   */
  spatial3dRotate: boolean;
  /** Seconds for one full turn. Lower is faster. */
  spatial3dRotateSeconds: number;
  audioThreshold: number;
  colorThreshold: number;
  shapeThreshold: number;
  calibrationEnabled: boolean;
  totalTrials: number;
  theme: 'cyan';
  devMode: boolean;
  ballSize: number;
  variableN: boolean;
  spatialEnabled: boolean;
  audioEnabled: boolean;
  colorEnabled: boolean;
  shapeEnabled: boolean;
  /* The verbal channel. It sits beside the tone rather than replacing it:
     the tone is a pitch discrimination and this is an identity, which are
     different questions and are allowed to run together. */
  syllableEnabled: boolean;
  shapeVertices: number;
  colorPattern: ColorPattern;
  feedbackEnabled: boolean;
  variableIsiEnabled: boolean;
  variableIsiRange: number;
  variableIsiMinRange: number;
};

export type PerformanceRecord = {
  date: string;
  settings: {
    nLevel: number;
    audioThreshold: number;
    colorThreshold: number;
    shapeThreshold: number;
    gridRows: number;
    gridCols: number;
    /* Optional: records written before the 3D mode existed have neither, and a
       reader must be able to tell "2D" from "not recorded". */
    spatial3dEnabled?: boolean;
    gridLayers?: number;
    spatial3dRotate?: boolean;
    spatial3dRotateSeconds?: number;
  };
  score: Score;
  accuracy?: number; // Optional accuracy field
  duration?: number; // in milliseconds
  totalMatches?: number;
  totalMatchesByModality?: Record<Modality, number>;
  correctRejections?: number;
  totalNonMatches?: number;
};
