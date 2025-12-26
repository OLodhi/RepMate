/**
 * OCR Parser - Extracts structured size chart data from OCR text
 */

const { translateChinese, getMeasurementKey, CN_TO_EN } = require('./translations');

// Patterns for detecting size guide content
const SIZE_PATTERNS = {
  // Size labels
  sizeLabels: /\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL|\d{2})\b/gi,

  // Measurements with units
  measurementWithUnit: /(\d+\.?\d*)\s*(cm|inch|in|"|'|厘米|公分|英寸)/gi,

  // Table-like number patterns (2-3 digit numbers)
  tableNumbers: /\b(\d{2,3}(?:\.\d)?)\b/g,

  // Row patterns (multiple numbers on a line)
  tableRow: /(?:\d{2,3}(?:\.\d)?\s*){2,}/g,

  // Measurement keywords (Chinese and English)
  measurementKeywords: /(尺码|尺寸|衣长|胸围|肩宽|袖长|腰围|臀围|裤长|size|chest|length|shoulder|sleeve|waist|hip)/gi,
};

/**
 * Check if text likely contains a size guide
 * @param {string} text - OCR text
 * @returns {boolean}
 */
function containsSizeGuide(text) {
  if (!text) return false;

  const hasKeywords = SIZE_PATTERNS.measurementKeywords.test(text);
  SIZE_PATTERNS.measurementKeywords.lastIndex = 0; // Reset regex

  const hasMeasurements = SIZE_PATTERNS.measurementWithUnit.test(text) ||
    SIZE_PATTERNS.tableNumbers.test(text);
  SIZE_PATTERNS.measurementWithUnit.lastIndex = 0;
  SIZE_PATTERNS.tableNumbers.lastIndex = 0;

  const hasSizeLabels = SIZE_PATTERNS.sizeLabels.test(text);
  SIZE_PATTERNS.sizeLabels.lastIndex = 0;

  return hasKeywords && (hasMeasurements || hasSizeLabels);
}

/**
 * Parse size chart from OCR text
 * @param {string} rawText - Raw OCR output
 * @returns {object} - { headers, rows, rawText, translatedText }
 */
function parseSizeChart(rawText) {
  if (!rawText) {
    return { headers: [], rows: [], rawText: '', translatedText: '' };
  }

  // Translate Chinese text
  const translatedText = translateChinese(rawText);

  // Split into lines
  const lines = translatedText.split('\n').map(l => l.trim()).filter(l => l);

  // Try to identify header row and data rows
  const headers = [];
  const rows = [];

  let headerFound = false;

  for (const line of lines) {
    // Check if this line contains measurement keywords (likely header)
    const keywordMatches = line.match(/\b(Size|Chest|Length|Shoulder|Sleeve|Waist|Hip|Hem|Thigh)\b/gi);

    if (keywordMatches && keywordMatches.length >= 2 && !headerFound) {
      // This is likely a header row
      headers.push(...keywordMatches.map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()));
      headerFound = true;
      continue;
    }

    // Check if this line has size label and numbers (data row)
    const sizeMatch = line.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL|\d{2})\b/i);
    const numbers = line.match(/\b(\d{2,3}(?:\.\d)?)\b/g);

    if (sizeMatch && numbers && numbers.length >= 1) {
      const rowData = {
        size: sizeMatch[0].toUpperCase(),
      };

      // Map numbers to headers if we have headers
      if (headers.length > 0) {
        numbers.forEach((num, idx) => {
          if (idx < headers.length) {
            const key = getMeasurementKey(headers[idx]) || headers[idx].toLowerCase();
            rowData[key] = parseFloat(num);
          }
        });
      } else {
        // Without headers, use generic keys
        numbers.forEach((num, idx) => {
          rowData[`measurement${idx + 1}`] = parseFloat(num);
        });
      }

      rows.push(rowData);
    }
  }

  // If no structured data found, try alternative parsing
  if (rows.length === 0) {
    const altResult = parseAlternativeFormat(translatedText);
    if (altResult.rows.length > 0) {
      return { ...altResult, rawText, translatedText };
    }
  }

  return {
    headers,
    rows,
    rawText,
    translatedText,
  };
}

/**
 * Try alternative parsing for different table formats
 * @param {string} text - Translated text
 * @returns {object} - { headers, rows }
 */
