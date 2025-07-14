class EditorialSmartFill {
    constructor() {
        // DOM Elements
        this.container = document.getElementById('container');
        this.sectionTitle = document.getElementById('sectionTitle');
        this.description = document.getElementById('description');
        this.fillButton = document.getElementById('fillButton');
        this.notification = document.getElementById('notification');
        this.profileName = document.getElementById('profile-name');
        this.profileEmail = document.getElementById('profile-email');

        // UI States
        this.states = {
            ready: {
                title: 'Form Analysis',
                description: 'I will carefully read the form fields and intelligently populate them using your profile information.',
                buttonText: 'Begin Analysis'
            },
            analyzing: {
                title: 'Reading Form',
                description: 'Examining the structure and context of each field...',
                buttonText: 'Analyzing...'
            },
            understanding: {
                title: 'Matching Context',
                description: 'Determining the most appropriate information for each field...',
                buttonText: 'Processing...'
            },
            filling: {
                title: 'Populating Fields',
                description: 'Carefully entering your information...',
                buttonText: 'Filling...'
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
        // Placeholder links for unimplemented features
        document.getElementById('previewLink').addEventListener('click', (e) => e.preventDefault());
        document.getElementById('undoLink').addEventListener('click', (e) => e.preventDefault());
        document.getElementById('historyLink').addEventListener('click', (e) => e.preventDefault());
    }

    // Load and store profile and API key once when the popup opens.
    async loadInitialData() {
        try {
            const { userProfile, apiKey } = await chrome.storage.local.get(['userProfile', 'apiKey']);
            this.userProfile = userProfile;
            this.apiKey = apiKey;

            if (this.userProfile && this.userProfile.name) {
                this.profileName.textContent = this.userProfile.name;
                this.profileEmail.textContent = this.userProfile.email;
            } else {
                this.profileName.textContent = 'Profile Not Set';
                this.profileEmail.textContent = 'Please complete in settings.';
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
        this.sectionTitle.textContent = state.title;
        this.description.textContent = state.description;
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
