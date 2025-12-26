/**
 * Chinese to English translation dictionary for clothing/size terms
 * Used for translating Yupoo size guides
 */

const CN_TO_EN = {
  // Size chart headers
  '尺码': 'Size',
  '尺寸': 'Size',
  '码数': 'Size',
  '号码': 'Size',
  '均码': 'One Size',

  // Measurement terms - Length
  '衣长': 'Length',
  '全长': 'Total Length',
  '身长': 'Body Length',
  '前长': 'Front Length',
  '后长': 'Back Length',

  // Measurement terms - Upper body
  '胸围': 'Chest',
  '胸園': 'Chest', // Variant/OCR misread
  '胸宽': 'Chest Width',
  '肩宽': 'Shoulder',
  '袖长': 'Sleeve',
  '抽长': 'Sleeve', // OCR misread of 袖长
  '袖口': 'Cuff',
  '领宽': 'Collar Width',
  '领高': 'Collar Height',
  '帽高': 'Hood Height',
  '帽宽': 'Hood Width',

  // Measurement terms - Lower body
  '腰围': 'Waist',
  '臀围': 'Hip',
  '裤长': 'Pants Length',
  '裙长': 'Skirt Length',
  '下摆': 'Hem',
  '裤脚': 'Leg Opening',
  '大腿围': 'Thigh',
  '坐围': 'Hip Width',

  // Units
  '厘米': 'cm',
  '公分': 'cm',
  '英寸': 'inch',

  // Recommendations
  '推荐尺码': 'Recommended Size',
  '推荐体重': 'Recommended Weight',
  '推荐身高': 'Recommended Height',
  '适合体重': 'Suitable Weight',
  '适合身高': 'Suitable Height',
  '建议体重': 'Suggested Weight',
  '建议身高': 'Suggested Height',
  '参考体重': 'Reference Weight',
  '参考身高': 'Reference Height',

  // Weight/Height units
  '公斤': 'kg',
  '斤': 'jin',

  // Fit descriptions
  '宽松': 'Loose Fit',
  '修身': 'Slim Fit',
  '常规': 'Regular Fit',
  '紧身': 'Tight Fit',

  // Materials
  '棉': 'Cotton',
  '聚酯纤维': 'Polyester',
  '涤纶': 'Polyester',
  '尼龙': 'Nylon',
  '羊毛': 'Wool',
  '羊绒': 'Cashmere',
  '真丝': 'Silk',
  '皮革': 'Leather',
  '鹅绒': 'Goose Down',
  '鸭绒': 'Duck Down',
  '充绒量': 'Down Fill',

  // Colors
  '黑色': 'Black',
  '白色': 'White',
  '灰色': 'Gray',
  '红色': 'Red',
  '蓝色': 'Blue',
  '绿色': 'Green',
  '黄色': 'Yellow',
  '棕色': 'Brown',
  '卡其': 'Khaki',
  '米色': 'Beige',
  '藏青': 'Navy',
  '军绿': 'Army Green',
  '酒红': 'Burgundy',

  // Other common terms
  '重量': 'Weight',
  '克': 'g',
  '男': 'Men',
  '女': 'Women',
  '中性': 'Unisex',
  '单位': 'Unit',
  '图片': 'Picture',
};

// Mapping of measurement terms to standardized keys for processing
const MEASUREMENT_KEYS = {
  // Upper body
  'Length': 'length',
  'Total Length': 'length',
  'Body Length': 'length',
  'Front Length': 'length',
  'Chest': 'chest',
  'Chest Width': 'chest',
  'Shoulder': 'shoulder',
  'Sleeve': 'sleeve',
  'Cuff': 'cuff',

  // Lower body
  'Waist': 'waist',
  'Hip': 'hip',
  'Hip Width': 'hip',
  'Pants Length': 'length',
  'Leg Opening': 'legOpening',
  'Thigh': 'thigh',
  'Hem': 'hem',
};

// Size order for comparison
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZE_ORDER = ['44', '46', '48', '50', '52', '54', '56', '58'];

/**
 * Translate Chinese text to English using dictionary lookup
 * @param {string} text - Text containing Chinese characters
 * @returns {string} - Translated text
 */
function translateChinese(text) {
  if (!text) return text;

  let result = text;

  // Sort by length (longest first) to avoid partial replacements
  const sortedEntries = Object.entries(CN_TO_EN).sort((a, b) => b[0].length - a[0].length);

  for (const [cn, en] of sortedEntries) {
    result = result.replace(new RegExp(cn, 'g'), en);
  }

  return result;
}

/**
 * Get standardized measurement key from translated term
 * @param {string} term - Translated measurement term
 * @returns {string|null} - Standardized key or null
 */
function getMeasurementKey(term) {
  const normalized = term.trim();
  return MEASUREMENT_KEYS[normalized] || null;
}

/**
 * Get the next size up from current size
 * @param {string} currentSize - Current size
 * @returns {string|null} - Next size up or null if not found
 */
function getNextSizeUp(currentSize) {
  const normalized = currentSize.toUpperCase().trim();

  // Check letter sizes
  const letterIndex = SIZE_ORDER.indexOf(normalized);
  if (letterIndex !== -1 && letterIndex < SIZE_ORDER.length - 1) {
    return SIZE_ORDER[letterIndex + 1];
  }

  // Check numeric sizes
  const numericIndex = NUMERIC_SIZE_ORDER.indexOf(normalized);
  if (numericIndex !== -1 && numericIndex < NUMERIC_SIZE_ORDER.length - 1) {
    return NUMERIC_SIZE_ORDER[numericIndex + 1];
  }

  // Try incrementing numeric size
  const num = parseInt(normalized);
  if (!isNaN(num)) {
    return String(num + 2); // EU sizes typically increment by 2
  }

  return null;
}

/**
 * Compare two sizes and return order (-1, 0, 1)
 * @param {string} sizeA - First size
 * @param {string} sizeB - Second size
 * @returns {number} - -1 if A < B, 0 if equal, 1 if A > B
 */
function compareSizes(sizeA, sizeB) {
  const normA = sizeA.toUpperCase().trim();
  const normB = sizeB.toUpperCase().trim();

  // Check letter sizes
  const letterIndexA = SIZE_ORDER.indexOf(normA);
  const letterIndexB = SIZE_ORDER.indexOf(normB);

  if (letterIndexA !== -1 && letterIndexB !== -1) {
    return letterIndexA - letterIndexB;
  }

  // Check numeric sizes
  const numA = parseInt(normA);
  const numB = parseInt(normB);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  return 0;
}

module.exports = {
  CN_TO_EN,
  MEASUREMENT_KEYS,
  SIZE_ORDER,
  NUMERIC_SIZE_ORDER,
  translateChinese,
  getMeasurementKey,
  getNextSizeUp,
  compareSizes,
};
