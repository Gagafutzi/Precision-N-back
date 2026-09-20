
import React, { useEffect, useRef, useState } from 'react';
import { PerformanceRecord } from '../types';

declare const Chart: any; // Using Chart.js from CDN

const FALSE_ALARMS: [string, keyof PerformanceRecord['score']][] = [
  ['Pos', 'spatialFalseAlarms'],
  ['Aud', 'audioFalseAlarms'],
  ['Col', 'colorFalseAlarms'],
  ['Shp', 'shapeFalseAlarms'],
  ['Syl', 'syllableFalseAlarms'],
];

interface PerformanceProps {
  history: PerformanceRecord[];
  onBack: () => void;
}

const Performance: React.FC<PerformanceProps> = ({ history, onBack }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const [timeFilter, setTimeFilter] = useState<'24h' | 'all'>('24h');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Data for the chart is always the complete set for the selected filter
  const chartHistory = history.filter(record => {
    if (timeFilter === 'all') return true;
    const recordDate = new Date(record.date);
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    return recordDate > yesterday;
  });

  // Data for the table is paginated for the 'all' filter
  const sourceHistoryForTable = timeFilter === '24h' ? chartHistory : history;
  const totalPages = timeFilter === 'all' ? Math.ceil(sourceHistoryForTable.length / ITEMS_PER_PAGE) : 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  
  const tableHistory = timeFilter === 'all'
    ? sourceHistoryForTable.slice(startIndex, endIndex)
    : sourceHistoryForTable;

  const handleFilterChange = (filter: '24h' | 'all') => {
    setTimeFilter(filter);
    setCurrentPage(1); // Reset page when changing filters
  };

  /*
   * Canvas is not CSS. A `var(--color-primary)` handed to Chart.js reaches a
   * 2D context, which knows nothing about custom properties and falls back to
   * black — which is how the lines and the legend came to be invisible against
   * a dark background. Resolved here, against the live theme, so changing the
   * theme still changes the chart.
   */
  const themeColor = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  useEffect(() => {
    const data = chartHistory;
    if (data.length > 1 && chartRef.current) {
      const ctx = chartRef.current.getContext('2d');
      if (ctx) {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
        }

        const labels = data.map((_, index) => `Session ${index + 1}`);
        const accuracyData = data.map(r => (r.accuracy !== undefined ? r.accuracy * 100 : null));
        const audioData = data.map(r => r.settings.audioThreshold);
        const colorData = data.map(r => r.settings.colorThreshold);
        const shapeData = data.map(r => r.settings.shapeThreshold);

        chartInstanceRef.current = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Accuracy (%)',
                data: accuracyData,
                borderColor: themeColor('--color-primary', '#22d3ee'),
                backgroundColor: 'hsla(188, 80%, 52%, 0.2)',
                yAxisID: 'yAccuracy',
                tension: 0.1,
              },
              {
                label: 'Audio Δ',
                data: audioData,
                borderColor: themeColor('--color-button-audio', '#7c3aed'),
                yAxisID: 'yThresholds',
                hidden: true,
              },
              {
                label: 'Color Δ',
                data: colorData,
                borderColor: themeColor('--color-button-color', '#16a34a'),
                yAxisID: 'yThresholds',
                hidden: true,
              },
              {
                label: 'Shape Δ',
                data: shapeData,
                borderColor: themeColor('--color-button-shape', '#d97706'),
                yAxisID: 'yThresholds',
                hidden: true,
              },
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              yAccuracy: {
                type: 'linear',
                display: true,
                position: 'left',
                min: 0,
                max: 100,
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: themeColor('--color-text-muted', '#9ca3af') }
              },
              yThresholds: {
                type: 'logarithmic',
                display: true,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: themeColor('--color-text-muted', '#9ca3af') }
              },
              x: {
                 grid: { color: 'rgba(255, 255, 255, 0.1)' },
                 ticks: { color: themeColor('--color-text-muted', '#9ca3af') }
              }
            },
            plugins: {
              legend: { labels: { color: themeColor('--color-text-base', '#f3f4f6') } },
              tooltip: {
                backgroundColor: themeColor('--color-bg-surface', '#374151'),
                titleColor: themeColor('--color-text-base', '#f3f4f6'),
                bodyColor: themeColor('--color-text-muted', '#9ca3af'),
              }
            }
          }
        });
      }
    }
     return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [chartHistory]);

  const formatDuration = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  };

  const totalTimeTodayMs = history.reduce((acc, record) => {
    const recordDate = new Date(record.date);
    const today = new Date();
    const isToday = recordDate.getFullYear() === today.getFullYear() &&
                    recordDate.getMonth() === today.getMonth() &&
                    recordDate.getDate() === today.getDate();

    if (isToday && typeof record.duration === 'number') {
      return acc + record.duration;
    }
    return acc;
  }, 0);

  const getTotalHits = (score: PerformanceRecord['score']) => {
    if (typeof score.hits === 'number') {
      return score.hits;
    }
    return Object.values(score.hits).reduce((sum, h) => sum + h, 0);
  }

  return (
    <div className="p-4 sm:p-8 bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl text-gray-200">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-primary">Performance History</h2>
        <div className="p-3 bg-gray-900/50 rounded-lg text-right">
            <span className="text-gray-400">Time Today: </span>
            <span className="text-xl font-bold text-primary">{formatDuration(totalTimeTodayMs)}</span>
        </div>
      </div>
      
      {chartHistory.length > 1 ? (
        <div className="mb-6 sm:mb-8 h-64 sm:h-96 bg-gray-900/50 p-2 sm:p-4 rounded-lg">
          <canvas ref={chartRef}></canvas>
        </div>
      ) : (
        history.length > 0 && <p className="text-center text-gray-400 py-4">Complete another session to see a performance graph.</p>
      )}
      
      <div className="flex justify-center mb-4 border-b border-gray-700">
        <button 
          onClick={() => handleFilterChange('24h')} 
          className={`px-4 sm:px-6 py-3 text-base sm:text-lg font-semibold transition-colors ${timeFilter === '24h' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Last 24 Hours
        </button>
        <button 
          onClick={() => handleFilterChange('all')} 
          className={`px-4 sm:px-6 py-3 text-base sm:text-lg font-semibold transition-colors ${timeFilter === 'all' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-200'}`}
        >
          All Time
        </button>
      </div>

      <div>
        {tableHistory.length > 0 ? (
          <>
            {/* Phone: a card per session. The table below is thirteen columns
                wide, and thirteen columns on a 390px screen is either a
                sideways scroll nobody discovers or type too small to read, so
                on a phone each session becomes a block of labelled figures
                instead. Same numbers, same order, no horizontal movement. */}
            <ul className="sm:hidden space-y-3">
              {[...tableHistory].reverse().map((record, index) => (
                <li key={index} className="p-3 bg-gray-900/40 rounded-lg">
                  <div className="flex justify-between items-baseline gap-2 mb-2">
                    <span className="text-sm text-gray-300">{new Date(record.date).toLocaleString()}</span>
                    <span className={`text-lg font-bold ${record.accuracy && record.accuracy > 0.75 ? 'text-accent-success' : 'text-gray-300'}`}>
                      {record.accuracy !== undefined ? `${(record.accuracy * 100).toFixed(0)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
                    <span className="text-gray-400">N-Level</span>
                    <span className="text-gray-400">Grid</span>
                    <span className="text-gray-400">Hits / Misses</span>
                    <span>{record.settings.nLevel}</span>
                    <span>{`${record.settings.gridRows}x${record.settings.gridCols}`}</span>
                    <span>
                      <span className="text-accent-success">{getTotalHits(record.score)}</span>
                      {' / '}
                      <span className="text-accent-error">{record.score.misses}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm mt-2">
                    <span className="text-gray-400">Audio Δ</span>
                    <span className="text-gray-400">Color Δ</span>
                    <span className="text-gray-400">Shape Δ</span>
                    <span>{record.settings.audioThreshold.toFixed(2)}</span>
                    <span>{record.settings.colorThreshold.toFixed(2)}</span>
                    <span>{record.settings.shapeThreshold.toFixed(3)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    False alarms — {FALSE_ALARMS.map(([label, key], i) => (
                      <React.Fragment key={key}>
                        {i > 0 && ' · '}{label} <span className="text-accent-error">{record.score[key] ?? 0}</span>
                      </React.Fragment>
                    ))}
                  </p>
                </li>
              ))}
            </ul>

            {/* From a tablet up, the table — fourteen columns, so it keeps its
                own sideways scroll rather than stretching the page. */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[50rem] text-left table-auto">
              <thead>
                <tr className="bg-gray-700 text-gray-300">
                  <th className="p-2 sm:p-3 whitespace-nowrap">Date</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">N-Level</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Grid Size</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Audio Δ</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Color Δ</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Shape Δ</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Accuracy</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Hits</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Misses</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Audio FA</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Spatial FA</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Color FA</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Shape FA</th>
                  <th className="p-2 sm:p-3 whitespace-nowrap">Syllable FA</th>
                </tr>
              </thead>
              <tbody>
                {[...tableHistory].reverse().map((record, index) => (
                  <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-2 sm:p-3 text-sm">{new Date(record.date).toLocaleString()}</td>
                    <td className="p-2 sm:p-3 text-center">{record.settings.nLevel}</td>
                    <td className="p-2 sm:p-3 text-center">{`${record.settings.gridRows}x${record.settings.gridCols}`}</td>
                    <td className="p-2 sm:p-3 text-center">{record.settings.audioThreshold.toFixed(2)}</td>
                    <td className="p-2 sm:p-3 text-center">{record.settings.colorThreshold.toFixed(2)}</td>
                    <td className="p-2 sm:p-3 text-center">{record.settings.shapeThreshold.toFixed(3)}</td>
                    <td className={`p-3 text-center font-bold ${record.accuracy && record.accuracy > 0.75 ? 'text-accent-success' : 'text-gray-300'}`}>
                      {record.accuracy !== undefined ? `${(record.accuracy * 100).toFixed(0)}%` : 'N/A'}
                    </td>
                    <td className="p-2 sm:p-3 text-center text-accent-success">{getTotalHits(record.score)}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.misses}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.audioFalseAlarms}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.spatialFalseAlarms}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.colorFalseAlarms}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.shapeFalseAlarms}</td>
                    <td className="p-2 sm:p-3 text-center text-accent-error">{record.score.syllableFalseAlarms ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {timeFilter === 'all' && totalPages > 1 && (
              <div className="flex justify-center items-center mt-4 gap-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-gray-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-gray-400 py-8">
            {timeFilter === '24h' ? 'No sessions in the last 24 hours.' : 'No performance data yet. Complete a session to see your results here.'}
          </p>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <button onClick={onBack} className="px-8 py-3 bg-secondary hover:bg-secondary-hover text-white font-bold rounded-lg transition-colors">Back to Menu</button>
      </div>
    </div>
  );
};

export default Performance;