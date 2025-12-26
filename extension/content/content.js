/**
 * RepMate Content Script
 * Scans Yupoo pages for images and communicates with popup
 */

(function() {
  'use strict';

  console.log('[RepMate] Content script loaded');

  /**
   * Get all potential size guide images from the page
   * Converts thumbnail URLs to full-resolution URLs (like Python script does)
   */
  function getPageImages() {
    const images = document.querySelectorAll('img');
    const yupooImages = [];

    images.forEach(img => {
      let src = img.src || img.dataset.src || img.dataset.originSrc || '';

      // Only include Yupoo product photos (not logos, icons, etc.)
      if (src.includes('photo.yupoo.com')) {
        // Skip tiny images
        const width = img.naturalWidth || img.offsetWidth || 0;
        const height = img.naturalHeight || img.offsetHeight || 0;

        if (width >= 100 && height >= 100) {
          // Convert thumbnail URLs to full-resolution URLs
          // This matches what the Python script does for better OCR accuracy
          src = src.replace(/\/(small|thumb|square|medium)\./gi, '/big.');
          src = src.replace(/_small\.|_thumb\.|_min\./gi, '.');

          yupooImages.push({
            src: src,
            width: width,
            height: height,
          });
        }
      }
    });

    console.log(`[RepMate] Found ${yupooImages.length} Yupoo images`);
    return yupooImages;
  }

  /**
   * Get page info
   */
  function getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      isYupoo: window.location.hostname.includes('yupoo.com'),
    };
  }

  /**
   * Listen for messages from popup
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[RepMate] Content received message:', message.type);

    if (message.type === 'GET_PAGE_INFO') {
      sendResponse(getPageInfo());
      return true;
    }

    if (message.type === 'GET_PAGE_IMAGES') {
      sendResponse(getPageImages());
      return true;
    }

    return false;
  });

})();
