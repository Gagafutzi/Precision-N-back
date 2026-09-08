
import React, { useState, useCallback, useEffect } from 'react';
import { GameState, CalibrationResult, Settings, PerformanceRecord, Score, Modality } from './types';
import Calibration from './components/Calibration';
import NBackGame from './components/NBackGame';
import SettingsComponent from './components/Settings';
import Performance from './components/Performance';
import { useLocalStorage } from './hooks/useLocalStorage';

const DEFAULT_SETTINGS: Settings = {
  nLevel: 2,
  matchRate: 0.20,
  lureRate: 0.30,
  isi: 2800,
  stimulusDuration: 500,
  gridRows: 7,
  gridCols: 7,
  spatial3dEnabled: false,
  gridLayers: 3,
  spatial3dRotate: false,
  spatial3dRotateSeconds: 24,
  audioThreshold: 290,
  colorThreshold: 28,
  shapeThreshold: 0.20,
  calibrationEnabled: false,
  totalTrials: 25,
  theme: 'cyan',
  devMode: false,
  /* A full cell. 0.5 was the slider's own minimum, so the app shipped at the
     smallest stimulus it can draw, on a 7x7 grid. */
  ballSize: 1.0,
  variableN: false,
  spatialEnabled: true,
  audioEnabled: true,
  colorEnabled: false,
  shapeEnabled: false,
  syllableEnabled: false,
  shapeVertices: 6,
  colorPattern: 'vertical',
  feedbackEnabled: true,
  variableIsiEnabled: false,
  variableIsiRange: 700,
  variableIsiMinRange: 350,
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.Start);
  const [settings, setSettings] = useLocalStorage<Settings>('nback-settings', DEFAULT_SETTINGS);
  const [performanceHistory, setPerformanceHistory] = useLocalStorage<PerformanceRecord[]>('nback-performance', []);
  const [isCalibratingForGame, setIsCalibratingForGame] = useState(false);
  const [lastSessionStats, setLastSessionStats] = useState<PerformanceRecord | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const handleCalibrationComplete = useCallback((result: Partial<CalibrationResult>) => {
    setSettings(prev => ({
      ...prev,
      ...result,
    }));
    if (isCalibratingForGame) {
      setGameState(GameState.Playing);
    } else {
      setGameState(GameState.Start);
    }
    setIsCalibratingForGame(false);
  }, [setSettings, isCalibratingForGame]);
  
  const handleCalibrationQuit = useCallback(() => {
    setIsCalibratingForGame(false);
    setGameState(GameState.Start);
  }, []);

  const handleGameEnd = useCallback((finalScore: Score, totalMatchesByModality: Record<Modality, number>, completed: boolean, duration: number) => {
    if (completed) {
      const totalHits = Object.values(finalScore.hits).reduce((sum, h) => sum + h, 0);
      const totalMatches = Object.values(totalMatchesByModality).reduce((sum, m) => sum + m, 0);
      const totalFalseAlarms = finalScore.spatialFalseAlarms + finalScore.audioFalseAlarms + finalScore.colorFalseAlarms + finalScore.shapeFalseAlarms;
      const totalNonMatches = settings.totalTrials - totalMatches;
      const correctRejections = Math.max(0, totalNonMatches - totalFalseAlarms);
      
      const accuracyDenominator = totalMatches + totalFalseAlarms;
      const accuracy = accuracyDenominator > 0 ? totalHits / accuracyDenominator : 1;
      
      const record: PerformanceRecord = {
        date: new Date().toISOString(),
        settings: {
          nLevel: settings.nLevel,
          audioThreshold: settings.audioThreshold,
          colorThreshold: settings.colorThreshold,
          shapeThreshold: settings.shapeThreshold,
          gridRows: settings.gridRows,
          gridCols: settings.gridCols,
          spatial3dEnabled: settings.spatial3dEnabled,
          gridLayers: settings.gridLayers,
          spatial3dRotate: settings.spatial3dRotate,
          spatial3dRotateSeconds: settings.spatial3dRotateSeconds,
          stimulusDuration: settings.stimulusDuration,
        },
        score: finalScore,
        accuracy: accuracy,
        duration: duration,
        totalMatches: totalMatches,
        totalMatchesByModality: totalMatchesByModality,
        correctRejections: correctRejections,
        totalNonMatches: totalNonMatches,
      };
      setPerformanceHistory(prev => [...prev, record]);
      setLastSessionStats(record);

      // Per-modality dynamic difficulty adjustment
      const newSettings = { ...settings };
      const adjustableModalities = (['audio', 'color', 'shape'] as const).filter(m => settings[`${m}Enabled`]);

      adjustableModalities.forEach(mod => {
          const hits = finalScore.hits[mod];
          const matches = totalMatchesByModality[mod];
          const falseAlarms = finalScore[`${mod}FalseAlarms`];
          
          const denominator = matches + falseAlarms;
          const modAccuracy = denominator > 2 ? hits / denominator : -1; // -1 to skip adjustment if not enough data
          
          const thresholdKey = `${mod}Threshold` as 'audioThreshold' | 'colorThreshold' | 'shapeThreshold';
          let currentThreshold = newSettings[thresholdKey];

          if (modAccuracy !== -1) {
            if (modAccuracy < 0.5) {
              // Decrease difficulty -> increase threshold
              currentThreshold *= 1.1;
            } else if (modAccuracy > 0.8) {
              // Increase difficulty -> decrease threshold
              currentThreshold *= 0.9;
            }
          }

          // Apply caps to prevent extreme values
          if (mod === 'audio') currentThreshold = Math.max(5, currentThreshold);
          if (mod === 'color') currentThreshold = Math.max(2, currentThreshold);
          if (mod === 'shape') currentThreshold = Math.max(0.01, currentThreshold);
          
          newSettings[thresholdKey] = currentThreshold;
      });

      setSettings(newSettings);
    }

    setGameState(GameState.Finished);
  }, [settings, setPerformanceHistory, setSettings]);
  
  const handleStartTraining = useCallback(() => {
    if (settings.calibrationEnabled) {
      setIsCalibratingForGame(true);
      setGameState(GameState.Calibrating);
    } else {
      setGameState(GameState.Playing);
    }
  }, [settings.calibrationEnabled]);

  const handleStartCalibration = () => {
    setIsCalibratingForGame(false);
    setGameState(GameState.Calibrating);
  };

  const renderContent = () => {
    switch (gameState) {
      case GameState.Start:
        return (
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4 text-primary">Precision N-Back</h1>
            <p className="max-w-2xl mx-auto mb-8 text-lg text-gray-300">
              A cognitive training tool for high-fidelity sensory buffering and working memory.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={handleStartTraining}
                className="px-8 py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Start Training
              </button>
               <button
                onClick={handleStartCalibration}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Calibrate
              </button>
              <button
                onClick={() => setGameState(GameState.Settings)}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Settings
              </button>
              <button
                onClick={() => setGameState(GameState.Performance)}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Performance
              </button>
            </div>
          </div>
        );
      case GameState.Settings:
        return <SettingsComponent settings={settings} onSave={setSettings} onBack={() => setGameState(GameState.Start)} />;
      case GameState.Performance:
        return <Performance history={performanceHistory} onBack={() => setGameState(GameState.Start)} />;
      case GameState.Calibrating:
        return <Calibration onComplete={handleCalibrationComplete} onQuit={handleCalibrationQuit} settings={settings} />;
      case GameState.Playing:
        return <NBackGame settings={settings} onGameEnd={handleGameEnd} />;
      case GameState.Finished:
        // Fix: Explicitly type accumulator and value in reduce to prevent type inference issues with Object.values.
        const totalHits = lastSessionStats ? Object.values(lastSessionStats.score.hits).reduce((s: number, h: number) => s + h, 0) : 0;
        return (
          <div className="text-center w-full max-w-lg">
            <h2 className="text-3xl font-bold mb-4 text-primary">Session Complete</h2>
            {lastSessionStats ? (
                <div className="p-6 bg-gray-800 rounded-lg mx-auto mb-8 text-left shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-center">Round Summary</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-lg">
                        <span className="font-semibold text-gray-400">Accuracy:</span>
                        <span className="font-bold text-primary">{`${(lastSessionStats.accuracy! * 100).toFixed(0)}%`}</span>
                        
                        <span className="font-semibold text-gray-400">Hits / Matches:</span>
                        <span><span className="text-accent-success">{totalHits}</span> / {lastSessionStats.totalMatches}</span>

                        <span className="font-semibold text-gray-400">Misses:</span>
                        <span className="text-accent-error">{lastSessionStats.score.misses}</span>
                        
                        {(lastSessionStats.correctRejections !== undefined && lastSessionStats.totalNonMatches !== undefined) && <>
                            <span className="font-semibold text-gray-400">Correct Rejections:</span>
                            <span>{lastSessionStats.correctRejections} / {lastSessionStats.totalNonMatches}</span>
                        </>}

                        <span className="font-semibold text-gray-400 col-span-2 text-center mt-3 border-b border-gray-700 pb-1 mb-1">False Alarms</span>
                        
                        {settings.spatialEnabled && <>
                            <span className="font-semibold text-gray-400">Spatial:</span>
                            <span className="text-accent-error">{lastSessionStats.score.spatialFalseAlarms}</span>
                        </>}
                        {settings.audioEnabled && <>
                            <span className="font-semibold text-gray-400">Audio:</span>
                            <span className="text-accent-error">{lastSessionStats.score.audioFalseAlarms}</span>
                        </>}
                        {settings.colorEnabled && <>
                            <span className="font-semibold text-gray-400">Color:</span>
                            <span className="text-accent-error">{lastSessionStats.score.colorFalseAlarms}</span>
                        </>}
                        {settings.shapeEnabled && <>
                             <span className="font-semibold text-gray-400">Shape:</span>
                            <span className="text-accent-error">{lastSessionStats.score.shapeFalseAlarms}</span>
                        </>}
                    </div>
                </div>
            ) : (
                <p className="mb-8 text-gray-300">You've completed the session. Great work!</p>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleStartTraining}
                className="px-8 py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Train Again
              </button>
              <button
                onClick={() => setGameState(GameState.Start)}
                className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors shadow-lg"
              >
                Main Menu
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className={`min-h-screen w-full flex flex-col items-center justify-center bg-gray-900 font-sans ${gameState === GameState.Playing ? "h-screen p-2" : "p-4"}`}>
      {renderContent()}
    </main>
  );
};

export default App;
