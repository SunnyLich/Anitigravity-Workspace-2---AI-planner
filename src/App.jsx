import React, { useState, useEffect } from 'react';
import { Compass, Search, CalendarCheck, Settings, Info, Map as MapIcon } from 'lucide-react';
import { TripFormWindow } from './components/TripFormWindow';
import ItineraryWindow from './components/ItineraryWindow';
import MapDisplay from './components/MapDisplay';
import { TSPSolver } from './utils/tspSolver';

function App() {
  const [itinerary, setItinerary] = useState([]);
  const [travelMethod, setTravelMethod] = useState('walk');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [pois, setPois] = useState([]);

  // Window Visibility State
  const [windows, setWindows] = useState({
    search: true,
    itinerary: false,
    settings: false,
    info: false
  });

  // Load London Ontario POIs
  useEffect(() => {
    fetch('/london-pois.json')
      .then(r => r.json())
      .then(data => setPois(data))
      .catch(err => console.warn('Could not load POIs:', err));
  }, []);

  const toggleWindow = (key) => {
    setWindows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleOptimize = (locations, method) => {
    setIsOptimizing(true);
    setTravelMethod(method);

    setTimeout(() => {
      const solver = new TSPSolver(locations, {
        travelSpeed: method === 'car' ? 40 : method === 'transit' ? 20 : 5,
        bufferTime: 15,
        startTime: "09:00"
      });

      const result = solver.solve();
      setItinerary(result);
      setWindows(prev => ({ ...prev, itinerary: true }));
      setIsOptimizing(false);
    }, 1200);
  };

  return (
    <div className="h-screen w-screen bg-bg-deep overflow-hidden relative">
      {/* Background Layer: Map — full screen, behind everything */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapDisplay itinerary={itinerary} pois={pois} />
      </div>

      {/* All UI sits above the map via explicit z-index */}

      {/* Header Area */}
      <div className="absolute top-6 left-6 flex items-center gap-4" style={{ zIndex: 400 }}>
        <div className="glass-panel p-3 flex items-center gap-3 border-primary/20 bg-primary/10">
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/30">
            <Compass className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">TripOptimizer</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Workspace v1.0</span>
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Windows Layer — zIndex 500+ so they sit above Leaflet panes */}
      <div style={{ position: 'relative', zIndex: 500, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'all' }}>
          <TripFormWindow
            isOpen={windows.search}
            onClose={() => toggleWindow('search')}
            onMinimize={() => toggleWindow('search')}
            onOptimize={handleOptimize}
          />

          <ItineraryWindow
            itinerary={itinerary}
            travelMethod={travelMethod}
            isOpen={windows.itinerary}
            onClose={() => toggleWindow('itinerary')}
            onMinimize={() => toggleWindow('itinerary')}
          />
        </div>
      </div>

      {/* App Dock */}
      <div className="app-dock" style={{ zIndex: 500 }}>
        <div
          className={`dock-item ${windows.search ? 'active' : ''}`}
          onClick={() => toggleWindow('search')}
          title="Plan Trip"
        >
          <Search size={22} />
        </div>
        <div
          className={`dock-item ${windows.itinerary ? 'active' : ''}`}
          onClick={() => toggleWindow('itinerary')}
          title="Itinerary"
        >
          <CalendarCheck size={22} />
        </div>
        <div
          className="dock-item"
          title="Settings (Coming Soon)"
        >
          <Settings size={22} />
        </div>
        <div
          className="dock-item"
          title="Help"
        >
          <Info size={22} />
        </div>
      </div>

      {/* Loading Overlay */}
      {isOptimizing && (
        <div className="fixed inset-0 bg-bg-deep/40 backdrop-blur-md flex flex-col items-center justify-center" style={{ zIndex: 1000 }}>
          <div className="relative">
            <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-6 font-black text-xl tracking-widest uppercase animate-pulse">Computing Best Route</p>
          <p className="text-text-muted text-sm mt-2">Running TSP-TW heuristic algorithms...</p>
        </div>
      )}

      {/* Floating hint */}
      <div className="absolute bottom-10 right-10" style={{ zIndex: 500 }}>
        <div className="glass-panel px-4 py-2 flex items-center gap-3 text-xs font-bold text-text-muted">
          <MapIcon size={14} className="text-primary" />
          <span>{pois.length > 0 ? `${pois.length} London ON places loaded` : 'Loading map data...'}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
