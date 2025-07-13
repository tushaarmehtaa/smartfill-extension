# SmartFill AI Chrome Extension

## Overview

SmartFill AI is an intelligent Chrome extension that automates filling out web forms. It uses a combination of smart rule-based matching and the power of large language models (Anthropic's Claude) to accurately and contextually fill in everything from simple contact forms to complex job applications.

## Key Features
- **Hybrid Filling Logic**: Uses deterministic rules for common fields (name, email, phone) and reserves AI for complex, open-ended questions, ensuring accuracy and relevance.
- **Full iFrame Compatibility**: Seamlessly detects and fills forms embedded within iframes, a common pattern in modern web applications like job portals.
- **User Profile Management**: Easily save and edit your profile information (name, email, professional summary, etc.) directly within the extension popup.
- **Robust Field Detection**: Uses XPath to reliably identify form fields, making it compatible with dynamic pages built with frameworks like React or Angular.
- **Secure**: Your API key and profile data are stored locally on your machine using Chrome's storage API and are never shared externally.
- **Visual Preview & Undo**: Preview fields before filling and undo the last fill with a single click.
- **Progress & Notifications**: See a spinner while filling and get success or error notifications.
- **Keyboard Shortcut**: Press Ctrl+Shift+F to trigger SmartFill from any page.
- **Dark Mode**: Toggle between light and dark themes in both the popup and settings pages.

## Quick Setup

To get started with SmartFill AI, follow these steps to load it as an unpacked extension in Google Chrome:

1.  **Download the Code**:
    If you haven't already, make sure you have the extension's source code on your computer in a folder (e.g., `smartfill-extension`).

2.  **Open Chrome Extensions Page**:
    Open Google Chrome and navigate to `chrome://extensions` in the address bar.

3.  **Enable Developer Mode**:
    In the top-right corner of the Extensions page, find the "Developer mode" switch and turn it on.

4.  **Load the Extension**:
    - Click the "Load unpacked" button that appears on the top-left.
    - In the file selection dialog that opens, navigate to and select the `smartfill-extension` directory (the one containing `manifest.json`).
    - Click "Select".

5.  **Pin the Extension (Recommended)**:
    - The SmartFill AI extension will now appear in your list of extensions.
    - Click the puzzle piece icon in your Chrome toolbar.
    - Find "SmartFill AI" in the list and click the pin icon next to it. This will keep the icon visible in your toolbar for easy access.

## How to Use

1.  **Set Your API Key**:
    - Click the SmartFill AI icon in your toolbar to open the popup.
    - Click the settings gear icon in the top-right corner.
    - Paste your Anthropic Claude API key into the input field and click "Save".

2.  **Complete Your Profile**:
    - In the main popup view, fill in your personal and professional details.
    - Your profile is saved automatically as you type.

3.  **Autofill a Form**:
    - Navigate to a web page with a form you want to fill.
    - Click the SmartFill AI icon.
    - Click the "Smart Fill Form" button.
    - The extension will scan the page, analyze the fields, and fill them in based on your profile.

4.  **Switch Themes**:
    - Use the moon icon in the popup or settings page to toggle dark mode.

## Technology Stack

- **Core**: HTML, CSS, Vanilla JavaScript
- **APIs**: Chrome Extension APIs (Storage, Messaging, WebNavigation), Anthropic Claude API
