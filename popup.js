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
  const themeToggle = document.getElementById('theme-toggle');
  const backBtn = document.getElementById('back-btn');
  const apiKeyInput = document.getElementById('api-key');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const autofillBtn = document.getElementById('autofill-btn');
  const statusDiv = document.getElementById('status');
  const profileStatusDiv = document.getElementById('profile-status');
  const expandProfileBtn = document.getElementById('expand-profile-btn');

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
  }

  // Profile input fields
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const professionInput = document.getElementById('profession');
  const aboutInput = document.getElementById('about');

  let userProfile = { ...defaultProfile };
  let isSettingsVisible = false;

  // Load data from storage
  function loadData() {
    chrome.storage.local.get(['userProfile', 'apiKey', 'theme'], (result) => {
      if (result.userProfile) {
        userProfile = { ...defaultProfile, ...result.userProfile };
        updateProfileDisplay();
        populateProfileInputs();
      }
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
      if (result.theme) {
        applyTheme(result.theme);
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

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    const newTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.local.set({ theme: newTheme });
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

  // Main autofill functionality
  autofillBtn.addEventListener('click', () => {
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
              if (chrome.runtime.lastError || !aiResponse) {
                statusDiv.textContent = `Error: ${chrome.runtime.lastError?.message || 'Unknown error'}`;
                return;
              }
              if (aiResponse.error) {
                statusDiv.textContent = `AI Error: ${aiResponse.error}`;
                return;
              }

              statusDiv.textContent = 'Filling form...';

              // Group values by frameId to send separate fill commands
              const valuesByFrame = {};
              for (const fieldId in aiResponse.values) {
                const field = allFields.find(f => f.id === fieldId);
                if (field) {
                  const frameId = field.frameId;
                  if (!valuesByFrame[frameId]) {
                    valuesByFrame[frameId] = {};
                  }
                  valuesByFrame[frameId][fieldId] = aiResponse.values[fieldId];
                }
              }

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
                      resolve(fillResp); // Resolve with the whole {filled, errors} object
                    } else {
                      resolve({ filled: 0, errors: [`Frame ${frameId}: No response from content script.`] });
                    }
                  });
                });
              });

              Promise.all(fillPromises).then((results) => {
                let totalFilledCount = 0;
                const allErrors = [];
                results.forEach(res => {
                  totalFilledCount += res.filled || 0;
                  if (res.errors && res.errors.length > 0) {
                    allErrors.push(...res.errors);
                  }
                });

                if (allErrors.length > 0) {
                  statusDiv.textContent = `Error: ${allErrors[0]}`;
                } else {
                  statusDiv.textContent = totalFilledCount > 0
                    ? `Successfully filled ${totalFilledCount} fields!`
                    : 'No fields were filled. Check if the form is compatible.';
                }
              });
            });
          });
        });
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
    if (changes.theme) {
      applyTheme(changes.theme.newValue);
    }
  });

  // Initialize
  loadData();
});
