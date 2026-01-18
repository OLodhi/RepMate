/**
 * Size recommendation calculator
 * Compares user measurements to garment measurements and recommends sizes
 */

const { getNextSizeUp, compareSizes } = require('./translations');

// Standard ease allowances (garment should be this much larger than body)
const EASE_ALLOWANCES = {
  // Upper body (tops, jackets)
  top: {
    chest: { min: 4, ideal: 8, max: 16 },      // cm
    shoulder: { min: 0, ideal: 2, max: 6 },
    sleeve: { min: -2, ideal: 0, max: 4 },
    length: { min: -2, ideal: 2, max: 8 },
  },
  // Lower body (pants, shorts)
  bottom: {
    waist: { min: 2, ideal: 4, max: 10 },
    hip: { min: 2, ideal: 6, max: 14 },
    length: { min: -4, ideal: 0, max: 4 },
    thigh: { min: 2, ideal: 6, max: 12 },
  },
};

/**
 * Calculate fit score for a single measurement
 * @param {number} garmentMeasure - Garment measurement in cm
 * @param {number} bodyMeasure - User body measurement in cm
 * @param {object} ease - Ease allowance config { min, ideal, max }
 * @returns {object} - { score: 0-1, fit: 'tight'|'right'|'loose'|'oversized', diff: number }
 */
function calculateMeasurementFit(garmentMeasure, bodyMeasure, ease) {
  const diff = garmentMeasure - bodyMeasure;

  // Determine fit category
  let fit;
  let score;

  if (diff < ease.min) {
    fit = 'tight';
    // Score decreases as it gets tighter
    score = Math.max(0, 0.5 - (ease.min - diff) * 0.1);
  } else if (diff >= ease.min && diff <= ease.ideal) {
    fit = 'right';
    // Score increases as it approaches ideal
    const range = ease.ideal - ease.min;
    const position = diff - ease.min;
    score = 0.7 + (position / range) * 0.3;
  } else if (diff > ease.ideal && diff <= ease.max) {
    fit = 'loose';
    // Score stays high but decreases slightly
    const range = ease.max - ease.ideal;
    const position = diff - ease.ideal;
    score = 1.0 - (position / range) * 0.2;
  } else {
    fit = 'oversized';
    // Score decreases as it gets more oversized
    score = Math.max(0.3, 0.8 - (diff - ease.max) * 0.05);
  }

  return { score, fit, diff };
}

/**
 * Calculate overall fit score for a size
 * @param {object} sizeData - Garment measurements for this size
 * @param {object} userMeasurements - User body measurements
 * @param {string} garmentType - 'top' or 'bottom'
 * @returns {object} - { score, fit, details, notes }
 */
function calculateSizeFit(sizeData, userMeasurements, garmentType) {
  const easeConfig = EASE_ALLOWANCES[garmentType] || EASE_ALLOWANCES.top;
  const details = {};
  const notes = [];
  let totalScore = 0;
  let measurementCount = 0;
  let garmentBiggerCount = 0;  // Count where garment > body (positive diff)
  let garmentSmallerCount = 0; // Count where garment < body (negative diff)

  // Check each measurement
  for (const [key, ease] of Object.entries(easeConfig)) {
    // Handle garment key aliases (bust -> chest, etc.)
    let garmentValue = sizeData[key];
    if (garmentValue == null && key === 'chest') {
      garmentValue = sizeData['bust'];
    }

    // Handle user key aliases (topLength -> length, etc.)
    let userValue = userMeasurements[key];
    if (userValue == null && key === 'length') {
      userValue = userMeasurements['topLength'];
    }
    if (userValue == null && key === 'length') {
      userValue = userMeasurements['pantsLength'];
    }

    if (garmentValue != null && userValue != null) {
      // Handle half-measurements (multiply by 2 for full circumference)
      // Size charts often show "flat lay" measurements (half the circumference)
      let adjustedGarment = garmentValue;
      if (key === 'waist' || key === 'hip' || key === 'chest') {
        // Compare garment to user measurement to detect half-measurements
        // If garment is less than 70% of user measurement, it's likely a half measurement
        const ratio = garmentValue / userValue;
        if (ratio < 0.7) {
          adjustedGarment = garmentValue * 2;
        }
        // Also check absolute thresholds as backup
        else if (garmentValue < 70 && key === 'chest') {
          adjustedGarment = garmentValue * 2;
        } else if (garmentValue < 50 && (key === 'waist' || key === 'hip')) {
          adjustedGarment = garmentValue * 2;
        }
      }

      const fitResult = calculateMeasurementFit(adjustedGarment, userValue, ease);
      details[key] = {
        garment: adjustedGarment,
        body: userValue,
        ...fitResult,
      };

      totalScore += fitResult.score;
      measurementCount++;

      // Track direction: is garment bigger or smaller than body?
      if (fitResult.diff > 0) {
        garmentBiggerCount++;
      } else if (fitResult.diff < 0) {
        garmentSmallerCount++;
      }

      // Add notes for problematic fits
      if (fitResult.fit === 'tight') {
        notes.push(`${key.charAt(0).toUpperCase() + key.slice(1)} may be tight`);
      } else if (fitResult.fit === 'oversized') {
        notes.push(`${key.charAt(0).toUpperCase() + key.slice(1)} may be very loose`);
      }
    }
  }

  const avgScore = measurementCount > 0 ? totalScore / measurementCount : 0;

  // Determine direction by counting measurements where garment > body vs garment < body
  // This is more robust than averaging diffs (which can be skewed by outliers)
  const isGarmentTooBig = garmentBiggerCount >= garmentSmallerCount;

  // Determine overall fit category based on BOTH score AND direction
  let fit;
  if (avgScore >= 0.85) {
    fit = 'right';
  } else if (avgScore >= 0.7) {
    // Good score but not perfect - check direction
    fit = isGarmentTooBig ? 'loose' : 'tight';
  } else if (avgScore >= 0.5) {
    // Moderate score - use direction to determine
    fit = isGarmentTooBig ? 'oversized' : 'tight';
  } else {
    // Low score - definitely problematic, use direction
    fit = isGarmentTooBig ? 'too_big' : 'too_small';
  }

  return {
    score: Math.round(avgScore * 100) / 100,
    fit,
    details,
    notes,
  };
}

