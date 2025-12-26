/**
 * RepMate Popup Script
 * Handles page scanning, size recommendations, and user measurements
 */

// State
let currentImages = [];
let userMeasurements = {};
let userSettings = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initBaggySettings();
  loadSavedData();
  initSaveButton();
  initScanButton();
  checkCurrentPage();
});

/**
 * Check if current tab is a Yupoo page
 */
async function checkCurrentPage() {
  const pageInfo = document.getElementById('pageInfo');
  const scanSection = document.getElementById('scanSection');
  const notYupooSection = document.getElementById('notYupooSection');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url && tab.url.includes('yupoo.com')) {
      // It's a Yupoo page
      pageInfo.innerHTML = `
        <span class="status-dot active"></span>
        <span class="status-text">Yupoo page detected</span>
      `;
      scanSection.classList.remove('hidden');
      notYupooSection.classList.add('hidden');

      // Get images from the page
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_IMAGES' }, (response) => {
        if (response && response.length > 0) {
          currentImages = response;
          console.log(`Found ${currentImages.length} images on page`);
        }
      });
    } else {
      // Not a Yupoo page
      pageInfo.innerHTML = `
        <span class="status-dot inactive"></span>
        <span class="status-text">Not a Yupoo page</span>
      `;
      scanSection.classList.add('hidden');
      notYupooSection.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error checking page:', error);
    pageInfo.innerHTML = `
      <span class="status-dot inactive"></span>
      <span class="status-text">Unable to detect page</span>
    `;
  }
}

/**
 * Initialize scan button
 */
function initScanButton() {
  const scanBtn = document.getElementById('scanBtn');
  const scanStatus = document.getElementById('scanStatus');

  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    scanStatus.classList.remove('hidden', 'error', 'success');
    scanStatus.textContent = 'Looking for size guides...';

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Get images from page
      const images = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_IMAGES' }, resolve);
      });

      if (!images || images.length === 0) {
        throw new Error('No images found on page');
      }

      scanStatus.textContent = `Found ${images.length} images. Analyzing...`;

      // Scan each image for size guide (limit to first 10 to avoid overload)
      const imagesToScan = images.slice(0, 10);
      let sizeGuideFound = null;

      for (let i = 0; i < imagesToScan.length; i++) {
        const img = imagesToScan[i];
        scanStatus.textContent = `Scanning image ${i + 1} of ${imagesToScan.length}...`;

        try {
          const ocrResult = await sendMessage({
            type: 'OCR_REQUEST',
            data: { imageUrl: img.src },
          });

          if (ocrResult.success && ocrResult.isSizeGuide) {
            sizeGuideFound = ocrResult;
            break; // Found a size guide, stop scanning
          }
        } catch (err) {
          console.log(`Image ${i + 1} scan failed:`, err);
          // Continue to next image
        }
      }

      if (sizeGuideFound) {
        scanStatus.classList.add('success');
        scanStatus.textContent = 'Size guide found!';

        // Get recommendations
        await showRecommendations(sizeGuideFound);
      } else {
        scanStatus.classList.add('error');
        scanStatus.textContent = 'No size guide found in images';
      }

    } catch (error) {
      console.error('Scan error:', error);
      scanStatus.classList.add('error');
      scanStatus.textContent = `Error: ${error.message}`;
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan for Size Guide';
    }
  });
}

/**
 * Show recommendations from OCR result
 */
async function showRecommendations(ocrResult) {
  const resultsSection = document.getElementById('resultsSection');
  const rightFitSize = document.getElementById('rightFitSize');
  const rightFitDetail = document.getElementById('rightFitDetail');
  const baggyFitSize = document.getElementById('baggyFitSize');
  const baggyFitDetail = document.getElementById('baggyFitDetail');
  const sizeChartTable = document.getElementById('sizeChartTable');
  const rawOcrText = document.getElementById('rawOcrText');

  // Show raw OCR text
  rawOcrText.textContent = ocrResult.translatedText || ocrResult.rawText;

  // Check if user has measurements
  if (!userMeasurements || Object.keys(userMeasurements).length === 0) {
    rightFitSize.textContent = '?';
    rightFitDetail.textContent = 'Set measurements first';
    baggyFitSize.textContent = '?';
    baggyFitDetail.textContent = 'Set measurements first';
    resultsSection.classList.remove('hidden');
    return;
  }

  try {
    // Get recommendations from API
    const recommendations = await sendMessage({
      type: 'RECOMMEND_REQUEST',
      data: {
        sizeChart: ocrResult.structured,
        userMeasurements: userMeasurements,
        garmentType: ocrResult.structured.garmentType || 'top',
        baggyMargin: userSettings.baggyMargin || { type: 'size', value: 1 },
      },
    });

    if (recommendations.success) {
      // Right fit
      if (recommendations.rightFit) {
        rightFitSize.textContent = recommendations.rightFit.size;
        rightFitDetail.textContent = `${Math.round(recommendations.rightFit.confidence * 100)}% match`;
      } else {
        rightFitSize.textContent = 'N/A';
        rightFitDetail.textContent = 'Could not determine';
      }

      // Baggy fit
      if (recommendations.baggyFit) {
        baggyFitSize.textContent = recommendations.baggyFit.size;
        baggyFitDetail.textContent = `${Math.round(recommendations.baggyFit.confidence * 100)}% match`;
      } else {
        baggyFitSize.textContent = 'N/A';
        baggyFitDetail.textContent = 'Could not determine';
      }

      // Build size chart table
      if (recommendations.allSizes && recommendations.allSizes.length > 0) {
        buildSizeChartTable(recommendations.allSizes, ocrResult.structured);
      }
    } else {
      rightFitSize.textContent = '?';
      rightFitDetail.textContent = recommendations.error || 'Error';
      baggyFitSize.textContent = '?';
      baggyFitDetail.textContent = '';
    }

  } catch (error) {
    console.error('Recommendation error:', error);
    rightFitSize.textContent = '?';
    rightFitDetail.textContent = error.message;
    baggyFitSize.textContent = '?';
    baggyFitDetail.textContent = '';
  }

  resultsSection.classList.remove('hidden');
}

