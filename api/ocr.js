/**
 * POST /api/ocr
 * Extracts text from size guide images using OCR.space API (free, fast)
 */

const { translateChinese } = require('../lib/translations');
const { parseSizeChart, containsSizeGuide, detectGarmentType } = require('../lib/ocrParser');

// OCR.space free API key (get your own at https://ocr.space/ocrapi)
const OCR_API_KEY = 'K85674275388957';

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, imageBase64 } = req.body;

    if (!imageUrl && !imageBase64) {
      return res.status(400).json({
        error: 'Missing "imageUrl" or "imageBase64" in request body',
      });
    }

    // Build form data for OCR.space API
    const formData = new URLSearchParams();
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'chs'); // Chinese Simplified (also detects English)
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for Asian languages

    if (imageBase64) {
      formData.append('base64Image', imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`);
    } else {
      formData.append('url', imageUrl);
    }

    // Call OCR.space API
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const ocrResult = await ocrResponse.json();

    if (ocrResult.IsErroredOnProcessing) {
      throw new Error(ocrResult.ErrorMessage || 'OCR processing failed');
    }

    const rawText = ocrResult.ParsedResults?.[0]?.ParsedText || '';
    const confidence = ocrResult.ParsedResults?.[0]?.TextOverlay?.confidence || 0;

    // Check if this looks like a size guide
    const isSizeGuide = containsSizeGuide(rawText);

    // Parse into structured data
    const structured = parseSizeChart(rawText);

    // Detect garment type
    const garmentType = detectGarmentType(structured);

    // Translate
    const translatedText = translateChinese(rawText);

    return res.status(200).json({
      success: true,
      isSizeGuide,
      confidence,
      rawText,
      translatedText,
      structured: {
        headers: structured.headers,
        rows: structured.rows,
        garmentType,
      },
    });
  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
