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

  // Try multiple parsing strategies and pick the best result
  const results = [];

  // Strategy 0: OCR-specific format where S/L might be missing
  // Format: measurement labels with first size values, then size labels with subsequent values
  const ocrSpecificResult = parseOCRSpecificFormat(translatedText);
  if (ocrSpecificResult.rows.length >= 3) {
    results.push(ocrSpecificResult);
  }

  // Strategy 1: Standard row-based table parsing
  const rowBasedResult = parseRowBasedTable(translatedText);
  if (rowBasedResult.rows.length > 0) {
    results.push(rowBasedResult);
  }

  // Strategy 2: Alternative formats (column-based, inline, vertical)
  const altResult = parseAlternativeFormat(translatedText);
  if (altResult.rows.length > 0) {
    results.push(altResult);
  }

  // Strategy 3: Extract all sizes and numbers, match by position
  const positionalResult = parseByPosition(translatedText);
  if (positionalResult.rows.length > 0) {
    results.push(positionalResult);
  }

  // Pick the result with the most complete data (most rows with most measurements)
  let bestResult = { headers: [], rows: [] };
  let bestScore = 0;

  for (const result of results) {
    const score = result.rows.length * Object.keys(result.rows[0] || {}).length;
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  return {
    headers: bestResult.headers,
    rows: bestResult.rows,
    rawText,
    translatedText,
  };
}

/**
 * Parse OCR-specific format where single-letter sizes (S, L) might be missed
 * Format example:
 *   shoulder/肩宽 (CM) 50    <- S's shoulder value
 *   chest/Chest (CM) 60      <- S's chest value
 *   length/Length (CM) 71    <- S's length value
 *   M                        <- M label
 *   51 62 72                 <- M's values
 *   XL                       <- XL label (L might be missing)
 *   52 53 64 66 73 74        <- L and XL values interleaved
 */
function parseOCRSpecificFormat(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const measurements = ['shoulder', 'chest', 'length'];
  const sizeOrder = ['S', 'M', 'L', 'XL'];

  // Collect all numbers from the text in order
  const allNumbers = [];
  const sizePositions = {}; // { M: 3, XL: 6 } - index in allNumbers where each size's values start

  let firstSizeFound = false;
  let measurementValues = {}; // Values found under measurement labels (these are S's values)
  let currentMeasurement = null; // Track measurement keyword for next number line

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check if this line is a size label
    const sizeMatch = line.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)$/i);
    if (sizeMatch) {
      const size = sizeMatch[1].toUpperCase();
      sizePositions[size] = allNumbers.length;
      firstSizeFound = true;
      currentMeasurement = null; // Reset after size label
      continue;
    }

    // Check if this line has a measurement keyword
    for (const m of measurements) {
      if (lowerLine.includes(m)) {
        currentMeasurement = m;
        break;
      }
    }

    // Extract numbers from this line
    const numbers = line.match(/(\d{2,3}(?:\.\d)?)/g);
    if (numbers) {
      // If we have a current measurement and haven't found a size yet, this is S's value
      if (currentMeasurement && !firstSizeFound && !measurementValues[currentMeasurement]) {
        measurementValues[currentMeasurement] = parseFloat(numbers[0]);
      }
      // Add all numbers to our list
      numbers.forEach(n => allNumbers.push(parseFloat(n)));
    }
  }

  // Now reconstruct the rows
  const rows = [];
  const headers = measurements;

  // If we have measurement values before any size label, that's S
  if (Object.keys(measurementValues).length >= 2) {
    const sRow = { size: 'S' };
    for (const m of measurements) {
      if (measurementValues[m] !== undefined) {
        sRow[m] = measurementValues[m];
      }
    }
    if (Object.keys(sRow).length > 1) {
      rows.push(sRow);
    }
  }

  // Process each detected size
  const detectedSizes = Object.keys(sizePositions).sort((a, b) =>
    sizeOrder.indexOf(a) - sizeOrder.indexOf(b)
  );

  for (let i = 0; i < detectedSizes.length; i++) {
    const size = detectedSizes[i];
    const startIdx = sizePositions[size];
    const nextSize = detectedSizes[i + 1];
    const endIdx = nextSize ? sizePositions[nextSize] : allNumbers.length;

    const sizeNumbers = allNumbers.slice(startIdx, endIdx);

    // If this is XL and we have 6+ numbers, L might be missing
    // Split the numbers: odd indices for L (previous size), even for XL
    if (size === 'XL' && sizeNumbers.length >= 6 && !detectedSizes.includes('L')) {
      // Numbers are interleaved: L-shoulder, XL-shoulder, L-chest, XL-chest, L-length, XL-length
      const lRow = { size: 'L' };
      const xlRow = { size: 'XL' };

      for (let j = 0; j < Math.min(sizeNumbers.length, measurements.length * 2); j++) {
        const measurementIdx = Math.floor(j / 2);
        if (measurementIdx < measurements.length) {
          if (j % 2 === 0) {
            lRow[measurements[measurementIdx]] = sizeNumbers[j];
          } else {
            xlRow[measurements[measurementIdx]] = sizeNumbers[j];
          }
        }
      }

      if (Object.keys(lRow).length > 1) rows.push(lRow);
      if (Object.keys(xlRow).length > 1) rows.push(xlRow);
    } else if (sizeNumbers.length >= 3) {
      // Normal case: 3 numbers for this size
      const row = { size };
      for (let j = 0; j < Math.min(sizeNumbers.length, measurements.length); j++) {
        row[measurements[j]] = sizeNumbers[j];
      }
      if (Object.keys(row).length > 1) {
        rows.push(row);
      }
    }
  }

  // Sort rows by standard size order
  rows.sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size));

  return { headers, rows };
}

