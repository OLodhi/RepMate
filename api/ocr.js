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

    // If we have a URL, fetch the image first and convert to base64
    // This is needed because OCR.space can't always fetch images from external sites
    let base64Data;
    if (imageBase64) {
      base64Data = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    } else {
      // Fetch the image and convert to base64
      // Use browser-like headers to avoid being blocked
      // Extract subdomain from image URL for proper referer
      const urlMatch = imageUrl.match(/photo\.yupoo\.com\/([^\/]+)/);
      const seller = urlMatch ? urlMatch[1] : 'x';
      const referer = `https://${seller}.x.yupoo.com/`;

      const imageResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': referer,
          'Origin': referer,
        },
      });
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString('base64');
      base64Data = `data:image/jpeg;base64,${base64}`;
    }

    // Build form data for OCR.space API
    const formData = new URLSearchParams();
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'chs'); // Chinese Simplified (also detects English)
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('isTable', 'true'); // Enable table detection for size charts
    formData.append('OCREngine', '2'); // Engine 2 is better for Asian languages
    formData.append('base64Image', base64Data);

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
        tables: structured.tables || [], // Multiple tables support
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