/**
 * Build size chart table HTML
 */
function buildSizeChartTable(allSizes, structured) {
  const container = document.getElementById('sizeChartTable');

  if (!allSizes || allSizes.length === 0) {
    container.innerHTML = '<p>No size data available</p>';
    return;
  }

  // Get all measurement keys from the first row
  const keys = Object.keys(allSizes[0]).filter(k => !['size', 'fit', 'score'].includes(k));

  let html = '<table><tr><th>Size</th><th>Fit</th>';
  keys.forEach(key => {
    html += `<th>${key.charAt(0).toUpperCase() + key.slice(1)}</th>`;
  });
  html += '</tr>';

  allSizes.forEach(row => {
    const rowClass = row.fit === 'right' ? 'recommended' : '';
    html += `<tr class="${rowClass}"><td>${row.size}</td><td>${row.fit}</td>`;
    keys.forEach(key => {
      html += `<td>${row[key] || '-'}</td>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  container.innerHTML = html;
}

/**
 * Send message to background script
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Initialize tab switching
 */
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
    });
  });
}

/**
 * Initialize baggy fit settings UI
 */
function initBaggySettings() {
  const baggyType = document.getElementById('baggyType');
  const baggyValue = document.getElementById('baggyValue');
  const baggyUnit = document.getElementById('baggyUnit');

  baggyType.addEventListener('change', () => {
    switch (baggyType.value) {
      case 'size':
        baggyValue.value = '1';
        baggyUnit.textContent = 'size(s)';
        break;
      case 'cm':
        baggyValue.value = '5';
        baggyUnit.textContent = 'cm';
        break;
      case 'percent':
        baggyValue.value = '10';
        baggyUnit.textContent = '%';
        break;
    }
  });
}

/**
 * Load saved measurements and settings
 */
function loadSavedData() {
  chrome.runtime.sendMessage({ type: 'GET_MEASUREMENTS' }, (response) => {
    if (response && response.measurements) {
      userMeasurements = response.measurements;
      const m = response.measurements;

      // Populate form fields
      if (m.chest) document.getElementById('chest').value = m.chest;
      if (m.shoulder) document.getElementById('shoulder').value = m.shoulder;
      if (m.sleeve) document.getElementById('sleeve').value = m.sleeve;
      if (m.topLength) document.getElementById('topLength').value = m.topLength;
      if (m.waist) document.getElementById('waist').value = m.waist;
      if (m.hip) document.getElementById('hip').value = m.hip;
      if (m.inseam) document.getElementById('inseam').value = m.inseam;
      if (m.thigh) document.getElementById('thigh').value = m.thigh;
      if (m.height) document.getElementById('height').value = m.height;
      if (m.weight) document.getElementById('weight').value = m.weight;
    }

    if (response && response.settings) {
      userSettings = response.settings;
      const s = response.settings;

      if (s.baggyMargin) {
        document.getElementById('baggyType').value = s.baggyMargin.type;
        document.getElementById('baggyValue').value = s.baggyMargin.value;
        const unitLabels = { size: 'size(s)', cm: 'cm', percent: '%' };
        document.getElementById('baggyUnit').textContent = unitLabels[s.baggyMargin.type] || 'size(s)';
      }
    }
  });
}

/**
 * Initialize save button
 */
function initSaveButton() {
  const saveBtn = document.getElementById('saveBtn');

  saveBtn.addEventListener('click', () => {
    const measurements = {
      chest: parseFloatOrNull(document.getElementById('chest').value),
      shoulder: parseFloatOrNull(document.getElementById('shoulder').value),
      sleeve: parseFloatOrNull(document.getElementById('sleeve').value),
      topLength: parseFloatOrNull(document.getElementById('topLength').value),
      waist: parseFloatOrNull(document.getElementById('waist').value),
      hip: parseFloatOrNull(document.getElementById('hip').value),
      inseam: parseFloatOrNull(document.getElementById('inseam').value),
      thigh: parseFloatOrNull(document.getElementById('thigh').value),
      height: parseFloatOrNull(document.getElementById('height').value),
      weight: parseFloatOrNull(document.getElementById('weight').value),
    };

    // Remove null values
    Object.keys(measurements).forEach(key => {
      if (measurements[key] === null) delete measurements[key];
    });

    const settings = {
      baggyMargin: {
        type: document.getElementById('baggyType').value,
        value: parseInt(document.getElementById('baggyValue').value, 10),
      },
      unit: 'cm',
    };

    // Update local state
    userMeasurements = measurements;
    userSettings = settings;

    // Save to storage
    chrome.runtime.sendMessage({
      type: 'SAVE_MEASUREMENTS',
      data: { measurements, settings },
    }, (response) => {
      if (response && response.success) {
        showStatus('Saved!', 'success');
      } else {
        showStatus('Failed to save', 'error');
      }
    });
  });
}

function parseFloatOrNull(value) {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  setTimeout(() => {
    status.className = 'status';
    status.textContent = '';
  }, 2000);
}
