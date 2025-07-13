// popup.js
const defaultProfile = {
  name: "", email: "", profession: "", about: "",
  company: "", phone: "", street: "", city: "", state: "", zip: "", country: "",
  linkedin: "", github: "", portfolio: "", resume: "", coverLetter: ""
};

document.addEventListener('DOMContentLoaded', () => {
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');
  const settingsToggle = document.getElementById('settings-toggle');
  const backBtn = document.getElementById('back-btn');
  const apiKeyInput = document.getElementById('api-key');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const autofillBtn = document.getElementById('autofill-btn');
  const undoBtn = document.getElementById('undo-btn');
  const spinner = document.getElementById('spinner');
  const previewOverlay = document.getElementById('preview-overlay');
  const previewList = document.getElementById('preview-list');
  const confirmFillBtn = document.getElementById('confirm-fill-btn');
  const cancelPreviewBtn = document.getElementById('cancel-preview-btn');
  const statusDiv = document.getElementById('status');
  const profileStatusDiv = document.getElementById('profile-status');
  const expandProfileBtn = document.getElementById('expand-profile-btn');

  // Profile input fields
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const professionInput = document.getElementById('profession');
  const aboutInput = document.getElementById('about');

  let userProfile = { ...defaultProfile };
  let isSettingsVisible = false;
  let lastFrameIds = [];

  // Load data from storage
  function loadData() {
    chrome.storage.local.get(['userProfile', 'apiKey'], (result) => {
      if (result.userProfile) {
        userProfile = { ...defaultProfile, ...result.userProfile };
        updateProfileDisplay();
        populateProfileInputs();
      }
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
    });
  }

  // Update profile status display
  function updateProfileDisplay() {
    const name = userProfile.name || 'Not set';
    const email = userProfile.email ? ` (${userProfile.email})` : '';
    profileStatusDiv.textContent = `Profile: ${name}${email}`;
  }

  // Populate profile input fields
  function populateProfileInputs() {
    if (nameInput) nameInput.value = userProfile.name || '';
    if (emailInput) emailInput.value = userProfile.email || '';
    if (phoneInput) phoneInput.value = userProfile.phone || '';
    if (professionInput) professionInput.value = userProfile.profession || '';
    if (aboutInput) aboutInput.value = userProfile.about || '';
  }

  // Save profile data
  function saveProfile() {
    const updatedProfile = {
      ...userProfile,
      name: nameInput?.value || '',
      email: emailInput?.value || '',
      phone: phoneInput?.value || '',
      profession: professionInput?.value || '',
      about: aboutInput?.value || ''
    };
    
    userProfile = updatedProfile;
    chrome.storage.local.set({ userProfile }, () => {
      updateProfileDisplay();
    });
  }

  // Toggle settings view
  settingsToggle.addEventListener('click', () => {
    isSettingsVisible = true;
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  // Back button
  backBtn.addEventListener('click', () => {
    isSettingsVisible = false;
    mainView.classList.remove('hidden');
    settingsView.classList.add('hidden');
  });

  // Save API key
  saveKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ apiKey }, () => {
        statusDiv.textContent = 'API Key saved!';
        setTimeout(() => statusDiv.textContent = '', 2000);
      });
    } else {
      statusDiv.textContent = 'Please enter a valid API key.';
      setTimeout(() => statusDiv.textContent = '', 2000);
    }
  });

  // Auto-save profile on input changes (debounced)
  let saveTimeout;
  function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveProfile, 500);
  }

  [nameInput, emailInput, phoneInput, professionInput, aboutInput].forEach(input => {
    if (input) {
      input.addEventListener('input', debouncedSave);
    }
  });

  // Expand profile button (opens full options page)
  expandProfileBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

  function showPreview(values, fields) {
    previewList.innerHTML = '';
    fields.forEach(f => {
      const val = values[f.id] || '';
      const item = document.createElement('div');
      item.textContent = `${f.label || f.name || f.id}: ${val}`;
      previewList.appendChild(item);
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'highlight_fields', fieldIds: fields.map(f => f.id) });
      }
    });
    previewOverlay.classList.remove('hidden');
  }

  function hidePreview() {
    previewOverlay.classList.add('hidden');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'clear_highlights' });
      }
    });
  }

  function notify(message) {
    const iconData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO++uLsAAAAASUVORK5CYII=';
    chrome.notifications.create({ type: 'basic', iconUrl: iconData, title: 'SmartFill', message });
  }

  function startAutofill() {
    statusDiv.textContent = 'Scanning form fields...';
    showSpinner();
    statusDiv.textContent = 'Scanning form fields...';

    chrome.storage.local.get(['apiKey'], (result) => {
      const apiKey = result.apiKey;
      if (!apiKey) {
        statusDiv.textContent = 'Please set your Claude API key in settings.';
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          statusDiv.textContent = 'Could not find active tab.';
          return;
        }
        const tabId = tabs[0].id;

        // Scan all frames for forms
        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          const scanPromises = frames.map(frame => {
            return new Promise((resolve) => {
              chrome.tabs.sendMessage(tabId, { action: 'scan_form', frameId: frame.frameId }, { frameId: frame.frameId }, (response) => {
                if (chrome.runtime.lastError || !response) {
                  resolve({ fields: [], pageContext: '', frameId: frame.frameId });
                } else {
                  resolve({ ...response, frameId: frame.frameId });
                }
              });
            });
          });

          Promise.all(scanPromises).then(results => {
            let allFields = [];
            let pageContext = '';

            results.forEach(result => {
              if (result && result.fields && result.fields.length > 0) {
                const fieldsWithFrameId = result.fields.map(field => ({ ...field, frameId: result.frameId }));
                allFields = allFields.concat(fieldsWithFrameId);
              }
              if (result && result.frameId === 0 && result.pageContext) {
                pageContext = result.pageContext;
              }
            });

            if (allFields.length === 0) {
              statusDiv.textContent = 'No fillable fields found on this page.';
              return;
            }

            statusDiv.textContent = `Found ${allFields.length} fields. AI is thinking...`;

            chrome.runtime.sendMessage({
              action: 'get_ai_fills',
              fields: allFields,
              profile: userProfile,
              apiKey: apiKey,
              pageContext: pageContext
            }, (aiResponse) => {
              hideSpinner();
              if (chrome.runtime.lastError || !aiResponse) {
                statusDiv.textContent = `Error: ${chrome.runtime.lastError?.message || 'Unknown error'}`;
                notify(statusDiv.textContent);
                return;
              }
              if (aiResponse.error) {
                statusDiv.textContent = `AI Error: ${aiResponse.error}`;
                notify(statusDiv.textContent);
                return;
              }

              statusDiv.textContent = 'Review fields then confirm.';
              lastFrameIds = Array.from(new Set(allFields.map(f => f.frameId)));
              previewOverlay.dataset.tabId = tabId;
              previewOverlay.dataset.pageContext = pageContext;
              previewOverlay.dataset.apiKey = apiKey;
              previewOverlay.dataset.values = JSON.stringify(aiResponse.values);
              previewOverlay.dataset.fields = JSON.stringify(allFields);
              showPreview(aiResponse.values, allFields);
            });
          });
        });
      });
    });
  }

  autofillBtn.addEventListener('click', startAutofill);

  confirmFillBtn.addEventListener('click', () => {
    hidePreview();
    showSpinner();
    const tabId = parseInt(previewOverlay.dataset.tabId, 10);
    const apiKey = previewOverlay.dataset.apiKey;
    const values = JSON.parse(previewOverlay.dataset.values || '{}');
    const fields = JSON.parse(previewOverlay.dataset.fields || '[]');

    // Group values by frameId
    const valuesByFrame = {};
    fields.forEach(f => {
      if (values[f.id]) {
        if (!valuesByFrame[f.frameId]) { valuesByFrame[f.frameId] = {}; }
        valuesByFrame[f.frameId][f.id] = values[f.id];
      }
    });

    const fillPromises = Object.keys(valuesByFrame).map(frameIdStr => {
      const frameId = parseInt(frameIdStr, 10);
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, {
          action: 'fill_form',
          values: valuesByFrame[frameId]
        }, { frameId }, (fillResp) => {
          if (chrome.runtime.lastError) {
            resolve({ filled: 0, errors: [`Frame ${frameId}: ${chrome.runtime.lastError.message}`] });
          } else if (fillResp) {
            resolve({ ...fillResp, frameId });
          } else {
            resolve({ filled: 0, errors: [`Frame ${frameId}: No response from content script.`] });
          }
        });
      });
    });

    Promise.all(fillPromises).then(results => {
      hideSpinner();
      let totalFilledCount = 0;
      const allErrors = [];
      lastFrameIds = [];
      results.forEach(res => {
        totalFilledCount += res.filled || 0;
        if (res.errors && res.errors.length > 0) {
          allErrors.push(...res.errors);
        }
        if (res.filled > 0) {
          lastFrameIds.push(res.frameId);
        }
      });

      if (allErrors.length > 0) {
        statusDiv.textContent = `Error: ${allErrors[0]}`;
        notify(statusDiv.textContent);
        undoBtn.classList.add('hidden');
      } else {
        statusDiv.textContent = totalFilledCount > 0
          ? `Successfully filled ${totalFilledCount} fields!`
          : 'No fields were filled. Check if the form is compatible.';
        notify(statusDiv.textContent);
        undoBtn.classList.toggle('hidden', totalFilledCount === 0);
      }
    });
  });

  cancelPreviewBtn.addEventListener('click', () => {
    hidePreview();
    statusDiv.textContent = 'Fill cancelled.';
  });

  undoBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      const promises = lastFrameIds.map(frameId => new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'undo_last_fill' }, { frameId }, () => resolve());
      }));
      Promise.all(promises).then(() => {
        statusDiv.textContent = 'Undo complete.';
        notify('Last fill undone');
        undoBtn.classList.add('hidden');
      });
    });
  });

  // Listen for changes from the options page
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.userProfile) {
      userProfile = { ...defaultProfile, ...changes.userProfile.newValue };
      updateProfileDisplay();
      populateProfileInputs();
    }
  });

  // Initialize
  loadData();

  chrome.storage.local.get('autoFillTrigger', (res) => {
    if (res.autoFillTrigger) {
      chrome.storage.local.remove('autoFillTrigger');
      startAutofill();
    }
  });
});
