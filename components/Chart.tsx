
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface ChartProps {
  data: { x: number; y: number }[];
  color: string;
  label: string;
  unit: string;
  xDomain: [number, number];
  isPace?: boolean;
}

const Chart: React.FC<ChartProps> = ({ data, color, label, unit, xDomain, isPace = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = 120;
    const margin = { top: 10, right: 0, bottom: 20, left: 0 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
      .domain([d3.min(data, d => d.y) || 0, d3.max(data, d => d.y) || 100])
      .range(isPace ? [margin.top, height - margin.bottom] : [height - margin.bottom, margin.top]);

    const line = d3.line<{ x: number; y: number }>()
      .x(d => x(d.x))
      .y(d => y(d.y))
      .curve(d3.curveBasis);

    const area = d3.area<{ x: number; y: number }>()
      .x(d => x(d.x))
      .y0(isPace ? margin.top : height - margin.bottom)
      .y1(d => y(d.y))
      .curve(d3.curveBasis);

    svg.append("path").datum(data).attr("fill", color).attr("fill-opacity", 0.1).attr("d", area);
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5).attr("d", line);

    // X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .attr("class", "text-zinc-600 font-mono text-[8px]")
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${Math.floor(+d/60)}m`).tickSize(0).tickPadding(8))
      .call(g => g.select(".domain").remove());

  }, [data, color, xDomain, isPace]);

  return (
    <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest italic">{label}</span>
        <span className="text-[10px] mono text-zinc-300 font-bold">{unit}</span>
      </div>
      <svg ref={svgRef} className="w-full h-[120px] overflow-visible" />
    </div>
  );
};

export default Chart;
