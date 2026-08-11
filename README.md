<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/92988b2b-8eee-4492-8370-d3617f05f4e6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploying to Cloud Run (Hosted Mode)

This repository supports dual-mode execution:
- **Local Mode (Electron)**: Run offline locally using safeStorage keyring and filesystem settings.
- **Hosted Mode (Cloud Run)**: Deployed to Google Cloud Run as a multi-tenant application.

### Auto-Transformation for Hosted Mode
When importing this repository into Google AI Studio's Build mode (`ai.studio/build` -> **+** -> **Import from GitHub**), the auto-transformation will detect the `start` script `"node dist/server.cjs"`. 

To configure the Cloud Run runtime properly, ensure the following environment variables are set in the Cloud Run deployment settings:
- `KANKALI_MODE`: `cloud`
- `KANKALI_ENCRYPTION_KEY`: A cryptographically secure 256-bit key (derived from a secret string injected from Google Secret Manager).
- Google Application Default Credentials (ADC) to authorize access to the Firestore instance.
