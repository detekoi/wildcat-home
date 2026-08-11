# Wildcat.chat Platform Homepage

This repository contains the landing page for [wildcat.chat](https://wildcat.chat). The page presents the Wildcat tools: Wildcat Sage, WildcatTTS, and Chat Overlay. Firebase Hosting serves the static output built by Eleventy.

## Features

- Canvas element with an animated TV-static background.
- 3D skeuomorphic button design system.
- Automatic dark mode based on system preferences.
- Responsive layout for mobile devices.
- Atkinson Hyperlegible Next typography.

## Chat Overlay

This repository includes the **Wildcat Chat Overlay** (`src/chat-overlay/`). The overlay displays Twitch and YouTube chat in OBS Studio with these functions:

- Theme generation with AI prompts.
- No user sign-in required. Add the browser source URL directly to OBS Studio.
- Pronoun badges, Twitch emote rendering, text auto-linking, and animations.
- Chat Scene Creator to compose multi-source overlay layouts.

The Chat Overlay uses two backend services:

- **[chat-theme-proxy](https://github.com/detekoi/chat-theme-proxy/)**: Express backend on Google Cloud Run. Delivers theme CSS and handles Google Gemini AI and Runware image API requests.
- **[yt-chat-proxy](https://github.com/detekoi/yt-chat-proxy)**: Proxy service for YouTube live chat. Allows the overlay to display YouTube chat and Twitch chat together.

## Development and Deployment

Make sure that you install the [Firebase CLI](https://firebase.google.com/docs/cli) and Node.js.

### Development

To start the Eleventy development server with live reload, run:

```bash
npm run dev
```

To run unit tests with Vitest, run:

```bash
npm test
```

To build the production site into `public/`, run:

```bash
npm run build
```

### Local Preview and Deployment

1. Log in to Firebase:

   ```bash
   firebase login
   ```

2. Select your Firebase project:

   ```bash
   firebase use --add
   ```

3. Preview local files with Firebase Hosting emulator:

   ```bash
   firebase serve
   ```

4. Deploy the site to Firebase Hosting:

   ```bash
   firebase deploy --only hosting
   ```

## Related Projects

- **Wildcat Sage:** AI-powered Twitch chatbot · [app.wildcat.chat](https://app.wildcat.chat)
- **WildcatTTS:** Text-to-speech bot for Twitch · [tts.wildcat.chat](https://tts.wildcat.chat)
- **Documentation:** Platform guides · [docs.wildcat.chat](https://docs.wildcat.chat)

## Support

For questions or support, use [this contact form](https://parfaitfair.com/#contact).