/**
 * Parse standard row-based table format
 * Each row has: size label followed by measurements
 */
function parseRowBasedTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const headers = [];
  const rows = [];
  let headerFound = false;

  // First pass: find header row
  for (const line of lines) {
    const keywordMatches = line.match(/\b(Size|Chest|Length|Shoulder|Sleeve|Waist|Hip|Hem|Thigh)(?:\s*\([^)]*\))?/gi);
    if (keywordMatches && keywordMatches.length >= 2 && !headerFound) {
      const measurementHeaders = keywordMatches
        .map(k => k.replace(/\s*\([^)]*\)/g, '').trim())
        .map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())
        .filter(k => k.toLowerCase() !== 'size');
      headers.push(...measurementHeaders);
      headerFound = true;
      break;
    }
  }

  // Second pass: find data rows
  // Look for lines that START with a size label
  // Handle both "S 50" and "S50" formats (no space between size and number)
  const sizeRowPattern = /^[^\w]*(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)(?=\s|\d|$)/i;

  for (const line of lines) {
    // Skip header-like lines (but not if they start with a size + numbers)
    const startsWithSizeAndNum = /^[^\w]*(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\s*\d/i.test(line);
    if (/\b(size|shoulder|chest|length|sleeve|waist|hip)\b/i.test(line) && !startsWithSizeAndNum) {
      continue;
    }

    const sizeMatch = line.match(sizeRowPattern);
    if (sizeMatch) {
      const size = sizeMatch[1].toUpperCase();
      // Get numbers from the line (after removing the size label)
      const afterSize = line.replace(sizeRowPattern, '');
      const numbers = afterSize.match(/(\d{2,3}(?:\.\d)?)/g);

      if (numbers && numbers.length >= 1) {
        // Check if this size already exists (avoid duplicates)
        if (rows.some(r => r.size === size)) continue;

        const rowData = { size };
        const keys = headers.length > 0 ? headers : ['shoulder', 'chest', 'length', 'sleeve'];

        numbers.forEach((num, idx) => {
          if (idx < keys.length) {
            const key = getMeasurementKey(keys[idx]) || keys[idx].toLowerCase();
            rowData[key] = parseFloat(num);
          }
        });

        rows.push(rowData);
      }
    }
  }

  return { headers, rows };
}

/**
 * Parse by extracting all sizes and numbers, then matching by position
 * Works when OCR outputs sizes and numbers on separate lines
 */
