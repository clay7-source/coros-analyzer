
import { HRZoneMethod, UserSettings, HRZoneDistribution, RunData, TrackPoint } from '../types';

/**
 * Grade Adjusted Pace (GAP)
 * Uses a simplified Minetti formula to adjust pace based on slope.
 * Returns equivalent flat pace in seconds per km.
 */
export const calculateGAP = (p1: TrackPoint, p2: TrackPoint): number => {
  const dist = (p2.distance || 0) - (p1.distance || 0);
  const elev = (p2.altitude || 0) - (p1.altitude || 0);
  const time = (p2.time.getTime() - p1.time.getTime()) / 1000;
  
  if (dist <= 0 || time <= 0) return 0;
  
  const grade = elev / dist;
  // Adjustment factor based on grade (standardized curve)
  // Higher grade = much slower GAP (harder effort)
  const adjFactor = 1 + (grade * 3) + (grade * grade * 10); 
  const actualPace = time / (dist / 1000);
  return actualPace / adjFactor;
};

/**
 * Aerobic Decoupling (Pa:Hr)
 * Compares efficiency of 1st half vs 2nd half.
 * A value > 5% suggests significant fatigue or lack of aerobic base.
 */
export const calculateDecoupling = (run: RunData): number | null => {
  if (run.points.length < 100) return null;
  const midPointIdx = Math.floor(run.points.length / 2);
  
  const getEfficiency = (pts: TrackPoint[]) => {
    let hrSum = 0;
    let distSum = 0;
    let timeSum = 0;
    let count = 0;
    
    for(let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i-1];
      if (p.hr && p.distance) {
        hrSum += p.hr;
        distSum += (p.distance - (prev.distance || 0));
        timeSum += (p.time.getTime() - prev.time.getTime()) / 1000;
        count++;
      }
    }
    if (count === 0 || distSum === 0) return 0;
    const avgHr = hrSum / count;
    const paceKmMin = (timeSum / 60) / (distSum / 1000);
    return (1 / paceKmMin) / avgHr; // Power-to-HR ratio proxy
  };

  const eff1 = getEfficiency(run.points.slice(0, midPointIdx));
  const eff2 = getEfficiency(run.points.slice(midPointIdx));
  
  if (eff1 === 0 || eff2 === 0) return null;
  return ((eff1 - eff2) / eff1) * 100;
};

export const calculateZones = (settings: UserSettings): { min: number, max: number, label: string }[] => {
  const { maxHR, restingHR, method } = settings;
  const hrReserve = maxHR - restingHR;

  if (method === HRZoneMethod.KARVONEN) {
    return [
      { label: 'Z1 Recovery', min: Math.round(restingHR + hrReserve * 0.50), max: Math.round(restingHR + hrReserve * 0.60) },
      { label: 'Z2 Aerobic', min: Math.round(restingHR + hrReserve * 0.60), max: Math.round(restingHR + hrReserve * 0.70) },
      { label: 'Z3 Tempo', min: Math.round(restingHR + hrReserve * 0.70), max: Math.round(restingHR + hrReserve * 0.80) },
      { label: 'Z4 Threshold', min: Math.round(restingHR + hrReserve * 0.80), max: Math.round(restingHR + hrReserve * 0.90) },
      { label: 'Z5 Anaerobic', min: Math.round(restingHR + hrReserve * 0.90), max: maxHR },
    ];
  } else {
    return [
      { label: 'Z1 Recovery', min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60) },
      { label: 'Z2 Aerobic', min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70) },
      { label: 'Z3 Tempo', min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80) },
      { label: 'Z4 Threshold', min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90) },
      { label: 'Z5 Anaerobic', min: Math.round(maxHR * 0.90), max: maxHR },
    ];
  }
};

export const getZoneDistribution = (run: RunData, settings: UserSettings): HRZoneDistribution[] => {
  const zones = calculateZones(settings);
  const distribution: HRZoneDistribution[] = zones.map((z, i) => ({
    zone: i + 1,
    label: z.label,
    min: z.min,
    max: z.max,
    seconds: 0,
    percentage: 0
  }));

  let totalValidSeconds = 0;

  for (let i = 1; i < run.points.length; i++) {
    const p1 = run.points[i - 1];
    const p2 = run.points[i];
    if (p1.hr && p2.hr) {
      const avgHr = (p1.hr + p2.hr) / 2;
      const duration = (p2.time.getTime() - p1.time.getTime()) / 1000;
      if (duration > 0 && duration < 30) {
        totalValidSeconds += duration;
        const zoneIdx = distribution.findIndex(d => avgHr >= d.min && avgHr < (d.max + 1));
        if (zoneIdx !== -1) {
          distribution[zoneIdx].seconds += duration;
        } else if (avgHr >= settings.maxHR) {
            distribution[distribution.length-1].seconds += duration;
        }
      }
    }
  }

  return distribution.map(d => ({
    ...d,
    percentage: totalValidSeconds > 0 ? (d.seconds / totalValidSeconds) * 100 : 0
  }));
};

export const calculateTrainingEffect = (run: RunData, settings: UserSettings) => {
  const dist = getZoneDistribution(run, settings);
  const z3 = dist[2].seconds;
  const z4 = dist[3].seconds;
  const z5 = dist[4].seconds;
  const score = (z3 * 0.5 + z4 * 1.5 + z5 * 3.0) / 60;
  let effect = 0;
  if (score < 10) effect = 1.0 + (score / 10);
  else if (score < 30) effect = 2.0 + (score - 10) / 20;
  else if (score < 60) effect = 3.0 + (score - 30) / 30;
  else if (score < 120) effect = 4.0 + (score - 60) / 60;
  else effect = 5.0;
  return Math.min(5.0, Math.round(effect * 10) / 10);
};
