
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserSettings, HRZoneMethod, Units, RunData, ThemeType, PlanSession, RunnerLevel } from './types';
import { parseTCX } from './services/tcxParser';
import { getZoneDistribution, calculateTrainingEffect, calculateGAP, calculateDecoupling } from './services/physiology';
import { PLANS, calculateCompliance, getScaledPlan } from './services/plans';
import MetricTile from './components/MetricTile';
import Chart from './components/Chart';
import L from 'leaflet';

const THEMES: Record<ThemeType, { accent: string; glow: string }> = {
  strava: { accent: '#FC4C02', glow: 'rgba(252, 76, 2, 0.4)' },
  carbon: { accent: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.2)' },
  midnight: { accent: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' },
  forest: { accent: '#a3e635', glow: 'rgba(163, 230, 53, 0.4)' }
};

const ZONE_COLORS: Record<number, string> = {
  1: '#94a3b8', // Recovery - Slate
  2: '#22c55e', // Aerobic - Green
  3: '#eab308', // Tempo - Yellow
  4: '#f97316', // Threshold - Orange
  5: '#ef4444'  // Anaerobic - Red
};

const DEFAULT_SETTINGS: UserSettings = {
  name: 'Athlete', age: 30, weight: 75, maxHR: 190, restingHR: 55,
  method: HRZoneMethod.KARVONEN, units: Units.KM, theme: 'strava', level: RunnerLevel.BEGINNER,
  completedSessions: {}
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('liquid_pro_settings');
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved);
    return { ...DEFAULT_SETTINGS, ...parsed };
  });
  
  const [runs, setRuns] = useState<RunData[]>(() => {
    const saved = localStorage.getItem('liquid_pro_runs');
    if (!saved) return [];
    return JSON.parse(saved).map((r: any) => ({ 
      ...r, 
      startTime: new Date(r.startTime), 
      points: r.points.map((p: any) => ({ ...p, time: new Date(p.time) })) 
    }));
  });

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'run' | 'plan' | 'settings'>('dashboard');
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    localStorage.setItem('liquid_pro_settings', JSON.stringify(settings));
    localStorage.setItem('liquid_pro_runs', JSON.stringify(runs));
    document.documentElement.style.setProperty('--accent', THEMES[settings.theme].accent);
    document.documentElement.style.setProperty('--accent-glow', THEMES[settings.theme].glow);
  }, [settings, runs]);

  const activeRun = useMemo(() => runs.find(r => r.id === activeRunId), [runs, activeRunId]);
  
  const activePlan = useMemo(() => {
    if (!settings.activePlanId) return null;
    return getScaledPlan(settings.activePlanId, settings.level);
  }, [settings.activePlanId, settings.level]);

  // Group plan sessions by week (assuming 7 days per week)
  const groupedPlan = useMemo(() => {
    if (!activePlan) return [];
    const weeks: Record<number, PlanSession[]> = {};
    activePlan.sessions.forEach(s => {
      const weekNum = Math.ceil(s.day / 7);
      if (!weeks[weekNum]) weeks[weekNum] = [];
      weeks[weekNum].push(s);
    });
    return Object.entries(weeks).sort(([a], [b]) => Number(a) - Number(b));
  }, [activePlan]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, sessionId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await parseTCX(file);
      data.summary.trainingEffect = calculateTrainingEffect(data, settings);
      data.summary.decoupling = calculateDecoupling(data) || 0;
      
      if (data.points.length > 10) {
        data.summary.gap = calculateGAP(data.points[0], data.points[data.points.length - 1]);
      }

      if (sessionId && activePlan) {
        const session = activePlan.sessions.find(s => s.id === sessionId);
        if (session) {
          const { score, notes } = calculateCompliance(session, data);
          data.compliance = { score, notes, sessionId };
          setSettings(prev => ({
            ...prev,
            completedSessions: { ...prev.completedSessions, [sessionId]: data.id }
          }));
        }
      }

      setRuns(prev => [data, ...prev].slice(0, 50));
      setActiveRunId(data.id);
      setView('run');
    } catch (err) {
      alert("Error processing file.");
    } finally {
      setLoading(false);
    }
  };

  const formatPace = (secPerKm: number) => {
    if (!secPerKm || isNaN(secPerKm) || secPerKm === Infinity) return "0:00";
    const factor = settings.units === Units.MILES ? 1.60934 : 1;
    const pace = secPerKm / factor;
    return `${Math.floor(pace / 60)}:${Math.floor(pace % 60).toString().padStart(2, '0')}`;
  };

  const chartData = useMemo(() => {
    if (!activeRun) return null;
    const start = activeRun.startTime.getTime();
    return {
      xDomain: [0, activeRun.summary.elapsedTime] as [number, number],
      paceData: activeRun.points.map((p, i) => {
        let pace = 0;
        if (i > 5) {
          const prev = activeRun.points[i - 5];
          const distDiff = (p.distance || 0) - (prev.distance || 0);
          const timeDiff = (p.time.getTime() - prev.time.getTime()) / 1000;
          if (distDiff > 0) pace = timeDiff / (distDiff / 1000);
        }
        return { x: (p.time.getTime() - start) / 1000, y: Math.min(pace, 900) };
      }).filter(d => d.y > 0),
      hrData: activeRun.points.filter(p => p.hr).map(p => ({ x: (p.time.getTime() - start) / 1000, y: p.hr! })),
      altData: activeRun.points.filter(p => p.altitude !== undefined).map(p => ({ x: (p.time.getTime() - start) / 1000, y: p.altitude! }))
    };
  }, [activeRun]);

  useEffect(() => {
    if (view === 'run' && activeRun) {
      setTimeout(() => {
        if (mapRef.current) mapRef.current.remove();
        const validPoints = activeRun.points.filter(p => p.lat !== undefined && p.lng !== undefined);
        if (validPoints.length > 0) {
          const coords = validPoints.map(p => [p.lat!, p.lng!] as [number, number]);
          const map = L.map('map', { zoomControl: false, attributionControl: false }).setView(coords[0], 13);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
          L.polyline(coords, { color: THEMES[settings.theme].accent, weight: 5, lineCap: 'round' }).addTo(map);
          map.fitBounds(L.polyline(coords).getBounds(), { padding: [40, 40] });
          mapRef.current = map;
        }
      }, 100);
    }
  }, [activeRun, view, settings.theme]);

  return (
    <div className="min-h-screen pb-40">
      <nav className="fixed top-0 w-full z-50 liquid-glass border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2" onClick={() => setView('dashboard')}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: THEMES[settings.theme].accent }}>
            <div className="w-4 h-4 bg-white rounded-full blur-[2px]"></div>
          </div>
          <span className="font-black italic text-lg tracking-tighter uppercase">PRO ANALYZER</span>
        </div>
        <div className="flex gap-4 sm:gap-6">
          <button onClick={() => setView('dashboard')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${view === 'dashboard' ? 'text-white' : 'text-white/40'}`}>Feed</button>
          <button onClick={() => setView('plan')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${view === 'plan' ? 'text-white' : 'text-white/40'}`}>Training</button>
          <button onClick={() => setView('settings')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${view === 'settings' ? 'text-white' : 'text-white/40'}`}>Config</button>
        </div>
      </nav>

      <div className="pt-24 px-5 max-w-xl mx-auto space-y-10">
        {view === 'dashboard' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h1 className="text-5xl font-black italic tracking-tighter text-glow uppercase" style={{ color: THEMES[settings.theme].accent }}>ACTIVITY</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Endurance Metrics</p>
            </header>

            <section className="space-y-4">
              {runs.length === 0 && (
                <div className="glass-card p-12 text-center border-dashed border-2 border-white/5 opacity-50">
                  <p className="text-[10px] font-black uppercase tracking-widest italic">Drop TCX to Begin</p>
                </div>
              )}
              {runs.map(run => (
                <button key={run.id} onClick={() => { setActiveRunId(run.id); setView('run'); }} className="w-full glass-card p-6 flex justify-between items-center hover:bg-white/5 active:scale-95 transition-all relative overflow-hidden group">
                  <div className="text-left">
                    <h4 className="font-black text-lg italic tracking-tighter uppercase group-hover:text-glow">{run.name}</h4>
                    <p className="text-white/40 text-[10px] mono">
                      {run.startTime.toLocaleDateString()} · {(run.summary.totalDistance / 1000).toFixed(2)}{settings.units} · TE {run.summary.trainingEffect}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] mono font-black italic px-2 py-1 rounded bg-white/5" style={{ color: THEMES[settings.theme].accent }}>{run.summary.fitnessScore} pts</span>
                    {run.compliance && (
                        <div className="flex items-center gap-1">
                            <span className="text-[8px] font-black text-green-500 italic">PLAN MATCH</span>
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                        </div>
                    )}
                  </div>
                </button>
              ))}
            </section>
          </div>
        )}

        {view === 'plan' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header>
              <h1 className="text-5xl font-black italic tracking-tighter text-glow uppercase" style={{ color: THEMES[settings.theme].accent }}>CALENDAR</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Periodic Cycle: {settings.level}</p>
            </header>

            {!activePlan ? (
              <div className="grid grid-cols-1 gap-4">
                {['c25k', 'run10k'].map(pId => (
                  <button key={pId} onClick={() => setSettings(s => ({...s, activePlanId: pId}))} className="glass-card p-8 text-left hover:border-white/20 active:scale-95 transition-all group">
                    <p className="text-white/20 text-[9px] font-black uppercase tracking-[0.3em] mb-1">Available Program</p>
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter group-hover:text-glow transition-all" style={{ color: THEMES[settings.theme].accent }}>{pId === 'c25k' ? 'Couch to 5K' : '10K Finisher'}</h3>
                    <div className="flex gap-4 mt-4">
                      <div className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40 italic">{pId === 'c25k' ? '9 Weeks' : '8 Weeks'}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-12 pb-20">
                <div className="flex justify-between items-center px-2">
                  <div className="space-y-1">
                    <h3 className="font-black text-2xl italic uppercase tracking-tighter text-white/90">{activePlan.name}</h3>
                    <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">Adjusted for {settings.level} level</p>
                  </div>
                  <button onClick={() => setSettings(s => ({...s, activePlanId: undefined}))} className="px-4 py-2 rounded-full border border-red-500/30 text-[9px] font-black uppercase text-red-500 italic hover:bg-red-500/10">Reset</button>
                </div>

                <div className="space-y-10">
                  {groupedPlan.map(([weekNum, sessions]) => (
                    <div key={weekNum} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Week {weekNum}</span>
                        <div className="h-px flex-1 bg-white/5"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sessions.map((session) => {
                          const linkedRunId = settings.completedSessions[session.id];
                          const run = linkedRunId ? runs.find(r => r.id === linkedRunId) : null;
                          const zoneColor = ZONE_COLORS[session.targetZone] || '#fff';
                          
                          return (
                              <div key={session.id} 
                                   className={`glass-card p-5 relative overflow-hidden transition-all ${run ? 'bg-green-500/[0.03] border-green-500/20' : 'hover:border-white/20'}`}
                              >
                                {run && (
                                    <div className="absolute top-0 right-0 p-2 opacity-30">
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" />
                                      </svg>
                                    </div>
                                )}
                                
                                <div className="flex flex-col h-full gap-4">
                                  <div className="flex justify-between items-start">
                                    <div className="px-2 py-1 rounded bg-white/5 text-[9px] font-black italic tracking-tighter" style={{ color: zoneColor }}>
                                      DAY {session.day} · Z{session.targetZone}
                                    </div>
                                    {run && (
                                      <div className="text-[8px] font-black uppercase text-green-500 italic">Score: {run.compliance?.score}%</div>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className={`font-black uppercase text-sm italic tracking-tighter leading-tight ${run ? 'text-white/40 line-through' : 'text-white'}`}>
                                      {session.title}
                                    </h4>
                                    <p className="text-white/40 text-[10px] leading-relaxed line-clamp-2">
                                      {session.description}
                                    </p>
                                  </div>

                                  <div className="mt-auto flex items-center justify-between pt-2 border-t border-white/5">
                                    <span className="text-[10px] font-black italic text-white/30 uppercase">{session.targetDuration} min</span>
                                    
                                    {!run ? (
                                      <label className="p-2 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 active:scale-90 transition-all">
                                          <span className="text-[10px] font-black uppercase italic" style={{ color: THEMES[settings.theme].accent }}>Upload</span>
                                          <input type="file" accept=".tcx" onChange={(e) => handleFileUpload(e, session.id)} className="hidden" />
                                      </label>
                                    ) : (
                                      <button onClick={() => { setActiveRunId(run.id); setView('run'); }} className="text-[8px] font-black uppercase italic text-green-500/60 hover:text-green-500 transition-colors">
                                          View Stats
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'run' && activeRun && (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            <header className="flex justify-between items-end border-b border-white/10 pb-6">
              <div className="space-y-1">
                <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">Run Signature</p>
                <h1 className="text-4xl font-black italic uppercase tracking-tighter">{activeRun.name}</h1>
              </div>
              <div className="text-right">
                <p className="text-white/30 text-[10px] font-mono">{activeRun.startTime.toLocaleTimeString()}</p>
                <p className="font-black italic text-sm" style={{ color: THEMES[settings.theme].accent }}>TE {activeRun.summary.trainingEffect}</p>
              </div>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <div className="glass-card p-4 space-y-1">
                  <p className="text-[8px] text-white/30 uppercase font-black">GAP</p>
                  <p className="text-xl font-black italic mono text-white">{activeRun.summary.gap ? formatPace(activeRun.summary.gap) : '--'}</p>
               </div>
               <div className="glass-card p-4 space-y-1">
                  <p className="text-[8px] text-white/30 uppercase font-black">Decoupling</p>
                  <p className={`text-xl font-black italic mono ${activeRun.summary.decoupling > 5 ? 'text-red-500' : 'text-green-500'}`}>
                    {activeRun.summary.decoupling.toFixed(1)}%
                  </p>
               </div>
               <div className="glass-card p-4 space-y-1">
                  <p className="text-[8px] text-white/30 uppercase font-black">Efficiency</p>
                  <p className="text-xl font-black italic mono text-white">{activeRun.summary.aerobicEfficiency.toFixed(2)}</p>
               </div>
               <div className="glass-card p-4 space-y-1">
                  <p className="text-[8px] text-white/30 uppercase font-black">Intensity</p>
                  <p className="text-xl font-black italic mono text-white">{activeRun.summary.intensityFactor.toFixed(2)}</p>
               </div>
            </div>

            <div className="glass-card p-8 grid grid-cols-2 gap-y-10 gap-x-12">
              <MetricTile label="Distance" value={(activeRun.summary.totalDistance / 1000).toFixed(2)} unit={settings.units} />
              <MetricTile label="Moving Time" value={`${Math.floor(activeRun.summary.movingTime / 60)}m`} />
              <MetricTile label="Avg Pace" value={formatPace(activeRun.summary.avgPace)} unit={`/${settings.units}`} />
              <MetricTile label="Avg HR" value={activeRun.summary.avgHR} unit="bpm" />
              <MetricTile label="Total Ascent" value={Math.round(activeRun.summary.totalAscent)} unit="m" />
              <MetricTile label="Calories" value={activeRun.summary.calories || 0} unit="kcal" />
            </div>

            <div id="map" className="glass-card overflow-hidden h-[240px]"></div>

            <div className="space-y-6">
              <Chart label="Pace (min/km)" color={THEMES[settings.theme].accent} data={chartData.paceData} xDomain={chartData.xDomain} isPace unit="" />
              <Chart label="Heart Rate (bpm)" color="#ef4444" data={chartData.hrData} xDomain={chartData.xDomain} unit="" />
              <Chart label="Elevation (m)" color="#3b82f6" data={chartData.altData} xDomain={chartData.xDomain} unit="" />
            </div>

            {activeRun.compliance && (
              <div className="glass-card p-6 border-green-500/20 bg-green-500/5">
                <p className="text-green-400 text-[10px] font-black uppercase tracking-widest italic mb-2">Execution Quality: {activeRun.compliance.score}%</p>
                <p className="text-white/60 text-xs italic">"{activeRun.compliance.notes}"</p>
              </div>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-top-4 duration-500 pb-20">
             <header>
              <h1 className="text-5xl font-black italic tracking-tighter text-glow uppercase" style={{ color: THEMES[settings.theme].accent }}>CONFIG</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Personal Physiology</p>
            </header>
            
            <section className="space-y-6">
              <label className="text-white/40 text-[10px] font-black uppercase tracking-widest pl-2 italic">Runner Capability</label>
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
                {Object.values(RunnerLevel).map(l => (
                  <button key={l} onClick={() => setSettings(s => ({...s, level: l}))} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${settings.level === l ? 'bg-white text-black' : 'text-white/30'}`}>{l}</button>
                ))}
              </div>
            </section>

            <section className="glass-card p-8 space-y-10">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-2 block italic">Lactate HR (Max)</label>
                  <input type="number" value={settings.maxHR} onChange={e => setSettings(s => ({ ...s, maxHR: +e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 font-black italic text-2xl outline-none focus:border-white/30 transition-all" />
                </div>
                <div>
                  <label className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-2 block italic">Resting HR</label>
                  <input type="number" value={settings.restingHR} onChange={e => setSettings(s => ({ ...s, restingHR: +e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 font-black italic text-2xl outline-none focus:border-white/30 transition-all" />
                </div>
              </div>
              <div className="space-y-4">
                 <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-500/10 rounded-2xl hover:bg-red-500/5 transition-all">Wipe Engine Data</button>
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-sm pointer-events-none z-50">
        <label className="pointer-events-auto flex items-center justify-center gap-4 liquid-glass text-white font-black italic uppercase text-xs py-7 rounded-[2.5rem] shadow-2xl active:scale-95 transition-all cursor-pointer group">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
             <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
          </div>
          Import Trace (TCX)
          <input type="file" accept=".tcx" onChange={(e) => handleFileUpload(e)} className="hidden" />
        </label>
      </div>

      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-3xl">
          <div className="w-20 h-20 border-8 border-white/5 border-t-white rounded-full animate-spin" style={{ borderTopColor: THEMES[settings.theme].accent }}></div>
          <p className="text-[10px] font-black italic uppercase tracking-[0.5em] mt-10">Parsing Physiology...</p>
        </div>
      )}
    </div>
  );
};

export default App;
