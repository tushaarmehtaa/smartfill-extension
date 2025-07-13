document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const themeToggle = document.getElementById('theme-toggle');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Define all profile input elements
  const inputs = {
    name: document.getElementById('profile-name'),
    email: document.getElementById('profile-email'),
    profession: document.getElementById('profile-profession'),
    company: document.getElementById('profile-company'),
    linkedin: document.getElementById('profile-linkedin'),
    github: document.getElementById('profile-github'),
    portfolio: document.getElementById('profile-portfolio'),
    phone: document.getElementById('profile-phone'),
    street: document.getElementById('profile-street'),
    city: document.getElementById('profile-city'),
    state: document.getElementById('profile-state'),
    zip: document.getElementById('profile-zip'),
    country: document.getElementById('profile-country'),
    about: document.getElementById('profile-about'),
    resume: document.getElementById('profile-resume'),
    coverLetter: document.getElementById('profile-cover-letter'),
  };

  const defaultProfile = Object.keys(inputs).reduce((acc, key) => ({ ...acc, [key]: '' }), {});

  let userProfile = { ...defaultProfile };
  let saveTimeout;

  // Load the existing profile from storage and populate the form
  chrome.storage.local.get(['userProfile', 'theme'], (result) => {
    if (result.userProfile) {
      userProfile = { ...defaultProfile, ...result.userProfile };
    }
    for (const key in inputs) {
      if (inputs[key]) {
        inputs[key].value = userProfile[key] || '';
      }
    }
    if (result.theme) {
      applyTheme(result.theme);
    }
  });

  // Function to handle input changes and save the profile
  function handleProfileChange() {
    for (const key in inputs) {
      if (inputs[key]) {
        userProfile[key] = inputs[key].value;
      }
    }

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      chrome.storage.local.set({ userProfile }, () => {
        statusDiv.textContent = 'Profile saved!';
        statusDiv.classList.remove('opacity-0');
        setTimeout(() => {
            statusDiv.classList.add('opacity-0');
        }, 2000);
      });
    }, 500); // Debounce saving to avoid excessive writes
  }

  // Attach event listeners to all input fields
  for (const key in inputs) {
    if (inputs[key]) {
      inputs[key].addEventListener('input', handleProfileChange);
    }
  }

  themeToggle.addEventListener('click', () => {
    const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.local.set({ theme: newTheme });
  });
});
