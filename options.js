document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('settings-form');
    const notification = document.getElementById('notification');

    // Define all the input fields based on the new HTML structure
    const inputIds = [
        'apiKey', 'name', 'email', 'phone', 'company', 'jobTitle',
        'address', 'city', 'state', 'zip', 'country', 'customBio',
        // Professional Details
        'experience', 'currentSalary', 'expectedSalary', 'noticePeriod', 'availability', 'workAuthorization',
        // Skills & Education
        'skills', 'education', 'university', 'graduationYear', 'certifications',
        // Online Presence
        'linkedin', 'github', 'portfolio', 'twitter',
        // Personal Information
        'dateOfBirth', 'gender', 'pronouns', 'ethnicity', 'veteranStatus', 'disability',
        // Additional Bio
        'coverLetter'
    ];

    const inputs = {};
    inputIds.forEach(id => {
        inputs[id] = document.getElementById(id);
    });

    // Load existing settings from storage and populate the form
    function loadSettings() {
        chrome.storage.local.get(['userProfile', 'apiKey'], (result) => {
            // Handle API Key
            if (inputs.apiKey) {
                inputs.apiKey.value = result.apiKey || '';
            }

            // Handle User Profile
            const userProfile = result.userProfile || {};
            inputIds.forEach(id => {
                // Skip apiKey as it's handled separately
                if (id === 'apiKey') return;

                if (inputs[id]) {
                    inputs[id].value = userProfile[id] || '';
                }
            });
        });
    }

    // Save settings to storage on form submission
    function saveSettings(event) {
        event.preventDefault(); // Prevent the form from submitting traditionally

        const apiKey = inputs.apiKey.value.trim();
        // Build comprehensive user profile object
        const userProfile = {};
        inputIds.forEach(id => {
            if (id === 'apiKey') return; // Skip apiKey as it's handled separately
            if (inputs[id]) {
                userProfile[id] = inputs[id].value.trim();
            }
        });

        chrome.storage.local.set({ userProfile, apiKey }, () => {
            // Show the success notification
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 2500); // Hide after 2.5 seconds
        });
    }

    // Attach the save function to the form's submit event
    if (form) {
        form.addEventListener('submit', saveSettings);
    }

    // Load the settings when the page is opened
    loadSettings();
});
