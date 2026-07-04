// updated on July 10
try {
  importScripts('config.js');
} catch (e) {
  console.error("AI Fact Checker: config.js is missing. Copy config.template.js to config.js and add your API keys.");
}
if (typeof API_KEYS === 'undefined') {
  self.API_KEYS = { OPENAI_API_KEY: '', CLAIMBUSTER_API_KEY: '' };
}

console.log("AI Fact Checker Extension: Background script loaded");

// Configuration - embedded directly to avoid import issues
const CONFIG = {
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  CLAIMBUSTER_API_URL: 'https://idir.uta.edu/claimbuster/api/v2/score/text/',
  
  // Supported news domains
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
  ],
  
  // OpenAI model configuration
  MODEL: 'gpt-4.1-nano', // Using gpt-4.1-nano for the advanced analysis
  MAX_TOKENS: 4000, // Increased for detailed analysis
  TEMPERATURE: 0.2, // Lower temperature for more factual responses
  
  // Analysis settings
  MAX_ARTICLE_LENGTH: 8000, // Limit article length to avoid token limits
  ANALYSIS_TIMEOUT: 30000, // 30 seconds timeout
  
  // UI settings
  PANEL_WIDTH: '400px',
  PANEL_MAX_HEIGHT: '70vh'
};

// ADD THIS: New function to analyze article using ClaimBuster API
async function analyzeWithClaimBuster(articleContent) {
  try {
    const { headline, article } = articleContent;
    
    // Prepare the text for analysis
    let fullText = headline ? `${headline}\n\n${article}` : article;
    
    if (!fullText || fullText.length < 50) {
      console.log("Content too short for ClaimBuster analysis");
      return {
        success: false,
        error: 'Insufficient content for ClaimBuster analysis'
      };
    }
    
    console.log('Starting ClaimBuster analysis with quality filtering...');
    
    // Split text into sentences for ClaimBuster analysis
    const sentences = splitTextIntoSentences(fullText);
    
    // IMPROVED: Smart sentence selection based on article length
    let sentencesToAnalyze;
    if (sentences.length <= 10) {
      // Short articles: analyze all sentences
      sentencesToAnalyze = sentences;
      console.log(`Short article: analyzing all ${sentences.length} sentences`);
    } else if (sentences.length <= 20) {
      // Medium articles: analyze first 15 sentences
      sentencesToAnalyze = sentences.slice(0, 15);
      console.log(`Medium article: analyzing first 15 of ${sentences.length} sentences`);
    } else {
      // Long articles: analyze first 25 sentences
      sentencesToAnalyze = sentences.slice(0, 25);
      console.log(`Long article: analyzing first 25 of ${sentences.length} sentences`);
    }
    
    console.log(`Total sentences found: ${sentences.length}, analyzing: ${sentencesToAnalyze.length}`);
    
    // Analyze sentences with ClaimBuster API
    const sentencePromises = sentencesToAnalyze.map(async (sentence, index) => {
      try {
        const response = await fetch(CONFIG.CLAIMBUSTER_API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': API_KEYS.CLAIMBUSTER_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input_text: sentence.trim()
          })
        });

        if (!response.ok) {
          console.warn(`ClaimBuster API error for sentence ${index}: ${response.status}`);
          return null;
        }

        const data = await response.json();
        return {
          sentence: sentence.trim(),
          score: data.results && data.results[0] ? data.results[0].score || 0 : 0,
          index: index
        };
      } catch (error) {
        console.warn(`Error analyzing sentence ${index}:`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(sentencePromises);
    const validResults = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    console.log(`ClaimBuster analysis completed: ${validResults.length} sentences analyzed`);

    // IMPROVED: Process results with quality filtering
    const processedResults = processClaimBusterResults(validResults, sentences.length);
    
    return {
      success: true,
      analysis: processedResults
    };

  } catch (error) {
    console.error("Error analyzing with ClaimBuster:", error);
    
    return {
      success: false,
      error: `ClaimBuster analysis failed: ${error.message}`
    };
  }
}


// Debug function to check if a sentence exists in the original article
function debugSentenceInArticle(sentence, originalText) {
  console.log('=== CHECKING SENTENCE IN ORIGINAL ===');
  console.log('Looking for:', sentence);
  console.log('Found in original:', originalText.includes(sentence));
  
  if (!originalText.includes(sentence)) {
    // Try to find similar content
    const words = sentence.split(' ').filter(w => w.length > 3);
    const partialMatches = words.filter(word => originalText.includes(word));
    console.log('Partial word matches:', partialMatches);
  }
  console.log('====================================');
}

// ADD THIS: Helper function to process ClaimBuster results
function processClaimBusterResults(results, totalSentencesInArticle) {
  console.log('=== CLAIMBUSTER QUALITY FILTERING ===');
  console.log(`Input: ${results.length} analyzed sentences`);
  
  if (results.length === 0) {
    return {
      overall_score: 0,
      priority: 'MINIMAL',
      quality_claims: [],
      summary: "No sentences were successfully analyzed",
      total_sentences_in_article: totalSentencesInArticle,
      analyzed_sentences: 0,
      quality_claims_count: 0,
      average_score: 0,
      highest_score: 0,
      all_results: []
    };
  }

  // Sort by score (highest first)
  const sortedResults = results.sort((a, b) => b.score - a.score);
  
  // QUALITY FILTER: Only keep sentences with score > 0.4
  const qualityClaims = sortedResults.filter(r => r.score > 0.4);
  
  console.log(`Quality filter (>0.4): ${qualityClaims.length} quality claims found`);
  console.log('Quality claims scores:', qualityClaims.map(c => c.score.toFixed(3)));
  
  // Calculate metrics
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const averageScore = totalScore / results.length;
  const highestScore = sortedResults.length > 0 ? sortedResults[0].score : 0;
  
  // Determine priority based on quality claims count and highest score
  let priority;
  let summary;
  
  if (qualityClaims.length >= 3 && highestScore > 0.7) {
    priority = 'HIGH';
    summary = `${qualityClaims.length} high-quality claims require fact-checking verification`;
  } else if (qualityClaims.length >= 2 && highestScore > 0.6) {
    priority = 'MEDIUM';
    summary = `${qualityClaims.length} claims may need additional verification`;
  } else if (qualityClaims.length >= 1) {
    priority = 'LOW';
    summary = `${qualityClaims.length} claim detected that may warrant fact-checking`;
  } else {
    priority = 'MINIMAL';
    summary = "No significant fact-checkable claims detected";
  }

  const result = {
    // IMPROVED: Focus on quality claims
    overall_score: highestScore, // Use highest score instead of average
    priority: priority,
    quality_claims: qualityClaims.slice(0, 5), // Top 5 quality claims only
    summary: summary,
    
    // Detailed metrics
    total_sentences_in_article: totalSentencesInArticle,
    analyzed_sentences: results.length,
    quality_claims_count: qualityClaims.length,
    average_score: Math.round(averageScore * 100) / 100,
    highest_score: Math.round(highestScore * 100) / 100,
    
    // Keep all results for debugging (but still sorted)
    all_results: sortedResults,
    
    // LEGACY: Keep checkworthy_claims for backward compatibility
    checkworthy_claims: qualityClaims.slice(0, 5)
  };
  
  console.log('=== PROCESSING RESULTS ===');
  console.log(`Priority: ${priority}`);
  console.log(`Quality claims: ${qualityClaims.length}`);
  console.log(`Highest score: ${highestScore.toFixed(3)}`);
  console.log(`Average score: ${averageScore.toFixed(3)}`);
  console.log('============================');
  
  return result;
}

// Helper function to split text into sentences with quality detection
function splitTextIntoSentences(text) {
  console.log('=== ENHANCED SENTENCE SPLITTING ===');
  console.log('Input text length:', text.length);
  
  // Enhanced sentence splitting regex
  const sentences = text
    .split(/[.!?]+\s*\n*\s*/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0)
    .filter(sentence => sentence.length > 20) // Minimum length
    .filter(sentence => !/^\d+[\d\s\-\/\.:]*$/.test(sentence)) // No date/number only
    .filter(sentence => {
      const lower = sentence.toLowerCase();
      return !lower.match(/^(teilen|drucken|weiter|zurück|mehr|weniger|klicken|hier|link|cookie|datenschutz|impressum)$/) &&
             !lower.includes('rache der mullahs') &&
             !lower.includes('iran-drohnen') &&
             !sentence.match(/\+\+\+.*\+\+\+/) &&
             !lower.includes('breaking news');
    })
    .filter(sentence => {
      // ENHANCED: Filter out navigation and UI elements more aggressively
      const navigationKeywords = [
        'zur startseite', 'zum artikel', 'weiterlesen', 'mehr dazu',
        'newsletter', 'anzeige', 'werbung', 'sponsored', 'partnerinhalt'
      ];
      const lower = sentence.toLowerCase();
      return !navigationKeywords.some(keyword => lower.includes(keyword));
    });
  
  console.log(`Sentence splitting result: ${sentences.length} valid sentences`);
  console.log('Sample sentences:', sentences.slice(0, 3).map(s => s.substring(0, 50) + '...'));
  console.log('====================================');
  
  return sentences;
}

/* =================================================================
                    TAB CAPTURE AUDIO PROCESSING
   ================================================================= */

// MV3: chrome.tabCapture.capture() and MediaRecorder are not available in
// service workers. Instead, the service worker gets a stream ID via
// chrome.tabCapture.getMediaStreamId() and hands it to an offscreen document
// (offscreen.js), which records the audio and sends it back as base64.

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error('Offscreen API not available (requires Chrome 109+)');
  }

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record tab audio so it can be transcribed for fact-checking'
  });
}

