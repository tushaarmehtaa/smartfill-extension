class EditorialSmartFill {
    constructor() {
        // DOM Elements
        this.container = document.getElementById('container');
        this.description = document.getElementById('description');
        this.fillButton = document.getElementById('fillButton');
        this.notification = document.getElementById('notification');
        this.profileName = document.getElementById('profile-name');
        this.profileInitial = document.getElementById('profile-initial');

        // UI States
        this.states = {
            ready: {
                description: 'You chill. We fill.',
                buttonText: "LET'S FILL IT UP."
            },
            analyzing: {
                description: 'scanning the page for forms...',
                buttonText: 'scanning...'
            },
            understanding: {
                description: 'matching your info to the fields...',
                buttonText: 'processing...'
            },
            filling: {
                description: 'filling it up for you...',
                buttonText: 'filling...'
            }
        };

        // Stored Data
        this.userProfile = null;
        this.apiKey = null;

        // Initial Setup
        this.fillButton.disabled = true; // Disable button until data is loaded
        this.initializeEventListeners();
        this.loadInitialData();
    }

    initializeEventListeners() {
        this.fillButton.addEventListener('click', () => this.handleSmartFill());
        document.getElementById('settingsLink').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });
        // Feature links
        document.getElementById('previewLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showPreviewModal();
        });
        document.getElementById('undoLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showUndoModal();
        });
        document.getElementById('historyLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHistoryModal();
        });

        // Modal event listeners
        this.initializeModalListeners();
    }

    // Load and store profile and API key once when the popup opens.
    async loadInitialData() {
        try {
            const { userProfile, apiKey } = await chrome.storage.local.get(['userProfile', 'apiKey']);
            this.userProfile = userProfile;
            this.apiKey = apiKey;

            if (this.userProfile && this.userProfile.name) {
                this.profileName.textContent = this.userProfile.name;
                this.profileInitial.textContent = this.userProfile.name.charAt(0).toUpperCase();
            } else {
                this.profileName.textContent = 'Profile Not Set';
                this.profileInitial.textContent = '?';
            }
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showNotification('Could not load settings.', 'error');
        } finally {
            // This ensures the UI is always reset, even if loading fails.
            this.resetToReady();
        }
    }

    // Main function to orchestrate the autofill process.
    async handleSmartFill() {
        // 1. Use the data loaded at initialization.
        const { userProfile, apiKey } = this;

        // 2. Validate data before proceeding.
        if (!apiKey) {
            this.showNotification('API Key is not set. Please go to settings.', 'error');
            return chrome.runtime.openOptionsPage();
        }
        if (!userProfile || !userProfile.name) {
            this.showNotification('User profile is empty. Please complete it in settings.', 'error');
            return chrome.runtime.openOptionsPage();
        }

        try {
            // 3. Scan for fields.
            this.setState('analyzing');
            const allFields = await this.scanAllFramesForForms();
            if (allFields.length === 0) {
                this.showNotification('No fillable fields were found on this page.', 'info');
                return this.resetToReady();
            }

            // 4. Process with AI.
            this.setState('understanding');
            const aiResponse = await this.processWithAI(allFields, userProfile, apiKey);
            if (aiResponse.error) throw new Error(aiResponse.error);
            if (!aiResponse.values || Object.keys(aiResponse.values).length === 0) {
                this.showNotification('The AI did not provide any values to fill.', 'info');
                return this.resetToReady();
            }

            // 5. Convert AI response to array format expected by content script.
            const valuesArray = Object.entries(aiResponse.values).map(([id, value]) => ({ id, value }));
            console.log('🔄 Converted AI values to array format:', valuesArray);
            
            // 6. Fill the form.
            this.setState('filling');
            const fillResult = await this.fillAllFrames(valuesArray, allFields);
            
            // 7. Save to history for undo functionality
            if (fillResult.totalFilledCount > 0) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                await this.saveToHistory(tab.url, fillResult.totalFilledCount, allFields);
            }
            
            this.showNotification(`Form completed. ${fillResult.totalFilledCount} fields filled.`, 'success');
            this.resetToReady();

        } catch (error) {
            console.error('SmartFill Error:', error);
            this.showNotification(error.message || 'An unknown error occurred.', 'error');
            this.resetToReady();
        }
    }

    // Communicates with content scripts to find all form fields.
    async scanAllFramesForForms() {
        console.log('🔍 Starting form scan...');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('📄 Active tab:', tab.url);
        
        try {
            const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
            console.log('🖼️ Found frames:', frames.length);
            
            const scanPromises = frames.map(async (frame, index) => {
                try {
                    console.log(`📨 Injecting content script into frame ${index} (ID: ${frame.frameId})`);
                    
                    // Inject the content script programmatically
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id, frameIds: [frame.frameId] },
                        files: ['content.js']
                    });
                    
                    console.log(`✅ Content script injected into frame ${index}`);
                    
                    // Now send the scan message
                    return new Promise(resolve => {
                        console.log(`📨 Sending scan message to frame ${index}`);
                        chrome.tabs.sendMessage(tab.id, { action: 'scan_form' }, { frameId: frame.frameId }, response => {
                            if (chrome.runtime.lastError) {
                                console.log(`❌ Frame ${index} message error:`, chrome.runtime.lastError.message);
                                return resolve([]);
                            }
                            console.log(`✅ Frame ${index} response:`, response);
                            if (!response || !response.fields) {
                                console.log(`⚠️ Frame ${index} returned invalid response`);
                                return resolve([]);
                            }
                            const fieldsWithFrameId = response.fields.map(f => ({ ...f, frameId: frame.frameId }));
                            console.log(`📝 Frame ${index} found ${fieldsWithFrameId.length} fields`);
                            resolve(fieldsWithFrameId);
                        });
                    });
                } catch (injectionError) {
                    console.log(`❌ Failed to inject into frame ${index}:`, injectionError.message);
                    return [];
                }
            });

            const results = await Promise.all(scanPromises);
            const allFields = results.flat();
            console.log('🎯 Total fields found:', allFields.length);
            console.log('📋 Field details:', allFields);
            return allFields;
        } catch (error) {
            console.error('❌ Error during frame scanning:', error);
            return [];
        }
    }

    // Communicates with the background script to get AI-powered fills.
    async processWithAI(fields, userProfile, apiKey) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return chrome.runtime.sendMessage({
            action: 'get_holistic_fills',
            fields,
            userProfile,
            apiKey,
            pageContext: { url: tab.url, title: tab.title }
        });
    }

    // Communicates with content scripts to fill the form fields.
    async fillAllFrames(values, fields) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const fieldsByFrame = {};
        fields.forEach(f => {
            if (!fieldsByFrame[f.frameId]) fieldsByFrame[f.frameId] = [];
            fieldsByFrame[f.frameId].push(f);
        });

        const fillPromises = Object.keys(fieldsByFrame).map(async frameIdStr => {
            const frameId = parseInt(frameIdStr, 10);
            try {
                // Ensure content script is injected before sending fill message
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id, frameIds: [frameId] },
                    files: ['content.js']
                });
                
                return new Promise(resolve => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'fill_form',
                        values: values // Send all values; content script will pick what it needs
                    }, { frameId }, response => {
                        if (chrome.runtime.lastError) {
                            return resolve({ totalFilledCount: 0, errors: [chrome.runtime.lastError.message] });
                        }
                        resolve(response);
                    });
                });
            } catch (error) {
                return { totalFilledCount: 0, errors: [`Failed to inject into frame ${frameId}: ${error.message}`] };
            }
        });

        const results = await Promise.all(fillPromises);
        const totalFilledCount = results.reduce((sum, res) => sum + (res.filledCount || 0), 0);
        return { totalFilledCount };
    }

    // --- UI Helper Functions ---

    setState(stateName) {
        const state = this.states[stateName];
        // Only update description if element exists
        if (this.description) {
            this.description.textContent = state.description;
        }
        this.fillButton.textContent = state.buttonText;
        this.fillButton.disabled = stateName !== 'ready';

        this.container.className = 'container'; // Reset classes
        if (stateName !== 'ready') {
            this.container.classList.add('loading');
        }
    }

    resetToReady() {
        this.setState('ready');
    }

    showNotification(message, type = 'info') {
        this.notification.textContent = message;
        this.notification.className = `notification ${type} show`;
        setTimeout(() => this.notification.classList.remove('show'), 3500);
    }

    // --- Modal Functions ---

    initializeModalListeners() {
        // Preview Modal
        const previewModal = document.getElementById('previewModal');
        document.getElementById('previewModalClose').addEventListener('click', () => this.hideModal('previewModal'));
        document.getElementById('previewModalCancel').addEventListener('click', () => this.hideModal('previewModal'));
        document.getElementById('previewModalFill').addEventListener('click', () => {
            this.hideModal('previewModal');
            this.handleSmartFill();
        });

        // Undo Modal
        const undoModal = document.getElementById('undoModal');
        document.getElementById('undoModalClose').addEventListener('click', () => this.hideModal('undoModal'));
        document.getElementById('undoModalCancel').addEventListener('click', () => this.hideModal('undoModal'));
        document.getElementById('undoModalConfirm').addEventListener('click', () => {
            this.hideModal('undoModal');
            this.performUndo();
        });

        // History Modal
        const historyModal = document.getElementById('historyModal');
        document.getElementById('historyModalClose').addEventListener('click', () => this.hideModal('historyModal'));
        document.getElementById('historyModalClose2').addEventListener('click', () => this.hideModal('historyModal'));
        document.getElementById('historyClear').addEventListener('click', () => this.clearHistory());

        // Close modals on overlay click
        [previewModal, undoModal, historyModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    // --- Preview Fields Feature ---

    async showPreviewModal() {
        const previewModalBody = document.getElementById('previewModalBody');
        const fillButton = document.getElementById('previewModalFill');
        
        try {
            // Show loading state
            previewModalBody.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Scanning for form fields...</p></div>';
            fillButton.disabled = true;
            this.showModal('previewModal');

            // Scan for fields
            const allFields = await this.scanAllFramesForForms();
            
            if (allFields.length === 0) {
                previewModalBody.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p>No form fields detected on the current page.</p>
                        <p>Navigate to a page with forms and try again.</p>
                    </div>
                `;
                fillButton.disabled = true;
                return;
            }

            // Generate AI values for preview
            const values = await this.generateAIValues(allFields);
            
            // Display fields with their proposed values
            let fieldsHtml = '';
            allFields.forEach(field => {
                const proposedValue = values[field.name] || values[field.id] || values[field.placeholder] || 'No match found';
                fieldsHtml += `
                    <div class="field-item">
                        <div class="field-name">${field.name || field.id || field.placeholder || 'Unnamed Field'}</div>
                        <div class="field-value">${proposedValue}</div>
                        <div class="field-type">${field.type} • ${field.tagName.toLowerCase()}</div>
                    </div>
                `;
            });

            previewModalBody.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <strong>Found ${allFields.length} form field${allFields.length !== 1 ? 's' : ''}</strong>
                </div>
                ${fieldsHtml}
            `;
            fillButton.disabled = false;

        } catch (error) {
            console.error('Preview error:', error);
            previewModalBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Error scanning form fields.</p>
                    <p>${error.message}</p>
                </div>
            `;
            fillButton.disabled = true;
        }
    }

    // --- Undo Feature ---

    async showUndoModal() {
        const undoModalBody = document.getElementById('undoModalBody');
        const confirmButton = document.getElementById('undoModalConfirm');
        
        try {
            // Get last fill operation from storage
            const { lastFillOperation } = await chrome.storage.local.get(['lastFillOperation']);
            
            if (!lastFillOperation) {
                undoModalBody.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🤷</div>
                        <p>No recent fill operation found.</p>
                        <p>There's nothing to undo.</p>
                    </div>
                `;
                confirmButton.disabled = true;
            } else {
                const date = new Date(lastFillOperation.timestamp).toLocaleString();
                undoModalBody.innerHTML = `
                    <p><strong>Last Fill Operation:</strong></p>
                    <p>Date: ${date}</p>
                    <p>URL: ${lastFillOperation.url}</p>
                    <p>Fields filled: ${lastFillOperation.fieldsCount}</p>
                    <br>
                    <p>Are you sure you want to undo this operation?</p>
                    <p>This will clear all fields that were filled.</p>
                `;
                confirmButton.disabled = false;
            }
        } catch (error) {
            console.error('Undo modal error:', error);
            undoModalBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Error loading undo information.</p>
                </div>
            `;
            confirmButton.disabled = true;
        }
        
        this.showModal('undoModal');
    }

    async performUndo() {
        try {
            const { lastFillOperation } = await chrome.storage.local.get(['lastFillOperation']);
            
            if (!lastFillOperation) {
                this.showNotification('No operation to undo', 'error');
                return;
            }

            // Send undo message to content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Ensure content script is injected
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            chrome.tabs.sendMessage(tab.id, {
                action: 'undo_fill',
                fields: lastFillOperation.fields
            }, (response) => {
                if (chrome.runtime.lastError) {
                    this.showNotification('Failed to undo: ' + chrome.runtime.lastError.message, 'error');
                    return;
                }
                
                if (response && response.success) {
                    this.showNotification(`Undone: ${response.clearedCount} fields cleared`, 'success');
                    // Clear the last operation from storage
                    chrome.storage.local.remove(['lastFillOperation']);
                } else {
                    this.showNotification('Undo failed: ' + (response?.error || 'Unknown error'), 'error');
                }
            });

        } catch (error) {
            console.error('Undo error:', error);
            this.showNotification('Undo failed: ' + error.message, 'error');
        }
    }

    // --- History Feature ---

    async showHistoryModal() {
        const historyModalBody = document.getElementById('historyModalBody');
        const clearButton = document.getElementById('historyClear');
        
        try {
            const { fillHistory = [] } = await chrome.storage.local.get(['fillHistory']);
            
            if (fillHistory.length === 0) {
                historyModalBody.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📚</div>
                        <p>No fill history available.</p>
                        <p>Your form fill history will appear here after you start using SmartFill.</p>
                    </div>
                `;
                clearButton.disabled = true;
            } else {
                let historyHtml = '';
                fillHistory.slice(0, 20).forEach(entry => { // Show last 20 entries
                    const date = new Date(entry.timestamp).toLocaleString();
                    const url = new URL(entry.url).hostname;
                    historyHtml += `
                        <div class="history-item">
                            <div class="history-date">${date}</div>
                            <div class="history-url">${url}</div>
                            <div class="history-fields">${entry.fieldsCount} fields filled</div>
                        </div>
                    `;
                });
                
                historyModalBody.innerHTML = `
                    <div style="margin-bottom: 16px;">
                        <strong>Recent Fill Operations (${fillHistory.length} total)</strong>
                    </div>
                    ${historyHtml}
                `;
                clearButton.disabled = false;
            }
        } catch (error) {
            console.error('History modal error:', error);
            historyModalBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Error loading history.</p>
                </div>
            `;
            clearButton.disabled = true;
        }
        
        this.showModal('historyModal');
    }

    async clearHistory() {
        try {
            await chrome.storage.local.remove(['fillHistory']);
            this.showNotification('History cleared', 'success');
            this.hideModal('historyModal');
        } catch (error) {
            console.error('Clear history error:', error);
            this.showNotification('Failed to clear history', 'error');
        }
    }

    // --- Enhanced Fill Function with History Tracking ---

    async saveToHistory(url, fieldsCount, fields) {
        try {
            const { fillHistory = [] } = await chrome.storage.local.get(['fillHistory']);
            
            const newEntry = {
                timestamp: Date.now(),
                url: url,
                fieldsCount: fieldsCount,
                fields: fields // Store for undo functionality
            };
            
            // Add to beginning of array and limit to 50 entries
            fillHistory.unshift(newEntry);
            const limitedHistory = fillHistory.slice(0, 50);
            
            await chrome.storage.local.set({ 
                fillHistory: limitedHistory,
                lastFillOperation: newEntry
            });
        } catch (error) {
            console.error('Failed to save to history:', error);
        }
    }
}

// Initialize the class once the DOM is loaded.
document.addEventListener('DOMContentLoaded', () => {
    new EditorialSmartFill();
});
document.querySelectorAll('a, button').forEach(element => {
    element.addEventListener('mouseenter', function() {
        if (!this.disabled) {
            this.style.transform = 'translateY(-1px)';
        }
    });
    
    element.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});
