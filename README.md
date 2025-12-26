# RepMate - Yupoo Size Guide Helper

A Chrome extension that analyzes size guides on Yupoo pages and recommends sizes based on your body measurements.

## Features

- **Automatic Size Guide Detection**: Identifies size charts on Yupoo product pages
- **OCR Analysis**: Extracts measurements from images using Tesseract.js
- **Chinese Translation**: Automatically translates Chinese size terms to English
- **Smart Recommendations**: Suggests "Right Fit" and "Baggy Fit" sizes based on your measurements
- **Customizable Settings**: Configure your preferred baggy fit margin

## Project Structure

```
RepMate/
├── api/                    # Vercel serverless functions
│   ├── ocr.js             # OCR endpoint
│   ├── recommend.js       # Size recommendation endpoint
│   └── translate.js       # Translation endpoint
├── lib/                    # Shared libraries
│   ├── translations.js    # Chinese-English dictionary
│   ├── sizeCalculator.js  # Size recommendation logic
│   └── ocrParser.js       # OCR result parser
├── extension/              # Chrome extension
│   ├── manifest.json
│   ├── popup/             # Extension popup UI
│   ├── content/           # Content scripts for Yupoo pages
│   ├── background/        # Service worker
│   └── icons/             # Extension icons
├── package.json
└── vercel.json
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

## License

MIT
