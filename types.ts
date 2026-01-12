
export enum HRZoneMethod {
  MAX_HR = 'MAX_HR',
  KARVONEN = 'KARVONEN'
}

export enum Units {
  KM = 'km',
  MILES = 'mi'
}

export enum RunnerLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  PRO = 'PRO'
}

export type ThemeType = 'carbon' | 'strava' | 'midnight' | 'forest';

export interface UserSettings {
  name: string;
  age: number;
  weight: number;
  maxHR: number;
  restingHR: number;
  method: HRZoneMethod;
  units: Units;
  theme: ThemeType;
  activePlanId?: string;
  level: RunnerLevel;
  // Map of sessionId -> runId to track completion
  completedSessions: Record<string, string>;
}

export interface TrackPoint {
  time: Date;
  lat?: number;
  lng?: number;
  altitude?: number;
  distance?: number;
  hr?: number;
  speed?: number;
}

export interface Lap {
  id: number;
  distance: number;
  time: number;
  avgPace: number;
  avgHR: number;
}

export interface RunData {
  id: string;
  name: string;
  startTime: Date;
  points: TrackPoint[];
  laps: Lap[];
  summary: {
    totalDistance: number;
    elapsedTime: number;
    movingTime: number;
    avgHR: number;
    maxHR: number;
    totalAscent: number;
    totalDescent: number;
    avgPace: number;
    maxPace: number;
    calories?: number;
    fitnessScore: number;
    intensityFactor: number;
    variabilityIndex: number;
    aerobicEfficiency: number;
    movementRatio: number;
    vam: number;
    gap?: number;
    decoupling?: number;
    trainingEffect: number;
  };
  compliance?: {
    score: number;
    notes: string;
    sessionId?: string;
  };
}

export interface PlanSession {
  id: string;
  day: number;
  title: string;
  description: string;
  targetDuration: number; // minutes
  targetZone: number;
  linkedRunId?: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  sessions: PlanSession[];
}

export interface HRZoneDistribution {
  zone: number;
  label: string;
  min: number;
  max: number;
  seconds: number;
  percentage: number;
}
