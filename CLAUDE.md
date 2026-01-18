# RepMate Project Instructions

## Allowed Operations

Claude is permitted to read, write, and edit any files in this project directory, including:
- `extension/**` - Chrome extension files (popup, content scripts, background)
- `lib/**` - Shared libraries (ocrParser, sizeCalculator, translations)
- `api/**` - Vercel serverless functions
- `*.md` - Markdown files
- `*.json` - Configuration files
- `*.js` - JavaScript files
- `*.css` - Stylesheets
- `*.html` - HTML files

## Allowed Commands

Claude may run the following commands without confirmation:
- `npm test` - Run tests
- `npm install` - Install dependencies
- `node` - Run Node.js scripts
- `git status`, `git diff`, `git log` - Check git state (read-only)

## Project Context

RepMate is a Chrome extension that:
1. Scans Yupoo product pages for size guide images
2. Uses OCR to extract size chart data
3. Provides personalized size recommendations based on user measurements

## Current Task

Working through `@fix_plan.md` to fix bugs and improve the extension. The main priority is fixing the multi-table size guide display bug.
