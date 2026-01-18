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

      console.log(`[RepMate] Total images found: ${images.length}`);
      scanStatus.textContent = `Found ${images.length} images. Prioritizing likely size guides...`;

      // Prioritize images that are likely to be size guides based on URL patterns
      const prioritizedImages = prioritizeImagesForSizeGuide(images);
      console.log(`[RepMate] Prioritized order: ${prioritizedImages.length} images`);

      let sizeGuideFound = null;
      let scannedCount = 0;

      for (let i = 0; i < prioritizedImages.length; i++) {
        const img = prioritizedImages[i];
        scannedCount++;
        scanStatus.textContent = `Scanning image ${scannedCount} of ${prioritizedImages.length}...`;

        try {
          const ocrResult = await sendMessage({
            type: 'OCR_REQUEST',
            data: { imageUrl: img.src },
          });

          if (ocrResult.success && ocrResult.isSizeGuide) {
            sizeGuideFound = ocrResult;
            console.log(`[RepMate] Size guide found at image ${scannedCount}`);
            break; // Found a size guide, stop scanning
          }
        } catch (err) {
          console.log(`[RepMate] Image ${scannedCount} scan failed:`, err.message);
          // Continue to next image
        }
      }

      if (sizeGuideFound) {
        scanStatus.classList.add('success');
        scanStatus.textContent = `Size guide found! (scanned ${scannedCount} of ${prioritizedImages.length} images)`;

        // Get recommendations
        await showRecommendations(sizeGuideFound);
      } else {
        scanStatus.classList.add('error');
        scanStatus.textContent = `No size guide found (scanned all ${scannedCount} images)`;
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
 * Supports multiple tables (e.g., Top + Bottom size guides)
 */
async function showRecommendations(ocrResult) {
  const resultsSection = document.getElementById('resultsSection');
  const recommendationsContainer = document.getElementById('recommendationsContainer');
  const singleRecommendation = document.getElementById('singleRecommendation');
  const rightFitSize = document.getElementById('rightFitSize');
  const rightFitDetail = document.getElementById('rightFitDetail');
  const baggyFitSize = document.getElementById('baggyFitSize');
  const baggyFitDetail = document.getElementById('baggyFitDetail');
  const sizeChartTable = document.getElementById('sizeChartTable');
  const rawOcrText = document.getElementById('rawOcrText');

  // Show raw OCR text
  rawOcrText.textContent = ocrResult.translatedText || ocrResult.rawText;

  // Show detected size chart from OCR
  if (ocrResult.structured && ocrResult.structured.rows) {
    buildSizeChartFromOCR(ocrResult.structured);
  }

  // Check if user has measurements
  if (!userMeasurements || Object.keys(userMeasurements).length === 0) {
    rightFitSize.textContent = '?';
    rightFitDetail.textContent = 'Set measurements first';
    baggyFitSize.textContent = '?';
    baggyFitDetail.textContent = 'Set measurements first';
    singleRecommendation.classList.remove('hidden');
    recommendationsContainer.innerHTML = '';
    resultsSection.classList.remove('hidden');
    return;
  }

  // Check if we have multiple tables (Top + Bottom)
  const tables = ocrResult.structured?.tables || [];

  if (tables.length > 1) {
    // Multiple tables - show recommendations for each
    console.log(`[RepMate] Found ${tables.length} tables, getting recommendations for each...`);
    singleRecommendation.classList.add('hidden');
    recommendationsContainer.innerHTML = '';

    for (const table of tables) {
      const garmentType = table.garmentType || 'top';
      const icon = garmentType === 'bottom' ? '👖' : '👕';
      const label = garmentType === 'bottom' ? 'Pants/Bottoms' : 'Top/Jacket';

      try {
        // Get recommendations for this specific table
        const recommendations = await sendMessage({
          type: 'RECOMMEND_REQUEST',
          data: {
            sizeChart: { headers: table.headers, rows: table.rows },
            userMeasurements: userMeasurements,
            garmentType: garmentType,
            baggyMargin: userSettings.baggyMargin || { type: 'size', value: 1 },
          },
        });

        console.log(`[RepMate] ${label} recommendations:`, recommendations);

        // Build HTML for this garment type
        let html = `<div class="garment-recommendation">
          <h3 class="garment-type">${icon} ${label}</h3>
          <div class="fit-cards">`;

        if (recommendations.success && recommendations.rightFit) {
          html += `
            <div class="fit-card right-fit">
              <div class="fit-label">Right Fit</div>
              <div class="fit-size">${recommendations.rightFit.size}</div>
              <div class="fit-detail">${Math.round(recommendations.rightFit.confidence * 100)}% match</div>
            </div>`;
        } else {
          html += `
            <div class="fit-card right-fit">
              <div class="fit-label">Right Fit</div>
              <div class="fit-size">N/A</div>
              <div class="fit-detail">Could not determine</div>
            </div>`;
        }

        if (recommendations.success && recommendations.baggyFit) {
          html += `
            <div class="fit-card baggy-fit">
              <div class="fit-label">Baggy Fit</div>
              <div class="fit-size">${recommendations.baggyFit.size}</div>
              <div class="fit-detail">${Math.round(recommendations.baggyFit.confidence * 100)}% match</div>
            </div>`;
        } else {
          html += `
            <div class="fit-card baggy-fit">
              <div class="fit-label">Baggy Fit</div>
              <div class="fit-size">N/A</div>
              <div class="fit-detail">Could not determine</div>
            </div>`;
        }

        html += `</div></div>`;
        recommendationsContainer.innerHTML += html;

      } catch (error) {
        console.error(`Error getting ${label} recommendations:`, error);
        recommendationsContainer.innerHTML += `
          <div class="garment-recommendation">
            <h3 class="garment-type">${icon} ${label}</h3>
            <div class="fit-cards">
              <div class="fit-card right-fit">
                <div class="fit-label">Right Fit</div>
                <div class="fit-size">?</div>
                <div class="fit-detail">${error.message}</div>
              </div>
            </div>
          </div>`;
      }
    }
  } else {
    // Single table - use original display
    singleRecommendation.classList.remove('hidden');
    recommendationsContainer.innerHTML = '';

    try {
      console.log('[RepMate] Getting recommendations...');
      const recommendations = await sendMessage({
        type: 'RECOMMEND_REQUEST',
        data: {
          sizeChart: ocrResult.structured,
          userMeasurements: userMeasurements,
          garmentType: ocrResult.structured.garmentType || 'top',
          baggyMargin: userSettings.baggyMargin || { type: 'size', value: 1 },
        },
      });
      console.log('[RepMate] Recommendations:', recommendations);

      if (recommendations.success) {
        if (recommendations.rightFit) {
          rightFitSize.textContent = recommendations.rightFit.size;
          rightFitDetail.textContent = `${Math.round(recommendations.rightFit.confidence * 100)}% match`;
        } else {
          rightFitSize.textContent = 'N/A';
          rightFitDetail.textContent = 'Could not determine';
        }

        if (recommendations.baggyFit) {
          baggyFitSize.textContent = recommendations.baggyFit.size;
          baggyFitDetail.textContent = `${Math.round(recommendations.baggyFit.confidence * 100)}% match`;
        } else {
          baggyFitSize.textContent = 'N/A';
          baggyFitDetail.textContent = 'Could not determine';
        }

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
  }

  resultsSection.classList.remove('hidden');
}

/**
 * Build size chart table from OCR structured data
 * Supports multiple tables for combined top+bottom size guides
 */
function buildSizeChartFromOCR(structured) {
  const container = document.getElementById('sizeChartTable');

  // Check for multiple tables first
  if (structured.tables && structured.tables.length > 0) {
    let html = '';

    structured.tables.forEach((table, index) => {
      const garmentLabel = table.garmentType === 'bottom' ? 'Pants/Bottoms' : 'Top/Jacket';
      const icon = table.garmentType === 'bottom' ? '👖' : '👕';

      html += `<div class="table-section">`;
      html += `<h4>${icon} ${garmentLabel}</h4>`;

      // Get all keys from this table's rows
      const allKeys = new Set();
      table.rows.forEach(row => {
        Object.keys(row).forEach(key => allKeys.add(key));
      });
      const keys = Array.from(allKeys);

      html += '<table><tr>';
      keys.forEach(key => {
        html += `<th>${formatMeasurementName(key)}</th>`;
      });
      html += '</tr>';

      table.rows.forEach(row => {
        html += '<tr>';
        keys.forEach(key => {
          html += `<td>${row[key] !== undefined ? row[key] : '-'}</td>`;
        });
        html += '</tr>';
      });

      html += '</table></div>';
    });

    container.innerHTML = html;
    return;
  }

  // Fallback to single table display
  if (!structured.rows || structured.rows.length === 0) {
    container.innerHTML = '<p>No structured size data detected</p>';
    return;
  }

  // Get all keys from the rows
  const allKeys = new Set();
  structured.rows.forEach(row => {
    Object.keys(row).forEach(key => allKeys.add(key));
  });
  const keys = Array.from(allKeys);

  let html = '<table><tr>';
  keys.forEach(key => {
    html += `<th>${formatMeasurementName(key)}</th>`;
  });
  html += '</tr>';

  structured.rows.forEach(row => {
    html += '<tr>';
    keys.forEach(key => {
      html += `<td>${row[key] !== undefined ? row[key] : '-'}</td>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  container.innerHTML = html;
}

/**
 * Format measurement key names for display
 */
function formatMeasurementName(key) {
  const nameMap = {
    'size': 'Size',
    'length': 'Length',
    'pantsLength': 'Pants Length',
    'chest': 'Chest',
    'shoulder': 'Shoulder',
    'sleeve': 'Sleeve',
    'waist': 'Waist',
    'hip': 'Hip',
    'thigh': 'Thigh',
    'legOpening': 'Leg Opening',
    'inseam': 'Inseam',
    'hem': 'Hem',
  };
  return nameMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
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

/**
 * Prioritize images that are likely to be size guides
 * Returns all images sorted by likelihood (most likely first)
 */
function prioritizeImagesForSizeGuide(images) {
  // Keywords that suggest an image might be a size guide
  const sizeGuideKeywords = [
    'size', 'sizing', 'chart', 'guide', 'measure', 'dimension',
    '尺码', '尺寸', '码数', '测量', '身高', '体重', // Chinese size terms
    'cm', 'inch', 'measurement'
  ];

  // Score each image based on likelihood of being a size guide
  const scoredImages = images.map(img => {
    let score = 0;
    const urlLower = img.src.toLowerCase();

    // Check URL for size-related keywords
    sizeGuideKeywords.forEach(keyword => {
      if (urlLower.includes(keyword.toLowerCase())) {
        score += 10;
      }
    });

    // Size guides are often later in the image list (after product photos)
    // Give slight preference to images in the middle/end
    const positionBonus = images.indexOf(img) / images.length * 2;
    score += positionBonus;

    // Size guide images often have specific aspect ratios (taller than wide, or very wide)
    if (img.width && img.height) {
      const aspectRatio = img.width / img.height;
      // Charts are often wide (aspect > 1.5) or tall (aspect < 0.7)
      if (aspectRatio > 1.5 || aspectRatio < 0.7) {
        score += 3;
      }
    }

    return { ...img, score };
  });

  // Sort by score descending (most likely size guides first)
  scoredImages.sort((a, b) => b.score - a.score);

  console.log('[RepMate] Image scores:', scoredImages.map(img => ({
    src: img.src.substring(img.src.lastIndexOf('/') + 1),
    score: img.score.toFixed(1)
  })));

  return scoredImages;
}
