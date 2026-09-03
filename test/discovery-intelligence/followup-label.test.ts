/**
 * Focused boundary tests for follow-up label helper.
 * Tests deterministic mapping of follow-up timing to labels.
 * 
 * @module discovery-intelligence/followup-label.test
 */

import { describe, test, expect } from 'vitest';
import { getFollowUpLabel, type FollowUpTiming } from '../lib/discovery-intelligence/followup-label';

describe('getFollowUpLabel', () => {
  const suite = 'follow-up label boundary tests';

  describe('NOW boundary (<=5 minutes)', () => {
    test('0 minutes returns NOW', () => {
      const input: FollowUpTiming = { minutesFromNow: 0 };
      expect(getFollowUpLabel(input)).toBe('NOW');
    });

    test('exactly 5 minutes returns NOW', () => {
      const input: FollowUpTiming = { minutesFromNow: 5 };
      expect(getFollowUpLabel(input)).toBe('NOW');
    });

    test('4.9 minutes returns NOW', () => {
      const input: FollowUpTiming = { minutesFromNow: 4.9 };
      expect(getFollowUpLabel(input)).toBe('NOW');
    });

    test('5 minutes via hours (1/12 hour) returns NOW', () => {
      const input: FollowUpTiming = { hoursFromNow: 1 / 12 };
      expect(getFollowUpLabel(input)).toBe('NOW');
    });
  });

  describe('SOON boundary (>5 minutes, <=120 minutes)', () => {
    test('6 minutes returns SOON', () => {
      const input: FollowUpTiming = { minutesFromNow: 6 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('exactly 120 minutes (2 hours) returns SOON', () => {
      const input: FollowUpTiming = { minutesFromNow: 120 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('60 minutes returns SOON', () => {
      const input: FollowUpTiming = { minutesFromNow: 60 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('1 hour via hoursFromNow returns SOON', () => {
      const input: FollowUpTiming = { hoursFromNow: 1 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });
  });

  describe('LATER boundary (>120 minutes)', () => {
    test('121 minutes returns LATER', () => {
      const input: FollowUpTiming = { minutesFromNow: 121 };
      expect(getFollowUpLabel(input)).toBe('LATER');
    });

    test('exactly 24 hours returns LATER', () => {
      const input: FollowUpTiming = { hoursFromNow: 24 };
      expect(getFollowUpLabel(input)).toBe('LATER');
    });

    test('1 day via daysFromNow returns LATER', () => {
      const input: FollowUpTiming = { daysFromNow: 1 };
      expect(getFollowUpLabel(input)).toBe('LATER');
    });
  });

  describe('UNKNOWN for invalid input', () => {
    test('undefined input returns UNKNOWN', () => {
      expect(getFollowUpLabel(undefined as any)).toBe('UNKNOWN');
    });

    test('null input returns UNKNOWN', () => {
      expect(getFollowUpLabel(null as any)).toBe('UNKNOWN');
    });

    test('empty object returns UNKNOWN', () => {
      expect(getFollowUpLabel({})).toBe('UNKNOWN');
    });

    test('string input returns UNKNOWN', () => {
      expect(getFollowUpLabel('invalid' as any)).toBe('UNKNOWN');
    });

    test('number input returns UNKNOWN', () => {
      expect(getFollowUpLabel(123 as any)).toBe('UNKNOWN');
    });

    test('NaN minutesFromNow returns UNKNOWN', () => {
      const input: FollowUpTiming = { minutesFromNow: NaN };
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });

    test('Infinity minutesFromNow returns UNKNOWN', () => {
      const input: FollowUpTiming = { minutesFromNow: Infinity };
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });

    test('-1 minutesFromNow returns UNKNOWN', () => {
      const input: FollowUpTiming = { minutesFromNow: -1 };
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });

    test('object with invalid key returns UNKNOWN', () => {
      const input: any = { badKey: 10 };
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });

    test('partial valid object returns appropriate label', () => {
      // Even with some invalid keys mixed in, we still should validate properly
      // This tests that isValidInput rejects objects with any invalid key
      const input: any = { minutesFromNow: 10, badKey: 'x' };
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });
  });

  describe('Mixed timing fields', () => {
    test('hoursFromNow=0.1 (6 minutes) returns SOON', () => {
      const input: FollowUpTiming = { hoursFromNow: 0.1 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('daysFromNow=0.001 (~14 minutes) returns SOON', () => {
      const input: FollowUpTiming = { daysFromNow: 0.001 };
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('multiple fields use minimum value', () => {
      const input: FollowUpTiming = { minutesFromNow: 120, hoursFromNow: 0.1 };
      // minimum is 6 minutes (0.1 hours), so returns SOON
      expect(getFollowUpLabel(input)).toBe('SOON');
    });

    test('multiple fields with NOW range', () => {
      const input: FollowUpTiming = { minutesFromNow: 3, hoursFromNow: 1 };
      // minimum is 3 minutes, so returns NOW
      expect(getFollowUpLabel(input)).toBe('NOW');
    });
  });

  describe('Edge cases', () => {
    test('zero object (no timing fields) returns UNKNOWN', () => {
      const input: FollowUpTiming = {};
      expect(getFollowUpLabel(input)).toBe('UNKNOWN');
    });
  });
});
