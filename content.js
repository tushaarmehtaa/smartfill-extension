// This script is injected into each frame to handle DOM interactions.

/**
 * Finds the best possible label for a given form element.
 * It checks for a <label> with a 'for' attribute, a parent <label>, the placeholder, and finally the name attribute.
 * @param {HTMLElement} el The form element.
 * @returns {string} The best available label for the element.
 */
function getBestLabel(el) {
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    return el.placeholder || el.name || '';
}

/**
 * Scans the document for all visible, enabled form fields.
 * @returns {Array<Object>} A list of field objects, each with details like id, label, and type.
 */
function scanForm() {
    console.log('🔍 Content script: Starting form scan on', window.location.href);
    const selector = 'input:not([type="hidden"]):not([type="submit"]), textarea, select';
    const allElements = document.querySelectorAll(selector);
    console.log('📋 Content script: Found', allElements.length, 'potential form elements');
    
    const fields = [];
    allElements.forEach((el, index) => {
        console.log(`🔎 Element ${index}:`, {
            tagName: el.tagName,
            type: el.type,
            id: el.id,
            name: el.name,
            disabled: el.disabled,
            visible: el.offsetParent !== null
        });
        
        if (el.disabled || el.offsetParent === null) {
            console.log(`⏭️ Skipping element ${index} (disabled or hidden)`);
            return;
        }

        const fieldId = el.id || el.name || `smartfill-field-${index}`;
        const field = {
            id: fieldId,
            label: getBestLabel(el),
            name: el.name || '',
            type: el.type || (el.tagName.toLowerCase() === 'select' ? 'select' : 'textarea'),
            tagName: el.tagName.toLowerCase(),
            value: el.value,
            placeholder: el.placeholder || '',
            required: el.required || false
        };
        
        // For select elements, capture available options
        if (el.tagName.toLowerCase() === 'select') {
            field.options = Array.from(el.options).map(option => ({
                value: option.value,
                text: option.text,
                selected: option.selected
            }));
        }
        console.log(`✅ Adding field ${index}:`, field);
        fields.push(field);
    });
    
    console.log('🎯 Content script: Final field count:', fields.length);
    return fields;
}

/**
 * Intelligently finds the best matching option in a select element
 * @param {HTMLSelectElement} selectElement - The select element
 * @param {string} targetValue - The value we want to match
 * @returns {Object|null} The best matching option or null
 */
function findBestSelectOption(selectElement, targetValue) {
    if (!targetValue || !selectElement.options) return null;
    
    const targetLower = targetValue.toLowerCase().trim();
    const options = Array.from(selectElement.options);
    
    // 1. Exact value match
    let match = options.find(opt => opt.value.toLowerCase() === targetLower);
    if (match) return match;
    
    // 2. Exact text match
    match = options.find(opt => opt.text.toLowerCase().trim() === targetLower);
    if (match) return match;
    
    // 3. Partial text match (contains)
    match = options.find(opt => opt.text.toLowerCase().includes(targetLower));
    if (match) return match;
    
    // 4. Partial value match (contains)
    match = options.find(opt => opt.value.toLowerCase().includes(targetLower));
    if (match) return match;
    
    // 5. Smart matching for common patterns
    // Years of experience: "3-5 years" should match "3-5", "3 to 5", etc.
    if (targetLower.includes('year')) {
        const yearMatch = targetLower.match(/(\d+)[-\s]*(?:to|-)\s*(\d+)|\d+/);
        if (yearMatch) {
            const yearPattern = yearMatch[0].replace(/\s+/g, '').replace('to', '-');
            match = options.find(opt => 
                opt.text.toLowerCase().includes(yearPattern) || 
                opt.value.toLowerCase().includes(yearPattern)
            );
            if (match) return match;
        }
    }
    
    // 6. Country/State matching
    if (targetLower.includes('india') || targetLower === 'in') {
        match = options.find(opt => 
            opt.text.toLowerCase().includes('india') || 
            opt.value.toLowerCase() === 'in' ||
            opt.value.toLowerCase() === 'india'
        );
        if (match) return match;
    }
    
    // 7. Gender matching
    if (['male', 'female', 'non-binary', 'other'].includes(targetLower)) {
        match = options.find(opt => 
            opt.text.toLowerCase().includes(targetLower) ||
            opt.value.toLowerCase().includes(targetLower)
        );
        if (match) return match;
    }
    
    console.log(`🔍 No match found for "${targetValue}" in options:`, options.map(o => o.text));
    return null;
}

