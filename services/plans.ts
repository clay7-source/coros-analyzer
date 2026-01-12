
import { TrainingPlan, PlanSession, RunData, RunnerLevel } from '../types';

export const getScaledPlan = (planId: string, level: RunnerLevel): TrainingPlan => {
  const basePlan = PLANS[planId];
  if (!basePlan) return basePlan;

  const multipliers: Record<RunnerLevel, number> = {
    [RunnerLevel.BEGINNER]: 1.0,
    [RunnerLevel.INTERMEDIATE]: 1.3,
    [RunnerLevel.PRO]: 1.7
  };

  return {
    ...basePlan,
    sessions: basePlan.sessions.map(s => ({
      ...s,
      targetDuration: Math.round(s.targetDuration * multipliers[level])
    }))
  };
};

// Fix: Export PLANS constant to allow external access (e.g., in App.tsx)
export const PLANS: Record<string, TrainingPlan> = {
  c25k: {
    id: 'c25k',
    name: 'Couch to 5K',
    sessions: [
      { id: 'c25k_w1d1', day: 1, title: 'W1D1: Intro', description: '60s run / 90s walk repeats', targetDuration: 20, targetZone: 2 },
      { id: 'c25k_w1d2', day: 3, title: 'W1D2: Consistency', description: '60s run / 90s walk repeats', targetDuration: 20, targetZone: 2 },
      { id: 'c25k_w1d3', day: 5, title: 'W1D3: Push', description: '60s run / 90s walk repeats', targetDuration: 20, targetZone: 2 },
      { id: 'c25k_w3d1', day: 15, title: 'W3D1: Progression', description: '2 min run / 1 min walk', targetDuration: 25, targetZone: 2 },
      { id: 'c25k_w5d3', day: 33, title: 'W5D3: The Wall', description: 'Continuous 20 minute run', targetDuration: 20, targetZone: 3 },
      { id: 'c25k_final', day: 63, title: 'Final Graduation', description: '30-45 minute steady run', targetDuration: 30, targetZone: 3 },
    ]
  },
  run10k: {
    id: 'run10k',
    name: '10K Finisher',
    sessions: [
      { id: '10k_w1d1', day: 1, title: 'Foundation', description: 'Easy base run', targetDuration: 30, targetZone: 2 },
      { id: '10k_w2d1', day: 8, title: 'Intervals', description: '4x400m fast with rest', targetDuration: 35, targetZone: 4 },
      { id: '10k_w4d1', day: 22, title: 'Threshold Work', description: '10 min warm up, 15 min Z4', targetDuration: 40, targetZone: 4 },
      { id: '10k_long', day: 14, title: 'Long Run', description: 'Slow steady distance', targetDuration: 50, targetZone: 2 },
    ]
  }
};

export const calculateCompliance = (session: PlanSession, run: RunData): { score: number; notes: string } => {
  const durationDiff = Math.abs((run.summary.movingTime / 60) - session.targetDuration);
  const durationScore = Math.max(0, 100 - (durationDiff / session.targetDuration) * 100);
  
  let intensityScore = 80;
  const score = Math.round((durationScore * 0.7) + (intensityScore * 0.3));
  
  let notes = score > 85 ? "Excellent adherence to plan." : "Session intensity or duration deviated.";
  if (run.summary.trainingEffect > 4.5) notes += " High fatigue risk.";
  
  return { score, notes };
};