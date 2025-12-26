/**
 * RepMate Content Script
 * Scans Yupoo pages for images and communicates with popup
 */

(function() {
  'use strict';

  console.log('[RepMate] Content script loaded');

  /**
   * Get all potential size guide images from the page
   */
  function getPageImages() {
    const images = document.querySelectorAll('img');
    const yupooImages = [];

    images.forEach(img => {
      const src = img.src || img.dataset.src || img.dataset.originSrc || '';

      // Only include Yupoo product photos (not logos, icons, etc.)
      if (src.includes('photo.yupoo.com')) {
        // Skip tiny images
        const width = img.naturalWidth || img.offsetWidth || 0;
        const height = img.naturalHeight || img.offsetHeight || 0;

        if (width >= 100 && height >= 100) {
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
