//New content.js
console.log("AI Fact Checker Extension: Content script loaded");

// FINAL WINDOW ASSIGNMENTS - PROTECTED POSITION (NO DUPLICATES)
console.log("🎯 Assigning window functions at final position...");

// Make functions globally available
window.startAnalysis = startAnalysis;
window.shareResults = shareResults;

window.scrollToArticle = function() {
  console.log("Window.scrollToArticle called");
  scrollToArticle();
};

// Test function
window.testBasic = function() { 
  console.log("✅ Window functions are working!");
  return "Extension is working!"; 
};

console.log("🎯 Global functions assigned at startup");

function scrollToArticle() {
  const articleSection = document.querySelector('article') || 
                        document.querySelector('main') || 
                        document.querySelector('.ai-tabs-nav');
  if (articleSection) {
    articleSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Configuration - embedded directly to avoid import issues
const CONFIG = {
  SUPPORTED_DOMAINS: [
    // German sites
    'bild.de',
    'spiegel.de',
    'faz.net',
    'sueddeutsche.de',
    'zeit.de',
    'welt.de',
    'nius.de',
    'n-tv.de',
    'compact-online.de',
    // International sites
    'bbc.com',
    'bbc.co.uk',
    'cnn.com',
    'theguardian.com',
    'nytimes.com',
    'washingtonpost.com',
    'reuters.com',
    'aljazeera.com',
    'foxnews.com',
    'nbcnews.com',
    // Video platforms
    'youtube.com',
    'youtu.be',
    'tiktok.com',
    'm.tiktok.com'
  ]
};

// Enhanced state tracking
let latestResults = null;
let isAnalyzing = false;
let hasAnalyzedCurrentPage = false;
let currentPageUrl = window.location.href;
let currentArticleHash = null;
let analysisPromise = null; // Track ongoing analysis promise
let autoAnalysisTriggered = false; // Prevent multiple auto-analysis triggers


// Ground Truth System - ADD THESE LINES
let groundTruthData = null;
let confidenceCalibration = null;

// Audio extraction state management
let isExtractingAudio = false;

// Function to load ground truth articles - ADD THIS FUNCTION
async function loadGroundTruthData() {
  if (groundTruthData && evaluationResults) return groundTruthData;
  
  try {
    console.log("Loading ground truth data...");
    
    // Try to load evaluation results
    const evalUrl = chrome.runtime.getURL('ground_truth/evaluate.js');
    console.log("Trying to fetch:", evalUrl);
    
    const evalResponse = await fetch(evalUrl);
    console.log("📡 Fetch response status:", evalResponse.status, evalResponse.ok);
    
    if (evalResponse.ok) {
      const evalText = await evalResponse.text();
      console.log("File content length:", evalText.length);
      console.log("First 200 chars:", evalText.substring(0, 200));
      
      // Extract EVALUATION_RESULTS from the file
      const match = evalText.match(/const EVALUATION_RESULTS = (\[[\s\S]*?\]);/);
      if (match) {
        evaluationResults = JSON.parse(match[1]);
        console.log(`Loaded ${evaluationResults.length} evaluation results`);
        
        // Log summary for debugging
        const correct = evaluationResults.filter(r => r.is_correct).length;
        const accuracy = Math.round((correct / evaluationResults.length) * 100);
        console.log(`Overall accuracy: ${correct}/${evaluationResults.length} = ${accuracy}%`);
        
        // Calculate brackets for debugging
        const brackets = {};
        evaluationResults.forEach(result => {
          const bracket = result.confidence_bracket;
          if (bracket && bracket !== 'ERROR') {
            if (!brackets[bracket]) brackets[bracket] = { correct: 0, total: 0 };
            brackets[bracket].total++;
            if (result.is_correct) brackets[bracket].correct++;
          }
        });
        
        console.log("Confidence brackets:", brackets);
        
      } else {
        console.error("Could not parse EVALUATION_RESULTS from evaluate.js");
        console.log("File content:", evalText.substring(0, 500));
      }
    } else {
      console.error(`Failed to fetch evaluate.js: ${evalResponse.status} ${evalResponse.statusText}`);
    }
    
    // Try to load original articles (optional)
    const articles = [];
    for (let i = 1; i <= 13; i++) {
      const articleNum = i.toString().padStart(3, '0');
      const filename = `ground_truth/data/articles/article_${articleNum}.json`;
      
      try {
        const response = await fetch(chrome.runtime.getURL(filename));
        if (response.ok) {
          const articleData = await response.json();
          articles.push(articleData);
        }
      } catch (error) {
        console.warn(`Could not load ${filename}:`, error);
      }
    }
    
    groundTruthData = articles;
    console.log(`Loaded ${articles.length} ground truth articles`);
    return articles;
    
  } catch (error) {
    console.error("Error loading ground truth data:", error);
    console.error("Error details:", error.message, error.stack);
    return [];
  }
}

function getConfidenceBracket(confidence) {
  console.log(`Calculating bracket for confidence: ${confidence}`);
  if (confidence >= 90) {
    console.log(`90-100% (${confidence} >= 90)`);
    return '90-100%';
  }
  if (confidence >= 80) {
    console.log(`80-90% (${confidence} >= 80)`);
    return '80-90%';
  }
  if (confidence >= 70) {
    console.log(`70-80% (${confidence} >= 70)`);
    return '70-80%';
  }
  if (confidence >= 60) {
    console.log(`60-70% (${confidence} >= 60)`);
    return '60-70%';
  }
  console.log(`under-60% (${confidence} < 60)`);
  return 'under-60%';
}

// ADD: Helper function to calculate real calibration from your data (MISSING!)
function calculateRealCalibration() {
  const brackets = {
    '90-100%': { correct: 0, total: 0 },
    '80-90%': { correct: 0, total: 0 },
    '70-80%': { correct: 0, total: 0 },
    '60-70%': { correct: 0, total: 0 },
    'under-60%': { correct: 0, total: 0 }
  };
  
  if (!evaluationResults) {
    console.warn("evaluationResults not available for calibration");
    return brackets;
  }
  
  console.log("Calculating calibration from", evaluationResults.length, "results");
  
  evaluationResults.forEach((result, index) => {
    // IGNORE the pre-calculated confidence_bracket - it's wrong!
    // Instead, recalculate from the actual confidence score
    if (result.openai_confidence > 0 && result.openai_verdict !== 'ERROR') {
      const correctBracket = getConfidenceBracket(result.openai_confidence);
      
      console.log(`Article ${index + 1}: confidence ${result.openai_confidence}% → ${correctBracket} (was: ${result.confidence_bracket})`);
      
      brackets[correctBracket].total++;
      if (result.is_correct) {
        brackets[correctBracket].correct++;
      }
    }
  });
  
  // Calculate accuracy for each bracket
  Object.keys(brackets).forEach(bracket => {
    const data = brackets[bracket];
    data.accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
  });
  
  console.log("CORRECTED brackets:", brackets);
  return brackets;
}

// Function to calculate confidence calibration - ADD THIS FUNCTION
function calculateConfidenceCalibrationReal(groundTruthArticles, currentResult) {
  try {
    // Load real evaluation results
    const evaluationResults = EVALUATION_RESULTS; // From evaluate.js
    
    if (!evaluationResults || evaluationResults.length === 0) {
      return {
        available: false,
        message: "Real evaluation data not available"
      };
    }
    
    const confidence = currentResult.analysis?.confidence_score || 0;
    const currentBracket = getConfidenceBracket(confidence);
    
    // Calculate real accuracy for this confidence bracket
    const bracketsData = calculateCalibration();
    const bracketStats = bracketsData[currentBracket];
    
    if (!bracketStats || bracketStats.total === 0) {
      return {
        available: true,
        confidence_bracket: currentBracket,
        actual_accuracy: 0,
        sample_size: evaluationResults.length,
        bracket_sample_size: 0,
        reliability_level: 'No Data',
        reliability_color: '#666',
        message: `No articles in our test set had AI confidence in the ${currentBracket} range.`
      };
    }
    
    const actualAccuracy = bracketStats.accuracy;
    const bracketSampleSize = bracketStats.total;
    
    // Determine reliability level based on REAL accuracy
    let reliabilityLevel = '';
    let reliabilityColor = '';
    
    if (actualAccuracy >= 80) {
      reliabilityLevel = 'High Reliability';
      reliabilityColor = '#34a853';
    } else if (actualAccuracy >= 65) {
      reliabilityLevel = 'Medium Reliability'; 
      reliabilityColor = '#fbbc05';
    } else {
      reliabilityLevel = 'Lower Reliability';
      reliabilityColor = '#ea4335';
    }
    
    return {
      available: true,
      confidence_bracket: currentBracket,
      actual_accuracy: actualAccuracy,
      sample_size: evaluationResults.length,
      bracket_sample_size: bracketSampleSize,
      reliability_level: reliabilityLevel,
      reliability_color: reliabilityColor,
      message: `Based on our testing with ${evaluationResults.length} verified articles, when this AI is ${currentBracket} confident, it was correct ${actualAccuracy}% of the time (${bracketStats.correct}/${bracketSampleSize} articles).`
    };
    
  } catch (error) {
    console.error("Error calculating real confidence calibration:", error);
    return {
      available: false,
      message: "Could not calculate confidence calibration from real data"
    };
  }
}

// Function to load and display ground truth - ADD THIS FUNCTION
async function loadAndDisplayGroundTruth(result) {
  const groundTruthSection = document.getElementById('ground-truth-content');
  if (!groundTruthSection) return;
  
  try {
    // Load ground truth data and evaluation results
    await loadGroundTruthData();
    
    // Calculate calibration using real data - FIXED FUNCTION CALL
    const calibration = calculateRealConfidenceCalibration(result);
    
    if (calibration.available) {
      // Show detailed calibration info
      const allBrackets = calculateRealCalibration();
      
      groundTruthSection.innerHTML = `
        <div style="background: ${calibration.reliability_color}15; border-left: 4px solid ${calibration.reliability_color}; padding: 12px; border-radius: 0 6px 6px 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="background: ${calibration.reliability_color}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">
              ${calibration.reliability_level}
            </div>
            <div style="font-size: 11px; color: #666;">
              Tested on ${calibration.sample_size} verified articles
            </div>
          </div>
          <div style="font-size: 13px; color: #333; line-height: 1.4; margin-bottom: 10px;">
            ${calibration.message}
          </div>
          
          <!-- Show all brackets for transparency -->
          <details style="margin-top: 10px;">
            <summary style="font-size: 11px; color: #666; cursor: pointer;">📊 Full calibration breakdown</summary>
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
              ${Object.entries(allBrackets).map(([bracket, data]) => 
                `<div style="margin: 2px 0;">${bracket}: ${data.correct}/${data.total} = ${data.accuracy}%</div>`
              ).join('')}
            </div>
          </details>
        </div>
      `;
    } else {
      groundTruthSection.innerHTML = `
        <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="font-size: 12px; color: #666;">
            ${calibration.message}
          </div>
        </div>
      `;
    }
    
  } catch (error) {
    console.error("Error loading ground truth:", error);
    groundTruthSection.innerHTML = `
      <div style="background: #fde7e7; padding: 12px; border-radius: 6px; text-align: center;">
        <div style="font-size: 12px; color: #666;">
          Could not load ground truth data: ${error.message}
        </div>
      </div>
    `;
  }
}

// ADD THIS NEW FUNCTION - this was missing!
function calculateRealConfidenceCalibration(currentResult) {
  try {
    console.log("Starting confidence calibration calculation...");
    console.log("evaluationResults available:", !!evaluationResults);
    console.log("evaluationResults length:", evaluationResults ? evaluationResults.length : 0);
    console.log("currentResult:", currentResult?.analysis?.confidence_score);
    
    if (!evaluationResults || evaluationResults.length === 0) {
      console.warn("No evaluation results available");
      return {
        available: false,
        message: "Real evaluation data not available"
      };
    }
    
    const confidence = currentResult?.analysis?.confidence_score || 0;
    console.log("Current confidence:", confidence);
    
    const currentBracket = getConfidenceBracket(confidence);
    console.log("Current bracket:", currentBracket);
    
    // Calculate real accuracy for this confidence bracket using actual data
    const realCalibration = calculateRealCalibration();
    const bracketStats = realCalibration[currentBracket];
    
    console.log("Bracket stats:", bracketStats);
    
    if (!bracketStats || bracketStats.total === 0) {
      console.log("No data for bracket:", currentBracket);
      return {
        available: true,
        confidence_bracket: currentBracket,
        actual_accuracy: 0,
        sample_size: evaluationResults.length,
        bracket_sample_size: 0,
        reliability_level: 'No Data',
        reliability_color: '#666',
        message: `No articles in our test set had AI confidence in the ${currentBracket} range. Our test set: ${evaluationResults.length} articles.`
      };
    }
    
    const actualAccuracy = bracketStats.accuracy;
    const bracketSampleSize = bracketStats.total;
    
    // Determine reliability level based on REAL accuracy
    let reliabilityLevel = '';
    let reliabilityColor = '';
    
    if (actualAccuracy >= 75) {
      reliabilityLevel = 'High Reliability';
      reliabilityColor = '#34a853';
    } else if (actualAccuracy >= 50) {
      reliabilityLevel = 'Medium Reliability'; 
      reliabilityColor = '#fbbc05';
    } else {
      reliabilityLevel = 'Lower Reliability';
      reliabilityColor = '#ea4335';
    }
    
    console.log("Calibration calculation successful:", {
      bracket: currentBracket,
      accuracy: actualAccuracy,
      level: reliabilityLevel
    });
    
    return {
      available: true,
      confidence_bracket: currentBracket,
      actual_accuracy: actualAccuracy,
      sample_size: evaluationResults.length,
      bracket_sample_size: bracketSampleSize,
      reliability_level: reliabilityLevel,
      reliability_color: reliabilityColor,
      message: `Based on our testing with ${evaluationResults.length} verified articles, when this AI is ${currentBracket} confident, it was correct ${actualAccuracy}% of the time (${bracketStats.correct}/${bracketSampleSize} articles).`
    };
    
  } catch (error) {
    console.error("Error calculating real confidence calibration:", error);
    console.error("Error stack:", error.stack);
    return {
      available: false,
      message: `Could not calculate confidence calibration: ${error.message}`
    };
  }
}


// ClaimBuster mini window state
let claimBusterMiniWindow = null;
let claimBusterToggleState = false;
let mouseLeaveTimeout = null;

// Simple hash function for article content
function hashString(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Generate unique hash for article content
function generateArticleHash(articleContent) {
  const { headline, article } = articleContent;
  const contentToHash = (headline || '') + '|||' + (article || '');
  return hashString(contentToHash);
}

// Cache management functions with improved error handling
async function getCachedResult(articleHash) {
  try {
    if (!isExtensionContextValid()) {
      return null;
    }
    
    const result = await chrome.storage.local.get([`analysis_${articleHash}`]);
    const cached = result[`analysis_${articleHash}`];
    
    if (cached && cached.timestamp && cached.result) {
      const hoursSinceCache = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
      // Cache expires after 7 days (168 hours) instead of 24 hours
      if (hoursSinceCache < 168) {
        console.log(`Using cached result for article (${hoursSinceCache.toFixed(1)} hours old)`);
        return cached.result;
      } else {
        // Remove expired cache silently
        try {
          chrome.storage.local.remove([`analysis_${articleHash}`]);
        } catch (e) {
          // Ignore removal errors
        }
      }
    }
  } catch (error) {
    console.log('Cache retrieval skipped due to context change');
  }
  return null;
}

async function setCachedResult(articleHash, result) {
  try {
    if (!isExtensionContextValid()) {
      return;
    }
    
    const cacheData = {
      result: result,
      timestamp: Date.now(),
      url: window.location.href
    };
    await chrome.storage.local.set({ [`analysis_${articleHash}`]: cacheData });
    console.log('Analysis result cached successfully');
  } catch (error) {
    console.log('Cache storage skipped due to context change');
  }
}

// Clean old cache entries (keep only last 50) with better error handling
async function cleanOldCache() {
  try {
    if (!isExtensionContextValid()) {
      console.log('Extension context invalid, skipping cache cleanup');
      return;
    }

    const allItems = await chrome.storage.local.get();
    const analysisKeys = Object.keys(allItems).filter(key => key.startsWith('analysis_'));
    
    // Keep last 100 entries instead of 50
    if (analysisKeys.length > 100) {
      const sortedItems = analysisKeys
        .map(key => ({ 
          key, 
          timestamp: (allItems[key] && allItems[key].timestamp) || 0 
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const keysToRemove = sortedItems.slice(100).map(item => item.key);
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`Cleaned ${keysToRemove.length} old cache entries`);
      }
    }
  } catch (error) {
    console.log('Cache cleanup skipped due to context change');
  }
}

// Check if we're on a supported news site
const isNewsSite = CONFIG.SUPPORTED_DOMAINS.some(domain => window.location.hostname.includes(domain));

// Check if the extension context is valid
function isExtensionContextValid() {
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
}

// Generate content hash for caching and identification
function generateContentHash(content) {
  if (!content) return 'no-content';
  
  // Simple hash function for content identification
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Create floating indicator button
if (isNewsSite) {
  const indicator = document.createElement('div');
  indicator.id = 'ai-fact-checker-indicator';
  indicator.innerHTML = 'AI Fact Check';
  indicator.title = 'Click to see AI fact-check results';
  
  // Set initial styles
  indicator.style.backgroundColor = '#4285f4';
  indicator.style.color = 'white';
  
  document.body.appendChild(indicator);
  
  // Add click event
  indicator.addEventListener('click', function() {
    toggleResultsPanel();
  });
}

/* =================================================================
                  MULTIMEDIA CONTENT EXTRACTION
   ================================================================= */

// Function to detect video platform
function detectVideoPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube';
  } else if (hostname.includes('tiktok.com')) {
    return 'tiktok';
  }
  return null;
}

// Capture tab audio using a stream ID from chrome.tabCapture.getMediaStreamId
async function captureTabAudio(streamId, duration) {
  try {
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm'
    ];
    let mimeType = 'audio/webm';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    return await new Promise((resolve, reject) => {
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = e => {
        stream.getTracks().forEach(t => t.stop());
        reject(new Error(e.error ? e.error.message : 'Recorder error'));
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        resolve({ blob, mimeType });
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, duration * 1000);
    });

  } catch (err) {
    console.error('Tab audio capture failed:', err);
    return { error: err.message };
  }
}

// Main function to extract video content (audio + metadata)
async function extractVideoContent() {
  console.log("🎥 Starting video content extraction...");
  
  const platform = detectVideoPlatform();
  if (!platform) {
    console.log("Not a supported video platform");
    return null;
  }
  
  console.log(`Detected platform: ${platform}`);
  
  try {
    // Get video metadata
    const metadata = await extractVideoMetadata(platform);
    
    // Use Tab Capture API for reliable audio extraction
    console.log("🎵 Attempting Tab Capture for audio extraction...");
    
    try {
      // Send request to background script to get stream ID
      console.log("📤 Sending START_TAB_CAPTURE message to background...");
      const message = {
        type: 'START_TAB_CAPTURE',
        videoData: {
          platform: platform,
          metadata: metadata,
          duration: metadata.duration || 60,
          hash: generateContentHash(metadata.title || metadata.url || window.location.href)
        }
      };
      console.log("Message details:", message);

      const tabCaptureResult = await chrome.runtime.sendMessage(message);
      console.log("📥 Received response from background:", tabCaptureResult);

      if (tabCaptureResult && tabCaptureResult.success && tabCaptureResult.streamId) {
        console.log("✅ Obtained stream ID, starting recording...");
        const recordDuration = Math.min(Math.max(metadata.duration || 60, 15), 60);
        const audioCapture = await captureTabAudio(tabCaptureResult.streamId, recordDuration);

        if (audioCapture.error || !audioCapture.blob) {
          throw new Error(audioCapture.error || 'Failed to capture tab audio');
        }

        console.log("✅ Tab audio captured:", audioCapture.blob.size, "bytes");

        return {
          platform,
          metadata,
          audio: audioCapture.blob,
          duration: recordDuration,
          format: audioCapture.mimeType,
          success: true,
          method: 'tab_capture'
        };
      } else {
        console.log("❌ Tab Capture failed:", tabCaptureResult?.error);
        throw new Error(`Tab Capture failed: ${tabCaptureResult?.error || 'Unknown error'}`);
      }

    } catch (tabCaptureError) {
      console.log("❌ Tab Capture not available, falling back to direct audio extraction...");
      console.log("Tab Capture error:", tabCaptureError.message);
      
      // Check if the error suggests permission issues or Tab Capture not working
      if (tabCaptureError.message.includes('permission') || tabCaptureError.message.includes('not allowed')) {
        console.log("🔒 Tab Capture permission issue - skipping direct capture (known to fail on protected content)");
        return {
          platform,
          metadata,
          audio: null,
          error: `Tab Capture permission denied and direct capture not reliable on ${platform}`,
          success: false
        };
      }
      
      // Fallback to old method if Tab Capture fails for other reasons
      console.log("Starting fallback audio extraction...");
      const audioResult = await extractAudioFromVideo(platform);
      console.log("Fallback audio extraction result:", audioResult);
      
      if (!audioResult || !audioResult.success) {
        const errorMsg = audioResult?.error || 'Unknown audio extraction error';
        console.error("Both Tab Capture and direct audio extraction failed:", errorMsg);
        return {
          platform,
          metadata,
          audio: null,
          error: `Tab Capture failed (${tabCaptureError.message}), Direct capture failed (${errorMsg})`,
          success: false
        };
      }
      
      if (!audioResult.audioBlob || audioResult.audioBlob.size === 0) {
        console.error("Fallback audio extraction returned empty blob");
        return {
          platform,
          metadata,
          audio: null,
          error: 'Both Tab Capture and direct audio extraction returned empty data',
          success: false
        };
      }
      
      console.log(`✅ Fallback audio extraction successful from ${platform}`);
      return {
        platform,
        metadata,
        audio: audioResult.audioBlob,
        duration: audioResult.duration,
        format: audioResult.format,
        success: true,
        method: 'direct_capture_fallback'
      };
    }
    
  } catch (error) {
    console.error("Error extracting video content:", error);
    return {
      platform,
      success: false,
      error: error.message
    };
  }
}

// Extract video metadata (title, duration, etc.)
async function extractVideoMetadata(platform) {
  console.log(`📋 Extracting metadata for ${platform}...`);
  
  switch (platform) {
    case 'youtube':
      return extractYouTubeMetadata();
    case 'tiktok':
      return extractTikTokMetadata();
    default:
      return { title: 'Unknown Video', duration: 0 };
  }
}

// YouTube metadata extraction
function extractYouTubeMetadata() {
  try {
    // Try multiple selectors for YouTube title
    const titleSelectors = [
      'h1.ytd-video-primary-info-renderer',
      'h1.title.style-scope.ytd-video-primary-info-renderer',
      'h1[class*="title"]',
      '#container h1.title'
    ];
    
    let title = 'YouTube Video';
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        title = element.textContent.trim();
        break;
      }
    }
    
    // Try to get video duration
    const video = document.querySelector('video');
    const duration = video ? video.duration : 0;
    
    // Try to get channel name
    const channelSelectors = [
      '#channel-name a',
      '.ytd-channel-name a',
      '#owner-name a'
    ];
    
    let channel = 'Unknown Channel';
    for (const selector of channelSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        channel = element.textContent.trim();
        break;
      }
    }
    
    console.log(`YouTube metadata: ${title} by ${channel} (${duration}s)`);
    
    return {
      title,
      channel,
      duration,
      url: window.location.href
    };
  } catch (error) {
    console.error("Error extracting YouTube metadata:", error);
    return { title: 'YouTube Video', duration: 0 };
  }
}

