/**
 * RepMate Service Worker
 * Handles background tasks and message passing
 */

// API base URL - update this after deploying to Vercel
const API_BASE = 'https://repmate.vercel.app';
// For local development:
// const API_BASE = 'http://localhost:3000';

/**
 * Handle messages from content script or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OCR_REQUEST') {
    handleOcrRequest(message.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'RECOMMEND_REQUEST') {
    handleRecommendRequest(message.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_MEASUREMENTS') {
    getMeasurements()
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_MEASUREMENTS') {
    saveMeasurements(message.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * Send image to OCR API
 */
async function handleOcrRequest(data) {
  const response = await fetch(`${API_BASE}/api/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`OCR API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get size recommendations from API
 */
async function handleRecommendRequest(data) {
  const response = await fetch(`${API_BASE}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Recommend API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get user measurements from storage
 */
async function getMeasurements() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['measurements', 'settings'], (result) => {
      resolve({
        measurements: result.measurements || {},
        settings: result.settings || { baggyMargin: { type: 'size', value: 1 } },
      });
    });
  });
}

/**
 * Save user measurements to storage
 */
async function saveMeasurements(data) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, () => {
      resolve({ success: true });
    });
  });
}

/**
 * Listen for installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      measurements: {},
      settings: {
        baggyMargin: { type: 'size', value: 1 },
        unit: 'cm',
      },
    });

    console.log('RepMate installed successfully');
  }
});
