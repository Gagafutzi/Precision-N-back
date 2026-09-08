
import React, { useState } from 'react';
import { Settings } from '../types';

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

  return (
    <div className="p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl text-gray-200">
      <h2 className="text-3xl font-bold mb-6 text-primary text-center">Settings</h2>
      
      <div className="space-y-4">
        {/* Modalities */}
        <div className="pt-2">
          <label className="font-bold text-lg">Active Modalities</label>
          <div className="grid grid-cols-2 gap-4 mt-2 p-4 bg-gray-900/50 rounded-lg">
            <div className="flex items-center gap-3"><input type="checkbox" name="spatialEnabled" id="spatialEnabled" checked={localSettings.spatialEnabled} onChange={handleChange} className="w-6 h-6" /><label htmlFor="spatialEnabled">Spatial (Position)</label></div>
            <div className="flex items-center gap-3"><input type="checkbox" name="audioEnabled" id="audioEnabled" checked={localSettings.audioEnabled} onChange={handleChange} className="w-6 h-6" /><label htmlFor="audioEnabled">Audio (Tone)</label></div>
            <div className="flex items-center gap-3"><input type="checkbox" name="colorEnabled" id="colorEnabled" checked={localSettings.colorEnabled} onChange={handleChange} className="w-6 h-6" /><label htmlFor="colorEnabled">Color (Hues)</label></div>
            <div className="flex items-center gap-3"><input type="checkbox" name="shapeEnabled" id="shapeEnabled" checked={localSettings.shapeEnabled} onChange={handleChange} className="w-6 h-6" /><label htmlFor="shapeEnabled">Shape (Contour)</label></div>
            <div className="flex items-center gap-3"><input type="checkbox" name="syllableEnabled" id="syllableEnabled" checked={localSettings.syllableEnabled} onChange={handleChange} className="w-6 h-6" /><label htmlFor="syllableEnabled">Syllable (Spoken)</label></div>
          </div>
          <p className="text-xs text-gray-400 mt-2 px-1">Note: When Color and Shape are enabled, the shape's contour masks the color pattern.</p>
        </div>
        
        {/* Color Pattern */}
        {localSettings.colorEnabled && (
          <div className="flex justify-between items-center">
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

        {/* Variable N Toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <label htmlFor="variableN">Enable Variable N</label>
          <input type="checkbox" name="variableN" id="variableN" checked={localSettings.variableN} onChange={handleChange} className="w-6 h-6" />
        </div>

        {/* N-Level */}
        <div className="flex justify-between items-center">
          <label htmlFor="nLevel">{localSettings.variableN ? 'Max N-Back Level' : 'N-Back Level'}</label>
          <input type="number" name="nLevel" id="nLevel" min="1" value={localSettings.nLevel} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Grid Size */}
        {localSettings.spatialEnabled && (
          <div className="flex justify-between items-center">
            <label htmlFor="gridRows">Grid Size</label>
            <div className='flex items-center gap-2'>
              <input type="number" name="gridRows" id="gridRows" min="2" max="20" value={localSettings.gridRows} onChange={handleChange} className="w-20 p-2 bg-gray-700 rounded" />
              <span>x</span>
              <input type="number" name="gridCols" id="gridCols" min="2" max="20" value={localSettings.gridCols} onChange={handleChange} className="w-20 p-2 bg-gray-700 rounded" />
            </div>
          </div>
        )}
        
        {/* 3D spatial — a separate mode, not a harder grid */}
        {localSettings.spatialEnabled && (
          <>
            <div className="flex justify-between items-center">
              <label htmlFor="spatial3dEnabled">3D Position</label>
              <input type="checkbox" name="spatial3dEnabled" id="spatial3dEnabled"
                     checked={localSettings.spatial3dEnabled} onChange={handleChange}
                     className="w-5 h-5 accent-cyan-500" />
            </div>
            {localSettings.spatial3dEnabled && (
              <>
                <div className="flex justify-between items-center">
                  <label htmlFor="gridLayers">Depth (layers)</label>
                  <input type="number" name="gridLayers" id="gridLayers" min="2" max="6"
                         value={localSettings.gridLayers} onChange={handleChange}
                         className="w-20 p-2 bg-gray-700 rounded" />
                </div>
                <div className="flex justify-between items-center">
                  <label htmlFor="spatial3dRotate">Rotate the box</label>
                  <input type="checkbox" name="spatial3dRotate" id="spatial3dRotate"
                         checked={localSettings.spatial3dRotate} onChange={handleChange}
                         className="w-5 h-5 accent-cyan-500" />
                </div>
                {localSettings.spatial3dRotate && (
                  <div className="flex justify-between items-center">
                    <label htmlFor="spatial3dRotateSeconds">Seconds per turn</label>
                    <input type="number" name="spatial3dRotateSeconds"
                           id="spatial3dRotateSeconds" min="4" max="120"
                           value={localSettings.spatial3dRotateSeconds}
                           onChange={handleChange}
                           className="w-20 p-2 bg-gray-700 rounded" />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Shape Vertices */}
        {localSettings.shapeEnabled && (
          <div className="flex justify-between items-center">
              <label htmlFor="shapeVertices">Shape Complexity (Vertices)</label>
              <input type="range" name="shapeVertices" id="shapeVertices" min="4" max="10" step="1" value={localSettings.shapeVertices} onChange={handleChange} className="w-1/2" />
              <span>{localSettings.shapeVertices}</span>
          </div>
        )}

        {/* Ball Size */}
        <div className="flex justify-between items-center">
          <label htmlFor="ballSize">Stimulus Size (% of cell)</label>
          <input type="range" name="ballSize" id="ballSize" min="50" max="400" value={localSettings.ballSize * 100} onChange={handleSliderChange} className="w-1/2" />
          <span>{(localSettings.ballSize * 100).toFixed(0)}%</span>
        </div>

        {/* Total Trials */}
        <div className="flex justify-between items-center">
          <label htmlFor="totalTrials">Total Trials per Session</label>
          <input type="number" name="totalTrials" id="totalTrials" min="10" step="5" value={localSettings.totalTrials} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Match Rate */}
        <div className="flex justify-between items-center">
          <label htmlFor="matchRate">Match Rate ({(localSettings.matchRate * 100).toFixed(0)}%)</label>
          <input type="range" name="matchRate" id="matchRate" min="0" max="100" value={localSettings.matchRate * 100} onChange={handleSliderChange} className="w-1/2" />
        </div>

        {/* Lure Rate */}
        <div className="flex justify-between items-center">
          <label htmlFor="lureRate">Lure (Interference) Rate ({(localSettings.lureRate * 100).toFixed(0)}%)</label>
          <input type="range" name="lureRate" id="lureRate" min="0" max="100" value={localSettings.lureRate * 100} onChange={handleSliderChange} className="w-1/2" />
        </div>
        
        {/* ISI */}
        <div className="flex justify-between items-center">
          <label htmlFor="isi">Base Inter-Stimulus Interval (ms)</label>
          <input type="number" name="isi" id="isi" step="100" min="500" value={localSettings.isi} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Stimulus duration */}
        <div className="flex justify-between items-center">
          <label htmlFor="stimulusDuration">Stimulus Shown For (ms)</label>
          <input type="number" name="stimulusDuration" id="stimulusDuration" step="100" min="100"
                 max={Math.max(200, localSettings.isi - 100)}
                 value={localSettings.stimulusDuration} onChange={handleChange}
                 className="w-24 p-2 bg-gray-700 rounded" />
        </div>

        {/* Variable ISI Toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <label htmlFor="variableIsiEnabled">Enable Variable ISI</label>
          <input type="checkbox" name="variableIsiEnabled" id="variableIsiEnabled" checked={localSettings.variableIsiEnabled} onChange={handleChange} className="w-6 h-6" />
        </div>
        {localSettings.variableIsiEnabled && (
            <>
              <div className="flex justify-between items-center">
                  <label htmlFor="variableIsiRange">Max ISI Variation (± ms)</label>
                  <input type="number" name="variableIsiRange" id="variableIsiRange" step="50" min="0" value={localSettings.variableIsiRange} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
              </div>
              <div className="flex justify-between items-center">
                  <label htmlFor="variableIsiMinRange">Min ISI Variation (± ms)</label>
                  <input type="number" name="variableIsiMinRange" id="variableIsiMinRange" step="50" min="0" max={localSettings.variableIsiRange} value={localSettings.variableIsiMinRange} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
              </div>
            </>
        )}

        {/* Calibration Toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <label htmlFor="calibrationEnabled">Enable Pre-game Calibration</label>
          <input type="checkbox" name="calibrationEnabled" id="calibrationEnabled" checked={localSettings.calibrationEnabled} onChange={handleChange} className="w-6 h-6" />
        </div>
        
        {/* Feedback Toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <label htmlFor="feedbackEnabled">Enable In-game Feedback</label>
          <input type="checkbox" name="feedbackEnabled" id="feedbackEnabled" checked={localSettings.feedbackEnabled} onChange={handleChange} className="w-6 h-6" />
        </div>

        {/* Dev Mode Toggle */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-700">
          <label htmlFor="devMode">Enable Dev Mode (Show Lure Info)</label>
          <input type="checkbox" name="devMode" id="devMode" checked={localSettings.devMode} onChange={handleChange} className="w-6 h-6" />
        </div>
        
        {/* Manual Thresholds (if calibration disabled) */}
        {!localSettings.calibrationEnabled && (
          <div className='p-4 bg-gray-900/50 rounded-lg mt-4'>
            <h3 className='text-center text-lg mb-2 font-bold'>Manual Thresholds</h3>
            {localSettings.audioEnabled && <div className="flex justify-between items-center mt-2">
              <label htmlFor="audioThreshold">Audio Delta (Cents)</label>
              <input type="number" name="audioThreshold" id="audioThreshold" step="1" min="1" value={localSettings.audioThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
             {localSettings.colorEnabled && <div className="flex justify-between items-center mt-2">
              <label htmlFor="colorThreshold">Color Interval Delta (Hue °)</label>
              <input type="number" name="colorThreshold" id="colorThreshold" step="1" min="1" value={localSettings.colorThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
             {localSettings.shapeEnabled && <div className="flex justify-between items-center mt-2">
              <label htmlFor="shapeThreshold">Shape Delta (% radius)</label>
              <input type="number" name="shapeThreshold" id="shapeThreshold" step="0.01" min="0.01" value={localSettings.shapeThreshold} onChange={handleChange} className="w-24 p-2 bg-gray-700 rounded" />
            </div>}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <button onClick={handleSave} className="px-8 py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors">Save & Back</button>
        <button onClick={onBack} className="px-8 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  );
};

export default SettingsComponent;
