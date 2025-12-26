/**
 * POST /api/ocr
 * Extracts text from size guide images using Tesseract.js
 */

const Tesseract = require('tesseract.js');
const { translateChinese } = require('../lib/translations');
const { parseSizeChart, containsSizeGuide, detectGarmentType } = require('../lib/ocrParser');

// Cache for Tesseract worker (reuse across requests in same instance)
let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng+chi_sim', 1, {
        logger: () => {}, // Suppress logs
      });
      return worker;
    })();
  }
  return workerPromise;
}

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

    // Determine image source
    let imageSource;
    if (imageBase64) {
      // Handle base64 data
      imageSource = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
    } else {
      imageSource = imageUrl;
    }

    // Perform OCR
    const worker = await getWorker();
    const { data } = await worker.recognize(imageSource);

    const rawText = data.text;
    const confidence = data.confidence;

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
