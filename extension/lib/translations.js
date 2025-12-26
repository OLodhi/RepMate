/**
 * Chinese to English translation dictionary for clothing/size terms
 * Shared with the extension
 */

const CN_TO_EN = {
  // Size chart headers
  '尺码': 'Size',
  '尺寸': 'Size',
  '码数': 'Size',
  '号码': 'Size',
  '均码': 'One Size',

  // Measurement terms
  '衣长': 'Length',
  '全长': 'Total Length',
  '身长': 'Body Length',
  '前长': 'Front Length',
  '后长': 'Back Length',
  '胸围': 'Chest',
  '胸宽': 'Chest Width',
  '肩宽': 'Shoulder',
  '袖长': 'Sleeve',
  '袖口': 'Cuff',
  '腰围': 'Waist',
  '臀围': 'Hip',
  '裤长': 'Pants Length',
  '裙长': 'Skirt Length',
  '下摆': 'Hem',
  '领宽': 'Collar Width',
  '领高': 'Collar Height',
  '帽高': 'Hood Height',
  '帽宽': 'Hood Width',
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

  // Other
  '重量': 'Weight',
  '克': 'g',
  '公斤': 'kg',
  '单位': 'Unit',
  '图片': 'Picture',
};

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CN_TO_EN };
}