async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }
  } catch (error) {
    console.warn("Could not close offscreen document:", error.message);
  }
}

// Start a tab capture recording for the given tab via the offscreen document
async function startTabCapture(videoData, tabId) {
  if (!chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
    throw new Error('tabCapture API not available - missing permission in manifest.json?');
  }

  console.log("🎙️ Requesting media stream ID for tab", tabId);
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(id);
      }
    });
  });

  await ensureOffscreenDocument();

  const maxDurationMs = Math.min(videoData.duration * 1000 || 60000, 300000); // Max 5 minutes
  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_RECORD_TAB',
    target: 'offscreen',
    streamId: streamId,
    maxDurationMs: maxDurationMs,
    videoData: videoData,
    tabId: tabId
  });

  if (!response || !response.started) {
    await closeOffscreenDocument();
    throw new Error(response?.error || 'Offscreen recorder did not start');
  }

  console.log(`✅ Offscreen recording started (max ${maxDurationMs / 1000}s)`);
}

// Handle the finished recording sent back by the offscreen document
async function handleOffscreenRecordingComplete(message) {
  const { videoData, tabId } = message;
  await closeOffscreenDocument();

  try {
    if (!message.success) {
      throw new Error(message.error || 'Tab audio recording failed');
    }

    // Rebuild the audio blob from base64 (ArrayBuffers don't survive sendMessage)
    const binary = atob(message.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const mimeType = message.mimeType || 'audio/webm';
    const audioBlob = new Blob([bytes], { type: mimeType });

    await processCapturedAudio(audioBlob, mimeType, videoData, tabId);
  } catch (error) {
    console.error("❌ Tab capture pipeline failed:", error);

    // Fall back to metadata-only analysis
    try {
      const fallbackResult = await analyzeVideoMetadataOnly(videoData);
      await safelySendMessageToTab(tabId, {
        type: 'FACTCHECK_RESULT',
        result: {
          ...fallbackResult,
          method: 'tab_capture_fallback',
          transcription_error: error.message
        }
      });
    } catch (fallbackError) {
      await safelySendMessageToTab(tabId, {
        type: 'FACTCHECK_RESULT',
        result: {
          success: false,
          type: 'video',
          platform: videoData?.platform || 'unknown',
          error: error.message,
          hash: videoData?.hash,
          analysis: {
            overall_verdict: 'ERROR',
            summary: 'Video analysis failed',
            detailed_analysis: `Tab audio capture failed: ${error.message}`
          }
        }
      });
    }
  }
}

// Transcribe captured tab audio and run the dual analysis pipeline
async function processCapturedAudio(audioBlob, mimeType, videoData, tabId) {
  console.log("🎵 Processing captured tab audio:", {
    size: audioBlob.size,
    sizeKB: Math.round(audioBlob.size / 1024),
    type: mimeType
  });

  if (audioBlob.size < 1000) {
    console.warn("⚠️ Audio blob is very small, might be empty or corrupted");
  }

  console.log("🚀 Sending to Whisper API...");
  const transcription = await transcribeAudioWithWhisper(audioBlob, {
    platform: videoData.platform,
    format: mimeType,
    ...videoData.metadata
  });

  if (!transcription.success) {
    console.error("❌ Transcription failed:", transcription.error);
    console.log("🔄 Falling back to metadata-only analysis...");

    const fallbackResult = await analyzeVideoMetadataOnly(videoData);
    await safelySendMessageToTab(tabId, {
      type: 'FACTCHECK_RESULT',
      result: {
        ...fallbackResult,
        method: 'tab_capture_fallback',
        transcription_error: transcription.error
      }
    });
    return;
  }

  console.log("✅ Transcription successful:", transcription.text.length, "characters");
  console.log("🚀 Starting dual analysis (GPT + ClaimBuster) of transcript...");

  const analysisContent = {
    transcript: transcription.text,
    metadata: videoData.metadata,
    platform: videoData.platform,
    duration: videoData.duration,
    segments: transcription.segments,
    language: transcription.language
  };

  // Run both analyses in parallel
  const [gptResult, claimbusterResult] = await Promise.allSettled([
    analyzeVideoWithGPT(analysisContent),
    analyzeWithClaimBuster({
      headline: videoData.metadata.title || '',
      article: transcription.text
    })
  ]);

  console.log("Dual video analysis completed");
  console.log("GPT result:", gptResult.status);
  console.log("ClaimBuster result:", claimbusterResult.status);

  let gptAnalysis = null;
  if (gptResult.status === 'fulfilled' && gptResult.value.success) {
    gptAnalysis = gptResult.value.analysis;
  }

  let claimbusterAnalysis = null;
  if (claimbusterResult.status === 'fulfilled' && claimbusterResult.value.success) {
    claimbusterAnalysis = claimbusterResult.value.analysis;
  }

  const result = {
    success: true,
    type: 'video',
    platform: videoData.platform,
    metadata: videoData.metadata,
    transcription: transcription,
    // Primary analysis (GPT)
    analysis: gptAnalysis || {
      overall_verdict: 'ERROR',
      summary: 'Video analysis failed',
      detailed_analysis: 'Could not analyze video transcript'
    },
    // Dual analysis results
    gpt: gptAnalysis ? {
      success: true,
      analysis: gptAnalysis
    } : {
      success: false,
      error: gptResult.reason?.message || 'GPT analysis failed'
    },
    claimbuster: claimbusterAnalysis ? {
      success: true,
      analysis: claimbusterAnalysis
    } : {
      success: false,
      error: claimbusterResult.reason?.message || 'ClaimBuster analysis failed'
    },
    hash: videoData.hash,
    method: 'tab_capture'
  };

  await safelySendMessageToTab(tabId, {
    type: 'FACTCHECK_RESULT',
    result: result
  });
}

/* =================================================================
                    WHISPER API INTEGRATION
   ================================================================= */

// Function to transcribe audio using OpenAI Whisper API
async function transcribeAudioWithWhisper(audioBlob, metadata = {}) {
  let timeoutId;
  
  try {
    console.log('🎵 Starting Whisper transcription...', {
      audioSize: audioBlob?.size,
      audioType: audioBlob?.type,
      platform: metadata.platform,
      hasBlob: !!audioBlob,
      format: metadata.format || audioBlob.type || 'audio/webm'
    });
    
    // Validate audio blob
    if (!audioBlob) {
      throw new Error('No audio blob provided for transcription');
    }
    
    if (audioBlob.size === 0) {
      throw new Error('Audio blob is empty (0 bytes)');
    }
    
    // Check if audio blob is too large (Whisper has 25MB limit)
    const maxSize = 25 * 1024 * 1024; // 25MB in bytes
    if (audioBlob.size > maxSize) {
      throw new Error(`Audio file too large: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB (max: 25MB)`);
    }
    
    // Log audio size but don't reject small files - let Whisper handle it
    if (audioBlob.size < 1024) {
      console.warn(`Audio blob is small: ${audioBlob.size} bytes. Proceeding with Whisper API call.`);
    }

    // Prepare form data for Whisper API
    const formData = new FormData();
    
    // Validate blob size first
    if (!audioBlob.size || audioBlob.size < 1024) {
      throw new Error(`Audio blob is too small or empty (${audioBlob.size} bytes) - likely failed capture`);
    }
    
    console.log("=== WHISPER FILE PREPARATION ===");
    console.log("Input blob:", { type: audioBlob.type, size: audioBlob.size, sizeKB: Math.round(audioBlob.size / 1024) });
    
    // Map MIME types to proper file extensions for Whisper
    const type = (audioBlob.type || '').toLowerCase();
    const extMap = {
      'audio/webm': 'webm',
      'video/webm': 'webm',            // Chrome sometimes gives this for audio-only
      'audio/ogg':  'ogg',
      'audio/oga':  'oga', 
      'audio/mpeg': 'mp3',
      'audio/mp3':  'mp3',
      'audio/wav':  'wav',
      'audio/x-wav':'wav',
      'audio/mp4':  'm4a',
      'video/mp4':  'mp4',
      'audio/flac': 'flac'
    };
    
    const extension = extMap[type] || 'webm'; // default to webm if unknown
    const filename = `${metadata.platform || 'video'}_audio.${extension}`;
    const finalType = type || `audio/${extension}`;
    
    // Create File object with proper filename and extension - Whisper needs this!
    const audioFile = new File([audioBlob], filename, { type: finalType });
    
    console.log("Created file for Whisper:", { 
      name: audioFile.name, 
      type: audioFile.type, 
      size: audioFile.size,
      extension: extension
    });
    console.log("==================================");
    
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json'); // Get timestamps and segments
    
    // Add language parameter only if specified (omitting it enables auto-detection)
    if (metadata.language) {
      formData.append('language', metadata.language);
    }

    console.log('📤 Sending audio to Whisper API...');

    // Create timeout promise (Whisper can take longer for longer audio)
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Whisper transcription timeout after 120 seconds'));
      }, 120000); // 2 minutes timeout for audio processing
    });

    // Make the Whisper API request
    const fetchPromise = fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEYS.OPENAI_API_KEY}`
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData
    });

    // Race between fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    console.log('📥 Received response from Whisper API');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('=== WHISPER API ERROR ===');
      console.error('HTTP Status:', response.status, response.statusText);
      console.error('Error response:', errorText);
      console.error('File sent to Whisper:', {
        name: audioFile.name,
        type: audioFile.type, 
        size: audioFile.size,
        extension: extension
      });
      console.error('=========================');
      throw new Error(`Whisper API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const transcriptionData = await response.json();
    console.log('✅ Successfully transcribed audio');

    // Process the response
    const result = {
      success: true,
      text: transcriptionData.text || '',
      language: transcriptionData.language || 'unknown',
      duration: transcriptionData.duration || 0,
      segments: transcriptionData.segments || [],
      confidence: calculateTranscriptionConfidence(transcriptionData)
    };

    console.log('Transcription result:', {
      textLength: result.text.length,
      language: result.language,
      segmentsCount: result.segments.length,
      confidence: result.confidence
    });

    return result;

  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error('Whisper transcription failed:', error);
    return {
      success: false,
      error: error.message,
      text: '',
      segments: []
    };
  }
}

