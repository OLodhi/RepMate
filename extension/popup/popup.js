/**
 * RepMate Popup Script
 * Handles user measurement input and settings
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initBaggySettings();
  loadSavedData();
  initSaveButton();
});

/**
 * Initialize tab switching
 */
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active to clicked
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
        baggyValue.min = '1';
        baggyValue.max = '3';
        baggyValue.step = '1';
        baggyUnit.textContent = 'size(s)';
        break;
      case 'cm':
        baggyValue.value = '5';
        baggyValue.min = '1';
        baggyValue.max = '20';
        baggyValue.step = '1';
        baggyUnit.textContent = 'cm';
        break;
      case 'percent':
        baggyValue.value = '10';
        baggyValue.min = '5';
        baggyValue.max = '30';
        baggyValue.step = '5';
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
      const m = response.measurements;

      // Tops
      if (m.chest) document.getElementById('chest').value = m.chest;
      if (m.shoulder) document.getElementById('shoulder').value = m.shoulder;
      if (m.sleeve) document.getElementById('sleeve').value = m.sleeve;
      if (m.topLength) document.getElementById('topLength').value = m.topLength;

      // Bottoms
      if (m.waist) document.getElementById('waist').value = m.waist;
      if (m.hip) document.getElementById('hip').value = m.hip;
      if (m.inseam) document.getElementById('inseam').value = m.inseam;
      if (m.thigh) document.getElementById('thigh').value = m.thigh;

      // General
      if (m.height) document.getElementById('height').value = m.height;
      if (m.weight) document.getElementById('weight').value = m.weight;
    }

    if (response && response.settings) {
      const s = response.settings;

      if (s.baggyMargin) {
        document.getElementById('baggyType').value = s.baggyMargin.type;
        document.getElementById('baggyValue').value = s.baggyMargin.value;

        // Update unit label
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
  const status = document.getElementById('status');

  saveBtn.addEventListener('click', () => {
    // Collect measurements
    const measurements = {
      // Tops
      chest: parseFloatOrNull(document.getElementById('chest').value),
      shoulder: parseFloatOrNull(document.getElementById('shoulder').value),
      sleeve: parseFloatOrNull(document.getElementById('sleeve').value),
      topLength: parseFloatOrNull(document.getElementById('topLength').value),

      // Bottoms
      waist: parseFloatOrNull(document.getElementById('waist').value),
      hip: parseFloatOrNull(document.getElementById('hip').value),
      inseam: parseFloatOrNull(document.getElementById('inseam').value),
      thigh: parseFloatOrNull(document.getElementById('thigh').value),

      // General
      height: parseFloatOrNull(document.getElementById('height').value),
      weight: parseFloatOrNull(document.getElementById('weight').value),
    };

    // Clean null values
    Object.keys(measurements).forEach(key => {
      if (measurements[key] === null) delete measurements[key];
    });

    // Collect settings
    const settings = {
      baggyMargin: {
        type: document.getElementById('baggyType').value,
        value: parseInt(document.getElementById('baggyValue').value, 10),
      },
      unit: 'cm',
    };

    // Save to storage
    chrome.runtime.sendMessage({
      type: 'SAVE_MEASUREMENTS',
      data: { measurements, settings },
    }, (response) => {
      if (response && response.success) {
        showStatus('Measurements saved!', 'success');
      } else {
        showStatus('Failed to save', 'error');
      }
    });
  });
}

/**
 * Parse float or return null
 */
function parseFloatOrNull(value) {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Show status message
 */
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;

  setTimeout(() => {
    status.className = 'status';
  }, 2000);
}
