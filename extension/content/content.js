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
    // Skip tiny images
    if (img.naturalWidth < 200 || img.naturalHeight < 150) return;

    // Skip already processed
    if (img.dataset.repmateChecked) return;
    img.dataset.repmateChecked = 'true';

    // Check image URL/alt for size-related keywords
    const src = img.src || img.dataset.src || '';
    const alt = img.alt || '';
    const combined = (src + alt).toLowerCase();

    // Size guide images on Yupoo are often in PNG format or have certain URL patterns
    const mightBeSizeGuide = combined.includes('size') ||
      combined.includes('chart') ||
      combined.includes('guide') ||
      src.includes('.png') ||
      src.includes('photo.yupoo.com');

    if (mightBeSizeGuide || true) { // For now, add button to all large images
      addScanButton(img);
    }
  }

  /**
   * Add scan button to an image
   */
  function addScanButton(img) {
    // Skip if already has button
    if (img.parentElement.querySelector('.repmate-scan-btn')) return;

    // Create wrapper if needed
    let wrapper = img.parentElement;
    if (wrapper.tagName !== 'DIV' || !wrapper.classList.contains('repmate-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'repmate-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      img.parentElement.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }

    // Create scan button
    const btn = document.createElement('button');
    btn.className = 'repmate-scan-btn';
    btn.innerHTML = '📏 Check Size';
    btn.title = 'Analyze this size chart with RepMate';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      analyzeImage(img, btn);
    });

    wrapper.appendChild(btn);
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

      if (!imageUrl) {
        throw new Error('Could not get image URL');
      }

      // Send to OCR API
      const ocrResult = await sendMessage({
        type: 'OCR_REQUEST',
        data: { imageUrl },
      });

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

})();
