
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalibrationResult, Settings, Shape } from '../types';
import ShapeDisplay from './ShapeDisplay';

declare namespace Tone {
  interface Synth {
    toDestination(): this;
    triggerAttackRelease(freq: number, duration: string): this;
    dispose(): void;
  }
  const context: { state: string };
  function start(): Promise<void>;
  const Synth: new () => Synth;
}

interface CalibrationProps {
  onComplete: (result: Partial<CalibrationResult>) => void;
  onQuit: () => void;
  settings: Settings;
}

type Modality = 'audio' | 'color' | 'shape';
type CalibrationMode = 'selection' | Modality;
type TrialStep = 'stimulus' | 'isi1' | 'noise' | 'isi2' | 'lure' | 'response' | 'feedback';

const MIN_AUDIO_DELTA = 5;
const MIN_COLOR_DELTA = 2;
const MIN_SHAPE_DELTA = 0.01;

const MAX_CALIBRATION_TRIALS = 20;
const INCORRECT_STEP_UP_FACTOR = 1.25;
const STIMULUS_DURATION_MS = 600;
const ISI_MS = 750;

const generateBaseShape = (numVertices: number): Shape => {
  const vertices = [];
  for (let i = 0; i < numVertices; i++) {
    vertices.push({ radius: 0.6 + Math.random() * 0.4 });
  }
  return { vertices };
};

const generateRandomHues = (): [number, number, number] => {
  const baseHue = Math.random() * 360;
  const interval = 15 + Math.random() * 20;
  const hues: [number, number, number] = [
    (baseHue - interval + 360) % 360,
    baseHue,
    (baseHue + interval) % 360,
  ];
  hues.sort((a, b) => a - b);
  return hues;
};

type Stimulus = {
    audio: number;
    spatial: { row: number; col: number };
    hues: [number, number, number];
    shape: Shape;
    bubbleData?: { cx: number; cy: number; r: number; }[];
    topoData?: { points: {x: number, y: number}[] }[];
};

