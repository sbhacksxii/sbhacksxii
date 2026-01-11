/**
 * =====================================================
 * AMTRAK SERVICE UNIT TESTS
 * =====================================================
 * 
 * Run these tests with: npm test
 * Or directly: node --experimental-vm-modules node_modules/jest/bin/jest.js
 * 
 * Test cases covered:
 * 1. Exact date match - returns fare with isEstimated: false
 * 2. Nearest/estimated match - returns closest date with isEstimated: true
 * 3. No match (route doesn't exist) - returns null
 * 4. Edge cases: invalid inputs, case insensitivity
 */

import { jest } from '@jest/globals';
import {
  getAmtrakFare,
  getStations,
  getStationByCode,
  getAvailableRoutes,
  clearCache,
  dateDiffInDays,
  normalizeCode
} from '../services/amtrakService.js';

// =====================================================
// HELPER FUNCTION TESTS
// =====================================================

describe('Helper Functions', () => {
  describe('normalizeCode', () => {
    test('should convert to uppercase', () => {
      expect(normalizeCode('sba')).toBe('SBA');
    });

    test('should trim whitespace', () => {
      expect(normalizeCode('  LAX  ')).toBe('LAX');
    });

    test('should handle null/undefined', () => {
      expect(normalizeCode(null)).toBe('');
      expect(normalizeCode(undefined)).toBe('');
    });
  });

  describe('dateDiffInDays', () => {
    test('should calculate difference correctly', () => {
      expect(dateDiffInDays('2026-02-15', '2026-02-20')).toBe(5);
    });

    test('should return absolute difference', () => {
      expect(dateDiffInDays('2026-02-20', '2026-02-15')).toBe(5);
    });

    test('should return 0 for same date', () => {
      expect(dateDiffInDays('2026-02-15', '2026-02-15')).toBe(0);
    });
  });
});

// =====================================================
// MAIN LOOKUP FUNCTION TESTS
// =====================================================