// TikTok metadata extraction
function extractTikTokMetadata() {
  try {
    // TikTok title/description selectors
    const titleSelectors = [
      '[data-e2e="browse-video-desc"]',
      '[data-e2e="video-desc"]',
      '.tt-video-meta-caption',
      '[class*="video-meta"] [class*="desc"]'
    ];
    
    let title = 'TikTok Video';
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        title = element.textContent.trim().substring(0, 200); // Limit length
        break;
      }
    }
    
    // Try to get video duration
    const video = document.querySelector('video');
    const duration = video ? video.duration : 0;
    
    // Try to get username
    const userSelectors = [
      '[data-e2e="browse-username"]',
      '[data-e2e="video-author-uniqueid"]',
      '.author-uniqueId'
    ];
    
    let username = 'Unknown User';
    for (const selector of userSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        username = element.textContent.trim();
        break;
      }
    }
    
    console.log(`TikTok metadata: ${title} by ${username} (${duration}s)`);
    
    return {
      title,
      username,
      duration,
      url: window.location.href
    };
  } catch (error) {
    console.error("Error extracting TikTok metadata:", error);
    return { title: 'TikTok Video', duration: 0 };
  }
}

// Extract audio from video element using captureStream API (CORS-friendly)
async function extractAudioFromVideo(platform) {
  console.log(`🎵 Extracting audio from ${platform} video...`);
  
  // Prevent multiple simultaneous audio extractions
  if (isExtractingAudio) {
    console.log("Audio extraction already in progress, skipping...");
    return {
      success: false,
      error: 'Audio extraction already in progress'
    };
  }
  
  isExtractingAudio = true;
  
  try {
    // Find video element based on platform
    const video = findVideoElement(platform);
    
    if (!video) {
      throw new Error(`Could not find video element for ${platform}`);
    }
    
    console.log("Video element found:", {
      duration: video.duration,
      readyState: video.readyState,
      muted: video.muted,
      volume: video.volume,
      paused: video.paused,
      currentTime: video.currentTime,
      hasAudioTracks: video.audioTracks?.length || 'unknown',
      src: video.src?.substring(0, 100) + '...'
    });
    
    // Check if video is playing
    if (video.paused) {
      console.log("Video is paused, attempting to play for audio capture...");
      try {
        await video.play();
        console.log("Video play successful");
      } catch (playError) {
        console.warn("Could not play video:", playError.message);
        // Continue anyway - some videos can still be captured while paused
      }
    }
    
    if (video.muted || video.volume === 0) {
      console.log("Video is muted, unmuting for audio extraction...");
      video.muted = false;
      video.volume = 1.0;
    }
    
    // Check if video has loaded enough data
    if (video.readyState < 3) {
      console.log("Waiting for video to load...");
      await new Promise((resolve) => {
        const onReady = () => {
          console.log("Video ready state changed to:", video.readyState);
          if (video.readyState >= 3) resolve();
        };
        video.addEventListener('canplaythrough', onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
        // Fallback timeout
        setTimeout(() => {
          console.log("Video load timeout, proceeding anyway...");
          resolve();
        }, 5000);
      });
    }
    
    // Try captureStream method first (more compatible with CORS)
    console.log("Attempting to use captureStream API...");
    let stream;
    let audioContext; // Keep reference for cleanup
    
    try {
      if (video.captureStream) {
        stream = video.captureStream();
      } else if (video.mozCaptureStream) {
        stream = video.mozCaptureStream();
      } else {
        throw new Error("captureStream not supported");
      }
      console.log("captureStream successful, stream tracks:", stream.getTracks().length);
      
      // Validate stream has tracks
      if (stream.getTracks().length === 0) {
        throw new Error("captureStream returned empty stream");
      }
      
    } catch (captureError) {
      console.log("captureStream failed, falling back to Web Audio API:", captureError.message);
      
      try {
        // Fallback to Web Audio API
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
          console.log("Resuming AudioContext...");
          await audioContext.resume();
        }
        
        console.log("Creating MediaElementSource...");
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination);
        stream = destination.stream;
        
        console.log("Web Audio API fallback successful, stream tracks:", stream.getTracks().length);
        
      } catch (webAudioError) {
        console.error("Both captureStream and Web Audio API failed:", webAudioError);
        throw new Error(`Audio extraction not possible: captureStream failed (${captureError.message}), Web Audio API failed (${webAudioError.message})`);
      }
    }
    
    // Check if stream has audio tracks with detailed logging
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    console.log("=== STREAM ANALYSIS ===");
    console.log("Audio tracks found:", audioTracks.length);
    console.log("Video tracks found:", videoTracks.length);
    console.log("All tracks:", stream.getTracks().map(t => ({
      kind: t.kind, 
      label: t.label, 
      enabled: t.enabled,
      readyState: t.readyState,
      muted: t.muted
    })));
    console.log("Stream active:", stream.active);
    console.log("========================");
    
    if (audioTracks.length === 0) {
      throw new Error("No audio tracks found in the video stream - video may be muted, not playing, or DRM protected");
    }
    
    // Test MediaRecorder support first
    console.log("=== MEDIARECORDER SUPPORT TEST ===");
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm', 
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    
    mimeTypes.forEach(type => {
      console.log(`${type}: ${MediaRecorder.isTypeSupported(type) ? '✅' : '❌'}`);
    });
    
    const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    console.log("Selected MIME type:", supportedType || '(browser default)');
    console.log("===================================");
    
    // Create MediaRecorder with proper error handling
    let mediaRecorder;
    try {
      mediaRecorder = supportedType 
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);
      console.log("✅ MediaRecorder created successfully");
      console.log("MediaRecorder mimeType:", mediaRecorder.mimeType);
    } catch (error) {
      console.error("❌ MediaRecorder construction failed:", error.name, error.message);
      throw new Error(`MediaRecorder creation failed: ${error.message}`);
    }
    
    const audioChunks = [];
    
    // Set up event handler
    mediaRecorder.ondataavailable = (event) => {
      console.log("MediaRecorder data available:", event.data.size, "bytes");
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    // Start recording with detailed debugging
    console.log("Starting MediaRecorder...");
    console.log("MediaRecorder state:", mediaRecorder.state);
    console.log("MediaRecorder mimeType:", mediaRecorder.mimeType);
    console.log("Stream active:", stream.active);
    console.log("Audio tracks:", stream.getAudioTracks().map(t => ({ 
      kind: t.kind, 
      enabled: t.enabled, 
      readyState: t.readyState,
      label: t.label 
    })));
    
    // Start MediaRecorder using reliable approach (no timeslice initially)
    try {
      console.log("=== STARTING MEDIARECORDER ===");
      console.log("MediaRecorder state before start:", mediaRecorder.state);
      
      // IMPORTANT: Start without timeslice first - Chromium can throw with timeslice in some states
      mediaRecorder.start();
      console.log("✅ MediaRecorder started successfully (no timeslice)");
      console.log("MediaRecorder state after start:", mediaRecorder.state);
      console.log("===============================");
      
    } catch (startError) {
      console.error("❌ MediaRecorder.start failed:", startError.name, startError.message);
      console.error("MediaRecorder state:", mediaRecorder.state);
      console.error("Stream active:", stream.active);
      console.error("Stream tracks:", stream.getTracks().map(t => `${t.kind}: ${t.readyState}`));
      
      // Try with fresh stream as last resort
      console.log("🔄 Last resort: creating fresh stream from video element...");
      try {
        const freshStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        const freshAudioTracks = freshStream.getAudioTracks();
        
        if (freshAudioTracks.length === 0) {
          throw new Error("Fresh stream also has no audio tracks");
        }
        
        const freshRecorder = supportedType 
          ? new MediaRecorder(freshStream, { mimeType: supportedType })
          : new MediaRecorder(freshStream);
          
        freshRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunks.push(event.data);
        };
        
        freshRecorder.start();
        mediaRecorder = freshRecorder;
        console.log("✅ Fresh MediaRecorder started successfully");
        
      } catch (freshError) {
        console.error("❌ Fresh MediaRecorder also failed:", freshError.name, freshError.message);
        throw new Error(`All MediaRecorder start attempts failed: ${startError.message} | Fresh attempt: ${freshError.message}`);
      }
    }
    
    // Record for the duration of the video or max 10 minutes
    const recordingDuration = Math.min(video.duration * 1000, 10 * 60 * 1000);
    
    console.log(`Recording audio for ${recordingDuration / 1000} seconds...`);
    console.log(`Video duration: ${video.duration} seconds, using: ${recordingDuration / 1000} seconds`);
    
    // Wait for recording to complete
    const audioBlob = await new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        console.log(`Recording stopped. Audio chunks collected: ${audioChunks.length}`);
        
        if (audioChunks.length === 0) {
          console.error("No audio chunks captured during recording!");
        } else {
          console.log("Audio chunks details:", audioChunks.map(chunk => ({ 
            size: chunk.size, 
            type: chunk.type 
          })));
        }
        
        const finalMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: finalMimeType });
        
        console.log("=== FINAL BLOB ANALYSIS ===");
        console.log("Blob details:", { 
          type: blob.type, 
          size: blob.size,
          sizeKB: Math.round(blob.size / 1024),
          chunks: audioChunks.length 
        });
        console.log("MediaRecorder final mimeType:", mediaRecorder.mimeType);
        console.log("============================");
        
        // Additional validation
        if (blob.size === 0) {
          console.error("❌ Created blob is empty - audio capture failed!");
          return reject(new Error("Audio recording produced empty blob"));
        }
        
        if (blob.size < 1000) {
          console.warn("⚠️ Blob is very small, may be corrupted or insufficient audio captured");
        }
        
        // Stop all tracks to free resources
        stream.getTracks().forEach(track => track.stop());
        
        // Close AudioContext if we created one
        if (audioContext) {
          audioContext.close();
        }
        
        resolve(blob);
      };
      
      mediaRecorder.onerror = (error) => {
        console.error("MediaRecorder error:", error);
        stream.getTracks().forEach(track => track.stop());
        
        // Close AudioContext if we created one
        if (audioContext) {
          audioContext.close();
        }
        
        reject(error);
      };
      
      // Stop recording after duration
      setTimeout(() => {
        console.log("Stopping recording after timeout...");
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, recordingDuration);
    });
    
    return {
      success: true,
      audioBlob,
      duration: recordingDuration / 1000,
      format: mimeType
    };
    
  } catch (error) {
    console.error("Audio extraction failed:", error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Always reset the extraction flag
    isExtractingAudio = false;
    console.log("Audio extraction flag reset");
  }
}

