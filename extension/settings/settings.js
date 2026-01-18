/**
 * RepMate Settings Page
 * Manages user measurements and preferences
 */

(function() {
  'use strict';

  // DOM Elements
  const backBtn = document.getElementById('backBtn');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Measurement inputs
  const chestInput = document.getElementById('chest');
  const shoulderInput = document.getElementById('shoulder');
  const sleeveInput = document.getElementById('sleeve');
  const topLengthInput = document.getElementById('topLength');
  const waistInput = document.getElementById('waist');
  const hipInput = document.getElementById('hip');
  const inseamInput = document.getElementById('inseam');
  const thighInput = document.getElementById('thigh');
  const heightInput = document.getElementById('height');
  const weightInput = document.getElementById('weight');

  // Baggy fit settings
  const baggyTypeSelect = document.getElementById('baggyType');
  const baggyValueInput = document.getElementById('baggyValue');
  const baggyUnitSpan = document.getElementById('baggyUnit');

  /**
   * Load saved settings from chrome.storage.local
   */
  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get([
        'userMeasurements',
        'baggySettings'
      ]);

      // Load measurements
      if (data.userMeasurements) {
        const m = data.userMeasurements;
        if (m.chest) chestInput.value = m.chest;
        if (m.shoulder) shoulderInput.value = m.shoulder;
        if (m.sleeve) sleeveInput.value = m.sleeve;
        if (m.topLength) topLengthInput.value = m.topLength;
        if (m.waist) waistInput.value = m.waist;
        if (m.hip) hipInput.value = m.hip;
        if (m.inseam) inseamInput.value = m.inseam;
        if (m.thigh) thighInput.value = m.thigh;
        if (m.height) heightInput.value = m.height;
        if (m.weight) weightInput.value = m.weight;
      }

      // Load baggy settings
      if (data.baggySettings) {
        baggyTypeSelect.value = data.baggySettings.type || 'size';
        baggyValueInput.value = data.baggySettings.value || 1;
        updateBaggyUnit();
      }
    } catch (error) {
      console.error('[RepMate Settings] Error loading settings:', error);
    }
  }

  /**
   * Save settings to chrome.storage.local
   */
  async function saveSettings() {
    try {
      const measurements = {
        chest: parseFloat(chestInput.value) || null,
        shoulder: parseFloat(shoulderInput.value) || null,
        sleeve: parseFloat(sleeveInput.value) || null,
        topLength: parseFloat(topLengthInput.value) || null,
        waist: parseFloat(waistInput.value) || null,
        hip: parseFloat(hipInput.value) || null,
        inseam: parseFloat(inseamInput.value) || null,
        thigh: parseFloat(thighInput.value) || null,
        height: parseFloat(heightInput.value) || null,
        weight: parseFloat(weightInput.value) || null
      };

      const baggySettings = {
        type: baggyTypeSelect.value,
        value: parseFloat(baggyValueInput.value) || 1
      };

      await chrome.storage.local.set({
        userMeasurements: measurements,
        baggySettings: baggySettings
      });

      showStatus('Settings saved!', 'success');
    } catch (error) {
      console.error('[RepMate Settings] Error saving settings:', error);
      showStatus('Error saving settings', 'error');
    }
  }

  /**
   * Show status message
   */
  function showStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;

    // Clear after 3 seconds
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 3000);
  }

  /**
   * Update baggy unit label based on selected type
   */
  function updateBaggyUnit() {
    const type = baggyTypeSelect.value;
    switch (type) {
      case 'size':
        baggyUnitSpan.textContent = 'size(s)';
        baggyValueInput.min = 1;
        baggyValueInput.max = 5;
        baggyValueInput.step = 1;
        break;
      case 'cm':
        baggyUnitSpan.textContent = 'cm';
        baggyValueInput.min = 1;
        baggyValueInput.max = 20;
        baggyValueInput.step = 1;
        break;
      case 'percent':
        baggyUnitSpan.textContent = '%';
        baggyValueInput.min = 5;
        baggyValueInput.max = 30;
        baggyValueInput.step = 5;
        break;
    }
  }

  /**
   * Go back to popup (close settings tab)
   */
  function goBack() {
    window.close();
  }

  // Event Listeners
  backBtn.addEventListener('click', goBack);
  saveBtn.addEventListener('click', saveSettings);
  baggyTypeSelect.addEventListener('change', updateBaggyUnit);

  // Load settings on page load
  loadSettings();

})();
