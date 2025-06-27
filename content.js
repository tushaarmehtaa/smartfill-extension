// content.js

function getXPathForElement(element) {
  if (element.id !== '') {
    // If the element has an ID, use it for a simple and robust XPath
    return `//*[@id="${element.id}"]`;
  }
  if (element === document.body) {
    return '/html/body';
  }

  let ix = 0;
  const siblings = element.parentNode.childNodes;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return `${getXPathForElement(element.parentNode)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
  return null; // Should not happen
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scan_form') {
    const fields = [];
    try {
      document.querySelectorAll('input, textarea, select').forEach((el) => {
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || !el.offsetParent) {
          return;
        }

        let label = '';
        if (el.id) {
          const labelEl = document.querySelector(`label[for='${el.id}']`);
          if (labelEl) label = labelEl.innerText;
        }
        if (!label) {
          label = el.closest('label')?.innerText || el.placeholder || el.name || el.ariaLabel || '';
        }

        const fieldXPath = getXPathForElement(el);
        if (fieldXPath) {
          fields.push({
            id: fieldXPath, // Use XPath as the unique identifier
            name: el.name,
            type: el.type,
            label: label.trim(),
            value: el.value,
            options: Array.from(el.options || []).map(opt => opt.value)
          });
        }
      });

      const pageContext = document.body.innerText;
      sendResponse({ fields, pageContext });

    } catch (error) {
      console.error('SmartFill: Error scanning form fields.', error);
      sendResponse({ error: 'Could not scan the form on this page.' });
    }
    return true;

  } else if (request.action === 'fill_form') {
    let filledCount = 0;
    const errors = [];
    const { values } = request;

    for (const fieldXPath in values) {
      if (Object.prototype.hasOwnProperty.call(values, fieldXPath)) {
        try {
          const el = document.evaluate(fieldXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          const valueToFill = values[fieldXPath];

          if (el && valueToFill) {
            el.focus();
            el.value = valueToFill;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
            filledCount++;
          } else if (!el) {
            errors.push(`Could not find element with XPath: ${fieldXPath.substring(0, 70)}...`);
          }
        } catch (e) {
          errors.push(`Error filling XPath: ${e.message}`);
        }
      }
    }
    sendResponse({ filled: filledCount, errors: errors });
    return true;
  }
});
