
import React, { useState } from 'react';
import { Settings } from '../types';
import { SYLLABLES } from '../syllableAudio';
import {
  SYLLABLE_RATE_MAX,
  SYLLABLE_RATE_MIN,
  previewSyllable,
  syllableMaxMs,
} from '../syllableVoice';

interface SettingsProps {
  settings: Settings;
  onSave: (newSettings: Settings) => void;
  onBack: () => void;
}

const SettingsComponent: React.FC<SettingsProps> = ({ settings, onSave, onBack }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  const handleSave = () => {
    // Ensure at least one modality is enabled
    if (!localSettings.spatialEnabled && !localSettings.audioEnabled && !localSettings.colorEnabled && !localSettings.shapeEnabled) {
      alert("Please enable at least one modality.");
      return;
    }
    onSave(localSettings);
    onBack();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const numValue = (type === 'number' || type === 'range') ? Number(value) : value;
    
    setLocalSettings(prev => {
      const newSettings = {
        ...prev,
        [name]: isCheckbox ? (e.target as HTMLInputElement).checked : numValue,
      };

      if (name === 'variableIsiRange' && typeof numValue === 'number') {
        if (newSettings.variableIsiMinRange > numValue) {
          newSettings.variableIsiMinRange = numValue;
        }
      }
      
      return newSettings;
    });
  };
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: Number(value) / 100,
    }));
  };

  /* The whole row toggles, not just the box — see .toggle-row in index.html. */
  const rowClass = 'flex items-center gap-3 toggle-row';

  return (
    <div className="p-4 sm:p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl text-gray-200">
      <h2 className="text-2xl sm:text-3xl font-bold mb-5 sm:mb-6 text-primary text-center">Settings</h2>
      
      <div className="space-y-4">
        {/* Modalities */}
        <div className="pt-2">
          <label className="font-bold text-lg">Active Modalities</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-2 p-3 sm:p-4 bg-gray-900/50 rounded-lg">
            <label htmlFor="spatialEnabled" className={rowClass}><input type="checkbox" name="spatialEnabled" id="spatialEnabled" checked={localSettings.spatialEnabled} onChange={handleChange} className="w-6 h-6 shrink-0" />Spatial (Position)</label>
            <label htmlFor="audioEnabled" className={rowClass}><input type="checkbox" name="audioEnabled" id="audioEnabled" checked={localSettings.audioEnabled} onChange={handleChange} className="w-6 h-6 shrink-0" />Audio (Tone)</label>
            <label htmlFor="colorEnabled" className={rowClass}><input type="checkbox" name="colorEnabled" id="colorEnabled" checked={localSettings.colorEnabled} onChange={handleChange} className="w-6 h-6 shrink-0" />Color (Hues)</label>
            <label htmlFor="shapeEnabled" className={rowClass}><input type="checkbox" name="shapeEnabled" id="shapeEnabled" checked={localSettings.shapeEnabled} onChange={handleChange} className="w-6 h-6 shrink-0" />Shape (Contour)</label>
            <label htmlFor="syllableEnabled" className={rowClass}><input type="checkbox" name="syllableEnabled" id="syllableEnabled" checked={localSettings.syllableEnabled} onChange={handleChange} className="w-6 h-6 shrink-0" />Syllable (Spoken)</label>
          </div>
          <p className="text-xs text-gray-400 mt-2 px-1">Note: When Color and Shape are enabled, the shape's contour masks the color pattern.</p>
        </div>
        
        {/* Color Pattern */}
        {localSettings.colorEnabled && (
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <label htmlFor="colorPattern">Color Pattern</label>
            <select
              name="colorPattern"
              id="colorPattern"
              value={localSettings.colorPattern}
              onChange={handleChange}
              className="p-2 bg-gray-700 rounded"
            >
              <option value="vertical">Vertical Stripes</option>
              <option value="horizontal">Horizontal Stripes</option>
              <option value="triangles">Triangles</option>
              <option value="radial">Radial</option>
              <option value="blocky">Blocky (Bricks)</option>
              <option value="aztec">Aztec (Maze)</option>
              <option value="grid">Grid</option>
              <option value="hexagons">Hexagons</option>
              <option value="bubbles">Bubbles</option>
              <option value="topo">Topography</option>
            </select>
          </div>
        )}

        {/* Pronunciation speed — playback-time, so it costs no re-render */}
        {localSettings.syllableEnabled && (
          <>
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <label htmlFor="syllableRate">Pronunciation Speed ({localSettings.syllableRate.toFixed(2)}x)</label>
              <input type="range" name="syllableRate" id="syllableRate"
                     min={SYLLABLE_RATE_MIN * 100} max={SYLLABLE_RATE_MAX * 100} step="5"
                     value={localSettings.syllableRate * 100}
                     onChange={handleSliderChange} className="w-1/3" />
              <button type="button"
                      onClick={() => void previewSyllable(localSettings.syllableRate, localSettings.syllablePoolSize)}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                Hear one
              </button>
            </div>
            <p className="text-xs text-gray-400 px-1">
              Slower speech is easier to identify and easier to rehearse; faster leaves
              more of the interval silent. The longest syllable runs about {syllableMaxMs(localSettings.syllableRate)} ms here.
              {syllableMaxMs(localSettings.syllableRate) > localSettings.isi && (
                <span className="text-yellow-400"> That is longer than the {localSettings.isi} ms interval, so it will be cut off by the next trial.</span>
              )}
            </p>

            <div className="flex justify-between items-center gap-3 flex-wrap">
              <label htmlFor="syllablePoolSize">Syllable Variety (of {SYLLABLES.length})</label>
              <input type="range" name="syllablePoolSize" id="syllablePoolSize"
                     min="4" max={SYLLABLES.length} step="1"
                     value={localSettings.syllablePoolSize} onChange={handleChange}
                     className="w-full sm:w-1/2 min-w-[8rem] grow" />
              <span>{localSettings.syllablePoolSize}</span>
            </div>
            <p className="text-xs text-gray-400 px-1">
              How many of the inventory are in play. Fewer is easier: with a small pool
              much of what you hear is something you heard recently anyway, and the
              channel starts rewarding familiarity rather than recall.
            </p>
          </>
        )}

        {/* Variable N Toggle */}
        <label htmlFor="variableN" className="flex justify-between items-center gap-3 flex-wrap pt-4 border-t border-gray-700 toggle-row">
          <span>Enable Variable N</span>
          <input type="checkbox" name="variableN" id="variableN" checked={localSettings.variableN} onChange={handleChange} className="w-6 h-6" />
        </label>

        {/* N-Level */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="nLevel">{localSettings.variableN ? 'Max N-Back Level' : 'N-Back Level'}</label>
          <input type="number" name="nLevel" id="nLevel" min="1" value={localSettings.nLevel} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Grid Size */}
        {localSettings.spatialEnabled && (
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <label htmlFor="gridRows">Grid Size</label>
            <div className='flex items-center gap-2 shrink-0'>
              <input type="number" name="gridRows" id="gridRows" min="2" max="20" value={localSettings.gridRows} onChange={handleChange} className="w-20 p-2 bg-gray-700 rounded" />
              <span>x</span>
              <input type="number" name="gridCols" id="gridCols" min="2" max="20" value={localSettings.gridCols} onChange={handleChange} className="w-20 p-2 bg-gray-700 rounded" />
            </div>
          </div>
        )}
        
        {/* 3D spatial — a separate mode, not a harder grid */}
        {localSettings.spatialEnabled && (
          <>
            <label htmlFor="spatial3dEnabled" className="flex justify-between items-center gap-3 flex-wrap toggle-row">
              <span>3D Position</span>
              <input type="checkbox" name="spatial3dEnabled" id="spatial3dEnabled"
                     checked={localSettings.spatial3dEnabled} onChange={handleChange}
                     className="w-5 h-5 accent-cyan-500" />
            </label>
            {localSettings.spatial3dEnabled && (
              <>
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <label htmlFor="gridLayers">Depth (layers)</label>
                  <input type="number" name="gridLayers" id="gridLayers" min="2" max="6"
                         value={localSettings.gridLayers} onChange={handleChange}
                         className="w-20 p-2 bg-gray-700 rounded" />
                </div>
                <label htmlFor="spatial3dRotate" className="flex justify-between items-center gap-3 flex-wrap toggle-row">
                  <span>Rotate the box</span>
                  <input type="checkbox" name="spatial3dRotate" id="spatial3dRotate"
                         checked={localSettings.spatial3dRotate} onChange={handleChange}
                         className="w-5 h-5 accent-cyan-500" />
                </label>
                {localSettings.spatial3dRotate && (
                  <div className="flex justify-between items-center gap-3 flex-wrap">
                    <label htmlFor="spatial3dRotateSeconds">Seconds per turn (4-500)</label>
                    <input type="number" name="spatial3dRotateSeconds"
                           id="spatial3dRotateSeconds" min="4" max="500" step="5"
                           value={localSettings.spatial3dRotateSeconds}
                           onChange={handleChange}
                           className="w-24 p-2 bg-gray-700 rounded" />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Shape Vertices */}
        {localSettings.shapeEnabled && (
          <div className="flex justify-between items-center gap-3 flex-wrap">
              <label htmlFor="shapeVertices">Shape Complexity (Vertices)</label>
              <input type="range" name="shapeVertices" id="shapeVertices" min="4" max="10" step="1" value={localSettings.shapeVertices} onChange={handleChange} className="w-full sm:w-1/2 min-w-[8rem] grow" />
              <span>{localSettings.shapeVertices}</span>
          </div>
        )}

        {/* Ball Size */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="ballSize">Stimulus Size (% of cell)</label>
          <input type="range" name="ballSize" id="ballSize" min="50" max="400" value={localSettings.ballSize * 100} onChange={handleSliderChange} className="w-full sm:w-1/2 min-w-[8rem] grow" />
          <span>{(localSettings.ballSize * 100).toFixed(0)}%</span>
        </div>

        {/* Total Trials */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="totalTrials">Total Trials per Session</label>
          <input type="number" name="totalTrials" id="totalTrials" min="10" step="5" value={localSettings.totalTrials} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Match Rate */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="matchRate">Match Rate ({(localSettings.matchRate * 100).toFixed(0)}%)</label>
          <input type="range" name="matchRate" id="matchRate" min="0" max="100" value={localSettings.matchRate * 100} onChange={handleSliderChange} className="w-full sm:w-1/2 min-w-[8rem] grow" />
        </div>

        {/* Lure Rate */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="lureRate">Lure (Interference) Rate ({(localSettings.lureRate * 100).toFixed(0)}%)</label>
          <input type="range" name="lureRate" id="lureRate" min="0" max="100" value={localSettings.lureRate * 100} onChange={handleSliderChange} className="w-full sm:w-1/2 min-w-[8rem] grow" />
        </div>
        
        {/* ISI */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="isi">Base Inter-Stimulus Interval (ms)</label>
          <input type="number" name="isi" id="isi" step="100" min="500" value={localSettings.isi} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Stimulus duration */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label htmlFor="stimulusDuration">Stimulus Shown For (ms)</label>
          <input type="number" name="stimulusDuration" id="stimulusDuration" step="100" min="100"
                 max={Math.max(200, localSettings.isi - 100)}
                 value={localSettings.stimulusDuration} onChange={handleChange}
                 className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Variable ISI Toggle */}
        <label htmlFor="variableIsiEnabled" className="flex justify-between items-center gap-3 flex-wrap pt-4 border-t border-gray-700 toggle-row">
          <span>Enable Variable ISI</span>
          <input type="checkbox" name="variableIsiEnabled" id="variableIsiEnabled" checked={localSettings.variableIsiEnabled} onChange={handleChange} className="w-6 h-6" />
        </label>
        {localSettings.variableIsiEnabled && (
            <>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                  <label htmlFor="variableIsiRange">Max ISI Variation (± ms)</label>
                  <input type="number" name="variableIsiRange" id="variableIsiRange" step="50" min="0" value={localSettings.variableIsiRange} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                  <label htmlFor="variableIsiMinRange">Min ISI Variation (± ms)</label>
                  <input type="number" name="variableIsiMinRange" id="variableIsiMinRange" step="50" min="0" max={localSettings.variableIsiRange} value={localSettings.variableIsiMinRange} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
              </div>
            </>
        )}

        {/* Calibration Toggle */}
        <label htmlFor="calibrationEnabled" className="flex justify-between items-center gap-3 flex-wrap pt-4 border-t border-gray-700 toggle-row">
          <span>Enable Pre-game Calibration</span>
          <input type="checkbox" name="calibrationEnabled" id="calibrationEnabled" checked={localSettings.calibrationEnabled} onChange={handleChange} className="w-6 h-6" />
        </label>
        
        {/* Feedback Toggle */}
        <label htmlFor="feedbackEnabled" className="flex justify-between items-center gap-3 flex-wrap pt-4 border-t border-gray-700 toggle-row">
          <span>Enable In-game Feedback</span>
          <input type="checkbox" name="feedbackEnabled" id="feedbackEnabled" checked={localSettings.feedbackEnabled} onChange={handleChange} className="w-6 h-6" />
        </label>

        {/* Dev Mode Toggle */}
        <label htmlFor="devMode" className="flex justify-between items-center gap-3 flex-wrap pt-4 border-t border-gray-700 toggle-row">
          <span>Enable Dev Mode (Show Lure Info)</span>
          <input type="checkbox" name="devMode" id="devMode" checked={localSettings.devMode} onChange={handleChange} className="w-6 h-6" />
        </label>
        
        {/* Manual Thresholds (if calibration disabled) */}
        {!localSettings.calibrationEnabled && (
          <div className='p-4 bg-gray-900/50 rounded-lg mt-4'>
            <h3 className='text-center text-lg mb-2 font-bold'>Manual Thresholds</h3>
            {localSettings.audioEnabled && <div className="flex justify-between items-center gap-3 flex-wrap mt-2">
              <label htmlFor="audioThreshold">Audio Delta (Cents)</label>
              <input type="number" name="audioThreshold" id="audioThreshold" step="1" min="1" value={localSettings.audioThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
             {localSettings.colorEnabled && <div className="flex justify-between items-center gap-3 flex-wrap mt-2">
              <label htmlFor="colorThreshold">Color Interval Delta (Hue °)</label>
              <input type="number" name="colorThreshold" id="colorThreshold" step="1" min="1" value={localSettings.colorThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
             {localSettings.shapeEnabled && <div className="flex justify-between items-center gap-3 flex-wrap mt-2">
              <label htmlFor="shapeThreshold">Shape Delta (% radius)</label>
              <input type="number" name="shapeThreshold" id="shapeThreshold" step="0.01" min="0.01" value={localSettings.shapeThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 sm:flex justify-center gap-3 sm:gap-4">
        <button onClick={handleSave} className="px-4 sm:px-8 py-4 sm:py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors">Save & Back</button>
        <button onClick={onBack} className="px-4 sm:px-8 py-4 sm:py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  );
};

export default SettingsComponent;