/**
 * Calculate size recommendations
 * @param {object} sizeChart - Parsed size chart { headers, rows }
 * @param {object} userMeasurements - User measurements
 * @param {string} garmentType - 'top' or 'bottom'
 * @param {object} baggyMargin - { type: 'size'|'cm'|'percent', value: number }
 * @returns {object} - { rightFit, baggyFit, allSizes }
 */
function calculateRecommendations(sizeChart, userMeasurements, garmentType, baggyMargin = { type: 'size', value: 1 }) {
  const results = [];

  // Calculate fit for each size
  for (const row of sizeChart.rows) {
    const fitResult = calculateSizeFit(row, userMeasurements, garmentType);
    results.push({
      size: row.size,
      ...fitResult,
    });
  }

  // Sort by score descending, with tie-breaker for larger sizes when all are too small
  const sizeOrder = sizeChart.rows.map(r => r.size);
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // When scores are equal (e.g., both 0 when user is too large for all sizes),
    // prefer larger sizes
    const aIndex = sizeOrder.indexOf(a.size);
    const bIndex = sizeOrder.indexOf(b.size);
    return bIndex - aIndex; // Higher index (larger size) comes first
  });

  // Find right fit (highest score)
  const rightFit = results[0] || null;

  // Calculate baggy fit
  let baggyFit = null;

  if (rightFit) {
    if (baggyMargin.type === 'size') {
      // Get N sizes up
      let targetSize = rightFit.size;
      for (let i = 0; i < baggyMargin.value; i++) {
        const nextSize = getNextSizeUp(targetSize);
        if (nextSize) targetSize = nextSize;
      }

      // Find this size in results
      baggyFit = results.find(r => r.size.toUpperCase() === targetSize.toUpperCase());

      // If not found, try to find the next larger size in results
      if (!baggyFit) {
        const rightIndex = results.findIndex(r => r.size === rightFit.size);
        const sortedBySizeOrder = [...sizeChart.rows].sort((a, b) => compareSizes(a.size, b.size));
        const rightSizeIndex = sortedBySizeOrder.findIndex(r => r.size === rightFit.size);

        if (rightSizeIndex !== -1 && rightSizeIndex + baggyMargin.value < sortedBySizeOrder.length) {
          const baggySize = sortedBySizeOrder[rightSizeIndex + baggyMargin.value].size;
          baggyFit = results.find(r => r.size === baggySize);
        }
      }
    } else if (baggyMargin.type === 'cm' || baggyMargin.type === 'percent') {
      // Find size where primary measurement (chest/waist) is X cm or X% larger
      const primaryKey = garmentType === 'top' ? 'chest' : 'waist';
      const targetMeasurement = baggyMargin.type === 'cm'
        ? userMeasurements[primaryKey] + baggyMargin.value
        : userMeasurements[primaryKey] * (1 + baggyMargin.value / 100);

      // Find size that best matches this target
      let bestMatch = null;
      let bestDiff = Infinity;

      for (const row of sizeChart.rows) {
        if (row[primaryKey] != null) {
          let garmentValue = row[primaryKey];
          // Adjust for half measurements
          if (garmentValue < 70 && primaryKey === 'chest') garmentValue *= 2;
          if (garmentValue < 50 && primaryKey === 'waist') garmentValue *= 2;

          const diff = Math.abs(garmentValue - targetMeasurement);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = row.size;
          }
        }
      }

      if (bestMatch) {
        baggyFit = results.find(r => r.size === bestMatch);
      }
    }
  }

  // If no baggy fit found, use the second best or larger size
  if (!baggyFit && results.length > 1) {
    baggyFit = results[1];
  }

  return {
    rightFit: rightFit ? {
      size: rightFit.size,
      confidence: rightFit.score,
      notes: rightFit.notes,
    } : null,
    baggyFit: baggyFit ? {
      size: baggyFit.size,
      confidence: baggyFit.score,
      notes: baggyFit.notes,
    } : null,
    allSizes: results.map(r => ({
      size: r.size,
      fit: r.fit,
      score: r.score,
    })),
  };
}

module.exports = {
  EASE_ALLOWANCES,
  calculateMeasurementFit,
  calculateSizeFit,
  calculateRecommendations,
};
