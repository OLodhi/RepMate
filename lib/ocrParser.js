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
    const keywordMatches = line.match(/\b(Size|Chest|Length|Shoulder|Sleeve|Waist|Hip|Hem|Thigh)(?:\s*\([^)]*\))?/gi);

    if (keywordMatches && keywordMatches.length >= 2 && !headerFound) {
      // This is likely a header row - exclude "Size" as we extract it separately
      const measurementHeaders = keywordMatches
        .map(k => k.replace(/\s*\([^)]*\)/g, '').trim()) // Remove (CM) etc
        .map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())
        .filter(k => k.toLowerCase() !== 'size');
      headers.push(...measurementHeaders);
      headerFound = true;
      continue;
    }

    // Check if this line has size label and numbers (data row)
    // Match letter-based sizes first, then numeric sizes
    const letterSizeMatch = line.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/i);
    const numbers = line.match(/\b(\d{2,3}(?:\.\d)?)\b/g);

    // For letter sizes
    if (letterSizeMatch && numbers && numbers.length >= 1) {
      const rowData = {
        size: letterSizeMatch[0].toUpperCase(),
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
        // Without headers, use generic keys based on common measurement order
        const defaultKeys = ['shoulder', 'chest', 'length', 'sleeve'];
        numbers.forEach((num, idx) => {
          const key = defaultKeys[idx] || `measurement${idx + 1}`;
          rowData[key] = parseFloat(num);
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
  // First try: Column-based table format
  // e.g., sizes in a row: "S M L XL" followed by measurement rows
  const columnResult = parseColumnBasedTable(text);
  if (columnResult.rows.length > 0) {
    return columnResult;
  }

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
 * Parse column-based table where sizes are column headers
 * Handles formats like:
 *   shoulder (CM)  S    M    L    XL
 *                  50   51   52   53
 * Or inline format:
 *   shoulder (CM) S 50 M 51 L 52 XL 53
 * @param {string} text - Text to parse
 * @returns {object} - { headers, rows }
 */
function parseColumnBasedTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // First, try inline format: "shoulder (CM) S 50 M 51 L 52 XL 53"
  const inlineResult = parseInlineFormat(text);
  if (inlineResult.rows.length > 0) {
    return inlineResult;
  }

  const numberPattern = /\b(\d{2,3}(?:\.\d)?)\b/g;

  // Find a line that contains multiple size labels (this is the size header row)
  let sizeRowIndex = -1;
  const sizes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sizeMatches = line.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/gi);
    if (sizeMatches && sizeMatches.length >= 2) {
      sizeRowIndex = i;
      const sizePattern = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/gi;
      let match;
      while ((match = sizePattern.exec(line)) !== null) {
        const size = match[1].toUpperCase();
        if (!sizes.includes(size)) {
          sizes.push(size);
        }
      }
      break;
    }
  }

  if (sizes.length < 2) {
    return { headers: [], rows: [] };
  }

  // Find measurement rows
  const measurementKeywords = ['shoulder', 'chest', 'length', 'sleeve', 'waist', 'hip', 'thigh', 'bust', 'front', 'hem'];
  const measurementData = {};

  for (let i = 0; i < lines.length; i++) {
    if (i === sizeRowIndex) continue;

    const line = lines[i];
    const lowerLine = line.toLowerCase();

    let foundMeasurement = null;
    for (const keyword of measurementKeywords) {
      if (lowerLine.includes(keyword)) {
        foundMeasurement = keyword === 'bust' ? 'chest' : (keyword === 'front' ? 'length' : keyword);
        break;
      }
    }

    const numbers = line.match(numberPattern) || [];
    const numericValues = numbers.map(n => parseFloat(n));

    if (numericValues.length > 0 && foundMeasurement) {
      measurementData[foundMeasurement] = numericValues;
    }
  }

  if (Object.keys(measurementData).length > 0) {
    const rows = [];
    const headers = Object.keys(measurementData);

    for (let i = 0; i < sizes.length; i++) {
      const row = { size: sizes[i] };
      for (const [measurement, values] of Object.entries(measurementData)) {
        if (values[i] !== undefined) {
          row[measurement] = values[i];
        }
      }
      if (Object.keys(row).length > 1) {
        rows.push(row);
      }
    }

    if (rows.length > 0) {
      return { headers, rows };
    }
  }

  return { headers: [], rows: [] };
}

/**
 * Parse inline format where each line has size:value pairs
 * e.g., "shoulder (CM) S 50 M 51 L 52 XL 53"
 * @param {string} text - Text to parse
 * @returns {object} - { headers, rows }
 */
function parseInlineFormat(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const measurementKeywords = ['shoulder', 'chest', 'length', 'sleeve', 'waist', 'hip', 'thigh', 'bust', 'front', 'hem'];

  // Pattern to match size followed by a number: "S 50" or "M 51"
  const sizeValuePattern = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\s+(\d{2,3}(?:\.\d)?)\b/gi;

  const measurementData = {}; // { shoulder: { S: 50, M: 51, ... }, chest: { ... } }
  const allSizes = new Set();

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Find measurement type for this line
    let foundMeasurement = null;
    for (const keyword of measurementKeywords) {
      if (lowerLine.includes(keyword)) {
        foundMeasurement = keyword === 'bust' ? 'chest' : (keyword === 'front' ? 'length' : keyword);
        break;
      }
    }

    if (!foundMeasurement) continue;

    // Extract all size:value pairs from this line
    const sizeValues = {};
    let match;
    while ((match = sizeValuePattern.exec(line)) !== null) {
      const size = match[1].toUpperCase();
      const value = parseFloat(match[2]);
      sizeValues[size] = value;
      allSizes.add(size);
    }
    sizeValuePattern.lastIndex = 0; // Reset regex

    if (Object.keys(sizeValues).length >= 2) {
      measurementData[foundMeasurement] = sizeValues;
    }
  }

  // Convert to rows
  if (Object.keys(measurementData).length > 0 && allSizes.size >= 2) {
    // Sort sizes in standard order
    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
    const sortedSizes = [...allSizes].sort((a, b) => {
      const aIdx = sizeOrder.indexOf(a);
      const bIdx = sizeOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    const rows = [];
    const headers = Object.keys(measurementData);

    for (const size of sortedSizes) {
      const row = { size };
      for (const [measurement, sizeValues] of Object.entries(measurementData)) {
        if (sizeValues[size] !== undefined) {
          row[measurement] = sizeValues[size];
        }
      }
      if (Object.keys(row).length > 1) {
        rows.push(row);
      }
    }

    if (rows.length >= 2) {
      return { headers, rows };
    }
  }

  return { headers: [], rows: [] };
}

/**
 * Parse vertical/mixed table format from OCR text
 * Handles formats like:
 *   shoulder (CM) 50
 *   chest (CM) 60
 *   length (CM) 71
 *   M 51 62 72
 *   XL 52 64 73
 * @param {string} text - Text to parse
 * @returns {object} - { headers, rows }
 */
function parseVerticalFormat(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Measurement keywords mapped to standard names
  const measurementKeywords = {
    'shoulder': 'shoulder',
    'chest': 'chest',
    'length': 'length',
    'sleeve': 'sleeve',
    'waist': 'waist',
    'hip': 'hip',
    'thigh': 'thigh',
    'inseam': 'inseam',
    'hem': 'hem',
    'bust': 'chest',
    'front': 'length',
  };

  // Find measurements IN ORDER OF APPEARANCE in the text
  const foundMeasurements = [];
  const lowerText = text.toLowerCase();

  // Create array of {keyword, position} and sort by position
  const keywordPositions = [];
  for (const [keyword, measurement] of Object.entries(measurementKeywords)) {
    const pos = lowerText.indexOf(keyword);
    if (pos !== -1 && !foundMeasurements.includes(measurement)) {
      keywordPositions.push({ keyword, measurement, position: pos });
    }
  }

  // Sort by position in text
  keywordPositions.sort((a, b) => a.position - b.position);

  // Extract measurements in order
  for (const { measurement } of keywordPositions) {
    if (!foundMeasurements.includes(measurement)) {
      foundMeasurements.push(measurement);
    }
  }

  // Default measurements if none found
  if (foundMeasurements.length === 0) {
    foundMeasurements.push('shoulder', 'chest', 'length');
  }

  const numberPattern = /\b(\d{2,3}(?:\.\d)?)\b/g;
  const rows = [];
  const sizeLabelsFound = [];

  // First pass: find lines with size labels followed by numbers
  for (const line of lines) {
    // Match size label anywhere on the line (not just at start)
    const sizeMatch = line.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/i);
    if (sizeMatch) {
      const size = sizeMatch[0].toUpperCase();

      // Get the portion of the line after the size label
      const afterSize = line.substring(line.indexOf(sizeMatch[0]) + sizeMatch[0].length);
      const numbers = afterSize.match(numberPattern) || [];

      if (numbers.length > 0 && !sizeLabelsFound.includes(size)) {
        sizeLabelsFound.push(size);
        const row = { size };

        numbers.forEach((num, idx) => {
          if (idx < foundMeasurements.length) {
            row[foundMeasurements[idx]] = parseFloat(num);
          }
        });

        rows.push(row);
      }
    }
  }

  // Second pass: look for measurement labels with inline values to build first size row
  if (rows.length > 0) {
    const firstSizeValues = {};

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // Skip lines that have size labels (already processed)
      if (/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/i.test(line)) continue;

      for (const [keyword, measurement] of Object.entries(measurementKeywords)) {
        if (lowerLine.includes(keyword)) {
          const numbers = line.match(numberPattern);
          if (numbers && numbers.length > 0) {
            firstSizeValues[measurement] = parseFloat(numbers[0]);
          }
          break;
        }
      }
    }

    // If we found first size values, insert as first row (likely "S" or smallest size)
    if (Object.keys(firstSizeValues).length > 0) {
      const firstRow = { size: 'S', ...firstSizeValues };
      if (!rows.some(r => r.size === 'S')) {
        rows.unshift(firstRow);
      }
    }
  }

  // If still no rows, try alternative extraction based on all numbers found
  if (rows.length === 0) {
    const allNumbers = [];
    for (const line of lines) {
      const numbers = line.match(numberPattern);
      if (numbers) {
        allNumbers.push(...numbers.map(n => parseFloat(n)));
      }
    }

    // Extract all unique size labels in order of appearance
    const allSizes = [];
    const sizePattern = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/gi;
    let match;
    while ((match = sizePattern.exec(text)) !== null) {
      const upper = match[1].toUpperCase();
      if (!allSizes.includes(upper)) {
        allSizes.push(upper);
      }
    }

    // Try to distribute numbers across sizes
    if (allSizes.length > 0 && allNumbers.length > 0) {
      const numPerSize = Math.floor(allNumbers.length / allSizes.length);

      if (numPerSize > 0) {
        for (let i = 0; i < allSizes.length; i++) {
          const row = { size: allSizes[i] };
          for (let j = 0; j < numPerSize && j < foundMeasurements.length; j++) {
            const numIdx = i * numPerSize + j;
            if (numIdx < allNumbers.length) {
              row[foundMeasurements[j]] = allNumbers[numIdx];
            }
          }
          rows.push(row);
        }
      }
    }
  }

  return {
    headers: foundMeasurements,
    rows: rows,
  };
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