describe('getAmtrakFare', () => {
  // Clear cache before each test to ensure fresh data
  beforeEach(() => {
    clearCache();
  });

  // -------------------------------------------------
  // TEST CASE 1: Exact Match
  // -------------------------------------------------
  describe('Exact Match Case', () => {
    test('should return exact match with isEstimated: false', async () => {
      const result = await getAmtrakFare('SBA', 'LAX', '2026-02-15');

      expect(result).not.toBeNull();
      expect(result.origin).toBe('SBA');
      expect(result.dest).toBe('LAX');
      expect(result.queriedDate).toBe('2026-02-15');
      expect(result.matchedDate).toBe('2026-02-15');
      expect(result.priceUSD).toBe(45);
      expect(result.isEstimated).toBe(false);
    });

    test('should handle case-insensitive station codes', async () => {
      const result = await getAmtrakFare('sba', 'lax', '2026-02-15');

      expect(result).not.toBeNull();
      expect(result.origin).toBe('SBA');
      expect(result.dest).toBe('LAX');
      expect(result.isEstimated).toBe(false);
    });
  });

  // -------------------------------------------------
  // TEST CASE 2: Nearest/Estimated Match
  // -------------------------------------------------
  describe('Nearest/Estimated Match Case', () => {
    test('should return nearest date when exact match not found', async () => {
      // Request a date between existing records (2026-02-15 and 2026-02-20)
      const result = await getAmtrakFare('SBA', 'LAX', '2026-02-17');

      expect(result).not.toBeNull();
      expect(result.queriedDate).toBe('2026-02-17');
      // Should match 2026-02-15 (2 days diff) rather than 2026-02-20 (3 days diff)
      expect(result.matchedDate).toBe('2026-02-15');
      expect(result.isEstimated).toBe(true);
    });

    test('should return nearest date for future date request', async () => {
      // Request a date after all existing records
      const result = await getAmtrakFare('SBA', 'LAX', '2026-04-01');

      expect(result).not.toBeNull();
      expect(result.isEstimated).toBe(true);
      // Should return the closest available date
      expect(result.matchedDate).toBe('2026-03-01');
    });

    test('should return nearest date for past date request', async () => {
      // Request a date before all existing records
      const result = await getAmtrakFare('SBA', 'LAX', '2026-01-01');

      expect(result).not.toBeNull();
      expect(result.isEstimated).toBe(true);
      // Should return the closest available date (2026-02-15)
      expect(result.matchedDate).toBe('2026-02-15');
    });

    test('should include all required fields in estimated result', async () => {
      const result = await getAmtrakFare('NYP', 'BOS', '2026-02-18');

      expect(result).toHaveProperty('origin');
      expect(result).toHaveProperty('dest');
      expect(result).toHaveProperty('queriedDate');
      expect(result).toHaveProperty('matchedDate');
      expect(result).toHaveProperty('priceUSD');
      expect(result).toHaveProperty('durationMin');
      expect(result).toHaveProperty('transfers');
      expect(result).toHaveProperty('isEstimated');
      expect(result.isEstimated).toBe(true);
    });
  });

  // -------------------------------------------------
  // TEST CASE 3: No Match (Route Doesn't Exist)
  // -------------------------------------------------
  describe('No Match Case', () => {
    test('should return null for non-existent route', async () => {
      const result = await getAmtrakFare('SBA', 'BOS', '2026-02-15');

      expect(result).toBeNull();
    });

    test('should return null for reversed non-existent route', async () => {
      // CHI to SBA doesn't exist (only SBA to CHI)
      const result = await getAmtrakFare('CHI', 'SBA', '2026-02-15');

      expect(result).toBeNull();
    });

    test('should return null for invalid station codes', async () => {
      const result = await getAmtrakFare('XXX', 'YYY', '2026-02-15');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------
  // TEST CASE 4: Edge Cases
  // -------------------------------------------------
  describe('Edge Cases', () => {
    test('should return null for missing origin', async () => {
      const result = await getAmtrakFare(null, 'LAX', '2026-02-15');

      expect(result).toBeNull();
    });

    test('should return null for missing destination', async () => {
      const result = await getAmtrakFare('SBA', null, '2026-02-15');

      expect(result).toBeNull();
    });

    test('should return null for missing date', async () => {
      const result = await getAmtrakFare('SBA', 'LAX', null);

      expect(result).toBeNull();
    });

    test('should handle whitespace in station codes', async () => {
      const result = await getAmtrakFare('  SBA  ', '  LAX  ', '2026-02-15');

      expect(result).not.toBeNull();
      expect(result.origin).toBe('SBA');
      expect(result.dest).toBe('LAX');
    });
  });
});

// =====================================================
// UTILITY FUNCTION TESTS
// =====================================================

describe('Utility Functions', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('getStations', () => {
    test('should return array of stations', async () => {
      const stations = await getStations();

      expect(Array.isArray(stations)).toBe(true);
      expect(stations.length).toBeGreaterThan(0);
    });

    test('station should have required fields', async () => {
      const stations = await getStations();
      const station = stations[0];

      expect(station).toHaveProperty('code');
      expect(station).toHaveProperty('name');
      expect(station).toHaveProperty('city');
      expect(station).toHaveProperty('state');
    });
  });

  describe('getStationByCode', () => {
    test('should return station for valid code', async () => {
      const station = await getStationByCode('LAX');

      expect(station).not.toBeNull();
      expect(station.code).toBe('LAX');
      expect(station.name).toBe('Los Angeles Union Station');
    });

    test('should return null for invalid code', async () => {
      const station = await getStationByCode('XXX');

      expect(station).toBeNull();
    });

    test('should be case insensitive', async () => {
      const station = await getStationByCode('lax');

      expect(station).not.toBeNull();
      expect(station.code).toBe('LAX');
    });
  });

  describe('getAvailableRoutes', () => {
    test('should return array of unique routes', async () => {
      const routes = await getAvailableRoutes();

      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
    });

    test('route should have origin and dest', async () => {
      const routes = await getAvailableRoutes();
      const route = routes[0];

      expect(route).toHaveProperty('origin');
      expect(route).toHaveProperty('dest');
    });
  });
});