// Helper function to calculate transcription confidence
function calculateTranscriptionConfidence(transcriptionData) {
  if (transcriptionData.segments && transcriptionData.segments.length > 0) {
    // Calculate average confidence from segments if available
    const confidences = transcriptionData.segments
      .filter(segment => segment.avg_logprob !== undefined)
      .map(segment => Math.exp(segment.avg_logprob));
    
    if (confidences.length > 0) {
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      return Math.round(avgConfidence * 100);
    }
  }
  
  // Default confidence based on text length and language detection
  const textLength = transcriptionData.text?.length || 0;
  if (textLength < 10) return 30; // Very short transcription, likely poor
  if (textLength < 50) return 60; // Short transcription
  if (transcriptionData.language && transcriptionData.language !== 'unknown') {
    return 85; // Good confidence with language detection
  }
  
  return 75; // Default reasonable confidence
}

/* =================================================================
                    VIDEO CONTENT ANALYSIS
   ================================================================= */

// Main function to analyze video content (transcript + metadata)
async function analyzeVideoContent(videoData) {
  try {
    console.log('🎬 Starting video content analysis...', {
      platform: videoData.platform,
      duration: videoData.duration,
      hasAudio: !!videoData.audioBlob
    });

    // Step 1: Transcribe audio with Whisper
    const transcription = await transcribeAudioWithWhisper(
      videoData.audioBlob, 
      { platform: videoData.platform, format: videoData.format, ...videoData.metadata }
    );

    if (!transcription.success) {
      console.warn('Audio transcription failed, falling back to metadata-only analysis:', transcription.error);
      
      // Fallback: Analyze video metadata without transcript
      const metadataAnalysis = await analyzeVideoMetadataOnly(videoData);
      return metadataAnalysis;
    }

    // Step 2: Analyze transcript with GPT-4.1-nano
    const analysisContent = {
      transcript: transcription.text,
      metadata: videoData.metadata,
      platform: videoData.platform,
      duration: videoData.duration,
      segments: transcription.segments,
      language: transcription.language
    };

    console.log('📝 Analyzing transcript with GPT-4.1-nano...');
    const gptAnalysis = await analyzeVideoWithGPT(analysisContent);

    // Step 3: Combine results
    const result = {
      success: true,
      type: 'video',
      platform: videoData.platform,
      metadata: videoData.metadata,
      transcription: transcription,
      analysis: gptAnalysis.analysis,
      hash: videoData.hash
    };

    console.log('🎯 Video analysis completed successfully');
    return result;

  } catch (error) {
    console.error('Video analysis failed:', error);
    return {
      success: false,
      type: 'video',
      platform: videoData.platform || 'unknown',
      error: error.message,
      hash: videoData.hash,
      analysis: {
        overall_verdict: 'ERROR',
        confidence_score: 0,
        summary: 'Video analysis failed - could not process audio or transcript',
        detailed_analysis: `Analysis failed: ${error.message}`
      }
    };
  }
}

