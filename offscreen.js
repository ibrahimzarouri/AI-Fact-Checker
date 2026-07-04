// Offscreen document for tab audio recording.
// Manifest V3 service workers cannot call chrome.tabCapture.capture() and have
// no MediaRecorder, so the background script hands us a media stream ID
// (from chrome.tabCapture.getMediaStreamId) and we do the recording here.
console.log("AI Fact Checker: Offscreen audio recorder loaded");

let isRecording = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen' || message.type !== 'OFFSCREEN_RECORD_TAB') {
    return false;
  }

  if (isRecording) {
    sendResponse({ started: false, error: 'A recording is already in progress' });
    return false;
  }

  startRecording(message)
    .then(() => sendResponse({ started: true }))
    .catch(error => {
      isRecording = false;
      sendResponse({ started: false, error: error.message });
    });

  return true; // Keep message channel open for async response
});

async function startRecording({ streamId, maxDurationMs, videoData, tabId }) {
  isRecording = true;
  console.log(`🎙️ Starting tab audio recording for ${maxDurationMs / 1000}s...`);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceStreamId: streamId
      }
    }
  });

  // Capturing a tab mutes its audio for the user; route the stream back to the
  // speakers so playback continues normally during recording.
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);

  const mimeType = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ].find(type => MediaRecorder.isTypeSupported(type)) || '';

  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const cleanup = () => {
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    isRecording = false;
  };

  recorder.onstop = async () => {
    console.log(`🔴 Recording stopped, ${chunks.length} chunks collected`);
    cleanup();

    try {
      if (chunks.length === 0) {
        throw new Error('No audio data captured');
      }

      const finalType = recorder.mimeType || mimeType || 'audio/webm';
      const audioBlob = new Blob(chunks, { type: finalType });
      const audioBase64 = await blobToBase64(audioBlob);

      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_RECORDING_COMPLETE',
        success: true,
        audioBase64: audioBase64,
        mimeType: finalType,
        videoData: videoData,
        tabId: tabId
      });
    } catch (error) {
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_RECORDING_COMPLETE',
        success: false,
        error: error.message,
        videoData: videoData,
        tabId: tabId
      });
    }
  };

  recorder.onerror = (event) => {
    console.error("MediaRecorder error:", event);
    cleanup();
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_RECORDING_COMPLETE',
      success: false,
      error: `MediaRecorder error: ${event.error || 'unknown'}`,
      videoData: videoData,
      tabId: tabId
    });
  };

  recorder.start(1000); // Collect data every second

  setTimeout(() => {
    if (recorder.state === 'recording') {
      console.log("⏰ Recording duration reached, stopping...");
      recorder.stop();
    }
  }, maxDurationMs);
}

// Encode the blob as plain base64 (without a data: URL prefix) so the service
// worker can rebuild it with atob - ArrayBuffers do not survive sendMessage.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}
