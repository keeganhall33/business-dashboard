/**
 * Follow-up label helper for DISCOVERY_INTELLIGENCE stream.
 * Maps follow-up timing information to deterministic labels: NOW, SOON, LATER, UNKNOWN.
 * 
 * @module discovery-intelligence/followup-label
 */

export type FollowUpTiming = {
  minutesFromNow?: number;
  hoursFromNow?: number;
  daysFromNow?: number;
};

export type FollowUpLabel = 'NOW' | 'SOON' | 'LATER' | 'UNKNOWN';

/**
 * Validates input is well-formed.
 */
function isValidInput(input: FollowUpTiming): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }
  
  const keys = Object.keys(input);
  const validKeys = ['minutesFromNow', 'hoursFromNow', 'daysFromNow'];
  
  // Check that all provided keys are valid
  for (const key of keys) {
    if (!validKeys.includes(key)) {
      return false;
    }
    // Check that values are finite numbers
    const value = (input as any)[key];
    if (value !== null && typeof value !== 'number' || !Number.isFinite(value)) {
      return false;
    }
  }
  
  // At least one timing field should be provided for valid input
  return keys.length > 0;
}

/**
 * Converts follow-up timing to a deterministic label.
 * 
 * Label boundaries (approximate):
 * - NOW: within ~5 minutes (immediate attention)
 * - SOON: ~5 minutes to ~2 hours
 * - LATER: > ~2 hours
 * - UNKNOWN: invalid/missing input
 * 
 * @param input - Follow-up timing information
 * @returns Deterministic label based on timing
 */
export function getFollowUpLabel(input: FollowUpTiming): FollowUpLabel {
  if (!isValidInput(input)) {
    return 'UNKNOWN';
  }
  
  const { minutesFromNow, hoursFromNow, daysFromNow } = input;
  
  // Normalize everything to minutes for comparison
  const totalMinutes: number[] = [];
  
  if (minutesFromNow !== undefined) {
    totalMinutes.push(minutesFromNow);
  }
  if (hoursFromNow !== undefined) {
    totalMinutes.push(hoursFromNow * 60);
  }
  if (daysFromNow !== undefined) {
    totalMinutes.push(daysFromNow * 24 * 60);
  }
  
  // Use minimum value for comparison
  const minMinutes = Math.min(...totalMinutes, Infinity);
  
  // Label boundaries
  if (minMinutes <= 5) {
    return 'NOW';
  } else if (minMinutes <= 120) { // 2 hours
    return 'SOON';
  } else {
    return 'LATER';
  }
}

export default {
  FollowUpLabel: ['NOW', 'SOON', 'LATER', 'UNKNOWN'],
  getFollowUpLabel,
};
