// background.js

// Detect form type based on URL, title, and field analysis
function detectFormType(url, title, fields) {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const fieldLabels = fields.map(f => (f.label || f.name || '').toLowerCase()).join(' ');
  
  // Job application indicators
  if (urlLower.includes('job') || urlLower.includes('career') || urlLower.includes('apply') ||
      titleLower.includes('job') || titleLower.includes('career') || titleLower.includes('application') ||
      fieldLabels.includes('resume') || fieldLabels.includes('cover letter') || fieldLabels.includes('salary') ||
      fieldLabels.includes('experience') || fieldLabels.includes('skills')) {
    return 'JOB_APPLICATION';
  }
  
  // Survey indicators
  if (urlLower.includes('survey') || urlLower.includes('feedback') || urlLower.includes('poll') ||
      titleLower.includes('survey') || titleLower.includes('feedback') ||
      fieldLabels.includes('gender') || fieldLabels.includes('age') || fieldLabels.includes('ethnicity')) {
    return 'SURVEY';
  }
  
  // Contact/Registration form indicators
  if (urlLower.includes('contact') || urlLower.includes('register') || urlLower.includes('signup') ||
      titleLower.includes('contact') || titleLower.includes('register') || titleLower.includes('sign up')) {
    return 'CONTACT_REGISTRATION';
  }
  
  // Default to general form
  return 'GENERAL_FORM';
}

async function getHolisticFills(fields, profile, apiKey, pageContext) {
  if (!apiKey) {
    throw new Error('API Key is not set. Please configure it in settings.');
  }

  if (!profile || !profile.name) {
    throw new Error('User profile is empty. Please complete your profile in settings.');
  }

  const simplifiedFields = fields.map(field => ({
    id: field.id,
    label: field.label,
    name: field.name,
    type: field.type,
    placeholder: field.placeholder,
    options: field.options
  }));

  // Detect form type for context-aware filling
  const formType = detectFormType(pageContext.url, pageContext.title, simplifiedFields);
  
  const aiPrompt = `
    You are an advanced AI form-filling assistant with expertise in context-aware field mapping. Your task is to intelligently fill forms based on user profile data and form context.

    FORM TYPE DETECTED: ${formType}
    
    USER PROFILE:
    ${JSON.stringify(profile, null, 2)}

    FORM CONTEXT:
    URL: ${pageContext.url}
    Page Title: ${pageContext.title}
    Detected Type: ${formType}

    FORM FIELDS:
    ${JSON.stringify(simplifiedFields, null, 2)}

    CONTEXT-AWARE FILLING INSTRUCTIONS:
    
    **For JOB APPLICATIONS:**
    - Use professional profile data (experience, skills, expectedSalary, etc.)
    - Fill cover letter fields with customized content using profile.coverLetter template
    - Use work authorization status, availability, notice period appropriately
    - Match skills to job requirements when possible
    
    **For SURVEYS/DEMOGRAPHICS:**
    - Use personal information fields (gender, ethnicity, dateOfBirth, etc.) when appropriate
    - Respect privacy - only fill demographic fields that seem relevant
    - Use professional background for work-related surveys
    
    **For CONTACT/REGISTRATION FORMS:**
    - Prioritize basic contact info (name, email, phone, address)
    - Use social profiles (linkedin, github, portfolio) for professional contexts
    - Fill company/job title for business registrations
    
    **INTELLIGENT FIELD MAPPING:**
    - Salary fields: Use currentSalary or expectedSalary based on context
    - Experience fields: Use profile.experience (e.g., "3-5 years")
    - Skills/Technologies: Use profile.skills (comma-separated list)
    - Education: Use profile.education, profile.university, profile.graduationYear
    - Bio/About fields: Use profile.customBio or generate from other profile data
    - Cover letter fields: Use profile.coverLetter template, replace {company} and {position} with detected values
    - Social links: Use appropriate profile.linkedin, profile.github, profile.portfolio, profile.twitter
    - Work authorization: Use profile.workAuthorization
    - Availability: Use profile.availability
    - Notice period: Use profile.noticePeriod
    
    **SMART DEFAULTS:**
    - For dropdown/select fields, choose the most appropriate option based on profile
    - For yes/no questions, make intelligent decisions based on context
    - For date fields, use appropriate format (MM/DD/YYYY, DD/MM/YYYY, etc.)
    - For phone fields, format appropriately
    
    **RULES:**
    1. Analyze each field's label, name, placeholder, and type to determine the best profile match
    2. Be context-aware - job applications need different data than surveys
    3. If no suitable profile data exists, return empty string ""
    4. For file upload fields, always return ""
    5. Return ONLY a valid JSON object mapping field IDs to string values
    6. Be intelligent about field variations (e.g., "first_name", "firstName", "fname" all map to profile.name)
    
    RESPONSE FORMAT (JSON only):
    {
      "field_id_1": "appropriate_value",
      "field_id_2": "another_value"
    }
  `;

  try {
    console.log('Sending comprehensive prompt to Claude API...');

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2048, // Increased token limit for potentially larger forms
        messages: [{ role: 'user', content: aiPrompt }]
      })
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json();
      throw new Error(`Claude API Error: ${errorBody.error.message}`);
    }

    const result = await apiResponse.json();
    console.log('Received full API response:', result);

    if (!result.content || !result.content[0] || !result.content[0].text) {
      throw new Error('Invalid response structure from Claude API.');
    }

    let jsonString = result.content[0].text;

    // Robustly extract the JSON object from the response string
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/s);
    if (!jsonMatch) {
        console.error("Could not find a JSON object in the AI's response. Response text:", jsonString);
        throw new Error('The AI returned a response that did not contain a valid JSON object.');
    }
    jsonString = jsonMatch[0];

    const aiValues = JSON.parse(jsonString);
    return { values: aiValues };

  } catch (error) {
    console.error('Error in getHolisticFills:', error);
    const errorMessage = error.message.includes('JSON') 
      ? 'The AI returned an invalid response. Please try again.' 
      : error.message;
    throw new Error(errorMessage);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_holistic_fills') {
    (async () => {
      try {
        // Destructure all expected properties from the request, including pageContext
        const { fields, userProfile, apiKey, pageContext } = request;

        // Pass them to the handler function
        const response = await getHolisticFills(fields, userProfile, apiKey, pageContext);
        sendResponse(response);
      } catch (error) {
        console.error('Error during get_holistic_fills:', error);
        sendResponse({ error: error.message || 'An unexpected error occurred.' });
      }
    })();
    return true; // Indicates that the response is sent asynchronously.
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'trigger-autofill') {
    chrome.storage.local.get('apiKey', (result) => {
        if (result.apiKey) {
            chrome.action.openPopup();
        } else {
            chrome.runtime.openOptionsPage();
        }
    });
  }
});