/**
 * Fills form fields with the provided values.
 * @param {Array<{id: string, value: string}>} values - The data to fill.
 * @returns {{filledCount: number, errors: Array<string>}} The result of the fill operation.
 */
function fillForm(values) {
    console.log('🖊️ Content script: Starting fillForm with values:', values);
    let filledCount = 0;
    const errors = [];

    if (!values || !Array.isArray(values)) {
        console.log('❌ Content script: Invalid values provided to fillForm');
        return { filledCount: 0, errors: ['Invalid values provided'] };
    }

    values.forEach((item, index) => {
        console.log(`🔍 Processing fill item ${index}:`, item);
        
        // Try multiple ways to find the element
        let el = document.getElementById(item.id);
        if (!el) {
            el = document.getElementsByName(item.id)[0];
        }
        if (!el) {
            // Try querySelector as fallback
            el = document.querySelector(`[name="${item.id}"]`) || document.querySelector(`#${item.id}`);
        }
        
        console.log(`🎯 Element found for ${item.id}:`, !!el);
        
        if (el) {
            try {
                console.log(`✏️ Filling ${item.id} with value:`, item.value);
                
                // Handle different field types intelligently
                if (el.tagName.toLowerCase() === 'select') {
                    // For select fields, try to find matching option
                    const matchingOption = findBestSelectOption(el, item.value);
                    if (matchingOption) {
                        el.value = matchingOption.value;
                        console.log(`🎯 Selected option: ${matchingOption.text} (${matchingOption.value})`);
                    } else {
                        console.log(`⚠️ No matching option found for: ${item.value}`);
                        // Skip this field if no match found
                        return;
                    }
                } else if (el.type === 'checkbox') {
                    // Handle checkboxes
                    const shouldCheck = ['true', 'yes', '1', 'on', 'checked'].includes(item.value.toLowerCase());
                    el.checked = shouldCheck;
                    console.log(`☑️ Checkbox ${shouldCheck ? 'checked' : 'unchecked'}`);
                } else if (el.type === 'radio') {
                    // Handle radio buttons
                    if (el.value === item.value || item.value.toLowerCase() === 'true') {
                        el.checked = true;
                        console.log(`🔘 Radio button selected`);
                    }
                } else {
                    // Handle regular input fields
                    el.value = item.value;
                }
                
                // Trigger events to notify the page of changes
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                filledCount++;
                console.log(`✅ Successfully filled ${item.id}`);
            } catch (e) {
                console.log(`❌ Error filling ${item.id}:`, e.message);
                errors.push(`Could not fill field ${item.id}: ${e.message}`);
            }
        } else {
            console.log(`❌ Field not found: ${item.id}`);
            errors.push(`Field with ID "${item.id}" not found.`);
        }
    });
    
    console.log(`🎯 Fill complete: ${filledCount} fields filled, ${errors.length} errors`);
    console.log('📋 Errors:', errors);
    return { filledCount, errors };
}

// Main message listener to communicate with the rest of the extension.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Content script: Received message:', request);
    
    if (request.action === 'scan_form') {
        console.log('🔍 Content script: Processing scan_form request');
        const fields = scanForm();
        const response = { fields };
        console.log('📤 Content script: Sending response:', response);
        sendResponse(response);
    } else if (request.action === 'fill_form') {
        console.log('📝 Content script: Processing fill_form request');
        if (request.values && Array.isArray(request.values)) {
            sendResponse(fillForm(request.values));
        } else {
            sendResponse({ filledCount: 0, errors: ['No values provided or values is not an array.'] });
        }
    } else {
        console.log('❓ Content script: Unknown action:', request.action);
    }
    return true; // Keep the message channel open for the asynchronous response.
});
