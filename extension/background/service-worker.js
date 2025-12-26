/**
 * RepMate Service Worker
 * Handles background tasks and message passing
 */

// Log immediately when service worker loads
console.log('[RepMate SW] ===== SERVICE WORKER LOADED =====');

// API base URL - Production deployment
const API_BASE = 'https://repmate-ten.vercel.app';

/**
 * Handle messages from content script or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[RepMate SW] ===== MESSAGE RECEIVED =====', message.type);

  if (message.type === 'OCR_REQUEST') {
    console.log('[RepMate SW] Processing OCR for:', message.data.imageUrl);

    // Call the API
    fetch(`${API_BASE}/api/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.data),
    })
      .then(response => {
        console.log('[RepMate SW] API response status:', response.status);
        if (!response.ok) {
          throw new Error(`OCR API error: ${response.status}`);
        }
        return response.json();
      })
      .then(result => {
        console.log('[RepMate SW] OCR success:', result);
        sendResponse(result);
      })
      .catch(err => {
        console.error('[RepMate SW] OCR error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep channel open for async response
  }

  if (message.type === 'RECOMMEND_REQUEST') {
    fetch(`${API_BASE}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.data),
    })
      .then(response => {
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        return response.json();
      })
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_MEASUREMENTS') {
    chrome.storage.sync.get(['measurements', 'settings'], (result) => {
      console.log('[RepMate SW] Returning measurements:', result);
      sendResponse({
        measurements: result.measurements || {},
        settings: result.settings || { baggyMargin: { type: 'size', value: 1 } },
      });
    });
    return true;
  }

  if (message.type === 'SAVE_MEASUREMENTS') {
    chrome.storage.sync.set(message.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Unknown message type
  console.log('[RepMate SW] Unknown message type:', message.type);
  return false;
});

/**
 * Listen for installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[RepMate SW] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      measurements: {},
      settings: {
        baggyMargin: { type: 'size', value: 1 },
        unit: 'cm',
      },
    });
  }
});

// Keep service worker alive by responding to alarms (optional)
console.log('[RepMate SW] Service worker ready and listening...');