function parseByPosition(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Extract all standalone size labels in order
  const sizes = [];
  const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)$/i;

  // Also look for sizes at start of lines with numbers (with or without space)
  const sizeWithNumbersPattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\s*(\d{2,3})/i;

  // Collect measurement rows (lines with 2+ numbers, no size label at start)
  const measurementRows = [];

  for (const line of lines) {
    // Check for standalone size
    const standaloneMatch = line.match(sizePattern);
    if (standaloneMatch) {
      const size = standaloneMatch[1].toUpperCase();
      if (!sizes.includes(size)) {
        sizes.push(size);
      }
      continue;
    }

    // Check for size with numbers
    const sizeNumMatch = line.match(sizeWithNumbersPattern);
    if (sizeNumMatch) {
      const size = sizeNumMatch[1].toUpperCase();
      if (!sizes.includes(size)) {
        sizes.push(size);
      }
      // Extract all numbers from the line after the size label
      const afterSize = line.replace(/^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\s*/i, '');
      const numbers = afterSize.match(/(\d{2,3}(?:\.\d)?)/g);
      if (numbers && numbers.length >= 2) {
        measurementRows.push({
          size,
          numbers: numbers.map(n => parseFloat(n))
        });
      }
      continue;
    }

    // Check for number-only lines (measurements without size label)
    const numbers = line.match(/\b(\d{2,3}(?:\.\d)?)\b/g);
    if (numbers && numbers.length >= 2 && !/\b(size|shoulder|chest|length|cm|tips|error)\b/i.test(line)) {
      measurementRows.push({
        size: null,
        numbers: numbers.map(n => parseFloat(n))
      });
    }
  }

  // If we have measurement rows with sizes, use them directly
  if (measurementRows.length > 0 && measurementRows.some(r => r.size)) {
    const rows = [];
    const headers = ['shoulder', 'chest', 'length'];

    for (const mr of measurementRows) {
      if (mr.size && !rows.some(r => r.size === mr.size)) {
        const row = { size: mr.size };
        mr.numbers.forEach((num, idx) => {
          if (idx < headers.length) {
            row[headers[idx]] = num;
          }
        });
        rows.push(row);
      }
    }

    // Sort rows by standard size order
    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
    rows.sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size));

    if (rows.length >= 2) {
      return { headers, rows };
    }
  }

  // Fallback: match sizes with measurement rows by index
  if (sizes.length >= 2 && measurementRows.length >= 2) {
    const rows = [];
    const headers = ['shoulder', 'chest', 'length'];

    // Match sizes with measurement rows that don't have sizes
    const unmatchedMeasurements = measurementRows.filter(r => !r.size);

    for (let i = 0; i < Math.min(sizes.length, unmatchedMeasurements.length); i++) {
      const row = { size: sizes[i] };
      unmatchedMeasurements[i].numbers.forEach((num, idx) => {
        if (idx < headers.length) {
          row[headers[idx]] = num;
        }
      });
      rows.push(row);
    }

    if (rows.length >= 2) {
      return { headers, rows };
    }
  }

  return { headers: [], rows: [] };
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
 *   S    M    L    XL
 *   50   51   52   53   (shoulder values)
 *   60   62   64   66   (chest values)
 *   71   72   73   74   (length values)
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

  // Collect all number rows AFTER the size row
  // These are measurement values in column format
  const numberRows = [];
  const measurementKeywords = ['shoulder', 'chest', 'length', 'sleeve', 'waist', 'hip', 'thigh', 'bust', 'front', 'hem'];
  const foundMeasurementNames = [];

  for (let i = 0; i < lines.length; i++) {
    if (i === sizeRowIndex) continue;

    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Check if this line has a measurement keyword
    let measurementName = null;
    for (const keyword of measurementKeywords) {
      if (lowerLine.includes(keyword)) {
        measurementName = keyword === 'bust' ? 'chest' : (keyword === 'front' ? 'length' : keyword);
        break;
      }
    }

    // Extract numbers from this line
    const numbers = line.match(numberPattern) || [];
    const numericValues = numbers.map(n => parseFloat(n));

    // If we have numbers matching the number of sizes, this is a measurement row
    if (numericValues.length >= sizes.length) {
      numberRows.push(numericValues.slice(0, sizes.length));
      foundMeasurementNames.push(measurementName || `measurement${numberRows.length}`);
    } else if (numericValues.length >= 2 && numericValues.length === sizes.length) {
      numberRows.push(numericValues);
      foundMeasurementNames.push(measurementName || `measurement${numberRows.length}`);
    }
  }

  // Build rows by taking column values
  if (numberRows.length >= 1) {
    const rows = [];
    // Default measurement names if none found
    const defaultNames = ['shoulder', 'chest', 'length', 'sleeve'];
    const headers = foundMeasurementNames.map((name, idx) =>
      name.startsWith('measurement') ? (defaultNames[idx] || name) : name
    );

    for (let sizeIdx = 0; sizeIdx < sizes.length; sizeIdx++) {
      const row = { size: sizes[sizeIdx] };
      for (let measIdx = 0; measIdx < numberRows.length; measIdx++) {
        const measurementName = headers[measIdx] || `measurement${measIdx + 1}`;
        if (numberRows[measIdx][sizeIdx] !== undefined) {
          row[measurementName] = numberRows[measIdx][sizeIdx];
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