const Calibration: React.FC<CalibrationProps> = ({ onComplete, onQuit, settings }) => {
  const [mode, setMode] = useState<CalibrationMode>('selection');
  const [trialCount, setTrialCount] = useState(0);
  const [trialStep, setTrialStep] = useState<TrialStep>('stimulus');
  const [currentStimulus, setCurrentStimulus] = useState<Stimulus | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [instructionText, setInstructionText] = useState<string>('');
  const [currentTestThreshold, setCurrentTestThreshold] = useState(0);
  
  const baseStimulusRef = useRef<Stimulus | null>(null);
  const synthRef = useRef<Tone.Synth | null>(null);
  const trialTimeoutRef = useRef<number | undefined>(undefined);
  
  const thresholdsRef = useRef<CalibrationResult>({
      audioThreshold: settings.audioThreshold,
      colorThreshold: settings.colorThreshold,
      shapeThreshold: settings.shapeThreshold,
  });
  
  useEffect(() => {
    synthRef.current = new Tone.Synth().toDestination();
    return () => {
      synthRef.current?.dispose();
      if (trialTimeoutRef.current) clearTimeout(trialTimeoutRef.current);
    };
  }, []);

  const playTone = useCallback((freq: number) => {
    const play = () => synthRef.current?.triggerAttackRelease(freq, `${STIMULUS_DURATION_MS / 1000}s`);
    if (synthRef.current && Tone.context.state !== 'running') {
      Tone.start().then(play);
    } else {
      play();
    }
  }, []);

  const runTrialStep = useCallback(() => {
    setFeedback(null);

    const generateLure = (base: Stimulus, modality: Modality): Stimulus => {
        let lure = {
            ...base,
            shape: { vertices: base.shape.vertices.map(v => ({...v})) },
            bubbleData: base.bubbleData,
            topoData: base.topoData,
        };
        switch (modality) {
            case 'audio':
                const directionA = Math.random() < 0.5 ? 1 : -1;
                lure.audio = base.audio * Math.pow(2, (directionA * thresholdsRef.current.audioThreshold) / 1200);
                break;
            case 'color':
                const targetHues = [...base.hues] as [number, number, number];
                const shiftAmount = thresholdsRef.current.colorThreshold;
                // Shift middle hue and compensate with the last hue to preserve average
                targetHues[1] = (targetHues[1] + shiftAmount + 360) % 360;
                targetHues[2] = (targetHues[2] - shiftAmount + 360) % 360;
                lure.hues = targetHues;
                break;
            case 'shape':
                const vIndex = Math.floor(Math.random() * lure.shape.vertices.length);
                const directionS = Math.random() < 0.5 ? 1 : -1;
                lure.shape.vertices[vIndex].radius = Math.max(0.1, Math.min(1.0, lure.shape.vertices[vIndex].radius + directionS * thresholdsRef.current.shapeThreshold));
                break;
        }
        return lure;
    };

    const generateRandomStimulus = (): Stimulus => {
        const stimulus: Stimulus = {
            audio: 200 + Math.random() * 600,
            spatial: { row: Math.floor(settings.gridRows / 2), col: Math.floor(settings.gridCols / 2) },
            hues: generateRandomHues(),
            shape: generateBaseShape(settings.shapeVertices),
        };

        if (settings.colorPattern === 'bubbles') {
            stimulus.bubbleData = Array.from({ length: 25 }, () => ({
                cx: Math.random(),
                cy: Math.random(),
                r: Math.random() * 0.2 + 0.1,
            }));
        }

        if (settings.colorPattern === 'topo') {
            const numLines = 6;
            stimulus.topoData = Array.from({ length: numLines }, (_, i) => {
                const radius = (0.5) * (0.1 + (i / numLines) * 0.85);
                const points = Array.from({length: 8}, (_, j) => {
                    const angle = (j / 8) * 2 * Math.PI;
                    const r = radius + (Math.random() - 0.5) * 0.1;
                    return { x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle) };
                });
                return { points };
            });
        }
        return stimulus;
    };

    switch (trialStep) {
        case 'stimulus':
            baseStimulusRef.current = generateRandomStimulus();
            setCurrentStimulus(baseStimulusRef.current);
            setInstructionText('Remember this');
            if (mode === 'audio') playTone(baseStimulusRef.current.audio);
            trialTimeoutRef.current = window.setTimeout(() => setTrialStep('isi1'), STIMULUS_DURATION_MS);
            break;
        case 'isi1':
            setCurrentStimulus(null);
            setInstructionText('');
            trialTimeoutRef.current = window.setTimeout(() => setTrialStep('noise'), ISI_MS);
            break;
        case 'noise':
            const noiseStim = generateRandomStimulus();
            setCurrentStimulus(noiseStim);
            setInstructionText('...');
            if (mode === 'audio') playTone(noiseStim.audio);
            trialTimeoutRef.current = window.setTimeout(() => setTrialStep('isi2'), STIMULUS_DURATION_MS);
            break;
        case 'isi2':
            setCurrentStimulus(null);
            setInstructionText('');
            trialTimeoutRef.current = window.setTimeout(() => setTrialStep('lure'), ISI_MS);
            break;
        case 'lure':
            if (baseStimulusRef.current && mode !== 'selection') {
                const lureStim = generateLure(baseStimulusRef.current, mode);
                setCurrentStimulus(lureStim);
                setInstructionText('Same as the first?');
                if (mode === 'audio') playTone(lureStim.audio);
            }
            trialTimeoutRef.current = window.setTimeout(() => setTrialStep('response'), STIMULUS_DURATION_MS);
            break;
        case 'response':
            setCurrentStimulus(null);
            break;
        case 'feedback':
            trialTimeoutRef.current = window.setTimeout(() => {
                const wasCorrect = feedback === 'correct';
                if (wasCorrect) {
                    onComplete(thresholdsRef.current);
                    setMode('selection');
                } else {
                    const nextTrialCount = trialCount + 1;
                    if (nextTrialCount >= MAX_CALIBRATION_TRIALS) {
                        onComplete(thresholdsRef.current);
                        setMode('selection');
                    } else {
                        setTrialCount(nextTrialCount);
                        setTrialStep('stimulus');
                    }
                }
            }, 1200);
            break;
    }
  }, [trialStep, mode, playTone, settings, onComplete, feedback, trialCount]);
  
  useEffect(() => {
      if (mode !== 'selection') {
        runTrialStep();
      }
      return () => clearTimeout(trialTimeoutRef.current);
  }, [trialStep, mode, runTrialStep]);

  const handleResponse = (userChoseSame: boolean) => {
      if (mode === 'selection' || trialStep !== 'response') return;
      
      const wasCorrect = !userChoseSame;
      setFeedback(wasCorrect ? 'correct' : 'incorrect');

      if (wasCorrect) {
        setInstructionText('Threshold Found!');
      } else {
        setInstructionText("Not quite, let's make it easier.");
        let currentDelta: keyof CalibrationResult;
        let newValue = 0;
        switch (mode) {
            case 'audio':   currentDelta = 'audioThreshold'; break;
            case 'color':   currentDelta = 'colorThreshold'; break;
            case 'shape':   currentDelta = 'shapeThreshold'; break;
        }
        newValue = thresholdsRef.current[currentDelta] * INCORRECT_STEP_UP_FACTOR;
        thresholdsRef.current[currentDelta] = newValue;
        setCurrentTestThreshold(newValue);
      }
      setTrialStep('feedback');
  };
  
  const startModalityCalibration = (modality: Modality) => {
      let startValue = 0;
      switch (modality) {
          case 'audio': 
              startValue = MIN_AUDIO_DELTA;
              thresholdsRef.current.audioThreshold = startValue; 
              break;
          case 'color': 
              startValue = MIN_COLOR_DELTA;
              thresholdsRef.current.colorThreshold = startValue; 
              break;
          case 'shape': 
              startValue = MIN_SHAPE_DELTA;
              thresholdsRef.current.shapeThreshold = startValue; 
              break;
      }
      setCurrentTestThreshold(startValue);
      setTrialCount(0);
      setTrialStep('stimulus');
      setMode(modality);
  };

  const handleEndCalibrationRun = () => {
    onComplete(thresholdsRef.current);
    setMode('selection');
  }

  const renderSelection = () => (
    <div className="text-center w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-primary">Calibration Menu</h2>
        <p className="mb-6 sm:mb-8 text-gray-300">We'll start with a tiny difference and increase it until you can spot it.</p>
        <div className="grid grid-cols-2 gap-4 mb-8">
            {settings.audioEnabled && <button onClick={() => startModalityCalibration('audio')} className="p-4 bg-button-audio hover:bg-button-audio-hover rounded-lg">Audio<br/><span className="text-sm opacity-80">({settings.audioThreshold.toFixed(2)})</span></button>}
            {settings.colorEnabled && <button onClick={() => startModalityCalibration('color')} className="p-4 bg-button-color hover:bg-button-color-hover rounded-lg">Color<br/><span className="text-sm opacity-80">({settings.colorThreshold.toFixed(2)})</span></button>}
            {settings.shapeEnabled && <button onClick={() => startModalityCalibration('shape')} className="p-4 bg-button-shape hover:bg-button-shape-hover rounded-lg">Shape<br/><span className="text-sm opacity-80">({settings.shapeThreshold.toFixed(3)})</span></button>}
        </div>
        <button onClick={onQuit} className="px-8 py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors">Finish & Back to Menu</button>
    </div>
  );

  /*
   * Two shapes, chosen by the height of the screen rather than its width.
   *
   * Stacked, the way it reads on a desktop or a phone held upright: title,
   * stimulus, answer. Held sideways a phone has around 390px of height and the
   * stack does not fit in it — the stimulus alone would be most of it and the
   * answer sits below the fold, so answering means scrolling the thing you are
   * being asked about off the screen first.
   *
   * On anything that short the same three blocks become two columns instead:
   * the stimulus on the left, spanning both rows, with the wording above the
   * answer on the right. The row and column placements below only mean anything
   * inside that grid, so the markup is one tree either way.
   */
  const renderCalibration = () => (
    <div className="w-full flex flex-col items-center [@media(max-height:560px)]:grid [@media(max-height:560px)]:grid-cols-[minmax(0,48vh)_minmax(0,1fr)] [@media(max-height:560px)]:grid-rows-[1fr_auto] [@media(max-height:560px)]:gap-x-5 [@media(max-height:560px)]:items-center">
      <div className="w-full flex flex-col items-center [@media(max-height:560px)]:col-start-2 [@media(max-height:560px)]:row-start-1 [@media(max-height:560px)]:self-end">
      <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2 text-primary capitalize text-center">{mode} Calibration</h2>
      <p className="text-base sm:text-lg text-gray-300 mb-1 sm:mb-2 min-h-7 text-center">{instructionText}</p>
      <p className="text-gray-400 mb-3 sm:mb-6 [@media(max-height:560px)]:mb-2 font-mono text-sm sm:text-base">
        Attempt: {trialCount + 1} | Current Delta: {currentTestThreshold.toFixed(3)}
      </p>
      </div>
      {/* Square, and bounded by the screen in both directions: a fixed 24rem hung
          off the side of a phone held upright, and a box sized by width alone
          pushes Same and Different under the fold of a phone held sideways —
          where answering means scrolling the stimulus away first. The vh term
          is what keeps the answer in view; the box stays square either way,
          since the stimulus is placed as a fraction of it. */}
      <div className="[@media(max-height:560px)]:col-start-1 [@media(max-height:560px)]:row-start-1 [@media(max-height:560px)]:row-span-2 relative w-[min(100%,45vh)] [@media(max-height:560px)]:w-full max-w-sm aspect-square mx-auto bg-gray-900 rounded-lg mb-4 sm:mb-6 [@media(max-height:560px)]:mb-0 flex items-center justify-center shadow-inner overflow-hidden">
          {currentStimulus && (
            <div className="absolute" style={{
              left: `50%`,
              top: `50%`,
              transform: 'translate(-50%, -50%)',
              width: `${settings.ballSize * 100}px`,
              height: `${settings.ballSize * 100}px`,
            }}>
              <ShapeDisplay
                shape={currentStimulus.shape}
                hues={currentStimulus.hues}
                size={settings.ballSize * 100}
                colorEnabled={mode === 'color'}
                shapeEnabled={mode === 'shape'}
                colorPattern={settings.colorPattern}
                bubbleData={currentStimulus.bubbleData}
                topoData={currentStimulus.topoData}
              />
            </div>
          )}
          {feedback && <span className={`text-5xl font-bold ${feedback === 'correct' ? 'text-accent-success' : 'text-accent-error'}`}>{feedback === 'correct' ? 'Correct' : 'Incorrect'}</span>}
      </div>
      <div className="w-full max-w-sm flex flex-col items-center [@media(max-height:560px)]:col-start-2 [@media(max-height:560px)]:row-start-2 [@media(max-height:560px)]:self-start">
        <div className="flex gap-4 w-full">
            <button disabled={trialStep !== 'response'} onClick={() => handleResponse(true)} className="flex-1 px-4 py-4 sm:py-3 font-bold bg-gray-600 hover:bg-gray-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Same</button>
            <button disabled={trialStep !== 'response'} onClick={() => handleResponse(false)} className="flex-1 px-4 py-4 sm:py-3 font-bold bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">Different</button>
        </div>
        <button onClick={handleEndCalibrationRun} className="mt-4 sm:mt-6 [@media(max-height:560px)]:mt-3 px-4 py-3 bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors text-sm">End & Return to Menu</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl">
      {mode === 'selection' ? renderSelection() : renderCalibration()}
    </div>
  );
};

export default Calibration;
