export type Milestone = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

export const MILESTONE_FEATURES: Record<Milestone, string[]> = {
  M1: ['F01', 'F02', 'F03', 'F04'],
  M2: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'],
  M3: [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09',
    'F10', 'F11', 'F12', 'F13', 'F14',
  ],
  M4: [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09',
    'F10', 'F11', 'F12', 'F13', 'F14',
    'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23',
  ],
  M5: [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09',
    'F10', 'F11', 'F12', 'F13', 'F14',
    'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23',
    'F24', 'F25', 'F26', 'F27',
  ],
  M6: [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09',
    'F10', 'F11', 'F12', 'F13', 'F14',
    'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23',
    'F24', 'F25', 'F26', 'F27',
    'F28', 'F29', 'F30', 'F31',
  ],
  M7: [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09',
    'F10', 'F11', 'F12', 'F13', 'F14',
    'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23',
    'F24', 'F25', 'F26', 'F27',
    'F28', 'F29', 'F30', 'F31',
    'F32', 'F33',
  ],
};

export function getFeaturesForMilestone(milestone: string): string[] {
  const key = milestone.toUpperCase() as Milestone;
  if (MILESTONE_FEATURES[key]) {
    return MILESTONE_FEATURES[key];
  }
  throw new Error(`Unknown milestone: ${milestone}. Valid options: M1, M2, M3, M4, M5, M6, M7`);
}

export const resolveFeaturesForMilestone = getFeaturesForMilestone;

export function featureToTestPattern(featureId: string, tier: number = 1): string {
  const cleanId = featureId.toLowerCase();
  return `tests/e2e/tier*/**/*${cleanId}*.e2e.test.ts`;
}