// Function to analyze video transcript with GPT-4.1-nano
async function analyzeVideoWithGPT(videoContent) {
  let timeoutId;
  let isGerman = false;

  try {
    const { transcript, metadata, platform, duration, segments, language } = videoContent;
    
    console.log(`Starting GPT analysis of ${platform} video transcript...`);
    
    // Enhanced validation
    if (!transcript || transcript.length < 20) {
      console.log("Transcript too short for analysis");
      return {
        success: false,
        error: 'Insufficient transcript content for analysis',
        analysis: {
          overall_verdict: 'ERROR',
          confidence_score: 0,
          summary: 'Transcript too short or empty for proper analysis',
          detailed_analysis: 'The video transcript was too short or empty for meaningful analysis.'
        }
      };
    }
    
    // Detect if content is German
    isGerman = /[äöüß]/.test(transcript) ||
                    /\b(der|die|das|und|ist|ein|eine|von|zu|auf|mit|für|sich|nicht|werden|kann|wird|sind|wurde|wurden)\b/i.test(transcript);
    
    console.log(`Detected language: ${language || (isGerman ? 'German' : 'English')}, Transcript length: ${transcript.length}, Platform: ${platform}`);
    
    // Truncate if too long to avoid token limits  
    let processedTranscript = transcript;
    if (transcript.length > CONFIG.MAX_ARTICLE_LENGTH) {
      processedTranscript = transcript.substring(0, CONFIG.MAX_ARTICLE_LENGTH) + '...';
    }

    // Create video-specific analysis prompt
    const prompt = `You are an expert fact-checker and misinformation analyst specializing in multimedia content analysis.

Respond in ${isGerman ? 'GERMAN' : 'ENGLISH'}.

You are analyzing a ${platform?.toUpperCase() || 'VIDEO'} video transcript. Pay special attention to the unique characteristics of ${platform} content:

${platform === 'youtube' ? `
YOUTUBE-SPECIFIC ANALYSIS:
- Educational vs entertainment vs misinformation content
- Creator credibility and channel history implications  
- Monetization incentives affecting content accuracy
- Comment manipulation and echo chamber effects
- Algorithmic amplification of controversial content
` : ''}

${platform === 'tiktok' ? `
TIKTOK-SPECIFIC ANALYSIS:
- Short-form content and oversimplification risks
- Viral misinformation spread patterns
- Influencer credibility vs. follower count
- Trend-based content vs. factual accuracy
- Youth audience vulnerability to misinformation
` : ''}

COMPREHENSIVE VIDEO CONTENT ANALYSIS:

1. TRANSCRIPT ACCURACY & QUALITY
   - Audio clarity and transcription confidence
   - Speech patterns, hesitations, or confidence levels
   - Identify segments that may need verification

2. SPOKEN CLAIMS VERIFICATION
   - Fact-check specific statements and statistics
   - Verify numerical data and percentages mentioned
   - Check dates, names, and factual assertions
   - Identify unsupported or fabricated claims

3. RHETORIC & PERSUASION ANALYSIS
   - Emotional manipulation techniques in speech
   - Fear-mongering, anger-inducing, or divisive language
   - Logical fallacies in argumentation
   - Appeal to authority, popularity, or emotion

4. MISINFORMATION PATTERNS
   - Conspiracy theory language and framing
   - Anti-establishment or anti-science rhetoric  
   - Misleading correlations presented as causation
   - Cherry-picked anecdotes vs. systematic evidence

5. PLATFORM-SPECIFIC RED FLAGS
   - Content designed for viral engagement vs. accuracy
   - Clickbait or sensationalist speaking style
   - Calls to action that could spread misinformation
   - References to debunked theories or sources

6. TEMPORAL CONTEXT
   - Time-sensitive claims that may be outdated
   - References to current events requiring fact-checking
   - Historical claims that can be verified

7. KEY MOMENTS IDENTIFICATION
   - Timestamp problematic statements or claims
   - Identify moments requiring additional verification
   - Flag emotionally manipulative segments
   - Mark statistical claims needing fact-checking

SPECIAL ATTENTION FOR VIDEO CONTENT:
- Spoken authority vs. actual expertise
- Confidence in delivery vs. accuracy of content  
- Repetition for emphasis vs. factual basis
- Personal anecdotes vs. systematic evidence
- Visual cues mentioned that may mislead (even though we can't see them)

VIDEO METADATA:
- Platform: ${platform}
- Title: ${metadata?.title || 'Unknown'}
- Channel/Creator: ${metadata?.channel || metadata?.username || 'Unknown'}
- Duration: ${Math.round(duration || 0)} seconds
- Detected Language: ${language || 'Auto-detected'}

TRANSCRIPT TO ANALYZE:
------
${processedTranscript}
------

IMPORTANT: Use verdict categories appropriately for video content:
- ${isGerman ? 'ZUVERLÄSSIG' : 'RELIABLE'}: Factually accurate, credible creator, well-sourced claims
- ${isGerman ? 'FRAGWÜRDIG' : 'QUESTIONABLE'}: Some concerns about accuracy, sources, or creator credibility  
- ${isGerman ? 'IRREFÜHREND' : 'MISLEADING'}: Significant factual issues, misleading claims, or questionable sources
- ${isGerman ? 'FALSCH' : 'FALSE'}: Contains false information, conspiracy theories, or intentional misinformation

Return ONLY a valid JSON object in this schema:

{
  "overall_verdict": "${isGerman ? 'ZUVERLÄSSIG|FRAGWÜRDIG|IRREFÜHREND|FALSCH' : 'RELIABLE|QUESTIONABLE|MISLEADING|FALSE'}", 
  "verdict_explanation": "${isGerman ? 'Kurze Begründung für das gewählte Urteil basierend auf der Video-Analyse' : 'Brief explanation for chosen verdict based on video analysis'}",
  "confidence_score": 85,
  "summary": "${isGerman ? 'Sehr kurze Zusammenfassung in 1-2 Sätzen – nur die wichtigsten Punkte' : 'Very brief summary in 1-2 sentences – key points only'}",
  "quick_summary": "${isGerman ? 'Mittellange Zusammenfassung für Übersichts-Tab (3-4 Sätze mit mehr Details)' : 'Medium-length summary for overview tab (3-4 sentences with more details)'}",
  "detailed_analysis": "${isGerman ? 'Ausführliche detaillierte Analyse aller Video-Aspekte' : 'Comprehensive detailed analysis covering all video aspects'}",
  "recommendations": "${isGerman ? 'Empfehlungen für Betrachter' : 'Recommendations for viewers'}",
  "red_flags": ["${isGerman ? 'Liste von problematischen Elementen im Video' : 'List of concerning elements in the video'}"],
  "sources_needed": ["${isGerman ? 'Benötigte Quellen zur Überprüfung' : 'Needed sources for verification'}"],
  "political_context": "${isGerman ? 'Politische Einordnung des Video-Inhalts' : 'Political context of video content'}",

  "multimedia_analysis": {
    "platform": "${platform}",
    "content_type": "${isGerman ? 'Bildung|Unterhaltung|Nachrichten|Meinung|Desinformation' : 'Educational|Entertainment|News|Opinion|Misinformation'}",
    "creator_credibility": "${isGerman ? 'Bewertung der Glaubwürdigkeit des Erstellers' : 'Assessment of creator credibility'}",
    "audio_quality": "HIGH|MEDIUM|LOW",
    "speech_patterns": ["${isGerman ? 'Auffällige Sprachmuster' : 'Notable speech patterns identified'}"],
    "detected_language": "${language || 'auto-detected'}",
    "duration": ${Math.round(duration || 0)},
    "content_summary": "${isGerman ? 'Zusammenfassung des Video-Inhalts' : 'Summary of video content'}"
  },

  "transcript": {
    "confidence": "${isGerman ? 'HOCH|MITTEL|NIEDRIG' : 'HIGH|MEDIUM|LOW'}",
    "text": "${isGerman ? 'Vollständiges Transkript verfügbar' : 'Full transcript available'}",
    "language_detected": "${language || 'unknown'}",
    "segments": ${segments ? segments.length : 0}
  },

  "key_moments": [
    {
      "timestamp": "${isGerman ? 'Zeitstempel (z.B. \"1:23\")' : 'Timestamp (e.g., \"1:23\")'}", 
      "description": "${isGerman ? 'Beschreibung des Problems' : 'Description of the issue'}",
      "severity": "HIGH|MEDIUM|LOW",
      "reason": "${isGerman ? 'Warum dieser Moment problematisch ist' : 'Why this moment is problematic'}",
      "suggested_verification": "${isGerman ? 'Vorschlag zur Überprüfung' : 'Suggestion for verification'}"
    }
  ],

  "factual_accuracy": {
    "verifiable_claims": "${isGerman ? 'Anzahl überprüfbarer Aussagen' : 'Number of checkable claims'}",
    "unsupported_claims": "${isGerman ? 'Anzahl unbelegter Aussagen' : 'Number of unverified assertions'}",
    "misleading_statistics": ["${isGerman ? 'Problematische Statistiken oder Zahlen' : 'Problematic statistics or numbers'}"],
    "missing_context": ["${isGerman ? 'Fehlende wichtige Informationen' : 'Crucial omitted information'}"]
  },

  "rhetoric_analysis": {
    "persuasion_techniques": ["${isGerman ? 'Verwendete Überzeugungstechniken' : 'Persuasion techniques used'}"],
    "emotional_manipulation": ["${isGerman ? 'Emotionale Manipulationstechniken' : 'Emotional manipulation techniques'}"],
    "logical_fallacies": ["${isGerman ? 'Logische Fehlschlüsse' : 'Logical fallacies identified'}"],
    "target_audience": "${isGerman ? 'Offensichtliche Zielgruppe' : 'Apparent target audience'}"
  }
}`;

    const requestBody = {
      model: CONFIG.MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert multimedia fact-checker and misinformation analyst. Analyze video transcripts thoroughly for accuracy, bias, and manipulation techniques. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      response_format: { type: 'json_object' }
    };

    console.log('🚀 Making request to OpenAI GPT-4.1-nano for video analysis...');

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timeout after 60 seconds'));
      }, 60000);
    });

    // Make the actual API request
    const fetchPromise = fetch(CONFIG.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    // Race between the fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    console.log('📥 Received response from GPT-4.1-nano for video analysis');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Successfully parsed video analysis response');
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from OpenAI API');
    }

    // Parse the JSON response
    const analysisText = data.choices[0].message.content.trim();
    console.log('Raw video analysis text:', analysisText.substring(0, 200) + '...');
    
    let analysisResult;
    
    try {
      // Try to parse as JSON
      analysisResult = JSON.parse(analysisText);
      console.log('✅ Successfully parsed video analysis JSON');
    } catch (parseError) {
      console.error('JSON parsing failed for video analysis, attempting cleanup...', parseError);
      
      // Try to extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
          console.log('✅ Successfully parsed cleaned video analysis JSON');
        } catch (cleanupError) {
          throw new Error('Could not parse video analysis response as JSON');
        }
      } else {
        throw new Error('No valid JSON found in video analysis response');
      }
    }

    // Validate and enrich the result
    if (!analysisResult.overall_verdict) {
      analysisResult.overall_verdict = isGerman ? 'FRAGWÜRDIG' : 'QUESTIONABLE';
    }
    
    if (!analysisResult.confidence_score || analysisResult.confidence_score < 1) {
      analysisResult.confidence_score = 70;
    }

    console.log(`🎯 Video analysis completed: ${analysisResult.overall_verdict} (${analysisResult.confidence_score}% confidence)`);

    return {
      success: true,
      analysis: analysisResult
    };

  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error('Video analysis failed:', error);
    return {
      success: false,
      error: error.message,
      analysis: {
        overall_verdict: isGerman ? 'FEHLER' : 'ERROR',
        confidence_score: 0,
        summary: isGerman ? 'Video-Analyse fehlgeschlagen' : 'Video analysis failed',
        detailed_analysis: `Video analysis failed: ${error.message}`
      }
    };
  }
}

