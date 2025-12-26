/**
 * POST /api/recommend
 * Calculates size recommendations based on user measurements and size chart
 */

const { calculateRecommendations, EASE_ALLOWANCES } = require('../lib/sizeCalculator');

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      sizeChart,
      userMeasurements,
      garmentType = 'top',
      baggyMargin = { type: 'size', value: 1 },
    } = req.body;

    // Validate required fields
    if (!sizeChart || !sizeChart.rows || sizeChart.rows.length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid "sizeChart" in request body',
        expected: {
          sizeChart: {
            headers: ['Size', 'Chest', 'Length', 'Shoulder', 'Sleeve'],
            rows: [
              { size: 'M', chest: 112, length: 70, shoulder: 47, sleeve: 62 },
            ],
          },
        },
      });
    }

    if (!userMeasurements || Object.keys(userMeasurements).length === 0) {
      return res.status(400).json({
        error: 'Missing or empty "userMeasurements" in request body',
        expected: {
          userMeasurements: {
            chest: 98,
            shoulder: 44,
            waist: 82,
          },
        },
      });
    }

    // Validate garment type
    if (!['top', 'bottom'].includes(garmentType)) {
      return res.status(400).json({
        error: 'Invalid "garmentType". Must be "top" or "bottom"',
      });
    }

    // Validate baggy margin
    if (!['size', 'cm', 'percent'].includes(baggyMargin.type)) {
      return res.status(400).json({
        error: 'Invalid "baggyMargin.type". Must be "size", "cm", or "percent"',
      });
    }

    // Calculate recommendations
    const recommendations = calculateRecommendations(
      sizeChart,
      userMeasurements,
      garmentType,
      baggyMargin
    );

    return res.status(200).json({
      success: true,
      garmentType,
      userMeasurements,
      baggyMargin,
      ...recommendations,
      easeAllowances: EASE_ALLOWANCES[garmentType],
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
