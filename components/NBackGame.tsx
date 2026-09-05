
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NBackEvent, Score, Settings, Shape, Modality } from '../types';
import ShapeDisplay from './ShapeDisplay';

declare namespace Tone {
  interface Synth {
    toDestination(): this;
    triggerAttackRelease(frequency: number, duration: string): this;
    dispose(): void;
  }
  const Synth: new () => Synth;

  const Transport: {
    schedule(callback: (time: number) => void, time: number | string): number;
    start(): void;
    stop(): void;
    cancel(): void;
    clear(eventId: number): void;
  };
  function start(): Promise<void>;
}

interface NBackGameProps {
  settings: Settings;
  onGameEnd: (score: Score, totalMatchesByModality: Record<Modality, number>, completed: boolean, duration: number) => void;
}

const getValidNValues = (maxN: number): number[] => {
    if (maxN <= 2) {
        // For N=1 or N=2, no non-trivial divisors to filter.
        return Array.from({ length: maxN }, (_, i) => i + 1);
    }
    
    const divisors = new Set<number>();
    // Find all non-trivial divisors of maxN.
    for (let i = 2; i <= Math.sqrt(maxN); i++) {
        if (maxN % i === 0) {
            divisors.add(i);
            divisors.add(maxN / i);
        }
    }

    const validNs: number[] = [];
    for (let i = 1; i <= maxN; i++) {
        if (!divisors.has(i)) {
            validNs.push(i);
        }
    }
    return validNs;
};

const generateBaseShape = (numVertices: number): Shape => ({
  vertices: Array.from({ length: numVertices }, () => ({ radius: 0.6 + Math.random() * 0.4 }))
});

const generateRandomHues = (): [number, number, number] => {
  const baseHue = Math.random() * 360;
  const interval = 15 + Math.random() * 20; // Interval between 15 and 35
  const hues: [number, number, number] = [
    (baseHue - interval + 360) % 360,
    baseHue,
    (baseHue + interval) % 360,
  ];
  hues.sort((a, b) => a - b);
  return hues;
};

