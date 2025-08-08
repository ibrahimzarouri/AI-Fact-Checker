// Popup script for AI Fact Checker Extension

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  const apiWarning = document.getElementById('apiWarning');
  
  // Check if we're on a supported site
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    if (!currentTab) return;
    
    // Import config to check supported domains
    const supportedDomains = [
      'bild.de', 'spiegel.de', 'faz.net', 'sueddeutsche.de', 'zeit.de', 'welt.de', 'nius.de',
      'bbc.com', 'bbc.co.uk', 'cnn.com', 'theguardian.com', 'nytimes.com', 
      'washingtonpost.com', 'reuters.com', 'aljazeera.com', 'foxnews.com', 'nbcnews.com'
    ];
    
    const isSupported = supportedDomains.some(domain => currentTab.url.includes(domain));
    
    if (isSupported) {
      statusElement.innerHTML = `
        <div style="color: #90ee90;">✅ Supported Site</div>
        <div style="font-size: 12px; margin-top: 4px;">Use the AI button on the page to analyze articles</div>
      `;
    } else {
      statusElement.innerHTML = `
        <div style="color: #ffcccb;">❌ Unsupported Site</div>
        <div style="font-size: 12px; margin-top: 4px;">This extension only works on major news websites</div>
      `;
    }
  });
  
  // Check API key configuration (simplified check)
  chrome.storage.local.get(['openai_api_key'], function(result) {
    if (!result.openai_api_key || result.openai_api_key === 'YOUR_OPENAI_API_KEY_HERE') {
      apiWarning.style.display = 'block';
    }
  });
  
  // Button event handlers
  document.getElementById('openSettings').addEventListener('click', function() {
    chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
  });
  
  document.getElementById('openDashboard').addEventListener('click', function() {
    // For now, just close popup and show message
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SHOW_DASHBOARD_INFO'
      });
      window.close();
    });
  });
  
  document.getElementById('helpBtn').addEventListener('click', function() {
    chrome.tabs.create({ 
      url: 'https://platform.openai.com/docs/guides/text-generation'
    });
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'UPDATE_POPUP_STATUS') {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.innerHTML = message.status;
    }
  }
});