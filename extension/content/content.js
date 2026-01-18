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
   * Checks multiple sources for lazy-loaded images
   */
  function getPageImages() {
    const images = document.querySelectorAll('img');
    const yupooImages = [];
    const seenUrls = new Set();

    console.log(`[RepMate] Total <img> elements on page: ${images.length}`);

    images.forEach(img => {
      // Check multiple possible image sources (for lazy loading)
      const possibleSources = [
        img.src,
        img.dataset.src,
        img.dataset.originSrc,
        img.dataset.original,
        img.dataset.lazySrc,
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'),
      ].filter(Boolean);

      for (let src of possibleSources) {
        // Only include Yupoo product photos (not logos, icons, etc.)
        if (src.includes('photo.yupoo.com') && !seenUrls.has(src)) {
          // Skip tiny images (but be more lenient - some size guides start small)
          const width = img.naturalWidth || img.offsetWidth || 200;
          const height = img.naturalHeight || img.offsetHeight || 200;

          // Convert thumbnail URLs to full-resolution URLs
          // This matches what the Python script does for better OCR accuracy
          src = src.replace(/\/(small|thumb|square|medium)\./gi, '/big.');
          src = src.replace(/_small\.|_thumb\.|_min\./gi, '.');

          // Deduplicate by normalized URL
          if (!seenUrls.has(src)) {
            seenUrls.add(src);
            yupooImages.push({
              src: src,
              width: width,
              height: height,
            });
          }
        }
      }
    });

    // Also check for images in anchor tags that might link to full images
    const anchors = document.querySelectorAll('a[href*="photo.yupoo.com"]');
    anchors.forEach(anchor => {
      let src = anchor.href;
      if (src.includes('photo.yupoo.com') && !seenUrls.has(src)) {
        // Convert to big version
        src = src.replace(/\/(small|thumb|square|medium)\./gi, '/big.');
        src = src.replace(/_small\.|_thumb\.|_min\./gi, '.');

        if (!seenUrls.has(src)) {
          seenUrls.add(src);
          yupooImages.push({
            src: src,
            width: 800, // Assume reasonable size for linked images
            height: 800,
          });
        }
      }
    });

    console.log(`[RepMate] Found ${yupooImages.length} unique Yupoo images`);
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
