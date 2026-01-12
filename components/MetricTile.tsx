
import React from 'react';

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
}

const MetricTile: React.FC<MetricTileProps> = ({ label, value, unit }) => (
  <div className="flex flex-col space-y-1">
    <span className="text-white/30 text-[8px] uppercase font-black tracking-[0.2em] italic">{label}</span>
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-black italic mono text-white tracking-tighter">{value}</span>
      {unit && <span className="text-white/20 text-[10px] font-bold uppercase italic tracking-widest">{unit}</span>}
    </div>
  </div>
);

export default MetricTile;
