# Wildcat.chat Platform Homepage

The unified landing page and web hub for [wildcat.chat](https://wildcat.chat), featuring all Wildcat tools — Wildcat Sage, WildcatTTS, and Chat Overlay — with consistent branding. Deployed to Firebase Hosting.

## Features

- Animated TV-static canvas background
- 3D skeuomorphic button design system
- Automatic dark mode (system preference)
- Mobile-responsive layout
- Atkinson Hyperlegible Next typography

## Chat Overlay

This repository also hosts the **Wildcat Chat Overlay** (`src/chat-overlay/`), a customizable Twitch & YouTube chat overlay for OBS. Features include:

- AI-generated themes via natural language prompts
- No login required — just add the browser source URL to OBS
- Pronoun badges, Twitch emote rendering, auto-linking, and animations
- Chat Scene Creator for composing multi-source layouts

The overlay depends on two companion services:

- **[chat-theme-proxy](https://github.com/detekoi/chat-theme-proxy/)** — Node.js/Express backend that delivers theme CSS and proxies AI generation (Gemini) and image asset (Runware) APIs. Deployed on Cloud Run.
- **[yt-chat-proxy](https://github.com/detekoi/yt-chat-proxy)** — Proxy service for YouTube live chat, enabling the overlay to display YouTube chat alongside Twitch.

## Setup & Deployment

Requires the [Firebase CLI](https://firebase.google.com/docs/cli).

```bash
firebase login
firebase use --add        # select your project
firebase serve            # preview at localhost:5000
firebase deploy --only hosting
```

## Related Projects

- **Wildcat Sage** — AI-powered Twitch chatbot · [app.wildcat.chat](https://app.wildcat.chat)
- **WildcatTTS** — Text-to-speech bot for Twitch · [tts.wildcat.chat](https://tts.wildcat.chat)
- **Documentation** · [docs.wildcat.chat](https://docs.wildcat.chat)

## License

All rights reserved © 2026 Wildcat.chat

## Support

For questions or support, visit [https://parfaitfair.com/#contact](https://parfaitfair.com/#contact)