// Enhanced function to analyze article using OpenAI API with improved German language support
async function analyzeWithOpenAI(articleContent) {
  let timeoutId;
  
  try {
    const { headline, article } = articleContent;
    
    // Prepare the text for analysis
    let fullText = headline ? `Headline: ${headline}\n\nArticle: ${article}` : article;
    
    // Enhanced validation for German content
    if (!fullText || fullText.length < 50) {
      console.log("Content too short for analysis");
      return {
        success: false,
        error: 'Insufficient content for analysis',
        analysis: {
          overall_verdict: 'ERROR',
          confidence_score: 0,
          summary: 'Not enough content to analyze',
          detailed_analysis: 'The article content was too short or empty for proper analysis.'
        }
      };
    }
    
    // Detect if content is German
    const isGerman = /[äöüß]/.test(fullText) || 
                    /\b(der|die|das|und|ist|ein|eine|von|zu|auf|mit|für|sich|nicht|werden|kann|wird|sind|wurde|wurden)\b/i.test(fullText);
    
    console.log(`Detected language: ${isGerman ? 'German' : 'English'}, Content length: ${fullText.length}`);
    
    // Truncate if too long to avoid token limits
    if (fullText.length > CONFIG.MAX_ARTICLE_LENGTH) {
      fullText = fullText.substring(0, CONFIG.MAX_ARTICLE_LENGTH) + '...';
    }
    
    console.log('Starting OpenAI analysis...');
    
// Enhanced prompt with integrated detailed instructions
const prompt = `You are an expert fact-checker, misinformation analyst, and media watchdog.

Respond in ${isGerman ? 'GERMAN' : 'ENGLISH'}.

Analyze this news article comprehensively, paying special attention to the following PRIMARY ANALYSIS AREAS:

1. FACTUAL ACCURACY
   - Verify specific claims, statistics, and statements
   - Check for fabricated or distorted information
   - Identify unsupported assertions

2. BIAS & MANIPULATION DETECTION
   - Inflammatory Language: Detect sensationalist, emotionally charged words
   - Framing Bias: How the story is presented vs. alternative framings
   - Selection Bias: What information is emphasized vs. omitted
   - False Balance: Inappropriate equalizing of unequal viewpoints
   - Dog-whistle Politics: Coded language targeting specific groups

3. HEADLINE ANALYSIS
   - Compare headline accuracy to actual content
   - Identify clickbait, sensationalism, or misleading framing
   - Detect headlines designed to provoke outrage or fear
   - Check if headline misrepresents the story's nuance

4. WRITING STYLE & TONE ASSESSMENT
   - Emotional Manipulation: Use of fear, anger, disgust to influence readers
   - Loaded Language: Words chosen to bias rather than inform
   - Rhetorical Techniques: Repetition, leading questions, false dilemmas
   - Political Messaging: Underlying ideological agenda or party-line messaging

5. SOURCE CREDIBILITY
   - Evaluate quoted sources and their reliability
   - Check for anonymous sources without justification
   - Identify potential conflicts of interest
   - Assess primary vs. secondary source usage

6. CONTEXT & COMPLETENESS
   - Missing crucial context or background information
   - Cherry-picked data or selective reporting
   - False comparisons or misleading statistics
   - Omitted counterarguments or alternative perspectives

7. COMPREHENSION QUIZ GENERATION
   - Create 5 multiple-choice questions to test reader comprehension
   - Focus on key facts, main themes, and important details from the article
   - Questions should test understanding, not just memorization
   - Include 4 options per question (A, B, C, D) with only one correct answer
   - Provide clear explanations for correct answers
   - Make questions relevant to fact-checking and media literacy

SPECIAL FOCUS AREAS:
- Sensationalist Headlines: Flag headlines that exaggerate, misrepresent, or emotionally manipulate
- Fear-Mongering: Identify language designed to create anxiety about specific groups
- False Urgency: Detect artificial crisis framing
- Scapegoating: Recognize blame-shifting onto minorities or outgroups
- Statistical Manipulation: Catch misleading use of numbers and data
- Anecdotal Evidence: Flag when isolated incidents are presented as widespread trends
- False Equivalencies: Identify inappropriate comparisons
- Confirmation Bias: Detect cherry-picked information supporting predetermined conclusions

Pay special attention to articles that seem designed to influence voting behavior or promote specific political agendas through emotional manipulation rather than factual reporting.

ARTICLE:
------
${fullText}
------

IMPORTANT: You MUST use all four verdict categories appropriately:
- ${isGerman ? 'ZUVERLÄSSIG' : 'RELIABLE'}: Factually accurate, well-sourced, minimal bias
- ${isGerman ? 'FRAGWÜRDIG' : 'QUESTIONABLE'}: Some concerns about accuracy or bias  
- ${isGerman ? 'IRREFÜHREND' : 'MISLEADING'}: Significant factual issues or strong bias
- ${isGerman ? 'FALSCH' : 'FALSE'}: Contains false information or severe manipulation

Do not default to middle categories - use the full spectrum based on your analysis.

Return ONLY a valid JSON object in this schema (translate values):

{
  "overall_verdict": "${isGerman ? 'ZUVERLÄSSIG|FRAGWÜRDIG|IRREFÜHREND|FALSCH' : 'RELIABLE|QUESTIONABLE|MISLEADING|FALSE'}", 
  "verdict_explanation": "${isGerman ? 'Kurze Begründung für das gewählte Urteil' : 'Brief explanation for chosen verdict'}",
  "confidence_score": 85,
  "summary": "${isGerman ? 'Sehr kurze Zusammenfassung in 1-2 Sätzen – nur die wichtigsten Punkte' : 'Very brief summary in 1-2 sentences – key points only'}",
  "quick_summary": "${isGerman ? 'Mittellange Zusammenfassung für Übersichts-Tab (3-4 Sätze mit mehr Details)' : 'Medium-length summary for overview tab (3-4 sentences with more details)'}",
  "detailed_analysis": "${isGerman ? 'Ausführliche detaillierte Analyse mit allen Aspekten' : 'Comprehensive detailed analysis covering all aspects'}",
  "recommendations": "${isGerman ? 'Empfehlungen für Leser' : 'Recommendations for readers'}",
  "red_flags": ["${isGerman ? 'Liste von Problemen' : 'List of concerning elements'}"],
  "sources_needed": ["${isGerman ? 'Benötigte Quellen' : 'Needed sources'}"],
  "political_context": "${isGerman ? 'Politische Einordnung' : 'Political context'}",

  "headline_analysis": {
    "accuracy_vs_content": "${isGerman ? 'Bewertung der Überschrift im Vergleich zum Inhalt' : 'Does headline match article content?'}",
    "sensationalism_level": "LOW|MEDIUM|HIGH",
    "inflammatory_language": ["${isGerman ? 'Reizende Begriffe' : 'List specific inflammatory words/phrases'}"],
    "manipulation_tactics": "${isGerman ? 'Manipulationstaktiken' : 'How headline tries to influence readers'}"
  },

  "bias_analysis": {
    "type_of_bias": ["${isGerman ? 'AUSWAHL|DARSTELLUNG|ERKENNTNISTHEORETISCH|PARTEIISCH' : 'SELECTION|FRAMING|EPISTEMOLOGICAL|PARTISAN'}"],
    "bias_direction": "${isGerman ? 'LINKS|RECHTS|NATIONALIST|POPULISTISCH|NEUTRAL' : 'LEFT|RIGHT|NATIONALIST|POPULIST|NEUTRAL'}",
    "manipulation_techniques": ["${isGerman ? 'Techniken' : 'Specific methods used'}"],
    "dog_whistle_elements": ["${isGerman ? 'Hundepfeifen-Elemente' : 'Coded language targeting specific groups'}"]
  },

  "writing_style_assessment": {
    "tone": "NEUTRAL|BIASED|INFLAMMATORY|MANIPULATIVE",
    "emotional_manipulation": ["${isGerman ? 'Emotionale Techniken' : 'Specific emotional manipulation techniques used'}"],
    "loaded_language": ["${isGerman ? 'Voreingenommene Begriffe' : 'Loaded words/phrases identified'}"],
    "political_framing": "${isGerman ? 'Politische Einordnung' : 'How story serves political agenda'}",
    "target_audience": "${isGerman ? 'Zielgruppe' : 'Who this article seems designed to influence'}"
  },

  "factual_accuracy": {
    "verifiable_claims": "${isGerman ? 'Anzahl überprüfbarer Aussagen' : 'Number of checkable facts'}",
    "unsupported_claims": "${isGerman ? 'Anzahl unbelegter Aussagen' : 'Number of unverified assertions'}",
    "misleading_statistics": ["${isGerman ? 'Problematische Statistiken' : 'Problematic data usage'}"],
    "missing_context": ["${isGerman ? 'Fehlende Informationen' : 'Crucial omitted information'}"]
  },

  "key_claims": [
    {
      "claim": "${isGerman ? 'Spezifische Aussage' : 'The specific claim made'}",
      "verdict": "${isGerman ? 'WAHR|FALSCH|UNBESTÄTIGT|IRREFÜHREND' : 'TRUE|FALSE|UNVERIFIED|MISLEADING'}",
      "explanation": "${isGerman ? 'Erklärung' : 'Why this claim is problematic/accurate'}",
      "context_missing": "${isGerman ? 'Fehlende Informationen' : 'What crucial context is omitted'}"
    }
  ],
  "comprehension_quiz": {
    "description": "${isGerman ? 'Quiz zum Textverständnis - 5 Fragen zu den wichtigsten Inhalten des Artikels' : 'Comprehension quiz - 5 questions about key content from the article'}",
    "instructions": "${isGerman ? 'Wählen Sie die beste Antwort für jede Frage. Die Fragen testen Ihr Verständnis der wichtigsten Fakten und Themen.' : 'Choose the best answer for each question. Questions test your understanding of key facts and themes.'}",
    "questions": [
      {
        "id": 1,
        "question": "${isGerman ? 'Frage basierend auf Hauptthema/Hauptfakt des Artikels' : 'Question based on main theme/key fact from article'}",
        "type": "${isGerman ? 'Faktenwissen|Verständnis|Analyse|Anwendung' : 'factual|comprehension|analysis|application'}",
        "options": {
          "A": "${isGerman ? 'Erste Antwortoption' : 'First answer option'}",
          "B": "${isGerman ? 'Zweite Antwortoption' : 'Second answer option'}",
          "C": "${isGerman ? 'Dritte Antwortoption' : 'Third answer option'}",
          "D": "${isGerman ? 'Vierte Antwortoption' : 'Fourth answer option'}"
        },
        "correct_answer": "A|B|C|D",
        "explanation": "${isGerman ? 'Erklärung warum diese Antwort richtig ist und warum die anderen falsch sind' : 'Explanation of why this answer is correct and others are wrong'}",
        "article_reference": "${isGerman ? 'Verweis auf relevanten Textabschnitt' : 'Reference to relevant article section'}"
      },
      {
        "id": 2,
        "question": "${isGerman ? 'Zweite Frage zu wichtigen Details oder Zusammenhängen' : 'Second question about important details or connections'}",
        "type": "${isGerman ? 'Faktenwissen|Verständnis|Analyse|Anwendung' : 'factual|comprehension|analysis|application'}",
        "options": {
          "A": "${isGerman ? 'Erste Antwortoption' : 'First answer option'}",
          "B": "${isGerman ? 'Zweite Antwortoption' : 'Second answer option'}",
          "C": "${isGerman ? 'Dritte Antwortoption' : 'Third answer option'}",
          "D": "${isGerman ? 'Vierte Antwortoption' : 'Fourth answer option'}"
        },
        "correct_answer": "A|B|C|D",
        "explanation": "${isGerman ? 'Erklärung der richtigen Antwort' : 'Explanation of correct answer'}",
        "article_reference": "${isGerman ? 'Verweis auf relevanten Textabschnitt' : 'Reference to relevant article section'}"
      },
      {
        "id": 3,
        "question": "${isGerman ? 'Dritte Frage zu Quellen, Zahlen oder wichtigen Aussagen' : 'Third question about sources, numbers, or important statements'}",
        "type": "${isGerman ? 'Faktenwissen|Verständnis|Analyse|Anwendung' : 'factual|comprehension|analysis|application'}",
        "options": {
          "A": "${isGerman ? 'Erste Antwortoption' : 'First answer option'}",
          "B": "${isGerman ? 'Zweite Antwortoption' : 'Second answer option'}",
          "C": "${isGerman ? 'Dritte Antwortoption' : 'Third answer option'}",
          "D": "${isGerman ? 'Vierte Antwortoption' : 'Fourth answer option'}"
        },
        "correct_answer": "A|B|C|D",
        "explanation": "${isGerman ? 'Erklärung der richtigen Antwort' : 'Explanation of correct answer'}",
        "article_reference": "${isGerman ? 'Verweis auf relevanten Textabschnitt' : 'Reference to relevant article section'}"
      },
      {
        "id": 4,
        "question": "${isGerman ? 'Vierte Frage zu Kontext oder Hintergrundinformationen' : 'Fourth question about context or background information'}",
        "type": "${isGerman ? 'Faktenwissen|Verständnis|Analyse|Anwendung' : 'factual|comprehension|analysis|application'}",
        "options": {
          "A": "${isGerman ? 'Erste Antwortoption' : 'First answer option'}",
          "B": "${isGerman ? 'Zweite Antwortoption' : 'Second answer option'}",
          "C": "${isGerman ? 'Dritte Antwortoption' : 'Third answer option'}",
          "D": "${isGerman ? 'Vierte Antwortoption' : 'Fourth answer option'}"
        },
        "correct_answer": "A|B|C|D",
        "explanation": "${isGerman ? 'Erklärung der richtigen Antwort' : 'Explanation of correct answer'}",
        "article_reference": "${isGerman ? 'Verweis auf relevanten Textabschnitt' : 'Reference to relevant article section'}"
      },
      {
        "id": 5,
        "question": "${isGerman ? 'Fünfte Frage zu Schlussfolgerungen oder kritischem Denken' : 'Fifth question about conclusions or critical thinking'}",
        "type": "${isGerman ? 'Faktenwissen|Verständnis|Analyse|Anwendung' : 'factual|comprehension|analysis|application'}",
        "options": {
          "A": "${isGerman ? 'Erste Antwortoption' : 'First answer option'}",
          "B": "${isGerman ? 'Zweite Antwortoption' : 'Second answer option'}",
          "C": "${isGerman ? 'Dritte Antwortoption' : 'Third answer option'}",
          "D": "${isGerman ? 'Vierte Antwortoption' : 'Fourth answer option'}"
        },
        "correct_answer": "A|B|C|D",
        "explanation": "${isGerman ? 'Erklärung der richtigen Antwort' : 'Explanation of correct answer'}",
        "article_reference": "${isGerman ? 'Verweis auf relevanten Textabschnitt' : 'Reference to relevant article section'}"
      }
    ]
  }
}`;


    // Prepare the request body
    const requestBody = {
      model: CONFIG.MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an expert fact-checker. Always respond with valid JSON only. ${isGerman ? 'Analyze in German and respond in German.' : 'Analyze in English and respond in English.'} Be objective and evidence-based.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      response_format: { type: 'json_object' }
    };

    console.log('Making request to OpenAI API...');

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timeout after 60 seconds'));
      }, 60000);
    });

    // Make the actual API request
    const fetchPromise = fetch(CONFIG.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    // Race between the fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    console.log('Received response from OpenAI API');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Successfully parsed OpenAI response');
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response structure from OpenAI API');
    }

    // Enhanced JSON parsing with better error handling
    const analysisText = data.choices[0].message.content.trim();
    console.log('Raw analysis text:', analysisText.substring(0, 200) + '...');
    
    let analysisResult;
    
    try {
      // Clean the response text before parsing
      let cleanedText = analysisText;
      
      // Remove markdown formatting if present
      cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Find JSON object in the response
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      // Try to parse as JSON
      analysisResult = JSON.parse(cleanedText);
      console.log('Successfully parsed analysis JSON');
      
      // Validate required fields and provide fallbacks
      if (!analysisResult.overall_verdict || 
          !['ZUVERLÄSSIG', 'FRAGWÜRDIG', 'IRREFÜHREND', 'FALSCH', 'RELIABLE', 'QUESTIONABLE', 'MISLEADING', 'FALSE'].includes(analysisResult.overall_verdict)) {
          analysisResult.overall_verdict = isGerman ? 'FRAGWÜRDIG' : 'QUESTIONABLE';
        }
      
      // Ensure all required sub-objects exist
      if (!analysisResult.headline_analysis) {
        analysisResult.headline_analysis = {
          accuracy_vs_content: isGerman ? 'Überschrift entspricht dem Inhalt' : 'Headline matches content',
          sensationalism_level: 'MEDIUM',
          inflammatory_language: [],
          manipulation_tactics: isGerman ? 'Keine offensichtlichen Manipulationstaktiken erkannt' : 'No obvious manipulation tactics detected'
        };
      }
      
      if (!analysisResult.bias_analysis) {
        analysisResult.bias_analysis = {
          type_of_bias: ['NEUTRAL'],
          bias_direction: isGerman ? 'NEUTRAL' : 'NEUTRAL',
          manipulation_techniques: [],
          dog_whistle_elements: []
        };
      }
      
      if (!analysisResult.key_claims || analysisResult.key_claims.length === 0) {
        analysisResult.key_claims = [{
          claim: isGerman ? 'Hauptaussage des Artikels' : 'Main claim of the article',
          verdict: isGerman ? 'UNBESTÄTIGT' : 'UNVERIFIED',
          explanation: isGerman ? 'Weitere Überprüfung erforderlich' : 'Further verification needed',
          context_missing: isGerman ? 'Zusätzliche Quellen benötigt' : 'Additional sources needed'
        }];
      }
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      console.log('Failed text:', analysisText);
      
      // Create a structured fallback response
      analysisResult = {
  overall_verdict: isGerman ? 'IRREFÜHREND' : 'MISLEADING',
  confidence_score: 30, // Low confidence for parsing errors
  summary: isGerman ? 
    'Die Analyse wurde abgeschlossen, aber die Antwort konnte nicht vollständig verarbeitet werden.' :
    'Analysis completed but response could not be fully processed.',
  detailed_analysis: isGerman ?
    'Der Artikel wurde analysiert, aber die KI-Antwort war nicht im erwarteten Format. Eine manuelle Überprüfung wird empfohlen.' :
    'The article was analyzed but the AI response was not in the expected format. Manual verification is recommended.',
  recommendations: isGerman ?
    'Überprüfen Sie zusätzliche Quellen und seien Sie vorsichtig bei der Interpretation.' :
    'Verify with additional sources and be cautious in interpretation.',
  red_flags: [isGerman ? 'Antwortformat-Problem' : 'Response format issue'],
  sources_needed: [isGerman ? 'Zusätzliche Verifikationsquellen' : 'Additional verification sources'],
  political_context: isGerman ?
    'Keine eindeutige politische Ausrichtung erkannt.' :
    'No clear political orientation detected.',
  verdict_explanation: isGerman ? 'Technisches Problem bei der Analyse' : 'Technical issue during analysis',
  headline_analysis: {
    accuracy_vs_content: isGerman ? 'Nicht vollständig analysiert' : 'Not fully analyzed',
    sensationalism_level: 'MEDIUM',
    inflammatory_language: [],
    manipulation_tactics: isGerman ? 'Nicht bestimmt' : 'Not determined'
  },
  bias_analysis: {
    type_of_bias: ['UNBESTIMMT'],
    bias_direction: isGerman ? 'UNBESTIMMT' : 'UNDETERMINED',
    manipulation_techniques: [],
    dog_whistle_elements: []
  },
  writing_style_assessment: {
    tone: 'NEUTRAL',
    emotional_manipulation: [],
    loaded_language: [],
    political_framing: isGerman ? 'Nicht eindeutig bestimmt' : 'Not clearly determined',
    target_audience: isGerman ? 'Allgemeine Öffentlichkeit' : 'General public'
  },
  factual_accuracy: {
    verifiable_claims: isGerman ? 'Nicht bestimmt' : 'Not determined',
    unsupported_claims: isGerman ? 'Nicht bestimmt' : 'Not determined',
    misleading_statistics: [],
    missing_context: []
  },
  key_claims: [{
    claim: isGerman ? 'Analyse unvollständig' : 'Analysis incomplete',
    verdict: isGerman ? 'UNBESTÄTIGT' : 'UNVERIFIED',
    explanation: isGerman ? 'Technisches Problem bei der Analyse' : 'Technical issue during analysis',
    context_missing: isGerman ? 'Vollständige Neuanalyse erforderlich' : 'Complete re-analysis needed'
  }]
};
    }

    return {
      success: true,
      analysis: analysisResult,
      tokens_used: data.usage ? data.usage.total_tokens : 0
    };

  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error("Detailed error analyzing with OpenAI:", error);
    
    // Enhanced error handling with German language support
    let errorMessage = 'Unknown error occurred';
    
    if (error.message.includes('timeout')) {
      errorMessage = 'Analysis timed out. Please try again.';
    } else if (error.message.includes('API key') || error.message.includes('401')) {
      errorMessage = 'API authentication failed. Please check your OpenAI API key.';
    } else if (error.message.includes('429')) {
      errorMessage = 'API rate limit exceeded. Please wait a moment and try again.';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection and try again.';
    } else {
      errorMessage = `Analysis failed: ${error.message}`;
    }
    
    return {
      success: false,
      error: errorMessage,
      analysis: {
        overall_verdict: 'ERROR',
        confidence_score: 0,
        summary: 'Analysis failed due to technical error.',
        detailed_analysis: `Error: ${errorMessage}`,
        key_claims: [],
        red_flags: ['Technical error during analysis'],
        recommendations: 'Please try again or verify manually.',
        sources_needed: []
      }
    };
  }
}

