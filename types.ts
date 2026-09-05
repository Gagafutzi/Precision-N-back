
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
  isMatch: { audio: boolean, spatial: boolean, color: boolean, shape: boolean };
  lureType: 'none' | 'audio' | 'spatial' | 'color' | 'shape';
  n: number; // The n-level for this specific trial
  bubbleData?: { cx: number; cy: number; r: number; }[];
  topoData?: { points: {x: number, y: number}[] }[];
};

export type Modality = 'spatial' | 'audio' | 'color' | 'shape';

export type Score = {
  hits: Record<Modality, number>;
  misses: number;
  audioFalseAlarms: number;
  spatialFalseAlarms: number;
  colorFalseAlarms: number;
  shapeFalseAlarms: number;
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
  };
  score: Score;
  accuracy?: number; // Optional accuracy field
  duration?: number; // in milliseconds
  totalMatches?: number;
  totalMatchesByModality?: Record<Modality, number>;
  correctRejections?: number;
  totalNonMatches?: number;
};
