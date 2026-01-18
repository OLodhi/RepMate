# RepMate - Yupoo Size Guide Helper

A Chrome extension that analyzes size guides on Yupoo pages and recommends sizes based on your body measurements.

## Features

- **Automatic Size Guide Detection**: Identifies size charts on Yupoo product pages
- **OCR Analysis**: Extracts measurements from images using OCR.space API
- **Multi-Table Support**: Handles combined Top/Bottom size guides in a single image
- **Chinese Translation**: Automatically translates Chinese size terms to English
- **Smart Recommendations**: Suggests "Right Fit" and "Baggy Fit" sizes based on your measurements
- **Multiple Parsing Strategies**: Handles various size chart formats (standard, EU sizes, numeric sizes, inline formats)
- **Customizable Settings**: Configure your preferred baggy fit margin (size steps, cm, or percentage)

## Project Structure

```
RepMate/
├── api/                    # Vercel serverless functions
│   ├── ocr.js             # OCR endpoint (uses OCR.space API)
│   ├── recommend.js       # Size recommendation endpoint
│   └── translate.js       # Translation endpoint
├── lib/                    # Shared libraries
│   ├── translations.js    # Chinese-English dictionary & size utilities
│   ├── sizeCalculator.js  # Size recommendation algorithm with ease allowances
│   ├── sizeCalculator.test.js  # Tests for size calculator
│   ├── ocrParser.js       # OCR result parser with multiple strategies
│   └── ocrParser.test.js  # Tests for OCR parser
├── extension/              # Chrome extension (Manifest v3)
│   ├── manifest.json
│   ├── popup/             # Extension popup UI (HTML, CSS, JS)
│   ├── content/           # Content scripts for Yupoo pages
│   ├── background/        # Service worker
│   └── icons/             # Extension icons
├── package.json
├── jest.config.js         # Jest test configuration
└── vercel.json            # Vercel deployment config
```

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Chrome browser

### Installation

1. Clone and install dependencies:
   ```bash
   cd RepMate
   npm install
   ```

2. Deploy to Vercel:
   ```bash
   npm run deploy
   ```

3. Update the API URL in `extension/background/service-worker.js`:
   ```javascript
   const API_BASE = 'https://your-project.vercel.app';
   ```

4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

## Usage

1. Click the RepMate icon in Chrome toolbar
2. Enter your body measurements (chest, waist, etc.)
3. Save your measurements
4. Browse to any Yupoo product page
5. Click the "📏 Check Size" button on size guide images
6. View your recommended sizes!

## API Endpoints

### POST /api/ocr
Extract text from size guide images.

```json
{
  "imageUrl": "https://photo.yupoo.com/..."
}
```

### POST /api/recommend
Get size recommendations.

```json
{
  "sizeChart": { "headers": [...], "rows": [...] },
  "userMeasurements": { "chest": 98, "waist": 82 },
  "garmentType": "top",
  "baggyMargin": { "type": "size", "value": 1 }
}
```

### POST /api/translate
Translate Chinese text to English.

```json
{
  "text": "尺码 胸围 肩宽"
}
```

## Development

Run locally:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

### Testing

RepMate includes comprehensive test suites:

- **ocrParser.test.js** (19 tests): Tests for size guide detection, multi-table parsing, size label extraction, and garment type detection
- **sizeCalculator.test.js** (15 tests): Tests for ease allowances, fit scoring, recommendation calculation, and edge cases

### Size Recommendation Algorithm

The algorithm uses **ease allowances** to determine fit:

| Measurement | Min | Ideal | Max |
|-------------|-----|-------|-----|
| Chest       | +4cm | +8cm | +16cm |
| Shoulder    | +0cm | +2cm | +6cm |
| Waist       | +2cm | +4cm | +10cm |
| Hip         | +2cm | +6cm | +14cm |

- **Tight**: Garment is smaller than body + min ease
- **Right Fit**: Garment provides min to ideal ease
- **Loose**: Garment provides ideal to max ease
- **Oversized**: Garment exceeds max ease

### Multi-Table Support

When a size guide image contains both Top and Bottom measurements (common in Chinese stores), RepMate:
1. Parses both tables separately
2. Detects garment type for each table based on measurements
3. Returns separate recommendations for tops and bottoms
4. Displays both sets of recommendations in the popup

## License

MIT