// Find video element based on platform
function findVideoElement(platform) {
  let selectors = [];
  
  switch (platform) {
    case 'youtube':
      selectors = [
        'video.html5-main-video',
        '.video-stream.html5-main-video',
        '#movie_player video',
        'video'
      ];
      break;
      
    case 'tiktok':
      selectors = [
        'video[data-e2e="video-player"]',
        '.video-player video',
        '[class*="video-player"] video',
        'video'
      ];
      break;
  }
  
  for (const selector of selectors) {
    const video = document.querySelector(selector);
    if (video && video.readyState > 0) {
      console.log(`Found video element with selector: ${selector}`);
      return video;
    }
  }
  
  console.warn(`No suitable video element found for ${platform}`);
  return null;
}

// Helper function to convert audio blob to appropriate format for Whisper
async function prepareAudioForWhisper(audioBlob) {
  console.log("🔧 Preparing audio for Whisper API...");
  
  try {
    // Convert WebM to WAV/MP3 if needed
    // For now, we'll send the WebM directly as Whisper supports it
    
    // Check file size (Whisper has a 25MB limit)
    const maxSize = 25 * 1024 * 1024; // 25MB
    
    if (audioBlob.size > maxSize) {
      console.log(`Audio file too large: ${audioBlob.size} bytes, compressing...`);
      
      // TODO: Implement audio compression if needed
      // For now, we'll truncate by taking the first part
      const truncatedSize = maxSize - 1000; // Leave some buffer
      const truncatedBlob = audioBlob.slice(0, truncatedSize);
      
      return {
        audioBlob: truncatedBlob,
        compressed: true,
        originalSize: audioBlob.size,
        compressedSize: truncatedSize
      };
    }
    
    return {
      audioBlob: audioBlob,
      compressed: false,
      size: audioBlob.size
    };
    
  } catch (error) {
    console.error("Error preparing audio for Whisper:", error);
    throw error;
  }
}

/* =================================================================
                  END OF MULTIMEDIA EXTRACTION
   ================================================================= */

// Enhanced function to extract article content with improved Zeit.de support
/**
 * Return { headline, article } where `article` is the cleaned main-text
 * body and `headline` is the best-guess <h1>/<span> title.
 *
 * – Handles bullet-list intros on Zeit.de
 * – Jumps into the same-origin <iframe> used by ZEIT-Plus pages
 * – Stops scanning as soon as the first domain-specific rule wins,
 *   so generic catch-alls can't overtake it.
 */
function extractArticleContent() {
  try {
    console.log("STARTING CONTENT EXTRACTION DEBUG");

    /* ─────────────────── 0. Pick the DOM root (iframe aware) ─────────────────── */
    const root =
      document.querySelector('iframe[src*="zeit"]')?.contentDocument ||
      document;

    /* ─────────────────── 1. HEADLINE  ─────────────────── */
    const headlineSelectors = [
      // ZEIT 2024+ layout
      '.header-image__title',
      '.header-image__heading',
      // older ZEIT layouts
      '.article__header h1',
      '.headline__title',
      // generic fallback
      '[itemprop="headline"]',
    ];

    let headline = '';
    for (const sel of headlineSelectors) {
      const h = root.querySelector(sel);
      if (h && h.textContent.trim().length) {
        headline = h.textContent.trim();
        break;
      }
    }

    /* ─────────────────── 2. BODY selectors  ─────────────────── */
    const bodySelectors = [
      // ── ZEIT Online first (p *and* li to catch bullet intros) ──
      '.article-body p, .article-body li',               // standard template
      '.article__body p, .article__body li',             // legacy template
      '.zplus-article__body p, .zplus-article__body li', // ZEIT-Plus
      '.markup__text p, .markup__text li',               // bullet-list intro
      '[itemprop="articleBody"] p, [itemprop="articleBody"] li',

      // ── BBC ──
      '.story-body__inner p',
      '.ssrcss-11r1m41-RichTextComponentWrapper p',

      // ── CNN ──
      '.Article__content p',
      '.zn-body__paragraph',
      '.article__content p',

      // ── Guardian ──
      '.article-body-commercial-selector p',
      '.dcr-7vl6yc p',

      // ── NYT ──
      '.StoryBodyCompanionColumn p',
      '.meteredContent p',

      // ── Washington Post ──
      '.article-body p',
      '.teaser-content p',

      // ── Reuters ──
      '.article-body__content p',
      '.StandardArticleBody_body p',

      // ── Al Jazeera ──
      '.wysiwyg p',
      '.article__content p',

      // ── NIUS / compact-online ──
      '.entry-content p',
      '.post-content p',
      '.article-content p',
      '.content-area p',
      '.article-text p',
      '.main-content p',

      // ── Generic fall-backs ──
      'article p',
      '[class*="article-body"] p',
      '[class*="content"] p',
      'main p',
      '[role="main"] p',
      '.content p',
      '.post p',
      '[class*="article"] p',
      '[class*="post"] p',
      '[class*="entry"] p',
      'p',
    ];

    /* ─────────────────── 3.  Scan & score  ─────────────────── */
    let bestMatch = [];
    for (const selector of bodySelectors) {
      const nodes = Array.from(root.querySelectorAll(selector));
      if (nodes.length === 0) continue; // nothing to check

      console.log(`Selector "${selector}" matched ${nodes.length} elements`);

      /* --- keep only “real” paragraphs / list-items --- */
      const valid = nodes.filter((el) => {
        const txt = el.innerText.trim();

        // contamination / boilerplate
        if (
          txt.includes("Der Artikel berichtet über") ||
          txt.includes("Keine erkennbaren Manipulationstaktiken") ||
          txt.includes("Target Audience:") ||
          txt.includes("Political Framing:")
        )
          return false;

        // length & generic boilerplate filters
        if (
          txt.length < 25 ||
          /^(Share|Tweet|Email|Print|Subscribe|Teilen|Werbung)$/i.test(txt) ||
          /^[0-9\s\-/.:]+$/.test(txt) ||
          txt.includes("© 202") ||
          txt.includes("Alle Rechte vorbehalten") ||
          txt.match(/\+\+\+.*\+\+\+/)
        )
          return false;

        // inside nav/ads/etc.
        if (
          el.closest(
            'nav, footer, aside, .navigation, .menu, .sidebar, .comments, .related, .newsletter, .ad, .advertisement, .breaking-news, .live-ticker, .ticker, [class*="breaking"], [class*="ticker"], [class*="banner"]'
          )
        )
          return false;

        return true;
      });

      /* ----- accept immediately if we’re on ZEIT and got ≥1 clean nodes ----- */
      const isZeit = location.hostname.endsWith("zeit.de");
      if (isZeit && valid.length) {
        bestMatch = valid;
        console.log(`ZEIT selector won: ${selector}`);
        break;
      }

      /* ----- for other sites, require ≥2 clean nodes ----- */
      if (valid.length >= 2) {
        bestMatch = valid;
        console.log(`Selector won: ${selector}`);
        break; // stop at first decent hit
      }
    }

    /* ─────────────────── 4.  Clean & join ─────────────────── */
    const article = bestMatch
      .map((el) =>
        el.innerText
          .trim()
          .replace(/\s+/g, " ") // collapse whitespace
          .replace(/^\d+\s*/, "") // leading numbers
          .replace(/^[•·\-–—]\s*/, "") // bullets/dashes
      )
      .join("\n\n");

    console.log("Headline:", headline);
    console.log("Paragraphs:", bestMatch.length);
    console.log("Characters :", article.length);

    return { headline, article };
  } catch (err) {
    console.error("extractArticleContent failed:", err);
    return { headline: null, article: "" };
  }
}


// Create results panel
let resultsPanel = null;

function createResultsPanel() {
  if (resultsPanel) return;
  
  resultsPanel = document.createElement('div');
  resultsPanel.id = 'ai-fact-checker-results-panel';
  resultsPanel.style.display = 'none';
  
  resultsPanel.innerHTML = `
    <div class="ai-panel-header">
      <h3 class="ai-panel-title">AI Fact Checker</h3>
      <button class="ai-close-btn" id="ai-close-panel">×</button>
    </div>
    <div class="ai-panel-content" id="ai-panel-content">
      <!-- Content will be populated here -->
    </div>
  `;
  
  document.body.appendChild(resultsPanel);
  
  // Add close button handler
  document.getElementById('ai-close-panel').addEventListener('click', function() {
    resultsPanel.style.display = 'none';
    // Hide ClaimBuster window when panel closes
    hideClaimBusterMiniWindow();
  });
}

// Toggle results panel with cache support
async function toggleResultsPanel() {
  if (!resultsPanel) {
    createResultsPanel();
  }
  
  if (resultsPanel.style.display === 'none') {
    resultsPanel.style.display = 'block';
    
    if (latestResults) {
      displayResults(latestResults);
    } else if (isAnalyzing) {
      showLoadingState('Analysis in progress...');
    } else {
      // Check if we have cached results for current page
      if (currentArticleHash) {
        const cachedResult = await getCachedResult(currentArticleHash);
        if (cachedResult) {
          latestResults = cachedResult;
          displayResults(cachedResult);
          return;
        }
      }
      
      // No results or cache, show initial state
      showInitialState();
    }
  } else {
    resultsPanel.style.display = 'none';
    // Hide ClaimBuster window when panel closes
    hideClaimBusterMiniWindow();
  }
}

// Show loading state
function showLoadingState(message = 'Analyzing with AI...') {
  // Ensure panel exists before trying to update it
  if (!resultsPanel) {
    createResultsPanel();
  }
  
  const contentDiv = document.getElementById('ai-panel-content');
  if (contentDiv) {
    contentDiv.innerHTML = `
      <div class="ai-loading">
        <div class="ai-loading-spinner"></div>
        <p class="ai-loading-text">${message}</p>
      </div>
    `;
  }
}

