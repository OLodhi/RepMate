/**
 * POST /api/translate
 * Translates Chinese text to English
 */

const { translateChinese, CN_TO_EN } = require('../lib/translations');

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing "text" in request body' });
    }

    const translated = translateChinese(text);

    return res.status(200).json({
      success: true,
      original: text,
      translated,
      dictionarySize: Object.keys(CN_TO_EN).length,
    });
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
