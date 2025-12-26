/**
 * RepMate Content Script
 * Runs on Yupoo pages to detect size guides and show recommendations
 */

(function() {
  'use strict';

  // State
  let userMeasurements = null;
  let userSettings = null;
  let overlay = null;
  let sizeGuideDetected = false;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * Initialize the content script
   */
  function init() {
    console.log('[RepMate] Initializing on Yupoo page');

    // Load user measurements
    loadUserData();

    // Observe for dynamically loaded images
    observeImages();

    // Initial scan for size guide images
    setTimeout(scanForSizeGuides, 1000);
  }

  /**
   * Load user measurements and settings
   */
  function loadUserData() {
    chrome.runtime.sendMessage({ type: 'GET_MEASUREMENTS' }, (response) => {
      if (response) {
        userMeasurements = response.measurements || {};
        userSettings = response.settings || { baggyMargin: { type: 'size', value: 1 } };
        console.log('[RepMate] User data loaded', userMeasurements);
      }
    });
  }

  /**
   * Observe for dynamically loaded images
   */
  function observeImages() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'IMG') {
              checkImage(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(checkImage);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Scan page for size guide images
   */
  function scanForSizeGuides() {
    const images = document.querySelectorAll('img');
    console.log(`[RepMate] Scanning ${images.length} images`);

    images.forEach(checkImage);
  }

  /**
   * Check if an image might be a size guide
   */
  function checkImage(img) {
    // Skip already processed
    if (img.dataset.repmateChecked) return;
    img.dataset.repmateChecked = 'true';

    // Check image URL for Yupoo photo URLs
    const src = img.src || img.dataset.src || img.dataset.originSrc || '';

    // Only process Yupoo product images
    if (!src.includes('photo.yupoo.com') && !src.includes('yupoo.com')) {
      return;
    }

    // Wait for image to load before adding button
    if (img.complete && img.naturalWidth > 0) {
      tryAddButton(img, src);
    } else {
      img.addEventListener('load', () => tryAddButton(img, src), { once: true });
    }
  }

  /**
   * Try to add button once image is ready
   */
  function tryAddButton(img, src) {
    const displayWidth = img.offsetWidth || img.clientWidth || img.naturalWidth;
    const displayHeight = img.offsetHeight || img.clientHeight || img.naturalHeight;

    console.log('[RepMate] Image size:', displayWidth, 'x', displayHeight, 'src:', src.substring(0, 50));

    // Skip tiny images (thumbnails, icons)
    if (displayWidth < 100 || displayHeight < 100) {
      console.log('[RepMate] Skipping small image');
      return;
    }

    console.log('[RepMate] Adding button to image:', src.substring(0, 60));
    addScanButton(img);
  }

  /**
   * Add scan button to an image
   */
  function addScanButton(img) {
    // Skip if already has button
    if (img.dataset.repmateButtonAdded) return;
    img.dataset.repmateButtonAdded = 'true';

    // Create button
    const btn = document.createElement('button');
    btn.className = 'repmate-scan-btn';
    btn.innerHTML = '📏';
    btn.title = 'Analyze this size chart with RepMate';

    // Function to position button
    function positionButton() {
      const rect = img.getBoundingClientRect();

      // Only show if image is in viewport and has size
      if (rect.width < 50 || rect.height < 50 || rect.bottom < 0 || rect.top > window.innerHeight) {
        btn.style.display = 'none';
        return;
      }

      btn.style.cssText = `
        position: fixed !important;
        top: ${rect.top + 8}px !important;
        left: ${rect.right - 45}px !important;
        z-index: 2147483647 !important;
        padding: 8px 12px !important;
        background: #007AFF !important;
        color: white !important;
        border: none !important;
        border-radius: 8px !important;
        font-size: 16px !important;
        cursor: pointer !important;
        box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      `;
    }

    // Initial position
    positionButton();
    document.body.appendChild(btn);
    console.log('[RepMate] Button created and appended to body');

    // Update position on scroll/resize
    let scrollTimeout;
    const updatePosition = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(positionButton, 10);
    };
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      analyzeImage(img, btn);
    });
  }

  /**
   * Analyze an image for size guide data
   */
  async function analyzeImage(img, btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Analyzing...';
    btn.disabled = true;

    try {
      // Get image URL
      const imageUrl = img.src || img.dataset.src;
      console.log('[RepMate] Analyzing image:', imageUrl);

      if (!imageUrl) {
        throw new Error('Could not get image URL');
      }

      // Send to OCR API
      console.log('[RepMate] Sending OCR request...');
      const ocrResult = await sendMessage({
        type: 'OCR_REQUEST',
        data: { imageUrl },
      });
      console.log('[RepMate] OCR result:', ocrResult);

      if (!ocrResult.success) {
        throw new Error(ocrResult.error || 'OCR failed');
      }

      if (!ocrResult.isSizeGuide) {
        showNotification('This doesn\'t appear to be a size guide', 'warning');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
      }

      // Check if user has measurements
      if (!userMeasurements || Object.keys(userMeasurements).length === 0) {
        showNotification('Please set your measurements in the RepMate popup first', 'warning');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
      }

      // Get recommendations
      const recommendations = await sendMessage({
        type: 'RECOMMEND_REQUEST',
        data: {
          sizeChart: ocrResult.structured,
          userMeasurements,
          garmentType: ocrResult.structured.garmentType || 'top',
          baggyMargin: userSettings.baggyMargin,
        },
      });

      if (!recommendations.success) {
        throw new Error(recommendations.error || 'Recommendation failed');
      }

      // Show overlay with results
      showOverlay(img, ocrResult, recommendations);

      btn.innerHTML = '✅ Done';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('[RepMate] Error:', error);
      showNotification(`Error: ${error.message}`, 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Show results overlay
   */
  function showOverlay(img, ocrResult, recommendations) {
    // Remove existing overlay
    if (overlay) {
      overlay.remove();
    }

    overlay = document.createElement('div');
    overlay.className = 'repmate-overlay';

    const rightFit = recommendations.rightFit;
    const baggyFit = recommendations.baggyFit;

    overlay.innerHTML = `
      <div class="repmate-overlay-content">
        <button class="repmate-close">&times;</button>
        <h3>📏 RepMate Size Recommendation</h3>

        <div class="repmate-results">
          <div class="repmate-fit-card right">
            <div class="fit-label">Right Fit</div>
            <div class="fit-size">${rightFit ? rightFit.size : 'N/A'}</div>
            <div class="fit-confidence">${rightFit ? Math.round(rightFit.confidence * 100) + '% match' : ''}</div>
            ${rightFit && rightFit.notes.length ? `<div class="fit-notes">${rightFit.notes.join(', ')}</div>` : ''}
          </div>

          <div class="repmate-fit-card baggy">
            <div class="fit-label">Baggy Fit</div>
            <div class="fit-size">${baggyFit ? baggyFit.size : 'N/A'}</div>
            <div class="fit-confidence">${baggyFit ? Math.round(baggyFit.confidence * 100) + '% match' : ''}</div>
          </div>
        </div>

        <div class="repmate-details">
          <details>
            <summary>View all sizes</summary>
            <table>
              <tr>
                <th>Size</th>
                <th>Fit</th>
                <th>Score</th>
              </tr>
              ${recommendations.allSizes.map(s => `
                <tr class="${s.fit}">
                  <td>${s.size}</td>
                  <td>${s.fit}</td>
                  <td>${Math.round(s.score * 100)}%</td>
                </tr>
              `).join('')}
            </table>
          </details>

          <details>
            <summary>Translated size chart</summary>
            <pre>${ocrResult.translatedText || 'N/A'}</pre>
          </details>
        </div>
      </div>
    `;

    // Close button handler
    overlay.querySelector('.repmate-close').addEventListener('click', () => {
      overlay.remove();
      overlay = null;
    });

    // Close on click outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        overlay = null;
      }
    });

    document.body.appendChild(overlay);
  }

  /**
   * Show notification toast
   */
  function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `repmate-toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Send message to background script
   */
  function sendMessage(message) {
    console.log('[RepMate] Sending message to background:', message.type);
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        console.log('[RepMate] Got response from background:', response);
        if (chrome.runtime.lastError) {
          console.error('[RepMate] Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

})();
