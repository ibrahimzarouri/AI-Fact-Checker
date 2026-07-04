# AI Fact Checker

A Chrome extension that fact-checks news articles and video content in real time. It combines **OpenAI GPT-4.1-nano** for in-depth misinformation and bias analysis, **OpenAI Whisper** for video/audio transcription, and the **ClaimBuster** academic API for sentence-level claim detection.

Developed as a master's project by [Ibrahim Zarouri](https://github.com/ibrahimzarouri).

## Features

- **Automatic article analysis** — detects articles on supported news sites and analyzes them for factual accuracy, bias, manipulation techniques, headline sensationalism, and missing context
- **Four-level verdict system** — RELIABLE / QUESTIONABLE / MISLEADING / FALSE (ZUVERLÄSSIG / FRAGWÜRDIG / IRREFÜHREND / FALSCH), with a confidence score
- **Dual analysis** — GPT-based deep analysis runs in parallel with ClaimBuster claim detection; ClaimBuster results can be toggled in the results panel
- **Video fact-checking** — captures audio from YouTube and TikTok videos, transcribes it with Whisper, and analyzes the transcript with platform-specific prompts (including timestamped "key moments")
- **German and English support** — language is auto-detected and the analysis is returned in the article's language
- **Confidence calibration ("Ground Truth Insight")** — shows how accurate the AI actually was at a given confidence level, based on a test set of 13 manually verified articles (`ground_truth/`)
- **Result caching** — analyses are cached locally (7 days) to avoid repeated API calls for the same article

## Supported sites

- **German news:** bild.de, spiegel.de, welt.de, faz.net, sueddeutsche.de, zeit.de, nius.de, n-tv.de, compact-online.de
- **International news:** bbc.com/bbc.co.uk, cnn.com, theguardian.com, nytimes.com, washingtonpost.com, reuters.com, aljazeera.com, foxnews.com, nbcnews.com
- **Video platforms:** youtube.com, tiktok.com

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ibrahimzarouri/AI-Fact-Checker.git
   ```

2. **Configure your API keys**

   Copy `config.template.js` to `config.js` and fill in your keys:

   ```javascript
   const API_KEYS = {
     OPENAI_API_KEY: 'sk-proj-...',      // https://platform.openai.com/api-keys
     CLAIMBUSTER_API_KEY: '...'          // https://idir.uta.edu/claimbuster/api/
   };
   ```

   > `config.js` is listed in `.gitignore` — never commit real API keys.

3. **Load the extension in Chrome**

   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the project folder

## Usage

- Visit an article on a supported news site — analysis starts automatically and the floating **"AI Fact Check"** button shows the status (✅ Checked / ⚠️ Review Results / ❌ Issues Found)
- Click the floating button (or the extension icon in the toolbar) to open the results panel with the verdict, summary, red flags, recommendations, and confidence calibration
- Toggle the **ClaimBuster** switch in the panel to see individual check-worthy claims ranked by priority
- On YouTube/TikTok, the extension records the tab audio, transcribes it, and fact-checks the spoken content — click the toolbar icon first so Chrome allows tab capture

## Project structure

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `background.js` | Service worker: OpenAI/ClaimBuster/Whisper API orchestration |
| `content.js` | Article/video extraction, results panel UI, caching |
| `offscreen.html` / `offscreen.js` | Offscreen document that records tab audio (MV3 service workers cannot use MediaRecorder) |
| `styles.css` | Results panel styling |
| `config.template.js` | Template for the API key file (`config.js`, not committed) |
| `ground_truth/` | 13 verified test articles and real evaluation results used for confidence calibration |
| `run_evaluation.html` | Standalone tool to re-run the ground-truth evaluation |
| `DEVELOPER_GUIDE.md` | Full technical documentation |

## How it works

1. `content.js` extracts the article headline and body (site-specific selectors with generic fallbacks) or, for videos, captures tab audio via `chrome.tabCapture.getMediaStreamId` + an offscreen document
2. `background.js` sends the content to **GPT-4.1-nano** (structured JSON analysis) and **ClaimBuster** (per-sentence claim scores) in parallel; video audio goes through **Whisper** first
3. Results are combined, cached, and rendered in the on-page panel, together with confidence calibration derived from the ground-truth test set

## Disclaimer

This is a research/educational project. AI-generated verdicts can be wrong — always verify important claims with primary sources. Using the extension consumes OpenAI API credits from your own account.

## Author

**Ibrahim Zarouri**
GitHub: [github.com/ibrahimzarouri](https://github.com/ibrahimzarouri)
Contact: ibrahim.zarouri@studmail.w-hs.de
