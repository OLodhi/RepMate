/**
 * Tests for Size Calculator
 */

const {
  calculateRecommendations,
  EASE_ALLOWANCES,
} = require('./sizeCalculator');

describe('EASE_ALLOWANCES', () => {
  test('has top measurements defined', () => {
    expect(EASE_ALLOWANCES.top).toBeDefined();
    expect(EASE_ALLOWANCES.top.chest).toBeDefined();
    expect(EASE_ALLOWANCES.top.shoulder).toBeDefined();
    expect(EASE_ALLOWANCES.top.sleeve).toBeDefined();
    expect(EASE_ALLOWANCES.top.length).toBeDefined();
  });

  test('has bottom measurements defined', () => {
    expect(EASE_ALLOWANCES.bottom).toBeDefined();
    expect(EASE_ALLOWANCES.bottom.waist).toBeDefined();
    expect(EASE_ALLOWANCES.bottom.hip).toBeDefined();
    expect(EASE_ALLOWANCES.bottom.thigh).toBeDefined();
    expect(EASE_ALLOWANCES.bottom.length).toBeDefined();
  });

  test('ease values have min, ideal, max', () => {
    const chestEase = EASE_ALLOWANCES.top.chest;
    expect(chestEase).toHaveProperty('min');
    expect(chestEase).toHaveProperty('ideal');
    expect(chestEase).toHaveProperty('max');
    expect(chestEase.min).toBeLessThan(chestEase.ideal);
    expect(chestEase.ideal).toBeLessThan(chestEase.max);
  });
});

describe('calculateRecommendations', () => {
  const topSizeChart = {
    headers: ['Size', 'Chest', 'Shoulder', 'Length', 'Sleeve'],
    rows: [
      { size: 'S', chest: 100, shoulder: 44, length: 68, sleeve: 60 },
      { size: 'M', chest: 104, shoulder: 46, length: 70, sleeve: 62 },
      { size: 'L', chest: 108, shoulder: 48, length: 72, sleeve: 64 },
      { size: 'XL', chest: 112, shoulder: 50, length: 74, sleeve: 66 },
    ],
  };

  const bottomSizeChart = {
    headers: ['Size', 'Waist', 'Hip', 'Thigh', 'Length'],
    rows: [
      { size: 'S', waist: 74, hip: 96, thigh: 54, length: 98 },
      { size: 'M', waist: 78, hip: 100, thigh: 56, length: 100 },
      { size: 'L', waist: 82, hip: 104, thigh: 58, length: 102 },
      { size: 'XL', waist: 86, hip: 108, thigh: 60, length: 104 },
    ],
  };

  describe('top garment recommendations', () => {
    test('returns rightFit and baggyFit', () => {
      const userMeasurements = {
        chest: 98,
        shoulder: 45,
        topLength: 70,
        sleeve: 62,
      };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      expect(result).toHaveProperty('rightFit');
      expect(result).toHaveProperty('baggyFit');
      expect(result).toHaveProperty('allSizes');
    });

    test('rightFit has size and confidence', () => {
      const userMeasurements = { chest: 98, shoulder: 45 };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      expect(result.rightFit).toHaveProperty('size');
      expect(result.rightFit).toHaveProperty('confidence');
      expect(result.rightFit.confidence).toBeGreaterThanOrEqual(0);
      expect(result.rightFit.confidence).toBeLessThanOrEqual(1);
    });

    test('baggyFit is larger than rightFit with size margin', () => {
      const userMeasurements = { chest: 98 };
      const sizeOrder = ['S', 'M', 'L', 'XL'];

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      const rightFitIndex = sizeOrder.indexOf(result.rightFit.size);
      const baggyFitIndex = sizeOrder.indexOf(result.baggyFit.size);

      // Baggy should be at least as large as right fit
      expect(baggyFitIndex).toBeGreaterThanOrEqual(rightFitIndex);
    });

    test('allSizes contains all sizes with fit info', () => {
      const userMeasurements = { chest: 98 };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      expect(result.allSizes.length).toBe(topSizeChart.rows.length);
      result.allSizes.forEach(size => {
        expect(size).toHaveProperty('size');
        expect(size).toHaveProperty('fit');
        expect(size).toHaveProperty('score');
      });
    });
  });

  describe('bottom garment recommendations', () => {
    test('uses bottom measurements correctly', () => {
      const userMeasurements = {
        waist: 80,
        hip: 98,
        thigh: 56,
        inseam: 78,
      };

      const result = calculateRecommendations(
        bottomSizeChart,
        userMeasurements,
        'bottom',
        { type: 'size', value: 1 }
      );

      expect(result).toHaveProperty('rightFit');
      expect(result).toHaveProperty('baggyFit');
      expect(['S', 'M', 'L', 'XL']).toContain(result.rightFit.size);
    });
  });

  describe('baggy margin options', () => {
    test('handles size-based margin', () => {
      const userMeasurements = { chest: 98 };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 2 }
      );

      expect(result.baggyFit).toBeDefined();
    });

    test('handles cm-based margin', () => {
      const userMeasurements = { chest: 98 };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'cm', value: 5 }
      );

      expect(result.baggyFit).toBeDefined();
    });

    test('handles percent-based margin', () => {
      const userMeasurements = { chest: 98 };

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'percent', value: 10 }
      );

      expect(result.baggyFit).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('handles missing measurements gracefully', () => {
      const userMeasurements = { chest: 98 }; // Only chest, missing shoulder, sleeve, length

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      expect(result.rightFit).toBeDefined();
    });

    test('handles empty size chart', () => {
      const emptySizeChart = { headers: [], rows: [] };
      const userMeasurements = { chest: 98 };

      const result = calculateRecommendations(
        emptySizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      expect(result.rightFit).toBeNull();
    });

    test('handles user at extremes (very small)', () => {
      const userMeasurements = { chest: 80 }; // Smaller than smallest size

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      // Should recommend smallest size
      expect(result.rightFit.size).toBe('S');
    });

    test('handles user at extremes (very large)', () => {
      const userMeasurements = { chest: 120 }; // Larger than largest size

      const result = calculateRecommendations(
        topSizeChart,
        userMeasurements,
        'top',
        { type: 'size', value: 1 }
      );

      // Should recommend largest size
      expect(result.rightFit.size).toBe('XL');
    });
  });
});
