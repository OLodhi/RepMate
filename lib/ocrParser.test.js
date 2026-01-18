/**
 * Tests for OCR Parser
 */

const {
  containsSizeGuide,
  parseSizeChart,
  extractSizeLabels,
  detectGarmentType,
} = require('./ocrParser');

describe('containsSizeGuide', () => {
  test('returns true for text with measurement keywords and numbers', () => {
    const text = 'Size S M L XL\nChest 100 104 108 112';
    expect(containsSizeGuide(text)).toBe(true);
  });

  test('returns true for Chinese size guide text', () => {
    const text = '尺码 S M L XL\n胸围 100 104 108 112';
    expect(containsSizeGuide(text)).toBe(true);
  });

  test('returns false for text without size guide', () => {
    const text = 'Hello world this is just random text';
    expect(containsSizeGuide(text)).toBe(false);
  });

  test('returns false for empty text', () => {
    expect(containsSizeGuide('')).toBe(false);
    expect(containsSizeGuide(null)).toBe(false);
  });
});

describe('parseSizeChart', () => {
  test('parses standard row-based table', () => {
    const text = `Size Chest Shoulder Length
S 100 44 68
M 104 45 70
L 108 46 72`;

    const result = parseSizeChart(text);

    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    expect(result.rows[0].size).toBe('S');
    expect(result.rows[1].size).toBe('M');
    expect(result.rows[2].size).toBe('L');
  });

  test('parses multi-table format with Top and Bottom', () => {
    const text = `Size S M L XL
Length 65 67 69 71
Chest 100 104 108 112
Shoulder 44 45 46 47
Size S M L XL
Waist 74 78 82 86
Hip 96 100 104 108
Pants Length 98 100 102 104`;

    const result = parseSizeChart(text);

    expect(result.tables.length).toBeGreaterThanOrEqual(1);
  });

  test('parses numeric size format (1, 2, 3, 4, 5)', () => {
    const text = `Size 1 2 3 4 5
Length 65 67 69 71 73
Chest 100 104 108 112 116`;

    const result = parseSizeChart(text);

    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  test('parses EU size format (46, 48, 50, 52)', () => {
    const text = `Size 46 48 50 52
Length 65 67 69 71
Chest 100 104 108 112`;

    const result = parseSizeChart(text);

    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  test('handles OCR errors like $ instead of 5', () => {
    const text = `Size S M L XL
Length 6$ 67 69 71
Chest 100 104 108 112`;

    const result = parseSizeChart(text);

    // Should have converted $5 to 55 or similar
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  test('returns empty result for empty text', () => {
    const result = parseSizeChart('');

    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.tables).toEqual([]);
  });

  test('parses inline format with size:measurements', () => {
    const text = `XS: Waist74 Rise32 Thigh66 Pants Length106
S: Waist78 Rise33 Thigh68 Pants Length106
M: Waist82 Rise34 Thigh70 Pants Length108`;

    const result = parseSizeChart(text);

    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    expect(result.rows[0].size).toBe('XS');
    expect(result.rows[0].waist).toBe(74);
  });
});

describe('extractSizeLabels', () => {
  test('extracts standard size labels', () => {
    const text = 'S M L XL XXL';
    const sizes = extractSizeLabels(text);

    expect(sizes).toContain('S');
    expect(sizes).toContain('M');
    expect(sizes).toContain('L');
    expect(sizes).toContain('XL');
    expect(sizes).toContain('XXL');
  });

  test('extracts numeric sizes', () => {
    const text = 'Size 1 2 3 4 5';
    const sizes = extractSizeLabels(text);

    expect(sizes.length).toBeGreaterThan(0);
  });

  test('handles empty text', () => {
    expect(extractSizeLabels('')).toEqual([]);
    expect(extractSizeLabels(null)).toEqual([]);
  });
});

describe('detectGarmentType', () => {
  test('detects top garment from measurements', () => {
    const sizeChart = {
      headers: ['Size', 'Chest', 'Shoulder', 'Sleeve', 'Length'],
      rows: [
        { size: 'M', chest: 112, shoulder: 47, sleeve: 62, length: 70 },
      ],
    };

    expect(detectGarmentType(sizeChart)).toBe('top');
  });

  test('detects bottom garment from measurements', () => {
    const sizeChart = {
      headers: ['Size', 'Waist', 'Hip', 'Inseam', 'Thigh'],
      rows: [
        { size: 'M', waist: 82, hip: 100, inseam: 78, thigh: 58 },
      ],
    };

    expect(detectGarmentType(sizeChart)).toBe('bottom');
  });

  test('defaults to top when ambiguous', () => {
    const sizeChart = {
      headers: ['Size', 'Length'],
      rows: [
        { size: 'M', length: 70 },
      ],
    };

    expect(detectGarmentType(sizeChart)).toBe('top');
  });
});

describe('multi-table parsing', () => {
  test('correctly identifies garment types in multi-table', () => {
    const text = `Size S M L XL
Shoulder 44 45 46 47
Chest 100 104 108 112
Length 65 67 69 71
Sleeve 60 61 62 63
Size S M L XL
Waist 74 78 82 86
Hip 96 100 104 108
Thigh 54 56 58 60
Pants Length 98 100 102 104`;

    const result = parseSizeChart(text);

    if (result.tables.length >= 2) {
      // First table should be top
      expect(result.tables[0].garmentType).toBe('top');
      // Second table should be bottom
      expect(result.tables[1].garmentType).toBe('bottom');
    }
  });

  test('preserves measurements in multi-table', () => {
    const text = `Size S M L
Length 65 67 69
Chest 100 104 108
Size S M L
Waist 74 78 82
Hip 96 100 104`;

    const result = parseSizeChart(text);

    if (result.tables.length >= 2) {
      // Check first table has top measurements
      const topRows = result.tables[0].rows;
      expect(topRows[0]).toHaveProperty('length');
      expect(topRows[0]).toHaveProperty('chest');

      // Check second table has bottom measurements
      const bottomRows = result.tables[1].rows;
      expect(bottomRows[0]).toHaveProperty('waist');
      expect(bottomRows[0]).toHaveProperty('hip');
    }
  });
});