function parseAlternativeFormat(text) {
  const headers = [];
  const rows = [];

  // Pattern: measurement label followed by colon and numbers
  // e.g., "Chest: 108 112 116 120"
  const labelPattern = /(\w+(?:\s+\w+)?)\s*[:：]\s*([\d\s.]+)/g;
  const measurements = {};

  let match;
  while ((match = labelPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const values = match[2].trim().split(/\s+/).map(v => parseFloat(v)).filter(v => !isNaN(v));

    if (values.length > 0) {
      const key = getMeasurementKey(label) || label.toLowerCase();
      measurements[key] = values;

      if (!headers.includes(label)) {
        headers.push(label);
      }
    }
  }

  // If no colon-separated format found, try vertical format parsing
  if (Object.keys(measurements).length === 0) {
    const verticalResult = parseVerticalFormat(text);
    if (verticalResult.rows.length > 0) {
      return verticalResult;
    }
  }

  // Convert to row format
  if (Object.keys(measurements).length > 0) {
    // Find the measurement with most values to determine size count
    const maxValues = Math.max(...Object.values(measurements).map(v => v.length));

    // Try to find size labels
    const sizeMatches = text.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL|\d{2})\b/gi) || [];
    const uniqueSizes = [...new Set(sizeMatches.map(s => s.toUpperCase()))];

    for (let i = 0; i < maxValues; i++) {
      const row = {
        size: uniqueSizes[i] || `Size${i + 1}`,
      };

      for (const [key, values] of Object.entries(measurements)) {
        if (values[i] != null) {
          row[key] = values[i];
        }
      }

      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * Parse vertical table format where measurements are listed as:
 * MEASUREMENT_LABEL
 * value1
 * value2
 * value3
 * @param {string} text - Text to parse
 * @returns {object} - { headers, rows }
 */
function parseVerticalFormat(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const headers = [];
  const measurements = {};

  // Find size labels first
  const sizeLabels = [];
  const measurementKeywords = ['chest', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'front', 'back', 'hem', 'thigh', 'inseam'];

  let currentMeasurement = null;
  let currentValues = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Check if this line is a size label (S, M, L, XL, etc.)
    const sizeMatch = line.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/i);
    if (sizeMatch && !sizeLabels.includes(sizeMatch[1].toUpperCase())) {
      sizeLabels.push(sizeMatch[1].toUpperCase());
      continue;
    }

    // Check if this line is a measurement keyword
    const isMeasurementLabel = measurementKeywords.some(kw => lowerLine.includes(kw));

    if (isMeasurementLabel) {
      // Save previous measurement if exists
      if (currentMeasurement && currentValues.length > 0) {
        measurements[currentMeasurement] = [...currentValues];
      }

      // Determine measurement key
      if (lowerLine.includes('chest')) currentMeasurement = 'chest';
      else if (lowerLine.includes('front') && lowerLine.includes('length')) currentMeasurement = 'length';
      else if (lowerLine.includes('length')) currentMeasurement = 'length';
      else if (lowerLine.includes('shoulder')) currentMeasurement = 'shoulder';
      else if (lowerLine.includes('sleeve')) currentMeasurement = 'sleeve';
      else if (lowerLine.includes('waist')) currentMeasurement = 'waist';
      else if (lowerLine.includes('hip')) currentMeasurement = 'hip';
      else if (lowerLine.includes('thigh')) currentMeasurement = 'thigh';
      else if (lowerLine.includes('inseam')) currentMeasurement = 'inseam';
      else if (lowerLine.includes('hem')) currentMeasurement = 'hem';
      else currentMeasurement = lowerLine.replace(/[^a-z]/g, '');

      currentValues = [];

      if (!headers.includes(currentMeasurement)) {
        headers.push(currentMeasurement);
      }
      continue;
    }

    // Check if this line is a number (measurement value)
    const numMatch = line.match(/^(\d{2,3}(?:\.\d)?)$/);
    if (numMatch && currentMeasurement) {
      currentValues.push(parseFloat(numMatch[1]));
    }
  }

  // Save last measurement
  if (currentMeasurement && currentValues.length > 0) {
    measurements[currentMeasurement] = [...currentValues];
  }

  // Build rows from measurements
  const rows = [];
  if (Object.keys(measurements).length > 0) {
    const numSizes = Math.max(...Object.values(measurements).map(v => v.length));

    for (let i = 0; i < numSizes; i++) {
      const row = {
        size: sizeLabels[i] || `Size${i + 1}`,
      };

      for (const [key, values] of Object.entries(measurements)) {
        if (values[i] != null) {
          row[key] = values[i];
        }
      }

      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * Extract size labels from text
 * @param {string} text - Text to search
 * @returns {string[]} - Array of size labels found
 */
function extractSizeLabels(text) {
  if (!text) return [];

  const matches = text.match(SIZE_PATTERNS.sizeLabels) || [];
  return [...new Set(matches.map(s => s.toUpperCase()))];
}

/**
 * Detect garment type from size chart headers/context
 * @param {object} sizeChart - Parsed size chart
 * @returns {string} - 'top' or 'bottom'
 */
function detectGarmentType(sizeChart) {
  const allKeys = new Set();

  // Collect all measurement keys
  if (sizeChart.headers) {
    sizeChart.headers.forEach(h => allKeys.add(h.toLowerCase()));
  }

  if (sizeChart.rows) {
    sizeChart.rows.forEach(row => {
      Object.keys(row).forEach(k => allKeys.add(k.toLowerCase()));
    });
  }

  // Check for bottom-specific measurements
  const bottomIndicators = ['waist', 'hip', 'inseam', 'thigh', 'pants', 'leg'];
  const topIndicators = ['chest', 'shoulder', 'sleeve', 'collar'];

  const bottomScore = bottomIndicators.filter(i => [...allKeys].some(k => k.includes(i))).length;
  const topScore = topIndicators.filter(i => [...allKeys].some(k => k.includes(i))).length;

  return bottomScore > topScore ? 'bottom' : 'top';
}

module.exports = {
  SIZE_PATTERNS,
  containsSizeGuide,
  parseSizeChart,
  parseAlternativeFormat,
  extractSizeLabels,
  detectGarmentType,
};