const NBackGame: React.FC<NBackGameProps> = ({ settings, onGameEnd }) => {
  const { nLevel, matchRate, lureRate, isi, totalTrials, ballSize, variableN, devMode, gridRows, gridCols, feedbackEnabled } = settings;
  /* Depth is one layer deep unless the 3D mode is on, so every position is a
     three-part coordinate and nothing downstream needs to branch. */
  const layers = settings.spatial3dEnabled ? Math.max(2, settings.gridLayers) : 1;
  const { audioThreshold, colorThreshold, shapeThreshold } = settings;
  
  const stimulusDuration = 500;

  const [history, setHistory] = useState<NBackEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<NBackEvent | null>(null);
  const [trialNumber, setTrialNumber] = useState(0);
  const [isStimulusVisible, setIsStimulusVisible] = useState(false);
  const [score, setScore] = useState<Score>({ hits: { spatial: 0, audio: 0, color: 0, shape: 0 }, misses: 0, audioFalseAlarms: 0, spatialFalseAlarms: 0, colorFalseAlarms: 0, shapeFalseAlarms: 0 });
  const [buttonHighlights, setButtonHighlights] = useState<Record<Modality, 'none' | 'hit' | 'miss' | 'false_alarm'>>({ spatial: 'none', audio: 'none', color: 'none', shape: 'none' });
  const [devLureInfo, setDevLureInfo] = useState<string>('');
  
  const [stimulusSize, setStimulusSize] = useState(settings.ballSize * 100);
  const gameBoardRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<Tone.Synth | null>(null);
  const transportEventIdRef = useRef<number | null>(null);
  const totalMatchesRef = useRef<Record<Modality, number>>({ spatial: 0, audio: 0, color: 0, shape: 0 });
  const startTimeRef = useRef<number>(Date.now());
  
  const historyRef = useRef(history);
  const trialNumberRef = useRef(trialNumber);
  const scoreRef = useRef(score);
  const respondedToRef = useRef(new Set<string>());
  const activeModalitiesRef = useRef<Modality[]>([]);

  const validNValues = useMemo(() => {
    if (!settings.variableN) return [];
    return getValidNValues(settings.nLevel);
  }, [settings.variableN, settings.nLevel]);

  useEffect(() => {
    const active: Modality[] = [];
    if (settings.spatialEnabled) active.push('spatial');
    if (settings.audioEnabled) active.push('audio');
    if (settings.colorEnabled) active.push('color');
    if (settings.shapeEnabled) active.push('shape');
    activeModalitiesRef.current = active;
  }, [settings]);

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { trialNumberRef.current = trialNumber; }, [trialNumber]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  useEffect(() => {
    const board = gameBoardRef.current;
    if (!board) return;

    const calculateSize = () => {
        const boardWidth = board.offsetWidth;
        const cellWidth = boardWidth / gridCols;
        setStimulusSize(cellWidth * ballSize);
    };

    const resizeObserver = new ResizeObserver(calculateSize);
    resizeObserver.observe(board);

    // Initial calculation for first render
    calculateSize();

    return () => resizeObserver.disconnect();
  }, [gridCols, gridRows, ballSize]);

  const handleUserResponse = useCallback((type: Modality) => {
    if (trialNumberRef.current === 0) return;
    const current = historyRef.current[historyRef.current.length - 1];
    if (!current || (current.id + 1) <= current.n) return;
    
    const isMatch = current.isMatch[type];
    const responseKey = `${current.id}_${type}`;

    if(respondedToRef.current.has(responseKey)) return;
    
    if (isMatch) {
      setScore(s => ({ ...s, hits: { ...s.hits, [type]: s.hits[type] + 1 } }));
      if (feedbackEnabled) setButtonHighlights(prev => ({...prev, [type]: 'hit'}));
    } else {
      setScore(s => ({ ...s, [`${type}FalseAlarms`]: s[`${type}FalseAlarms`] + 1 }));
      if (feedbackEnabled) setButtonHighlights(prev => ({...prev, [type]: 'false_alarm' }));
    }
    respondedToRef.current.add(responseKey);
  }, [feedbackEnabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      switch (key) {
        case 'a':
          if (settings.spatialEnabled) handleUserResponse('spatial');
          break;
        case 'l':
          if (settings.audioEnabled) handleUserResponse('audio');
          break;
        case 'f':
          if (settings.colorEnabled) handleUserResponse('color');
          break;
        case 'j':
          if (settings.shapeEnabled) handleUserResponse('shape');
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUserResponse, settings.spatialEnabled, settings.audioEnabled, settings.colorEnabled, settings.shapeEnabled]);

  const endSession = useCallback((completed: boolean) => {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      const duration = Date.now() - startTimeRef.current;
      onGameEnd(scoreRef.current, totalMatchesRef.current, completed, duration);
  }, [onGameEnd]);

  const quitSession = useCallback(() => {
    endSession(false);
  }, [endSession]);

  const generateNextEvent = useCallback(() => {
    const history = historyRef.current;
    const trialNumber = trialNumberRef.current;
    const activeModalities = activeModalitiesRef.current;

    let n: number;
    if (variableN) {
        if (validNValues.length === 0) {
            n = 1; // Fallback for N=1 or other edge cases
        } else if (validNValues.length === 1) {
            n = validNValues[0];
        } else {
            // Exponentially weight towards higher N values for a "fat tail" distribution.
            const weights = validNValues.map((_, i) => Math.exp(i));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            const random = Math.random() * totalWeight;

            let cumulativeWeight = 0;
            let selectedIndex = validNValues.length - 1; // Default to last
            for (let i = 0; i < weights.length; i++) {
                cumulativeWeight += weights[i];
                if (random < cumulativeWeight) {
                    selectedIndex = i;
                    break;
                }
            }
            n = validNValues[selectedIndex];
        }
    } else {
        n = nLevel;
    }
    
    const isReadyForMatch = trialNumber >= n;
    const targetEvent = isReadyForMatch ? history[trialNumber - n] : null;
    
    const newEvent: NBackEvent = {
        id: trialNumber, n,
        spatial: { row: Math.floor(Math.random() * gridRows), col: Math.floor(Math.random() * gridCols), layer: Math.floor(Math.random() * layers) },
        audio: 200 + Math.random() * 600,
        hues: generateRandomHues(),
        shape: generateBaseShape(settings.shapeVertices),
        isMatch: { audio: false, spatial: false, color: false, shape: false },
        lureType: 'none',
    };

    if (settings.colorPattern === 'bubbles') {
        newEvent.bubbleData = Array.from({ length: 25 }, () => ({
            cx: Math.random(),
            cy: Math.random(),
            r: Math.random() * 0.2 + 0.1,
        }));
    }

    if (settings.colorPattern === 'topo') {
        const numLines = 6;
        newEvent.topoData = Array.from({ length: numLines }, (_, i) => {
            const radius = (0.5) * (0.1 + (i / numLines) * 0.85);
            const points = Array.from({length: 8}, (_, j) => {
                const angle = (j / 8) * 2 * Math.PI;
                const r = radius + (Math.random() - 0.5) * 0.1;
                return { x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle) };
            });
            return { points };
        });
    }
    
    let devInfoParts: string[] = [`N=${n}`];
    let lureFound = false;

    if (isReadyForMatch && targetEvent) {
      activeModalities.forEach(mod => {
        const rand = Math.random();
        if (rand < matchRate) {
          // This modality is a MATCH
          if (mod === 'color') {
            newEvent.hues = targetEvent.hues;
            newEvent.bubbleData = targetEvent.bubbleData;
            newEvent.topoData = targetEvent.topoData;
          } else {
            (newEvent[mod] as any) = targetEvent[mod];
          }
          newEvent.isMatch[mod] = true;
          totalMatchesRef.current[mod] += 1;
          devInfoParts.push(`${mod.charAt(0).toUpperCase()}:MATCH`);
        } else if (rand < matchRate + lureRate) {
          // This modality is a LURE
          if (!lureFound) {
            newEvent.lureType = mod;
            lureFound = true;
          }
          devInfoParts.push(`${mod.charAt(0).toUpperCase()}:LURE`);
          switch (mod) {
            case 'spatial':
              const { row, col, layer } = targetEvent.spatial;
              /* One step along a single axis. In 3D that includes the two depth
                 neighbours, which is the whole point of the mode: a lure one
                 layer away is the one the eye is least able to reject. */
              const possibleLures = [
                  { row: row - 1, col, layer }, { row: row + 1, col, layer },
                  { row, col: col - 1, layer }, { row, col: col + 1, layer },
                  ...(layers > 1
                    ? [{ row, col, layer: layer - 1 }, { row, col, layer: layer + 1 }]
                    : []),
              ].filter(p => p.row >= 0 && p.row < gridRows
                         && p.col >= 0 && p.col < gridCols
                         && p.layer >= 0 && p.layer < layers);
              if (possibleLures.length > 0) {
                  newEvent.spatial = possibleLures[Math.floor(Math.random() * possibleLures.length)];
              }
              break;
            case 'audio':
              newEvent.audio = targetEvent.audio * Math.pow(2, ((Math.random() < 0.5 ? 1 : -1) * audioThreshold) / 1200);
              break;
            case 'color':
              const targetHues = [...targetEvent.hues] as [number, number, number];
              const indices = [0, 1, 2];
              const idx1 = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
              const idx2 = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
              const shiftAmount = colorThreshold * (Math.random() < 0.5 ? 1 : -1);
              targetHues[idx1] = (targetHues[idx1] + shiftAmount + 360) % 360;
              targetHues[idx2] = (targetHues[idx2] - shiftAmount + 360) % 360;
              newEvent.hues = targetHues;
              // For lure, keep the pattern structure the same, only change colors
              newEvent.bubbleData = targetEvent.bubbleData;
              newEvent.topoData = targetEvent.topoData;
              break;
            case 'shape':
              const newVertices = targetEvent.shape.vertices.map(v => ({...v}));
              const vIndex = Math.floor(Math.random() * newVertices.length);
              newVertices[vIndex].radius = Math.max(0.1, Math.min(1.0, newVertices[vIndex].radius + (Math.random() < 0.5 ? 1 : -1) * shapeThreshold));
              newEvent.shape = { vertices: newVertices };
              break;
          }
        } else {
          // This modality is RANDOM
          devInfoParts.push(`${mod.charAt(0).toUpperCase()}:RAND`);
          // FIX: Ensure random event is not an accidental match, which would be confusing for the user.
          if (targetEvent) {
            if (mod === 'spatial') {
              while (newEvent.spatial.row === targetEvent.spatial.row
                     && newEvent.spatial.col === targetEvent.spatial.col
                     && newEvent.spatial.layer === targetEvent.spatial.layer) {
                newEvent.spatial = { row: Math.floor(Math.random() * gridRows), col: Math.floor(Math.random() * gridCols), layer: Math.floor(Math.random() * layers) };
              }
            }
            if (mod === 'audio') {
              // Check for perceptible similarity (e.g., less than 1 Hz difference)
              while (Math.abs(newEvent.audio - targetEvent.audio) < 1) {
                 newEvent.audio = 200 + Math.random() * 600;
              }
            }
            // Note: Accidental matches for color (3 hues) and shape (N vertices) are statistically insignificant
            // and not worth the performance cost of checking and re-generating.
          }
        }
      });
    } else {
      devInfoParts.push("RANDOM (Pre-N)");
    }
    
    setDevLureInfo(devInfoParts.join(' '));
    return newEvent;
  }, [nLevel, variableN, matchRate, lureRate, settings, validNValues]);
  
  const runTrial = useCallback(() => {
    const nextButtonHighlights: Record<Modality, 'none' | 'hit' | 'miss' | 'false_alarm'> = { spatial: 'none', audio: 'none', color: 'none', shape: 'none' };
    if (feedbackEnabled) {
      const activeModalities = activeModalitiesRef.current;
      if (trialNumberRef.current > 0) {
        const lastEvent = historyRef.current[historyRef.current.length - 1];
        if (trialNumberRef.current > lastEvent.n) {
          activeModalities.forEach(mod => {
            if (lastEvent.isMatch[mod] && !respondedToRef.current.has(`${lastEvent.id}_${mod}`)) {
              setScore(s => ({ ...s, misses: s.misses + 1 }));
              nextButtonHighlights[mod] = 'miss';
            }
          });
        }
      }
    }
    setButtonHighlights(nextButtonHighlights);

    if (trialNumberRef.current >= totalTrials) {
      endSession(true);
      return;
    }

    const newEvent = generateNextEvent();
    setCurrentEvent(newEvent);
    setHistory(h => [...h, newEvent]);
    setTrialNumber(t => t + 1);
    setIsStimulusVisible(true);

    if (settings.audioEnabled && synthRef.current) {
      synthRef.current.triggerAttackRelease(newEvent.audio, `${stimulusDuration / 1000}s`);
    }

    setTimeout(() => { setIsStimulusVisible(false); }, stimulusDuration);

    // Schedule the next trial
    let nextIsi = settings.isi;
    if (settings.variableIsiEnabled) {
        const maxRange = settings.variableIsiRange;
        const minRange = settings.variableIsiMinRange;
        
        if (minRange < maxRange) {
            const range = maxRange - minRange;
            const deltaMagnitude = minRange + (Math.random() * range);
            const sign = Math.random() < 0.5 ? -1 : 1;
            nextIsi += deltaMagnitude * sign;
        } else {
            // Fallback for invalid settings: simple randomization within max range
            const delta = (Math.random() - 0.5) * 2 * maxRange;
            nextIsi += delta;
        }
    }
    // Sanity check for minimum ISI
    nextIsi = Math.max(stimulusDuration + 100, nextIsi);
    
    transportEventIdRef.current = Tone.Transport.schedule(runTrial, `+${nextIsi / 1000}`);
  }, [generateNextEvent, endSession, totalTrials, settings, stimulusDuration, feedbackEnabled]);

  useEffect(() => {
    synthRef.current = new Tone.Synth().toDestination();
    const startAudio = async () => {
      await Tone.start();
      Tone.Transport.start();
      runTrial(); // Kicks off the self-scheduling loop
    };
    startAudio();
    return () => {
      if (transportEventIdRef.current !== null) { Tone.Transport.clear(transportEventIdRef.current); }
      Tone.Transport.stop();
      Tone.Transport.cancel();
      synthRef.current?.dispose();
    };
  }, [runTrial]);

  const getGameTitle = () => {
    const count = activeModalitiesRef.current.length;
    const names = ["", "Single", "Dual", "Triple", "Quad"];
    const baseTitle = `${names[count] || 'Multi'}-Modality`;
    if (variableN) return `Variable ${baseTitle} (Max N: ${nLevel})`;
    return `${nLevel}-Back ${baseTitle}`;
  };

  const getButtonClass = (modality: Modality) => {
    const baseClasses = 'py-4 px-6 text-xl font-bold text-white rounded-lg transition-all duration-150';
    const defaultClasses = 'bg-gray-600 hover:bg-gray-500';

    switch (buttonHighlights[modality]) {
        case 'hit':
            return `${baseClasses} bg-accent-success scale-105`;
        case 'miss':
            return `${baseClasses} bg-accent-warning`;
        case 'false_alarm':
            return `${baseClasses} bg-accent-error-heavy`;
        default:
            return `${baseClasses} ${defaultClasses}`;
    }
  };
  
  const gridStyle = {
      backgroundImage: `
          linear-gradient(to right, rgba(128, 128, 128, 0.15) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(128, 128, 128, 0.15) 1px, transparent 1px)
      `,
      backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`
  };

  // Fix: Explicitly type accumulator and value in reduce to prevent type inference issues with Object.values.
  const totalHits = Object.values(score.hits).reduce((sum: number, h: number) => sum + h, 0);

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl">
      <div className="w-full flex justify-between items-center mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-primary">{getGameTitle()}</h2>
        <div className="text-lg font-mono">Trial: {trialNumber} / {totalTrials}</div>
      </div>
      
      <div
        ref={gameBoardRef}
        className="relative w-full bg-gray-900 rounded-lg mb-6 shadow-inner overflow-hidden"
        style={{
          /* The flat grid lines belong to the 2D board. In 3D each layer draws
             its own, or the fixed backdrop reads as a plane the cells float in
             front of. */
          ...(settings.spatial3dEnabled ? {} : gridStyle),
          aspectRatio: `${gridCols} / ${gridRows}`,
          ...(settings.spatial3dEnabled
            ? { perspective: '60svmin', perspectiveOrigin: 'center center' }
            : {}),
        }}
      >
        {settings.spatial3dEnabled && (
          /* One plane per layer, spaced along Z. Perspective does the rest:
             a nearer layer is drawn larger, and that size difference IS the
             depth cue, so nothing has to be scaled by hand.

             The technique — a perspective container over preserve-3d planes —
             is the one used by the Quad Box project (MIT, Copyright (c) 2025
             The Quad Box Project Contributors), reimplemented here because that
             project is Svelte and this one is React. */
          <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {Array.from({ length: layers }, (_, l) => {
              const z = (l - (layers - 1) / 2) * 7;
              const isNear = currentEvent ? l === currentEvent.spatial.layer : false;
              return (
                <div
                  key={l}
                  className="absolute inset-0"
                  style={{
                    ...gridStyle,
                    transform: `translateZ(${z}svmin)`,
                    transformStyle: 'preserve-3d',
                    /* Layers behind the lit one are dimmed so the stack reads as
                       depth rather than as overlapping grids. */
                    opacity: isStimulusVisible && isNear ? 1 : 0.35,
                    border: '1px solid rgba(128,128,128,0.12)',
                  }}
                >
                  {isStimulusVisible && currentEvent && isNear && (
                    <div
                      className="absolute"
                      style={{
                        left: `${(currentEvent.spatial.col + 0.5) / gridCols * 100}%`,
                        top: `${(currentEvent.spatial.row + 0.5) / gridRows * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: `${stimulusSize}px`,
                        height: `${stimulusSize}px`,
                      }}
                    >
                      <ShapeDisplay
                        shape={currentEvent.shape}
                        hues={currentEvent.hues}
                        size={stimulusSize}
                        colorEnabled={settings.colorEnabled}
                        shapeEnabled={settings.shapeEnabled}
                        colorPattern={settings.colorPattern}
                        bubbleData={currentEvent.bubbleData}
                        topoData={currentEvent.topoData}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {devMode && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-mono rounded z-10">
            {devLureInfo}
          </div>
        )}
        {variableN && !isStimulusVisible && currentEvent && trialNumber < totalTrials && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="text-9xl font-bold text-white opacity-10">{currentEvent.n}</span>
          </div>
        )}

        {!settings.spatial3dEnabled && isStimulusVisible && currentEvent && (
          <div className="absolute" style={{
                left: `${(currentEvent.spatial.col + 0.5) / gridCols * 100}%`,
                top: `${(currentEvent.spatial.row + 0.5) / gridRows * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: `${stimulusSize}px`,
                height: `${stimulusSize}px`
              }}>
            <ShapeDisplay
                shape={currentEvent.shape}
                hues={currentEvent.hues}
                size={stimulusSize}
                colorEnabled={settings.colorEnabled}
                shapeEnabled={settings.shapeEnabled}
                colorPattern={settings.colorPattern}
                bubbleData={currentEvent.bubbleData}
                topoData={currentEvent.topoData}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-lg mx-auto">
        {settings.spatialEnabled && <button onClick={() => handleUserResponse('spatial')} className={getButtonClass('spatial')}>Position <span className="text-xs opacity-70">(A)</span></button>}
        {settings.audioEnabled && <button onClick={() => handleUserResponse('audio')} className={getButtonClass('audio')}>Audio <span className="text-xs opacity-70">(L)</span></button>}
        {settings.colorEnabled && <button onClick={() => handleUserResponse('color')} className={getButtonClass('color')}>Color <span className="text-xs opacity-70">(F)</span></button>}
        {settings.shapeEnabled && <button onClick={() => handleUserResponse('shape')} className={getButtonClass('shape')}>Shape <span className="text-xs opacity-70">(J)</span></button>}
      </div>

      <div className="mt-6 w-full flex justify-between items-center text-gray-400 font-mono">
        <button onClick={quitSession} className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white font-bold rounded-lg text-sm">Quit</button>
        {feedbackEnabled && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              <p>Hits: <span className="text-accent-success">{totalHits}</span></p>
              <p>Misses: <span className="text-accent-error">{score.misses}</span></p>
              {activeModalitiesRef.current.map(m => <p key={m}>{m.charAt(0).toUpperCase()} FA: <span className="text-accent-error">{score[`${m}FalseAlarms`]}</span></p>)}
          </div>
        )}
      </div>
    </div>
  );
};

export default NBackGame;