// Show initial state with manual reset option
function showInitialState() {
  // Ensure panel exists before trying to update it
  if (!resultsPanel) {
    createResultsPanel();
  }
  
  const contentDiv = document.getElementById('ai-panel-content');
  if (contentDiv) {
    // Check if we're stuck in analyzing state
    const isStuck = isAnalyzing && hasAnalyzedCurrentPage;
    
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🤖</div>
        <h3 style="margin: 0 0 12px 0; color: #333;">${isStuck ? 'Analysis seems stuck?' : 'No analysis yet'}</h3>
        <p style="color: #666; margin: 0 0 20px 0;">${isStuck ? 'Click below to reset and try again.' : 'Click the button below to analyze this article with AI.'}</p>
        <button class="ai-btn ai-btn-primary" id="ai-start-analysis">
          ${isStuck ? 'Reset & Analyze' : 'Analyze Article'}
        </button>
        ${isStuck ? `
          <div style="margin-top: 15px; padding: 10px; background-color: #fff8e1; border-radius: 6px; font-size: 12px; color: #e65100;">
            If analysis keeps getting stuck, try refreshing the page.
          </div>
        ` : ''}
      </div>
    `;
    
    const startBtn = document.getElementById('ai-start-analysis');
    if (startBtn) {
      startBtn.addEventListener('click', function() {
        // Reset state if stuck
        if (isStuck) {
          console.log('Manual reset triggered');
          isAnalyzing = false;
          hasAnalyzedCurrentPage = false;
          currentArticleHash = null;
          analysisPromise = null;
          
          // Reset indicator
          const indicator = document.getElementById('ai-fact-checker-indicator');
          if (indicator) {
            indicator.style.backgroundColor = '#4285f4';
            indicator.innerHTML = 'AI Fact Check';
            indicator.classList.remove('analyzing');
          }
        }
        
        startAnalysis(true); // Force new analysis
      });
    }
  }
}

// NEW: Function to convert ClaimBuster scores to German priority levels
function getClaimBusterPriority(score) {
  if (score >= 0.8) {
    return { level: 'Hochpriorität', color: '#ea4335', bgColor: '#fce8e6' };
  } else if (score >= 0.6) {
    return { level: 'Mittelpriorität', color: '#fbbc05', bgColor: '#fef7e0' };
  } else {
    return { level: 'Niedrigpriorität', color: '#34a853', bgColor: '#e6f4ea' };
  }
}

// NEW: Test function to manually trigger ClaimBuster toggle
function testClaimBusterToggle() {
  console.log("=== TESTING CLAIMBUSTER TOGGLE ===");
  const toggle = document.getElementById('claimbuster-toggle');
  
  if (!toggle) {
    console.log("Toggle not found");
    return;
  }
  
  console.log("Toggle current state:", toggle.checked);
  console.log("Toggle disabled:", toggle.disabled);
  console.log("Toggle setup status:", toggle.dataset.claimBusterSetup);
  
  // Try to toggle it ONCE
  const newState = !toggle.checked;
  console.log(`🔄 Manually setting toggle to: ${newState}`);
  
  toggle.checked = newState;
  
  // Manually trigger the change event
  const changeEvent = new Event('change', { bubbles: false }); 
  toggle.dispatchEvent(changeEvent);
  
  console.log("Toggle new state:", toggle.checked);
  console.log("Expected expandable section state:", newState ? "EXPANDED" : "COLLAPSED");
  console.log("================================");
}

// NEW: Function to force show expandable section for testing
function forceShowExpandableSection() {
  console.log("🔧 FORCE SHOWING EXPANDABLE SECTION FOR TESTING");
  const expandableSection = document.querySelector('.claimbuster-expandable');
  
  if (expandableSection) {
    showClaimBusterExpandableSection();
    console.log("Expandable section forced visible");
  } else {
    console.log("No expandable section exists");
    console.log("Let's check if ClaimBuster data exists...");
    console.log("Latest results:", latestResults?.claimbuster);
  }
}

// NEW: Function to debug expandable section
function debugExpandableSection() {
  console.log("DEBUGGING EXPANDABLE SECTION");
  
  const expandableSection = document.querySelector('.claimbuster-expandable');
  if (!expandableSection) {
    console.log("expandableSection is null/undefined");
    
    // Try to find the ClaimBuster section
    const claimBusterSection = document.querySelector('.ai-analysis-panel').querySelector('[class*="claim"]')?.closest('div');
    console.log("ClaimBuster section found:", !!claimBusterSection);
    if (claimBusterSection) {
      console.log("ClaimBuster section:", claimBusterSection);
    }
    return;
  }
  
  console.log("expandableSection exists");
  console.log("Element:", expandableSection);
  console.log("Parent:", expandableSection.parentElement);
  console.log("Display:", expandableSection.style.display);
  console.log("Opacity:", expandableSection.style.opacity);
  console.log("Max height:", expandableSection.style.maxHeight);
  console.log("Content:", expandableSection.innerHTML.substring(0, 200) + "...");
  
  const rect = expandableSection.getBoundingClientRect();
  console.log("Position and size:", rect);
}

// Make test functions globally available for debugging
window.testClaimBusterToggle = testClaimBusterToggle;
window.forceShowExpandableSection = forceShowExpandableSection;
window.debugExpandableSection = debugExpandableSection;

// NEW: Function to create ClaimBuster toggle switch
function createClaimBusterToggle(claimbusterResult) {
  console.log("=== CREATING CLAIMBUSTER TOGGLE ===");
  console.log("Creating ClaimBuster toggle with result:", claimbusterResult);
  
  // Check if we have any ClaimBuster data at all
  const hasClaimBusterAttempt = claimbusterResult && (claimbusterResult.success || claimbusterResult.error);
  
  if (!hasClaimBusterAttempt) {
    console.log("No ClaimBuster attempt detected - showing disabled toggle");
    return `
      <div class="ai-claimbuster-toggle-section">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 15px 0;">
          <div>
            <span style="font-weight: 600; color: #666;">ClaimBuster</span>
            <div style="font-size: 12px; color: #888;">Nicht verfügbar</div>
          </div>
          <div style="opacity: 0.5;">
            <div class="ai-toggle-switch disabled">
              <input type="checkbox" id="claimbuster-toggle" disabled>
              <span class="ai-toggle-slider"></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ClaimBuster analysis failed
  if (!claimbusterResult.success) {
    console.log("ClaimBuster analysis failed - showing failed toggle:", claimbusterResult.error);
    return `
      <div class="ai-claimbuster-toggle-section">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 15px 0;">
          <div>
            <span style="font-weight: 600; color: #ea4335;">ClaimBuster</span>
            <div style="font-size: 12px; color: #ea4335;">Analyse fehlgeschlagen</div>
          </div>
          <div style="opacity: 0.5;">
            <div class="ai-toggle-switch disabled">
              <input type="checkbox" id="claimbuster-toggle" disabled>
              <span class="ai-toggle-slider"></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ClaimBuster analysis succeeded - ALWAYS make toggle clickable
  const analysis = claimbusterResult.analysis;
  const claimCount = analysis.checkworthy_claims ? analysis.checkworthy_claims.length : 0;
  const totalAnalyzed = analysis.analyzed_sentences || 0;
  
  console.log(`ClaimBuster analysis succeeded: ${claimCount} claims from ${totalAnalyzed} sentences - ENABLING TOGGLE`);
  
  return `
    <div class="ai-claimbuster-toggle-section">
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 15px 0;">
        <div>
          <span style="font-weight: 600; color: #333;">ClaimBuster</span>
          <div style="font-size: 12px; color: #666;">${claimCount} Aussagen erkannt</div>
        </div>
        <div class="ai-toggle-switch">
          <input type="checkbox" id="claimbuster-toggle">
          <span class="ai-toggle-slider"></span>
        </div>
      </div>
    </div>
  `;
}

// NEW: Function to create ClaimBuster mini window
function createClaimBusterMiniWindow(claimbusterResult) {
  console.log("Creating ClaimBuster mini window with result:", claimbusterResult);
  
  if (claimBusterMiniWindow) {
    document.body.removeChild(claimBusterMiniWindow);
  }

  claimBusterMiniWindow = document.createElement('div');
  claimBusterMiniWindow.className = 'ai-claimbuster-mini-window';
  
  const analysis = claimbusterResult.analysis;
  const overallPriority = getClaimBusterPriority(analysis.overall_score || 0);
  
  let claimsHtml = '';
  
  // Check if we have any check-worthy claims
  if (analysis.checkworthy_claims && analysis.checkworthy_claims.length > 0) {
    claimsHtml = analysis.checkworthy_claims.slice(0, 5).map(claim => {
      const claimPriority = getClaimBusterPriority(claim.score);
      return `
        <div style="margin: 8px 0; padding: 8px; background: ${claimPriority.bgColor}; border-radius: 4px;">
          <div style="font-size: 13px; line-height: 1.3; margin-bottom: 4px;">${claim.sentence.substring(0, 80)}${claim.sentence.length > 80 ? '...' : ''}</div>
          <div style="font-size: 11px; color: ${claimPriority.color}; font-weight: 600;">${claimPriority.level}</div>
        </div>
      `;
    }).join('');
  } else if (analysis.all_results && analysis.all_results.length > 0) {
    // Show some low-priority claims if no high-priority ones exist
    claimsHtml = analysis.all_results.slice(0, 3).map(result => {
      const claimPriority = getClaimBusterPriority(result.score);
      return `
        <div style="margin: 8px 0; padding: 8px; background: ${claimPriority.bgColor}; border-radius: 4px;">
          <div style="font-size: 13px; line-height: 1.3; margin-bottom: 4px;">${result.sentence.substring(0, 80)}${result.sentence.length > 80 ? '...' : ''}</div>
          <div style="font-size: 11px; color: ${claimPriority.color}; font-weight: 600;">${claimPriority.level}</div>
        </div>
      `;
    }).join('');
    
    if (claimsHtml) {
      claimsHtml = `<div style="font-size: 11px; color: #666; margin-bottom: 8px; font-style: italic;">Niedrig bewertete Aussagen:</div>${claimsHtml}`;
    }
  }
  
  // Fallback message if no claims at all
  if (!claimsHtml) {
    claimsHtml = `
      <div style="text-align: center; color: #666; font-size: 12px; padding: 15px;">
        <div style="font-size: 24px; margin-bottom: 8px;">✅</div>
        <div style="font-weight: 600; margin-bottom: 4px;">Keine auffälligen Aussagen</div>
        <div>Analysiert: ${analysis.analyzed_sentences || 0} Sätze</div>
      </div>
    `;
  }

  claimBusterMiniWindow.innerHTML = `
    <div style="text-align: center; padding: 12px; background: ${overallPriority.bgColor}; border-radius: 8px 8px 0 0; border-left: 4px solid ${overallPriority.color};">
      <div style="font-weight: 600; color: ${overallPriority.color}; font-size: 14px;">${overallPriority.level}</div>
      <div style="font-size: 11px; color: #666; margin-top: 2px;">Score: ${(analysis.overall_score || 0).toFixed(2)}</div>
    </div>
    <div style="border-top: 1px solid #e0e0e0; padding: 10px; max-height: 200px; overflow-y: auto;">
      ${claimsHtml}
    </div>
  `;

  document.body.appendChild(claimBusterMiniWindow);
  
  // Add mouse leave handler
  claimBusterMiniWindow.addEventListener('mouseleave', function() {
    if (mouseLeaveTimeout) clearTimeout(mouseLeaveTimeout);
    mouseLeaveTimeout = setTimeout(() => {
      hideClaimBusterMiniWindow();
    }, 300); // 300ms delay before hiding
  });

  // Cancel hide on mouse enter
  claimBusterMiniWindow.addEventListener('mouseenter', function() {
    if (mouseLeaveTimeout) {
      clearTimeout(mouseLeaveTimeout);
      mouseLeaveTimeout = null;
    }
  });
  
  console.log("ClaimBuster mini window created successfully");
}

// NEW: Function to show ClaimBuster mini window
function showClaimBusterMiniWindow() {
  console.log("showClaimBusterMiniWindow called");
  
  if (!claimBusterMiniWindow) {
    console.log("No ClaimBuster mini window exists");
    return;
  }
  
  console.log("Showing ClaimBuster mini window with AGGRESSIVE STYLING");
  
  // AGGRESSIVE styling to make sure it's visible
  claimBusterMiniWindow.style.position = 'fixed';
  claimBusterMiniWindow.style.top = '100px';  // Changed from bottom to top
  claimBusterMiniWindow.style.right = '100px';
  claimBusterMiniWindow.style.zIndex = '999999999'; // Even higher z-index
  claimBusterMiniWindow.style.display = 'block';
  claimBusterMiniWindow.style.opacity = '1'; // Start with full opacity
  claimBusterMiniWindow.style.width = '300px';
  claimBusterMiniWindow.style.height = 'auto';
  claimBusterMiniWindow.style.minHeight = '100px';
  
  // Add VERY visible styling for debugging
  claimBusterMiniWindow.style.border = '5px solid red';
  claimBusterMiniWindow.style.backgroundColor = 'yellow';
  claimBusterMiniWindow.style.color = 'black';
  claimBusterMiniWindow.style.padding = '20px';
  claimBusterMiniWindow.style.fontSize = '16px';
  claimBusterMiniWindow.style.fontWeight = 'bold';
  
  // Add a test message
  if (!claimBusterMiniWindow.querySelector('.test-message')) {
    const testDiv = document.createElement('div');
    testDiv.className = 'test-message';
    testDiv.innerHTML = '🎯 ClaimBuster Mini Window - VISIBLE TEST';
    testDiv.style.cssText = 'background: red; color: white; padding: 10px; margin: 10px 0; border: 2px solid black;';
    claimBusterMiniWindow.insertBefore(testDiv, claimBusterMiniWindow.firstChild);
  }
  
  // Log final position for debugging
  console.log("ClaimBuster mini window positioned and styled");
  
  setTimeout(() => {
    if (claimBusterMiniWindow) {
      const rect = claimBusterMiniWindow.getBoundingClientRect();
      console.log("Mini window position and size:", {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0,
        inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
      });
      
      console.log("Window viewport size:", {
        width: window.innerWidth,
        height: window.innerHeight
      });
      
      console.log("ClaimBuster mini window should be VERY visible now with yellow background and red border!");
    }
  }, 100);
}

// NEW: Function to hide ClaimBuster mini window
function hideClaimBusterMiniWindow() {
  console.log("hideClaimBusterMiniWindow called");
  
  if (!claimBusterMiniWindow) {
    console.log("No ClaimBuster mini window exists");
    return;
  }
  
  console.log("Hiding ClaimBuster mini window");
  claimBusterMiniWindow.style.opacity = '0';
  
  // Hide after fade-out animation
  setTimeout(() => {
    if (claimBusterMiniWindow) {
      claimBusterMiniWindow.style.display = 'none';
      console.log("ClaimBuster mini window fade-out complete");
    }
  }, 200);
}

// MODIFIED: Enhanced displayResults function with simplified ClaimBuster toggle UI
function displayResults(result) {
  if (!resultsPanel) {
    createResultsPanel();
  }
  
  const contentDiv = document.getElementById('ai-panel-content');
  if (!contentDiv) {
    console.error('Could not find panel content div');
    return;
  }

  // Add comprehensive logging to debug the data structure
  console.log("=== DISPLAY RESULTS DEBUG ===");
  console.log("Full result object:", result);
  console.log("Result success:", result.success);
  console.log("Result analysis:", result.analysis);
  console.log("Result openai:", result.openai);
  console.log("Result claimbuster:", result.claimbuster);
  console.log("===============================");

  if (!result.success) {
    contentDiv.innerHTML = `
      <div class="ai-verdict-banner misleading">
        <div class="ai-verdict-title">❌ Analysis Failed</div>
        <div class="ai-verdict-summary">${result.error || 'Unable to analyze this article. Please try again.'}</div>
      </div>
      <div class="ai-action-buttons">
        <button class="ai-btn ai-btn-primary" id="try-again-btn">Try Again</button>
      </div>
    `;
    
    // Add event listener for try again button
    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) {
      tryAgainBtn.addEventListener('click', function() {
        console.log("Try Again button clicked");
        
        // Reset all state
        isAnalyzing = false;
        hasAnalyzedCurrentPage = false;
        latestResults = null;
        analysisPromise = null;
        
        // Clear cache for current article
        if (currentArticleHash && isExtensionContextValid()) {
          try {
            chrome.storage.local.remove([`analysis_${currentArticleHash}`]);
            console.log("Cache cleared for retry");
          } catch (e) {
            console.log("Cache clear failed, continuing anyway");
          }
        }
        
        currentArticleHash = null;
        
        // Reset indicator
        const indicator = document.getElementById('ai-fact-checker-indicator');
        if (indicator) {
          indicator.style.backgroundColor = '#4285f4';
          indicator.innerHTML = 'AI Fact Check';
          indicator.classList.remove('analyzing');
        }
        
        // Close panel and start fresh analysis
        resultsPanel.style.display = 'none';
        
        // Start new analysis after a brief delay
        setTimeout(() => {
          startAnalysis(true);
        }, 500);
      });
    }
    
    return;
  }
  
  // Enhanced data extraction with better fallbacks
  const analysis = result.analysis || {};
  
  // Extract key data with comprehensive fallbacks
  let verdict = analysis.overall_verdict || analysis.verdict || 'UNKNOWN';
  let confidence = analysis.confidence_score || analysis.confidence || 0;
  let summary = analysis.summary || analysis.detailed_analysis || 'Analysis completed';
  let recommendations = analysis.recommendations || 'No specific recommendations available';
  

  // Additional fallbacks for missing data
  if (summary === 'Analysis completed' && analysis.detailed_analysis) {
    summary = analysis.detailed_analysis.substring(0, 200) + '...';
  }
  
  // Handle both German and English verdicts
  const verdictMap = {
    'ZUVERLÄSSIG': 'RELIABLE',
    'FRAGWÜRDIG': 'QUESTIONABLE', 
    'IRREFÜHREND': 'MISLEADING',
    'FALSCH': 'FALSE',
    'RELIABLE': 'RELIABLE',
    'QUESTIONABLE': 'QUESTIONABLE',
    'MISLEADING': 'MISLEADING',
    'FALSE': 'FALSE'
  };
  
  const normalizedVerdict = verdictMap[verdict] || 'QUESTIONABLE';
  
  // Determine verdict styling
  const verdictConfig = {
    'RELIABLE': { class: 'reliable', icon: '✅', title: 'Zuverlässig / Reliable', color: '#34a853' },
    'QUESTIONABLE': { class: 'questionable', icon: '⚠️', title: 'Fragwürdig / Questionable', color: '#fbbc05' },
    'MISLEADING': { class: 'misleading', icon: '❗', title: 'Irreführend / Misleading', color: '#e84330' },
    'FALSE': { class: 'false', icon: '❌', title: 'Falsch / False', color: '#ea4335' }
  };
  
  const config = verdictConfig[normalizedVerdict] || verdictConfig['QUESTIONABLE'];
  
  // Debug logging for extracted data
  console.log("=== EXTRACTED DATA DEBUG ===");
  console.log("Verdict:", verdict, "->", normalizedVerdict);
  console.log("Confidence:", confidence);
  console.log("Summary:", summary);
  console.log("Recommendations:", recommendations);
  console.log("============================");
  
  // MODIFIED: Build the main interface with simplified ClaimBuster toggle positioned correctly
  contentDiv.innerHTML = `
    <!-- UPDATED: Simplified ClaimBuster Toggle Section -->
    <div class="ai-claimbuster-toggle-section">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: 600; color: #333;">🔍 ClaimBuster</span>
          <span style="font-size: 12px; color: #666;">Fact-check claims detection</span>
        </div>
        <label class="ai-toggle-switch">
          <input type="checkbox" id="claimbuster-toggle" ${result.claimbuster && result.claimbuster.success ? '' : 'disabled'}>
          <span class="ai-toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- ClaimBuster Results Container (Hidden by default) -->
    <div id="claimbuster-results" style="display: none;">
      <!-- ClaimBuster content will be inserted here -->
    </div>

    <!-- Main Verdict Section -->
    <div class="ai-verdict-main ${config.class}">
      <div class="ai-verdict-header">
        <div class="ai-verdict-icon">${config.icon}</div>
        <div class="ai-verdict-info">
          <div class="ai-verdict-title">${config.title}</div>
          <div class="ai-confidence">${confidence}% Confidence</div>
        </div>
      </div>
      <div class="ai-verdict-summary">${summary}</div>
    </div>

    <!-- Navigation Tabs (Updated for Multimedia Content) -->
    <div class="ai-tabs-nav">
      <button class="ai-tab-btn active" data-tab="overview">📊 Overview</button>
      <button class="ai-tab-btn" data-tab="multimedia">🎥 Multimedia</button>
      <button class="ai-tab-btn" data-tab="transcript">📝 Transcript</button>
      <button class="ai-tab-btn" data-tab="moments">⏱️ Key Moments</button>
    </div>

    <!-- Tab Content -->
    <div class="ai-tabs-content">
      <!-- Overview Tab -->
      <div class="ai-tab-content active" id="tab-overview">
        <div class="ai-section">
          <h4>Quick Summary</h4>
          <p>${analysis.quick_summary}</p>
        </div>
        ${analysis.red_flags && Array.isArray(analysis.red_flags) && analysis.red_flags.length > 0 ? `
          <div class="ai-section ai-red-flags">
            <h4>🚨 Red Flags</h4>
            <ul>
              ${analysis.red_flags.map(flag => `<li>${flag}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="ai-section">
                <!-- Ground Truth Section -->
        <div class="ai-section ai-ground-truth" id="ground-truth-section">
          <h4>Ground Truth Insight</h4>
          <div id="ground-truth-content">
            <div style="text-align: center; color: #666; font-size: 12px; padding: 10px;">
              Loading calibration data...
            </div>
          </div>
        </div>
          <h4>💡 Recommendations</h4>
          <p>${recommendations}</p>
        </div>
      </div>

      <!-- Multimedia Analysis Tab -->
      <div class="ai-tab-content" id="tab-multimedia">
        ${analysis.multimedia_analysis ? `
          <div class="ai-section">
            <h4>Content Type</h4>
            <p><strong>Platform:</strong> ${analysis.multimedia_analysis.platform || 'Unknown'}</p>
            <p><strong>Duration:</strong> ${analysis.multimedia_analysis.duration || 'Not detected'}</p>
            <p><strong>Language:</strong> ${analysis.multimedia_analysis.detected_language || 'Auto-detected'}</p>
          </div>
          <div class="ai-section">
            <h4>Audio Quality</h4>
            <div class="ai-level-indicator ${(analysis.multimedia_analysis.audio_quality || 'MEDIUM').toLowerCase()}">
              ${analysis.multimedia_analysis.audio_quality || 'MEDIUM'}
            </div>
          </div>
          ${analysis.multimedia_analysis.speech_patterns && Array.isArray(analysis.multimedia_analysis.speech_patterns) && analysis.multimedia_analysis.speech_patterns.length > 0 ? `
            <div class="ai-section">
              <h4>Speech Patterns</h4>
              <div class="ai-tags">
                ${analysis.multimedia_analysis.speech_patterns.map(pattern => `<span class="ai-tag">${pattern}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          <div class="ai-section">
            <h4>Content Analysis</h4>
            <p>${analysis.multimedia_analysis.content_summary || 'Video content has been analyzed for factual accuracy and potential misinformation.'}</p>
          </div>
        ` : `
          <div class="ai-section">
            <h4>🎥 Multimedia Analysis</h4>
            <p>This content will be analyzed for audio transcription and video-specific fact-checking once multimedia processing is complete.</p>
            <div style="background: #f0f7ff; padding: 12px; border-radius: 6px; margin-top: 10px;">
              <p style="margin: 0; font-size: 13px; color: #1565c0;">
                <strong>Coming Soon:</strong> Audio transcription via OpenAI Whisper, timestamp-based analysis, and platform-specific content verification.
              </p>
            </div>
          </div>
        `}
      </div>

      <!-- Transcript Tab -->
      <div class="ai-tab-content" id="tab-transcript">
        ${analysis.transcript ? `
          <div class="ai-section">
            <h4>Transcription Quality</h4>
            <div class="ai-level-indicator ${(analysis.transcript.confidence || 'HIGH').toLowerCase()}">
              Confidence: ${analysis.transcript.confidence || 'HIGH'}
            </div>
          </div>
          <div class="ai-section">
            <h4>Full Transcript</h4>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 14px; line-height: 1.6;">
              ${analysis.transcript.segments ? 
                analysis.transcript.segments.map(segment => 
                  `<div style="margin-bottom: 10px;">
                    <span style="color: #666; font-size: 12px;">[${segment.start}s - ${segment.end}s]</span>
                    <br>
                    <span style="color: #333;">${segment.text}</span>
                  </div>`
                ).join('') : 
                `<div style="color: #333;">${analysis.transcript.text || 'Transcript content will appear here after audio processing.'}</div>`
              }
            </div>
          </div>
          ${analysis.transcript.language_detected ? `
            <div class="ai-section">
              <h4>Language Detection</h4>
              <p><strong>Detected:</strong> ${analysis.transcript.language_detected}</p>
              <p><strong>Confidence:</strong> ${analysis.transcript.language_confidence || '95%'}</p>
            </div>
          ` : ''}
        ` : `
          <div class="ai-section">
            <h4>📝 Audio Transcript</h4>
            <p>Audio transcription will appear here once the video content is processed through OpenAI Whisper.</p>
            <div style="background: #f0f7ff; padding: 12px; border-radius: 6px; margin-top: 10px;">
              <p style="margin: 0; font-size: 13px; color: #1565c0;">
                <strong>Processing Steps:</strong>
                <br>1. Audio extraction from video
                <br>2. OpenAI Whisper transcription with timestamps
                <br>3. Text analysis for fact-checking
              </p>
            </div>
          </div>
        `}
      </div>

      <!-- Key Moments Tab -->
      <div class="ai-tab-content" id="tab-moments">
        ${analysis.key_moments && analysis.key_moments.length > 0 ? `
          ${analysis.key_moments.map((moment, index) => {
            const severityColors = {
              'HIGH': '#ea4335', 'CRITICAL': '#ea4335',
              'MEDIUM': '#fbbc05', 'MODERATE': '#fbbc05',
              'LOW': '#34a853', 'MINOR': '#34a853'
            };
            const severityColor = severityColors[moment.severity] || '#5f6368';
            
            return `
              <div class="ai-claim-card">
                <div class="ai-claim-header">
                  <span class="ai-claim-verdict" style="background-color: ${severityColor}20; color: ${severityColor};">
                    ${moment.severity || 'FLAGGED'}
                  </span>
                  <span style="background: #f0f0f0; padding: 4px 8px; border-radius: 12px; font-size: 12px; color: #666;">
                    ⏱️ ${moment.timestamp}
                  </span>
                </div>
                <div class="ai-claim-text">${moment.description || moment.text}</div>
                <div class="ai-claim-explanation">${moment.reason || moment.explanation}</div>
                ${moment.suggested_verification ? `
                  <div class="ai-claim-context">
                    <strong>Verification Suggestion:</strong> ${moment.suggested_verification}
                  </div>
                ` : ''}
                ${moment.timestamp ? `
                  <div style="margin-top: 10px;">
                    <button class="ai-btn ai-btn-secondary" onclick="seekToTimestamp('${moment.timestamp}')" style="font-size: 12px; padding: 6px 12px;">
                      ▶️ Jump to ${moment.timestamp}
                    </button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        ` : `
          <div class="ai-section">
            <h4>⏱️ Key Moments Analysis</h4>
            <p>Timestamped analysis of important moments will appear here after video processing.</p>
            <div style="background: #f0f7ff; padding: 12px; border-radius: 6px; margin-top: 10px;">
              <p style="margin: 0; font-size: 13px; color: #1565c0;">
                <strong>What we'll identify:</strong>
                <br>• Questionable claims with timestamps
                <br>• Misleading statements or statistics
                <br>• Emotional manipulation moments
                <br>• Missing context or verification needs
              </p>
            </div>
          </div>
        `}
      </div>

    </div>

    <!-- Action Buttons -->
    <div class="ai-action-buttons" style="justify-content: center;">
          <button class="ai-btn ai-btn-primary" id="reanalyze-btn" style="flex: none; min-width: 120px;">Re-analyze</button>
    </div>

    <!-- Footer -->
    <div class="ai-footer">
      Powered by OpenAI GPT-4 & Whisper ${result.claimbuster && result.claimbuster.success ? '• ClaimBuster' : ''} • Multimedia Fact-Check Analysis
    </div>
  `;
// ADD THIS DEBUG LINE HERE:
console.log("INITIAL CONTENT SET - Summary:", summary, "Detailed:", analysis.detailed_analysis);

  // Add tab switching functionality
  setupTabNavigation();
  
  // NEW: Add ClaimBuster toggle functionality
  setupClaimBusterToggle(result);
  
  // Add button event listeners
  const reanalyzeBtn = document.getElementById('reanalyze-btn');
  
  if (reanalyzeBtn) {
    reanalyzeBtn.addEventListener('click', function() {
      console.log("Reanalyze button clicked - forcing fresh analysis");
      
      // Force a complete reset
      isAnalyzing = false;
      hasAnalyzedCurrentPage = false;
      latestResults = null;
      analysisPromise = null;
      
      // Clear the current article from cache immediately
      if (currentArticleHash && isExtensionContextValid()) {
        try {
          chrome.storage.local.remove([`analysis_${currentArticleHash}`]);
          console.log("Cache cleared for reanalysis");
        } catch (e) {
          console.log("Cache clear failed, continuing anyway");
        }
      }
      
      // Reset the hash to force regeneration
      currentArticleHash = null;
      
      // Update button text and disable during analysis
      reanalyzeBtn.textContent = 'Re-analyzing...';
      reanalyzeBtn.disabled = true;
      
      // Close the panel to show the indicator animation
      resultsPanel.style.display = 'none';
      
      // Reset indicator to show fresh analysis
      const indicator = document.getElementById('ai-fact-checker-indicator');
      if (indicator) {
        indicator.style.backgroundColor = '#fbbc05';
        indicator.innerHTML = 'Analyzing...';
        indicator.classList.add('analyzing');
      }
      
      // Start fresh analysis with a small delay to show the animation
      setTimeout(() => {
        startAnalysis(true).then(() => {
          // Re-enable button after analysis
          reanalyzeBtn.textContent = 'Re-analyze';
          reanalyzeBtn.disabled = false;
        }).catch(() => {
          reanalyzeBtn.textContent = 'Re-analyze';
          reanalyzeBtn.disabled = false;
        });
      }, 500);
    });
  }
  
// Load and display ground truth data
  loadAndDisplayGroundTruth(result).catch(error => {
    console.error("Error loading ground truth:", error);
  });
  
  resultsPanel.style.display = 'block';
}


// Setup tab navigation
function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.ai-tab-btn');
  const tabContents = document.querySelectorAll('.ai-tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Remove active class from all tabs and content
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${targetTab}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// Function to seek to specific timestamp in video (for Key Moments tab)
function seekToTimestamp(timestamp) {
  console.log("Seeking to timestamp:", timestamp);
  
  // Convert timestamp (e.g., "1:23" or "0:45") to seconds
  const timeInSeconds = convertTimestampToSeconds(timestamp);
  
  // Try to find YouTube video player
  const youtubeVideo = document.querySelector('video');
  if (youtubeVideo && youtubeVideo.currentTime !== undefined) {
    youtubeVideo.currentTime = timeInSeconds;
    youtubeVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Briefly highlight the video
    youtubeVideo.style.boxShadow = '0 0 20px #4285f4';
    setTimeout(() => {
      youtubeVideo.style.boxShadow = '';
    }, 2000);
    
    console.log(`Seeked to ${timeInSeconds} seconds in video`);
    return;
  }
  
  // Try to find TikTok video player
  const tiktokVideo = document.querySelector('video[data-e2e="video-player"]') || 
                      document.querySelector('.video-player video');
  if (tiktokVideo && tiktokVideo.currentTime !== undefined) {
    tiktokVideo.currentTime = timeInSeconds;
    tiktokVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Briefly highlight the video
    tiktokVideo.style.border = '3px solid #4285f4';
    setTimeout(() => {
      tiktokVideo.style.border = '';
    }, 2000);
    
    console.log(`Seeked to ${timeInSeconds} seconds in TikTok video`);
    return;
  }
  
  // Fallback: just scroll to top and show message
  window.scrollTo({ top: 0, behavior: 'smooth' });
  alert(`Please manually seek to ${timestamp} in the video player`);
}

// Helper function to convert timestamp string to seconds
function convertTimestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(part => parseInt(part, 10));
  
  if (parts.length === 2) {
    // Format: "M:SS" 
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // Format: "H:MM:SS"
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else {
    // Fallback: assume it's already in seconds
    return parseInt(timestamp, 10) || 0;
  }
}

// Make seekToTimestamp globally available
window.seekToTimestamp = seekToTimestamp;

// Enhanced startAnalysis function with promise tracking
async function startAnalysis(forceAnalysis = false) {
  console.log(`startAnalysis called - isAnalyzing: ${isAnalyzing}, hasAnalyzed: ${hasAnalyzedCurrentPage}, forced: ${forceAnalysis}`);
  
  if (!isExtensionContextValid()) {
    console.log("Extension context invalid");
    return;
  }
  
  // If already analyzing and not forced, return the existing promise
  if (isAnalyzing && !forceAnalysis) {
    console.log("Analysis already in progress, waiting for existing analysis...");
    return analysisPromise || Promise.resolve(null);
  }
  
  // If already analyzed this page and not forced, use cached results
  if (hasAnalyzedCurrentPage && !forceAnalysis && latestResults) {
    console.log("Page already analyzed, using existing results");
    if (resultsPanel && resultsPanel.style.display === 'block') {
      displayResults(latestResults);
    }
    return Promise.resolve(latestResults);
  }
  
  // Prevent multiple simultaneous analyses
  if (isAnalyzing && analysisPromise) {
    console.log("Waiting for existing analysis to complete...");
    return analysisPromise;
  }
  
  // Start new analysis
  isAnalyzing = true;
  console.log(`Starting new analysis... (forced: ${forceAnalysis})`);
  
  // Create analysis promise
  analysisPromise = performAnalysis(forceAnalysis);
  
  try {
    const result = await analysisPromise;
    return result;
  } finally {
    // Always clean up state
    isAnalyzing = false;
    analysisPromise = null;
  }
}

// Enhanced performAnalysis function with increased timeouts
async function performAnalysis(forceAnalysis = false) {
  // INCREASED: Overall analysis timeout from 30s to 60s
  const analysisTimeout = setTimeout(() => {
    if (isAnalyzing) {
      console.log("Analysis timeout - resetting");
      handleAnalysisError("Analysis timed out. Please try again.");
    }
  }, 120000);

  // Show "still working" message at 60 seconds
  const progressTimeout = setTimeout(() => {
    if (isAnalyzing && resultsPanel && resultsPanel.style.display === 'block') {
      showLoadingState('🔄 Still processing... Complex analysis in progress. Results will appear automatically.');
    }
  }, 60000);  
  
  try {
    // Show loading state in panel if it's open
    if (resultsPanel && resultsPanel.style.display === 'block') {
      showLoadingState('Extracting article content...');
    }
    
    // Update indicator immediately
    const indicator = document.getElementById('ai-fact-checker-indicator');
    if (indicator) {
      indicator.style.backgroundColor = '#fbbc05';
      indicator.innerHTML = 'Analyzing...';
      indicator.classList.add('analyzing');
    }
    
    // Detect content type and extract accordingly
    const platform = detectVideoPlatform();
    let contentData;
    let contentHash;
    
    if (platform) {
      console.log(`🎥 Extracting video content from ${platform}...`);
      if (resultsPanel && resultsPanel.style.display === 'block') {
        showLoadingState(`Extracting audio from ${platform} video...`);
      }
      
      contentData = await extractVideoContent();
      if (!contentData || !contentData.success) {
        console.log("Video content extraction failed:", contentData?.error);
        clearTimeout(analysisTimeout);
        handleAnalysisError(contentData?.error || 'Could not extract audio from video. Please try refreshing the page.');
        return null;
      }
      
      // Generate hash for video content (using metadata + URL)
      const hashContent = (contentData.metadata.title || '') + '|||' + (contentData.metadata.url || '');
      contentHash = hashString(hashContent);
      console.log(`Video content extracted: ${contentData.metadata.title} (${contentData.duration}s)`);
      
    } else {
      console.log("📰 Extracting article content...");
      contentData = extractArticleContent();
      
      if (!contentData.headline && contentData.article.length < 100) {
        console.log("Insufficient content found");
        clearTimeout(analysisTimeout);
        handleAnalysisError('Could not find enough article content to analyze.');
        return null;
      }
      
      // Generate hash for article content
      contentHash = generateArticleHash(contentData);
    }
    
    const articleHash = contentHash;
    
    // Check if this is the same article we just analyzed
    if (currentArticleHash === articleHash && !forceAnalysis && latestResults) {
      console.log("Same article hash detected, using existing results");
      clearTimeout(analysisTimeout);
      isAnalyzing = false;
      updateIndicatorWithResult(latestResults);
      return latestResults;
    }
    
    currentArticleHash = articleHash;
    console.log("Article hash generated:", articleHash);
    
    // Check cache first (skip if forced analysis)
    if (!forceAnalysis) {
      console.log("Checking cache...");
      const cachedResult = await getCachedResult(articleHash);
      if (cachedResult) {
        console.log('Using cached analysis result');
        clearTimeout(analysisTimeout);
        clearTimeout(progressTimeout);
        hasAnalyzedCurrentPage = true;
        updateIndicatorWithResult(cachedResult);
        latestResults = cachedResult;
        
        if (resultsPanel && resultsPanel.style.display === 'block') {
          displayResults(cachedResult);
        }
        return cachedResult;
      }
    }
    
    // No cache found or forced analysis, proceed with API analysis
    console.log('Analyzing with dual AI...');
    hasAnalyzedCurrentPage = true;
    
    // Update loading message
    if (resultsPanel && resultsPanel.style.display === 'block') {
      showLoadingState('Sending to AI for dual analysis...');
    }
    
    // Send to background script and wait for response
    console.log("Sending message to background script...");
    
    return new Promise(async (resolve, reject) => {
      let responseReceived = false;
      
      // Set up a one-time listener for the response
      const responseHandler = (message, sender, sendResponse) => {
        console.log("Response handler received message:", message.type);
        
        if (message.type === 'FACTCHECK_RESULT' && message.result.hash === articleHash) {
          console.log("Matching response received for hash:", articleHash);
          responseReceived = true;
          chrome.runtime.onMessage.removeListener(responseHandler);
          clearTimeout(analysisTimeout);
          clearTimeout(progressTimeout);
          clearTimeout(responseTimeout);
          
          latestResults = message.result;
          hasAnalyzedCurrentPage = true;
          updateIndicatorWithResult(message.result);
          
          // Cache the result if successful
          if (message.result.success) {
            setCachedResult(articleHash, message.result);
          }
          
          // Display results if panel is open
          if (resultsPanel && resultsPanel.style.display === 'block') {
            displayResults(message.result);
          }
          
          resolve(message.result);
        }
      };
      
      chrome.runtime.onMessage.addListener(responseHandler);
      
      // INCREASED: Response timeout from 25s to 50s
      const responseTimeout = setTimeout(() => {
        if (!responseReceived) {
          console.log("Response timeout - no response received within 120 seconds");
          chrome.runtime.onMessage.removeListener(responseHandler);
          clearTimeout(analysisTimeout);
          clearTimeout(progressTimeout);
          handleAnalysisError("Response timeout. The analysis service may be overloaded.");
          reject(new Error("Response timeout"));
        }
      }, 120000);
      
      // Try to send the message with enhanced error handling
      try {
        console.log("Attempting to send message to background script...");
        
        // Prepare data based on content type
        let messageData;
        if (platform) {
          // Video content - check if audio extraction was successful
          if (!contentData.audio) {
            console.error("No audio data available for transcription");
            console.error("Full contentData:", contentData);
            clearTimeout(analysisTimeout);
            handleAnalysisError('Audio extraction failed. Please try refreshing the page and ensure the video has audio.');
            return null;
          }
          
          // Video content - send with audio blob
          if (resultsPanel && resultsPanel.style.display === 'block') {
            showLoadingState('Preparing audio for transcription...');
          }
          
          // Convert blob to ArrayBuffer for message passing
          console.log("Audio blob before conversion:", contentData.audio.size, "bytes, type:", contentData.audio.type);
          
          // Validate audio blob size - be more lenient for short videos
          if (contentData.audio.size < 100) {  // Less than 100 bytes is definitely too small
            console.error("Audio blob is too small:", contentData.audio.size, "bytes for", contentData.duration, "seconds of video");
            clearTimeout(analysisTimeout);
            handleAnalysisError('Audio extraction produced insufficient data. This might be due to browser security restrictions or the video not having audio.');
            return null;
          }
          
          let audioArrayBuffer;
          try {
            audioArrayBuffer = await contentData.audio.arrayBuffer();
            console.log("ArrayBuffer conversion successful, size:", audioArrayBuffer.byteLength, "bytes");
          } catch (error) {
            console.error("Failed to convert audio blob to ArrayBuffer:", error);
            console.error("Audio blob details:", {
              size: contentData.audio.size,
              type: contentData.audio.type,
              constructor: contentData.audio.constructor.name
            });
            clearTimeout(analysisTimeout);
            handleAnalysisError('Failed to process audio data. Please try refreshing the page.');
            return null;
          }
          
          if (!audioArrayBuffer || audioArrayBuffer.byteLength === 0) {
            console.error("ArrayBuffer is empty or undefined");
            clearTimeout(analysisTimeout);
            handleAnalysisError('Audio conversion failed - no audio data available.');
            return null;
          }
          
          messageData = {
            type: 'VIDEO_CONTENT',
            data: {
              platform,
              metadata: contentData.metadata,
              audioData: audioArrayBuffer,
              audioType: contentData.format,
              duration: contentData.duration,
              format: contentData.format,
              hash: articleHash
            }
          };
        } else {
          // Text article content
          messageData = {
            type: 'ARTICLE_TEXT', 
            data: { ...contentData, hash: articleHash }
          };
        }
        
        chrome.runtime.sendMessage(messageData, (response) => {
          // Check for immediate response errors
          if (chrome.runtime.lastError) {
            console.error("Runtime error when sending message:", chrome.runtime.lastError);
            chrome.runtime.onMessage.removeListener(responseHandler);
            clearTimeout(analysisTimeout);
            clearTimeout(responseTimeout);
            handleAnalysisError("Communication error with analysis service.");
            reject(new Error("Runtime error: " + chrome.runtime.lastError.message));
            return;
          }
          
          console.log("Message sent successfully, received immediate response:", response);
        });
      } catch (error) {
        console.error("Exception when sending message:", error);
        chrome.runtime.onMessage.removeListener(responseHandler);
        clearTimeout(analysisTimeout);
        clearTimeout(progressTimeout);
        clearTimeout(responseTimeout);
        handleAnalysisError("Failed to communicate with analysis service.");
        reject(error);
      }
    });
    
  } catch (error) {
    console.error("Error during analysis:", error);
    clearTimeout(analysisTimeout);
    clearTimeout(progressTimeout);
    handleAnalysisError("An unexpected error occurred during analysis.");
    throw error;
  }
}

// Enhanced error handling with user-friendly messages
function handleAnalysisError(errorMessage) {
  isAnalyzing = false;
  analysisPromise = null;
  
  const indicator = document.getElementById('ai-fact-checker-indicator');
  if (indicator) {
    indicator.style.backgroundColor = '#ea4335';
    indicator.innerHTML = '❌ Error';
    indicator.classList.remove('analyzing');
  }
  
  // Show error in panel if it's open
  if (resultsPanel && resultsPanel.style.display === 'block') {
    displayResults({
      success: false,
      error: errorMessage
    });
  }
  
  // For timeout errors, provide helpful suggestions
  if (errorMessage.includes('timeout') || errorMessage.includes('Response timeout')) {
    console.log("Analysis timed out. Suggestions:");
    console.log("1. Check your internet connection");
    console.log("2. Verify your OpenAI API key is configured correctly");
    console.log("3. Try refreshing the page and analyzing again");
    console.log("4. The article might be too long or complex");
  }
}

// Update indicator with analysis result
function updateIndicatorWithResult(result) {
  const indicator = document.getElementById('ai-fact-checker-indicator');
  if (!indicator) return;
  
  indicator.classList.remove('analyzing');
  
  if (result.success) {
    const analysis = result.analysis;
    let verdict = analysis.overall_verdict || 'UNKNOWN';
    
    // Handle both German and English verdicts
    const verdictMap = {
      'ZUVERLÄSSIG': 'RELIABLE',
      'FRAGWÜRDIG': 'QUESTIONABLE', 
      'IRREFÜHREND': 'MISLEADING',
      'FALSCH': 'FALSE',
      'RELIABLE': 'RELIABLE',
      'QUESTIONABLE': 'QUESTIONABLE',
      'MISLEADING': 'MISLEADING',
      'FALSE': 'FALSE'
    };
    
    const normalizedVerdict = verdictMap[verdict] || 'QUESTIONABLE';
    
    // Set indicator with improved status messages
    switch(normalizedVerdict) {
      case 'RELIABLE':
        indicator.style.backgroundColor = '#34a853';
        indicator.innerHTML = '✅ Checked';
        break;
      case 'FALSE':
      case 'MISLEADING':
        indicator.style.backgroundColor = '#ea4335';
        indicator.innerHTML = '❌ Issues Found';
        break;
      case 'QUESTIONABLE':
      default:
        indicator.style.backgroundColor = '#fbbc05';
        indicator.innerHTML = '⚠️ Review Results';
        break;
    }
  } else {
    indicator.style.backgroundColor = '#ea4335';
    indicator.innerHTML = '❌ Error';
  }
}

// Share results function
function shareResults() {
  if (!latestResults || !latestResults.success) return;
  
  const analysis = latestResults.analysis;
  const verdict = analysis.overall_verdict || 'UNKNOWN';
  const confidence = analysis.confidence_score || 0;
  
  const shareText = `AI Fact Check Result: ${verdict} (${confidence}% confidence)\n\n${analysis.summary}\n\n#AIFactCheck #FactCheck`;
  
  if (navigator.share) {
    navigator.share({
      title: 'AI Fact Check Result',
      text: shareText,
      url: window.location.href
    });
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(shareText).then(() => {
      alert('Results copied to clipboard!');
    });
  }
}

// Enhanced message handler with better result validation
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("Content script received message:", message.type, message);
  
  try {
    if (message.type === 'FACTCHECK_RESULT') {
      // Check if this result is for the current article
      if (message.result.hash && currentArticleHash && message.result.hash !== currentArticleHash) {
        console.log("Received result for different article, ignoring");
        sendResponse({ status: 'ignored_outdated' });
        return true;
      }
      
      isAnalyzing = false;
      analysisPromise = null;
      
      // ENHANCED: Validate and fix incomplete analysis results
      if (message.result.success && message.result.analysis) {
        const analysis = message.result.analysis;
        console.log("Validating analysis result:", analysis);
        
        // Check for incomplete analysis and fix it
        const hasValidData = analysis.summary && 
                           analysis.summary !== 'Analysis completed' && 
                           analysis.summary !== 'No summary available' &&
                           analysis.confidence_score > 0;
        
        if (!hasValidData) {
          console.log("Detected incomplete analysis, attempting to fix...");
          
          // Create a more complete analysis from available data
          const fixedAnalysis = {
            ...analysis,
            overall_verdict: analysis.overall_verdict,
            confidence_score: analysis.confidence_score,
            summary: analysis.summary || analysis.detailed_analysis || 
                    'Diese Analyse wurde automatisch erstellt. Bitte überprüfen Sie die Details in den einzelnen Tabs.',
            detailed_analysis: analysis.detailed_analysis || 
                             'Der Artikel wurde analysiert, aber einige Details konnten nicht vollständig verarbeitet werden. Überprüfen Sie bitte die verfügbaren Informationen.',
            recommendations: analysis.recommendations || 
                           'Überprüfen Sie zusätzliche Quellen und achten Sie auf mögliche Verzerrungen oder fehlende Informationen.',
            red_flags: analysis.red_flags || ['Unvollständige Analyse'],
            sources_needed: analysis.sources_needed || ['Zusätzliche Quellen zur Verifikation'],
            
            // Ensure headline analysis exists
            headline_analysis: analysis.headline_analysis || {
              accuracy_vs_content: 'Nicht vollständig analysiert',
              sensationalism_level: 'MEDIUM',
              inflammatory_language: [],
              manipulation_tactics: 'Keine spezifischen Taktiken erkannt'
            },
            
            // Ensure bias analysis exists
            bias_analysis: analysis.bias_analysis || {
              type_of_bias: ['NICHT_BESTIMMT'],
              bias_direction: 'Nicht bestimmt',
              manipulation_techniques: [],
              dog_whistle_elements: []
            },
            
            // Ensure writing style assessment exists
            writing_style_assessment: analysis.writing_style_assessment || {
              tone: 'NEUTRAL',
              emotional_manipulation: [],
              loaded_language: [],
              political_framing: 'Keine eindeutige politische Ausrichtung erkannt',
              target_audience: 'Allgemeine Öffentlichkeit'
            },
            
            // Ensure factual accuracy exists
            factual_accuracy: analysis.factual_accuracy || {
              verifiable_claims: 'Nicht bestimmt',
              unsupported_claims: 'Nicht bestimmt',
              misleading_statistics: [],
              missing_context: []
            },
            
            // Ensure key claims exist
            key_claims: analysis.key_claims || [{
              claim: 'Automatische Analyse unvollständig',
              verdict: 'UNBESTÄTIGT',
              explanation: 'Die Analyse konnte nicht alle Aussagen vollständig überprüfen.',
              context_missing: 'Detailliertere Analyse erforderlich'
            }],
            
            // Add political context if missing
            political_context: analysis.political_context || 
                             'Keine eindeutigen politischen Motive oder Ausrichtungen erkannt.'
          };
          
          console.log("Fixed analysis:", fixedAnalysis);
          message.result.analysis = fixedAnalysis;
        }
      }
      
      latestResults = message.result;
      
      // Cache the result if successful and we have a hash
      if (message.result.success && message.result.hash) {
        setCachedResult(message.result.hash, message.result);
      }
      
      // Update indicator
      updateIndicatorWithResult(message.result);
      
      // Display results if panel is open
      if (resultsPanel && resultsPanel.style.display === 'block') {
        displayResults(message.result);
      }
      
      sendResponse({ status: 'results_received' });
      
    } else if (message.type === 'FACTCHECK_UPDATE') {
      // Only update if panel is open and we're currently analyzing
      if (resultsPanel && resultsPanel.style.display === 'block' && isAnalyzing) {
        showLoadingState(message.message || 'Analyzing...');
        
        // Update with quick summary if available
        if (message.quickSummary) {
          showLoadingState(`Quick assessment: ${message.quickSummary}`);
        }
      }
      
      sendResponse({ status: 'update_received' });
      
    } else if (message.type === 'TOGGLE_PANEL') {
      toggleResultsPanel().catch(error => {
        console.error("Error toggling panel:", error);
      });
      sendResponse({ status: 'panel_toggled' });
      
    } else if (message.type === 'SHOW_SITE_NOTIFICATION') {
      showSiteNotification(message.supportedDomains);
      sendResponse({ status: 'notification_shown' });
      
    } else if (message.type === 'SHOW_DASHBOARD_INFO') {
      // Handle dashboard info request
      if (!resultsPanel) createResultsPanel();
      resultsPanel.style.display = 'block';
      
      const contentDiv = document.getElementById('ai-panel-content');
      if (contentDiv) {
        contentDiv.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <h3 style="margin: 0 0 12px 0; color: #333;">Dashboard Coming Soon</h3>
            <p style="color: #666; margin: 0;">Advanced analytics and reporting features are in development.</p>
          </div>
        `;
      }
      sendResponse({ status: 'dashboard_shown' });
    }
    
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ status: 'error', error: error.message });
  }
  
  return true; // Keep message channel open for async response
});

// Show notification for unsupported sites
function showSiteNotification(supportedDomains) {
  const notification = document.createElement('div');
  notification.className = 'ai-notification';
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.zIndex = '2147483647';
  notification.style.width = '300px';
  
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h4 style="margin: 0 0 8px 0;">AI Fact Checker</h4>
        <p style="margin: 0; font-size: 13px; color: #666;">This extension works on major news sites only.</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 18px; cursor: pointer;">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.remove();
    }
  }, 5000);
}

// Enhanced page state reset
function resetPageState() {
  console.log("Resetting page state for new page");
  currentPageUrl = window.location.href;
  hasAnalyzedCurrentPage = false;
  latestResults = null;
  isAnalyzing = false;
  analysisPromise = null;
  autoAnalysisTriggered = false;
  
  // Reset ClaimBuster state
  claimBusterToggleState = false;
  hideClaimBusterMiniWindow();
  
  // Clear cache for previous article
  if (currentArticleHash && isExtensionContextValid()) {
    try {
      chrome.storage.local.remove([`analysis_${currentArticleHash}`]);
      console.log('Cache cleared on navigation');
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  
  currentArticleHash = null;
  
  // Reset indicator if it exists
  const indicator = document.getElementById('ai-fact-checker-indicator');
  if (indicator) {
    indicator.style.backgroundColor = '#4285f4';
    indicator.innerHTML = 'AI Fact Check';
    indicator.classList.remove('analyzing');
  }
}

// FIXED: Enhanced auto-analysis with proper initialization
if (isNewsSite) {
  console.log("Initializing auto-analysis for news site");
  
  const startImmediateAnalysis = async () => {
    // Prevent multiple auto-analysis triggers
    if (autoAnalysisTriggered) {
      console.log("Auto-analysis already triggered for this page");
      return;
    }
    
    console.log("Starting auto-analysis process...");
    autoAnalysisTriggered = true;
    
    const indicator = document.getElementById('ai-fact-checker-indicator');
    
    if (!indicator || !isExtensionContextValid()) {
      console.log("Extension context invalid or indicator not found");
      return;
    }
    
    // Check if we already have results for this page
    if (hasAnalyzedCurrentPage && latestResults) {
      console.log("Page already analyzed, updating indicator");
      updateIndicatorWithResult(latestResults);
      return;
    }
    
    // Quick content check before starting
    const testContent = extractArticleContent();
    if (!testContent.headline && testContent.article.length < 100) {
      console.log("Insufficient content for auto-analysis");
      return;
    }
    
    console.log("Content detected, starting auto-analysis...");
    
    // Show immediate analyzing animation
    indicator.style.backgroundColor = '#fbbc05';
    indicator.innerHTML = 'Analyzing...';
    indicator.classList.add('analyzing');
    
    try {
      console.log("Starting auto-analysis...");
      await startAnalysis(false);
      console.log("Auto-analysis completed successfully");
    } catch (error) {
      console.error("Auto-analysis failed:", error);
      
      // Reset indicator on failure
      indicator.style.backgroundColor = '#4285f4';
      indicator.innerHTML = 'AI Fact Check';
      indicator.classList.remove('analyzing');
      
      // For auto-analysis failures, don't show intrusive errors
      console.log("Auto-analysis failed silently - manual analysis still available");
    }
  };
  
  // FIXED: Enhanced startup logic with multiple trigger points
  const initializeAnalysis = () => {
    console.log("Document ready state:", document.readyState);
    
    // Wait for page to stabilize, then start analysis
    setTimeout(() => {
      console.log("Attempting to start auto-analysis...");
      if (isExtensionContextValid()) {
        startImmediateAnalysis();
      } else {
        console.log("Extension context not valid for auto-analysis");
      }
    }, 2000); // Wait 2 seconds for page to fully load
  };
  
  // Multiple initialization triggers to ensure auto-analysis runs
  if (document.readyState === 'loading') {
    console.log("Document still loading, waiting for DOMContentLoaded");
    document.addEventListener('DOMContentLoaded', () => {
      console.log("DOMContentLoaded event fired");
      initializeAnalysis();
    });
  } else if (document.readyState === 'interactive') {
    console.log("Document interactive, waiting for load event");
    window.addEventListener('load', () => {
      console.log("Window load event fired");
      initializeAnalysis();
    });
  } else {
    console.log("Document already complete, starting initialization");
    initializeAnalysis();
  }
  
  // Fallback trigger after 5 seconds
  setTimeout(() => {
    if (!autoAnalysisTriggered && isExtensionContextValid()) {
      console.log("Fallback auto-analysis trigger activated");
      startImmediateAnalysis();
    }
  }, 5000);
  
  // Clean old cache periodically but safely
  setTimeout(() => {
    if (isExtensionContextValid()) {
      cleanOldCache();
    }
  }, 20000); // Wait 20 seconds before cleaning cache
}

// Reset analysis state when navigating to new page or closing tab
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(history, arguments);
  // Only reset if it's a completely different article
  if (window.location.pathname !== currentPageUrl.split('?')[0].split('#')[0]) {
    resetPageState();
  }
};

history.replaceState = function() {
  originalReplaceState.apply(history, arguments);
  if (window.location.href !== currentPageUrl) {
    resetPageState();
  }
};

window.addEventListener('popstate', function() {
  if (window.location.href !== currentPageUrl) {
    resetPageState();
  }
});


// NEW: Setup ClaimBuster toggle functionality with simplified design
function setupClaimBusterToggle(result) {
  console.log("=== SETUP CLAIMBUSTER TOGGLE ===");
  console.log("Setting up ClaimBuster toggle with result:", result);
  
  const toggle = document.getElementById('claimbuster-toggle');
  const resultsContainer = document.getElementById('claimbuster-results');
  
  console.log("Toggle element found:", !!toggle);
  console.log("Results container found:", !!resultsContainer);
  
  if (!toggle || !resultsContainer) {
    console.log("ClaimBuster toggle elements not found");
    return;
  }
  
  // Only enable toggle if ClaimBuster analysis was successful
  if (!result.claimbuster || !result.claimbuster.success) {
    console.log("ClaimBuster analysis not available");
    toggle.disabled = true;
    return;
  }
  
  console.log("ClaimBuster toggle setup conditions met");
  const claimbusterAnalysis = result.claimbuster.analysis || result.claimbuster;
  console.log("ClaimBuster analysis data:", claimbusterAnalysis);
  
  toggle.addEventListener('change', function() {
    console.log("ClaimBuster toggle changed:", this.checked);
    
    if (this.checked) {
      console.log("Generating ClaimBuster content...");
      
      try {
        // Show ClaimBuster results
        resultsContainer.style.display = 'block';
        const content = generateClaimBusterContentSimplified(claimbusterAnalysis);
        console.log("Generated content:", content);
        resultsContainer.innerHTML = content;
        
        // Setup expand/collapse functionality for claims
        setTimeout(() => {
          setupClaimBusterExpansion();
        }, 100);
        
        console.log("ClaimBuster results displayed successfully");
      } catch (error) {
        console.error("Error generating ClaimBuster content:", error);
        resultsContainer.innerHTML = `<div style="color: red; padding: 15px;">Error loading ClaimBuster data: ${error.message}</div>`;
      }
    } else {
      // Hide ClaimBuster results
      resultsContainer.style.display = 'none';
      console.log("ClaimBuster results hidden");
    }
  });
  
  console.log("ClaimBuster toggle setup complete");

// TEMPORARY DEBUG FUNCTION - Add these lines
window.debugClaimBuster = function() {
  console.log("=== CLAIMBUSTER DATA STRUCTURE DEBUG ===");
  if (latestResults && latestResults.claimbuster) {
    console.log("Full ClaimBuster result:", latestResults.claimbuster);
    console.log("Analysis object:", latestResults.claimbuster.analysis);
    console.log("All results array:", latestResults.claimbuster.analysis.all_results);
    console.log("First claim:", latestResults.claimbuster.analysis.all_results[0]);
    console.log("Checkworthy claims:", latestResults.claimbuster.analysis.checkworthy_claims);
  } else {
    console.log("No ClaimBuster results available");
  }
};
console.log("Debug function added - you can now run: debugClaimBuster()");
}


function generateClaimBusterContentSimplified(claimbusterAnalysis) {
  console.log("=== CLAIMBUSTER COMBINED VERSION ===");
  console.log("Raw ClaimBuster Analysis:", claimbusterAnalysis);
  
  if (!claimbusterAnalysis) {
    console.log("No ClaimBuster data available");
    return '<div style="color: #ea4335; padding: 15px; text-align: center;">❌ No ClaimBuster data available</div>';
  }
  
  try {
    let highestScore = 0;
    let meaningfulClaims = []; // Only claims worth showing (better filtering)
    let allAnalyzedClaims = []; // For statistics
    
    console.log("Processing ClaimBuster data...");
    
    // Get all analyzed claims for statistics
    if (claimbusterAnalysis.all_results && Array.isArray(claimbusterAnalysis.all_results)) {
      allAnalyzedClaims = claimbusterAnalysis.all_results;
    }
    
    // Get meaningful claims using better logic from NEW code
    if (claimbusterAnalysis.quality_claims && Array.isArray(claimbusterAnalysis.quality_claims) && claimbusterAnalysis.quality_claims.length > 0) {
      meaningfulClaims = claimbusterAnalysis.quality_claims.sort((a, b) => (b.score || 0) - (a.score || 0));
      highestScore = meaningfulClaims[0].score || 0;
      console.log("Using quality_claims for meaningful claims:", meaningfulClaims.length);
    } else if (claimbusterAnalysis.checkworthy_claims && Array.isArray(claimbusterAnalysis.checkworthy_claims) && claimbusterAnalysis.checkworthy_claims.length > 0) {
      meaningfulClaims = claimbusterAnalysis.checkworthy_claims.sort((a, b) => (b.score || 0) - (a.score || 0));
      highestScore = meaningfulClaims[0].score || 0;
      console.log("Using checkworthy_claims for meaningful claims:", meaningfulClaims.length);
    } else if (claimbusterAnalysis.all_results && Array.isArray(claimbusterAnalysis.all_results)) {
      // Better filtering from NEW code - only show meaningful claims
      meaningfulClaims = claimbusterAnalysis.all_results
        .filter(claim => (claim.score || 0) > 0.35) // Threshold for meaningful claims
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5); // Limit to top 5 most important
      highestScore = meaningfulClaims.length > 0 ? meaningfulClaims[0].score : 0;
      console.log("Using filtered all_results for meaningful claims:", meaningfulClaims.length);
    }

    // Get analyzed count from all results
    const analyzedCount = allAnalyzedClaims.length || meaningfulClaims.length;
    const hasDetailedClaims = meaningfulClaims.length > 0;

    console.log("PROCESSED RESULTS:");
    console.log("Highest Score:", highestScore);
    console.log("Meaningful Claims:", meaningfulClaims.length);
    console.log("Total Analyzed:", analyzedCount);

    // Determine verdict based on highest score (keep OLD UI styling)
    let verdictColor, verdictIcon, verdictHtml;

    if (highestScore > 0.8) {
      verdictColor = '#ea4335';
      verdictIcon = '🚨';
      verdictHtml = `
        <div id="claimbuster-verdict-box" style="background-color: #fde7e7; border-left: 4px solid ${verdictColor}; padding: 12px; margin-bottom: 15px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#fdd5d5'" onmouseout="this.style.backgroundColor='#fde7e7'">
          <div style="font-weight: bold; color: ${verdictColor}; font-size: 16px; margin-bottom: 5px;">
            ${verdictIcon} Wichtige Behauptungen gefunden
          </div>
          <div style="font-size: 13px; color: #333;">
            Dieser Artikel enthält Behauptungen, die eine Überprüfung erfordern. Prüfen Sie diese Behauptungen 
            mit vertrauenswürdigen Quellen, bevor Sie sie teilen.
          </div>
          ${hasDetailedClaims ? '<div style="font-size: 11px; color: #666; margin-top: 8px; font-style: italic;">Klicken für Details ↓</div>' : ''}
        </div>
      `;
    } else if (highestScore > 0.6) {
      verdictColor = '#fbbc05';
      verdictIcon = '⚠️';
      verdictHtml = `
        <div id="claimbuster-verdict-box" style="background-color: #fff8e6; border-left: 4px solid ${verdictColor}; padding: 12px; margin-bottom: 15px; cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#fff2d1'" onmouseout="this.style.backgroundColor='#fff8e6'">
          <div style="font-weight: bold; color: #af8603; font-size: 16px; margin-bottom: 5px;">
            ${verdictIcon} Einige Behauptungen sollten überprüft werden
          </div>
          <div style="font-size: 13px; color: #333;">
            Dieser Artikel enthält potenziell wichtige Behauptungen. Prüfen Sie die Hauptpunkte mit anderen Quellen.
          </div>
          ${hasDetailedClaims ? '<div style="font-size: 11px; color: #666; margin-top: 8px; font-style: italic;">Klicken für Details ↓</div>' : ''}
        </div>
      `;
    } else {
      verdictColor = '#34a853';
      verdictIcon = '✓';
      verdictHtml = `
        <div id="claimbuster-verdict-box" style="background-color: #e7f8ed; border-left: 4px solid ${verdictColor}; padding: 12px; margin-bottom: 15px; cursor: pointer; transition: background-color 0.2s ease; border-radius: 8px;">
          <div style="font-weight: bold; color: ${verdictColor}; font-size: 16px; margin-bottom: 5px;">
            ${verdictIcon} Keine wichtigen Behauptungen gefunden
          </div>
          <div style="font-size: 13px; color: #333;">
            ClaimBuster hat ${analyzedCount} Sätze analysiert und keine Behauptungen mit hoher Priorität gefunden.
          </div>
          ${hasDetailedClaims ? '<div style="font-size: 11px; color: #666; margin-top: 8px; font-style: italic;">Klicken für Details ↓</div>' : ''}
        </div>
      `;
    }

    // Count high, medium, low priority claims (from meaningful claims only)
    const highPriorityClaims = meaningfulClaims.filter(c => (c.score || 0) > 0.8).length;
    const mediumPriorityClaims = meaningfulClaims.filter(c => (c.score || 0) > 0.6 && (c.score || 0) <= 0.8).length;
    const lowPriorityClaims = meaningfulClaims.filter(c => (c.score || 0) <= 0.6).length;
    
    // Keep OLD UI structure with expandable sections
    const content = `
      ${verdictHtml}
      
      <!-- Statistics section hidden by default, shown when expanded -->
      <div id="claimbuster-stats" style="display: none; margin-bottom: 15px;">
        <div style="display: flex; justify-content: center; align-items: center;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 700; color: #34a853;">${analyzedCount}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Analysiert</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 700; color: #ea4335;">${highPriorityClaims}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Hochpriorität</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 700; color: #fbbc05;">${mediumPriorityClaims}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Mittelpriorität</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; font-weight: 700; color: #34a853;">${lowPriorityClaims}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Niedrigpriorität</div>
            </div>
          </div>
        </div>
      </div>
      
      ${hasDetailedClaims ? `
        <div id="detailed-claims" style="display: none; margin-top: 15px;">
          <h4 style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Gefundene Behauptungen:</h4>
          ${generateDetailedClaimsUserFriendly(meaningfulClaims)}
        </div>
      ` : ''}
    `;
    
    console.log("Combined ClaimBuster content generated");
    return content;
    
  } catch (error) {
    console.error("Error in generateClaimBusterContentSimplified:", error);
    return `<div style="color: #ea4335; padding: 15px; text-align: center;">Error loading ClaimBuster data: ${error.message}</div>`;
  }
}

// Keep the OLD UI style for detailed claims
function generateDetailedClaimsUserFriendly(claims) {
  if (!claims || !Array.isArray(claims) || claims.length === 0) {
    return '<div style="text-align: center; color: #666; padding: 20px;">Keine Aussagen verfügbar</div>';
  }
  
  // Already sorted and filtered by the main function
  return claims.map((claim, index) => {
    const score = claim.score || claim.checkworthiness || 0;
    const text = claim.sentence || claim.text || claim.claim || 'No text available';
    
    // Clean up the text (remove extra whitespace, line breaks)
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    // Determine priority based on score
    let priority, priorityColor, priorityBg, priorityText, priorityIcon;
    
    if (score > 0.8) {
      priority = 'high';
      priorityColor = '#ea4335';
      priorityBg = '#fde7e7';
      priorityText = 'Hochpriorität';
      priorityIcon = '🚨';
    } else if (score > 0.6) {
      priority = 'medium';
      priorityColor = '#fbbc05';
      priorityBg = '#fff8e6';
      priorityText = 'Mittelpriorität';
      priorityIcon = '⚠️';
    } else {
      priority = 'low';
      priorityColor = '#34a853';
      priorityBg = '#e7f8ed';
      priorityText = 'Niedrigpriorität';
      priorityIcon = '✓';
    }
    
    return `
      <div class="ai-claimbuster-claim ai-priority-${priority}" style="background: ${priorityBg}; border-left: 4px solid ${priorityColor}; padding: 12px; margin: 8px 0; border-radius: 0 6px 6px 0;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-size: 14px; line-height: 1.4; margin-bottom: 8px; color: #333;">${cleanText}</div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <span style="font-size: 12px; padding: 4px 8px; background: ${priorityColor}20; color: ${priorityColor}; border-radius: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                ${priorityIcon} ${priorityText}
              </span>
              ${score > 0 ? `
                <span style="font-size: 11px; color: #666; background: #f5f5f5; padding: 2px 6px; border-radius: 8px;">
                  Bewertung: ${(score * 100).toFixed(0)}%
                </span>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
// UPDATED: Setup expand/collapse functionality for claims using verdict box - now includes stats
function setupClaimBusterExpansion() {
  const verdictBox = document.getElementById('claimbuster-verdict-box');
  const detailedClaims = document.getElementById('detailed-claims');
  const statsSection = document.getElementById('claimbuster-stats');
  
  console.log("Setting up ClaimBuster expansion. Verdict box:", verdictBox, "Claims:", detailedClaims, "Stats:", statsSection);
  
  if (!verdictBox) {
    console.log("ClaimBuster expansion elements not found");
    return;
  }
  
  let isExpanded = false;
  
  verdictBox.addEventListener('click', function() {
    isExpanded = !isExpanded;
    console.log("ClaimBuster expansion toggled:", isExpanded);
    
    if (isExpanded) {
      // Show stats and claims
      if (statsSection) {
        statsSection.style.display = 'block';
      }
      if (detailedClaims) {
        detailedClaims.style.display = 'block';
      }
      // Update the hint text
      const hintText = verdictBox.querySelector('div[style*="font-style: italic"]');
      if (hintText) {
        hintText.textContent = 'Klicken zum Ausblenden ↑';
      }
    } else {
      // Hide stats and claims
      if (statsSection) {
        statsSection.style.display = 'none';
      }
      if (detailedClaims) {
        detailedClaims.style.display = 'none';
      }
      // Update the hint text
      const hintText = verdictBox.querySelector('div[style*="font-style: italic"]');
      if (hintText) {
        hintText.textContent = 'Klicken für Details ↓';
      }
    }
  });
  
  console.log("ClaimBuster expansion setup complete");
}
function debugContentExtraction() {
  console.log("=== DEBUGGING CONTENT EXTRACTION ===");
  
  // Test the extraction step by step
  const articleContent = extractArticleContent();
  
  console.log("Extracted headline:", articleContent.headline);
  console.log("Extracted article length:", articleContent.article.length);
  console.log("First 500 chars of article:", articleContent.article.substring(0, 500));
  console.log("Last 500 chars of article:", articleContent.article.substring(articleContent.article.length - 500));
  
  // Check for specific contamination markers
  const contaminationMarkers = [
    "Der Artikel berichtet über",
    "Die Angaben zu Ort, Zeit",
    "Keine erkennbaren Manipulationstaktiken", 
    "Target Audience:",
    "Political Framing:",
    "Es werden keine unbelegten Behauptungen",
    "Die Ermittlungen sind noch im Gange"
  ];
  
  console.log("CONTAMINATION CHECK:");
  contaminationMarkers.forEach(marker => {
    if (articleContent.article.includes(marker)) {
      console.log(`FOUND CONTAMINATION: "${marker}"`);
      
      // Find the context around this contamination
      const index = articleContent.article.indexOf(marker);
      const context = articleContent.article.substring(Math.max(0, index - 100), index + 200);
      console.log(`Context: "${context}"`);
    } else {
      console.log(`Clean: "${marker}"`);
    }
  });
  
  console.log("=====================================");
  
  return articleContent;
}

/* =================================================================
                     VIDEO TESTING & DEBUG FUNCTIONS
   ================================================================= */

// Test video platform detection
function testVideoPlatformDetection() {
  console.log("=== VIDEO PLATFORM DETECTION TEST ===");
  const platform = detectVideoPlatform();
  console.log("Current URL:", window.location.href);
  console.log("Detected platform:", platform);
  console.log("=====================================");
  return platform;
}

// Test video metadata extraction
async function testVideoMetadata() {
  console.log("=== VIDEO METADATA EXTRACTION TEST ===");
  const platform = detectVideoPlatform();
  
  if (!platform) {
    console.log("No video platform detected");
    return null;
  }
  
  const metadata = await extractVideoMetadata(platform);
  console.log("Extracted metadata:", metadata);
  console.log("======================================");
  return metadata;
}

// Test video element finding
function testVideoElement() {
  console.log("=== VIDEO ELEMENT DETECTION TEST ===");
  const platform = detectVideoPlatform();
  
  if (!platform) {
    console.log("No video platform detected");
    return null;
  }
  
  const video = findVideoElement(platform);
  console.log("Found video element:", video);
  
  if (video) {
    console.log("Video properties:");
    console.log("- readyState:", video.readyState);
    console.log("- duration:", video.duration);
    console.log("- currentTime:", video.currentTime);
    console.log("- muted:", video.muted);
    console.log("- volume:", video.volume);
    console.log("- src:", video.src);
  }
  
  console.log("====================================");
  return video;
}

// Test full video content extraction (including audio)
async function testVideoContentExtraction() {
  console.log("=== FULL VIDEO CONTENT EXTRACTION TEST ===");
  
  try {
    const result = await extractVideoContent();
    console.log("Video content extraction result:", result);
    
    if (result && result.success && result.audio) {
      console.log(`Audio extracted successfully: ${result.audio.size} bytes`);
      console.log(`Duration: ${result.duration} seconds`);
      
      // Create a temporary download link for testing
      const url = URL.createObjectURL(result.audio);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.platform}_audio_test.webm`;
      a.textContent = `Download ${result.platform} audio (${Math.round(result.audio.size / 1024)} KB)`;
      a.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 999999; background: #4285f4; color: white; padding: 10px; border-radius: 4px; text-decoration: none;';
      document.body.appendChild(a);
      
      console.log("Download link created for extracted audio");
      
      // Auto-remove link after 30 seconds
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 30000);
    }
    
    console.log("============================================");
    return result;
    
  } catch (error) {
    console.error("Video content extraction test failed:", error);
    console.log("============================================");
    return null;
  }
}

// Make test functions globally available
window.testVideoPlatformDetection = testVideoPlatformDetection;
window.testVideoMetadata = testVideoMetadata; 
window.testVideoElement = testVideoElement;
window.testVideoContentExtraction = testVideoContentExtraction;

// Auto-run basic detection test on video platforms
if (detectVideoPlatform()) {
  console.log("🎥 Video platform detected - test functions available:");
  console.log("• testVideoPlatformDetection()");
  console.log("• testVideoMetadata()");
  console.log("• testVideoElement()");
  console.log("• testVideoContentExtraction()");
}

// Very last line of content.js file
console.log("🔥 CONTENT SCRIPT LOADED COMPLETELY - WITH MULTIMEDIA SUPPORT");