// Enhanced function to get article summary for quick analysis with INCREASED timeout
async function getQuickSummary(articleContent) {
  let timeoutId;
  
  try {
    const { headline, article } = articleContent;
    let fullText = headline ? `${headline}\n\n${article}` : article;
    
    // Truncate for quick analysis
    if (fullText.length > 2000) {
      fullText = fullText.substring(0, 2000) + '...';
    }

    const prompt = `Briefly analyze this German or English news article for potential misinformation and bias. Respond with just the verdict (ZUVERLÄSSIG/RELIABLE, FRAGWÜRDIG/QUESTIONABLE, IRREFÜHREND/MISLEADING, or FALSCH/FALSE) followed by a one-sentence explanation in the same language as the article.

Article: ${fullText}`;

    console.log('Making quick summary request...');

    // INCREASED: Quick summary timeout from 15s to 30s
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Quick summary timeout after 30 seconds'));
      }, 30000);
    });

    // Make the actual API request
    const fetchPromise = fetch(CONFIG.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEYS.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano', // Use cheaper model for quick summary
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200, // Quick summary is only a verdict + one sentence
        temperature: 0.2
      })
    });

    // Race between the fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (!response.ok) {
      throw new Error(`Quick summary API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Quick summary completed successfully');
    return data.choices[0].message.content;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error("Error getting quick summary:", error);
    
    if (error.message.includes('timeout')) {
      return "FRAGWÜRDIG - Quick analysis timed out.";
    }
    return "FRAGWÜRDIG - Unable to analyze due to technical error.";
  }
}

// MODIFIED: Enhanced message listener to call both APIs
// Tab Capture handler for reliable audio extraction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script received message:", message.type);
  
  if (message.type === 'OFFSCREEN_RECORDING_COMPLETE') {
    console.log("=== OFFSCREEN RECORDING COMPLETE ===");
    console.log("Recording success:", message.success, "for tab:", message.tabId);

    sendResponse({ received: true });

    handleOffscreenRecordingComplete(message).catch(error => {
      console.error("Error processing offscreen recording:", error);
    });

    return false;

  } else if (message.type === 'START_TAB_CAPTURE') {
    console.log("=== TAB CAPTURE REQUEST RECEIVED ===");
    console.log("🎵 Starting Tab Capture for audio extraction...");
    console.log("Request from tab:", sender.tab?.id);
    console.log("Video data:", message.videoData);
    console.log("====================================");

    startTabCapture(message.videoData, sender.tab.id)
      .then(() => {
        console.log("✅ Tab Capture recording initiated");
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error("❌ Tab Capture failed:", error.message);
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true; // Keep message channel open for async response

  } else if (message.type === 'VIDEO_CONTENT') {
    console.log("Received video content from tab:", sender.tab.id);
    console.log('Video platform:', message.data.platform);
    console.log('Video metadata:', message.data.metadata);
    console.log('Audio data size:', message.data.audioData ? message.data.audioData.byteLength : 'No audio');
    console.log('Audio type:', message.data.audioType);
    console.log('Video duration:', message.data.duration, 'seconds');
    console.log('===============================');
    
    // IMPORTANT: Send immediate response to prevent timeout
    sendResponse({ received: true, timestamp: Date.now(), type: 'video' });
    
    // Process the video content
    const processVideo = async () => {
      try {
        console.log('🎬 Starting video content processing...');
        
        // Check if tab still exists before starting intensive work
        try {
          await chrome.tabs.get(sender.tab.id);
        } catch (error) {
          console.log("Tab no longer exists, canceling video analysis");
          return;
        }

        // Send progress update
        await safelySendMessageToTab(sender.tab.id, {
          type: 'FACTCHECK_UPDATE',
          message: '🎵 Transcribing audio with OpenAI Whisper...'
        });

        // Recreate blob from ArrayBuffer for audio processing
        const audioBlob = new Blob([message.data.audioData], { type: message.data.audioType });
        
        // Prepare video data with recreated blob
        const videoData = {
          ...message.data,
          audioBlob: audioBlob
        };
        
        // Analyze video content (transcribe + analyze)
        const result = await analyzeVideoContent(videoData);
        
        console.log('🎯 Video analysis completed:', result.success);

        // Send the result back to the content script
        await safelySendMessageToTab(sender.tab.id, {
          type: 'FACTCHECK_RESULT',
          result: result
        });

      } catch (error) {
        console.error('Video processing failed:', error);
        
        await safelySendMessageToTab(sender.tab.id, {
          type: 'FACTCHECK_RESULT', 
          result: {
            success: false,
            type: 'video',
            platform: message.data.platform || 'unknown',
            error: error.message,
            analysis: {
              overall_verdict: 'ERROR',
              summary: 'Video analysis failed - could not process content',
              detailed_analysis: `Video analysis failed: ${error.message}`
            },
            hash: message.data.hash
          }
        });
      }
    };
    
    // Start processing asynchronously
    processVideo();
    
  } else if (message.type === 'ARTICLE_TEXT') {
    console.log("Received article data from tab:", sender.tab.id);
    // ADD THESE DEBUG LINES RIGHT HERE:
    console.log('Article headline:', message.data.headline);
    console.log('Article text length:', message.data.article ? message.data.article.length : 'NO ARTICLE');
    console.log('Article text preview:', message.data.article ? message.data.article.substring(0, 200) + '...' : 'NO ARTICLE');
    console.log('Message data keys:', Object.keys(message.data));
    console.log('Full message.data:', message.data);
    console.log('===============================');
    
    
    // IMPORTANT: Send immediate response to prevent timeout
    sendResponse({ received: true, timestamp: Date.now() });
    
    // MODIFIED: Process the article text with both APIs
    const processArticle = async () => {
      const { headline, article, hash } = message.data;
      
      try {
        // Quick validation
        if (!headline && (!article || article.length < 50)) {
          console.log("Insufficient content provided");
          await safelySendMessageToTab(sender.tab.id, {
            type: 'FACTCHECK_RESULT',
            result: {
              success: false,
              headline: null,
              error: 'Insufficient article content found',
              analysis: {
                overall_verdict: 'ERROR',
                summary: 'No content to analyze',
                detailed_analysis: 'Not enough article content was provided for analysis.'
              },
              hash: hash
            }
          });
          return;
        }
        
        // Check if tab still exists before starting intensive work
        try {
          await chrome.tabs.get(sender.tab.id);
        } catch (error) {
          console.log("Tab no longer exists, canceling analysis");
          return;
        }
        
        if (headline || article) {
          console.log("Starting dual analysis process...");
          
          // Send initial status update
          const statusSent = await safelySendMessageToTab(sender.tab.id, {
            type: 'FACTCHECK_UPDATE',
            status: 'analyzing',
            message: 'Analyzing with OpenAI and ClaimBuster...'
          });
          
          if (!statusSent) {
            console.log("Tab became unavailable, canceling analysis");
            return;
          }

          // Get quick initial assessment with INCREASED timeout
          console.log("Getting quick summary...");
          try {
            // INCREASED: Quick summary timeout from 15s to 30s
            const quickSummary = await Promise.race([
              getQuickSummary({ headline, article }),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Quick summary timeout")), 30000))
            ]);
            
            console.log("Quick summary result:", quickSummary);
            
            // Send quick update
            await safelySendMessageToTab(sender.tab.id, {
              type: 'FACTCHECK_UPDATE',
              status: 'analyzing',
              message: 'Getting detailed analysis...',
              quickSummary: quickSummary
            });
          } catch (quickError) {
            console.log("Quick summary failed:", quickError.message);
            // Continue with detailed analysis even if quick summary fails
          }

          // MODIFIED: Get detailed analysis from BOTH APIs simultaneously
          console.log("Starting dual API analysis...");
          try {
            // Call both APIs in parallel
            const [openaiResult, claimbusterResult] = await Promise.allSettled([
              Promise.race([
                analyzeWithOpenAI({ headline, article }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("OpenAI analysis timeout")), 60000))
              ]),
              Promise.race([
                analyzeWithClaimBuster({ headline, article }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("ClaimBuster analysis timeout")), 30000))
              ])
            ]);
            
            console.log("Dual analysis completed");
            console.log("OpenAI result:", openaiResult.status);
            console.log("ClaimBuster result:", claimbusterResult.status);
            
            // Process OpenAI result
            let openaiAnalysis = null;
            let openaiError = null;
            
            if (openaiResult.status === 'fulfilled' && openaiResult.value.success) {
              openaiAnalysis = openaiResult.value.analysis;
            } else {
              openaiError = openaiResult.status === 'fulfilled' ? 
                openaiResult.value.error : 
                openaiResult.reason?.message || 'OpenAI analysis failed';
              console.log("OpenAI analysis failed:", openaiError);
            }
            
            // Process ClaimBuster result
            let claimbusterAnalysis = null;
            let claimbusterError = null;
            
            if (claimbusterResult.status === 'fulfilled' && claimbusterResult.value.success) {
              claimbusterAnalysis = claimbusterResult.value.analysis;
            } else {
              claimbusterError = claimbusterResult.status === 'fulfilled' ? 
                claimbusterResult.value.error : 
                claimbusterResult.reason?.message || 'ClaimBuster analysis failed';
              console.log("ClaimBuster analysis failed:", claimbusterError);
            }
            
            // MODIFIED: Send results back with both analyses
            const combinedResult = {
              success: openaiAnalysis || claimbusterAnalysis ? true : false,
              headline: headline,
              openai: openaiAnalysis ? {
                success: true,
                analysis: openaiAnalysis,
                tokens_used: openaiResult.value?.tokens_used || 0
              } : {
                success: false,
                error: openaiError
              },
              claimbuster: claimbusterAnalysis ? {
                success: true,
                analysis: claimbusterAnalysis
              } : {
                success: false,
                error: claimbusterError
              },
              // Keep backward compatibility - use OpenAI as primary analysis
              analysis: openaiAnalysis || {
                overall_verdict: 'ERROR',
                summary: 'Both analyses failed',
                detailed_analysis: `OpenAI: ${openaiError || 'Failed'}, ClaimBuster: ${claimbusterError || 'Failed'}`
              },
              error: openaiAnalysis ? null : (openaiError || 'Analysis failed'),
              hash: hash
            };
            
            console.log("Combined analysis result prepared");
            
            const resultSent = await safelySendMessageToTab(sender.tab.id, {
              type: 'FACTCHECK_RESULT',
              result: combinedResult
            });

            if (!resultSent) {
              console.log("Could not deliver analysis results - tab may have been closed");
            } else {
              console.log("Dual analysis results delivered successfully");
            }
          } catch (analysisError) {
            console.error("Dual analysis failed:", analysisError.message);
            
            // Send error result
            await safelySendMessageToTab(sender.tab.id, {
              type: 'FACTCHECK_RESULT',
              result: {
                success: false,
                headline: headline,
                error: `Analysis failed: ${analysisError.message}`,
                analysis: {
                  overall_verdict: 'ERROR',
                  summary: 'Analysis failed',
                  detailed_analysis: `The analysis could not be completed: ${analysisError.message}`
                },
                hash: hash
              }
            });
          }

        } else {
          await safelySendMessageToTab(sender.tab.id, {
            type: 'FACTCHECK_RESULT',
            result: {
              success: false,
              headline: null,
              error: 'No article content found',
              analysis: {
                overall_verdict: 'ERROR',
                summary: 'No content to analyze',
                detailed_analysis: 'No article content was detected on this page.'
              },
              hash: hash
            }
          });
        }
      } catch (error) {
        console.error("Error during analysis processing:", error);
        
        // Try to send error message
        await safelySendMessageToTab(sender.tab.id, {
          type: 'FACTCHECK_RESULT',
          result: {
            success: false,
            headline: headline || null,
            error: `Processing error: ${error.message}`,
            analysis: {
              overall_verdict: 'ERROR',
              summary: 'Processing failed',
              detailed_analysis: `An error occurred while processing the article: ${error.message}`
            },
            hash: hash
          }
        });
      }
    };
    
    // Start processing without awaiting to prevent blocking
    processArticle().catch(error => {
      console.error("Unhandled error in processArticle:", error);
    });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  // For other message types, handle synchronously
  return false;
});

// Enhanced function to safely send message to tab with better error handling
async function safelySendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      // First check if tab exists
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.log(`Tab ${tabId} does not exist:`, chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        // Check if tab is still loading or has a valid URL
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          console.log(`Tab ${tabId} has invalid URL or is a system page:`, tab.url);
          resolve(false);
          return;
        }
        
        // Tab exists and is valid, try to send message
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.log(`Failed to send message to tab ${tabId}:`, chrome.runtime.lastError.message);
            resolve(false);
          } else {
            console.log(`Message sent successfully to tab ${tabId}`);
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.log(`Exception sending message to tab ${tabId}:`, error.message);
      resolve(false);
    }
  });
}

// Fallback function to analyze video metadata when audio transcription fails
async function analyzeVideoMetadataOnly(videoData) {
  console.log('📋 Performing metadata-only video analysis...');
  
  try {
    const analysisContent = {
      title: videoData.metadata.title || 'No title available',
      platform: videoData.platform,
      duration: videoData.duration,
      url: videoData.metadata.url || 'No URL available',
      username: videoData.metadata.username || 'Unknown user',
      description: videoData.metadata.description || 'No description available'
    };
    
    // Create GPT analysis focusing on metadata
    const metadataPrompt = `Analyze this ${videoData.platform} video based on its metadata:
    
Title: "${analysisContent.title}"
Platform: ${analysisContent.platform}
Duration: ${analysisContent.duration} seconds
Username: ${analysisContent.username}
Description: ${analysisContent.description}

Please provide a fact-checking analysis based on the title and metadata. Note that audio transcription was not available.

Provide your analysis in this exact JSON format:
{
  "overall_verdict": "RELIABLE|QUESTIONABLE|MISLEADING|FALSE",
  "confidence_score": 65,
  "summary": "Brief summary of the analysis",
  "detailed_analysis": "Detailed analysis based on title and metadata",
  "recommendations": "Recommendations for further verification",
  "red_flags": ["list", "of", "potential", "issues"],
  "key_claims": [
    {
      "claim": "Main claim from title",
      "verdict": "UNVERIFIED",
      "explanation": "Cannot verify without audio content"
    }
  ],
  "multimedia_analysis": {
    "platform": "${videoData.platform}",
    "content_summary": "Analysis based on title and metadata only",
    "audio_analysis": "Audio transcription unavailable - content may be protected or encrypted"
  }
}`;

    const gptAnalysis = await analyzeVideoWithGPT({ 
      transcript: metadataPrompt, 
      metadata: analysisContent, 
      platform: videoData.platform, 
      duration: videoData.duration 
    });
    
    if (gptAnalysis.success) {
      return {
        success: true,
        type: 'video',
        platform: videoData.platform,
        metadata: videoData.metadata,
        transcription: { 
          success: false, 
          error: 'Audio transcription unavailable',
          text: 'Audio content could not be transcribed - possibly protected content'
        },
        analysis: {
          ...gptAnalysis.analysis,
          transcript_available: false,
          analysis_limitation: 'Analysis based on metadata only - audio content unavailable'
        },
        hash: videoData.hash
      };
    } else {
      throw new Error('GPT analysis failed: ' + gptAnalysis.error);
    }
    
  } catch (error) {
    console.error('Metadata-only analysis failed:', error);
    return {
      success: false,
      type: 'video',
      platform: videoData.platform || 'unknown',
      error: 'Both audio transcription and metadata analysis failed: ' + error.message,
      hash: videoData.hash,
      analysis: {
        overall_verdict: 'ERROR',
        confidence_score: 0,
        summary: 'Analysis failed due to technical limitations',
        detailed_analysis: 'Unable to analyze video content - both audio transcription and metadata analysis failed.',
        recommendations: 'Please try refreshing the page or analyzing the content manually.'
      }
    };
  }
}

// Handle clicks on the extension icon in the toolbar
chrome.action.onClicked.addListener((tab) => {
  const isNewsWebsite = CONFIG.SUPPORTED_DOMAINS.some(domain => tab.url.includes(domain));
  
  if (isNewsWebsite) {
    chrome.tabs.sendMessage(tab.id, { 
      type: 'TOGGLE_PANEL'
    }).catch(error => {
      console.error("Error sending toggle message:", error);
    });
  } else {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_SITE_NOTIFICATION',
      supportedDomains: CONFIG.SUPPORTED_DOMAINS
    }).catch(error => {
      console.error("Error showing notification:", error);
    });
  }
});