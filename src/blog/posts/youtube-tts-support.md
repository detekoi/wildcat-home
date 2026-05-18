---
title: "New: YouTube Live Chat TTS Support for Multi-Streamers"
date: 2026-05-17
description: "WildcatTTS now natively supports reading YouTube Live chat aloud, perfect for broadcasters multistreaming to Twitch and YouTube simultaneously."
---

We're excited to announce that **YouTube Live Chat TTS** is now fully integrated into WildcatTTS! Following the success of our YouTube-compatible chat overlay, we've brought the same reliable integration directly to the text-to-speech engine.

If you are multistreaming to both Twitch and YouTube, you no longer have to keep your eyes glued to two separate chat windows. WildcatTTS will now read messages from both platforms aloud, mixing them seamlessly into your existing audio feed.

### Perfect for Multi-Streamers

The integration is designed with multi-streamers in mind. When a viewer chats on YouTube, their message goes through the same powerful processing pipeline as Twitch messages:

- **AI Emote Descriptions:** Custom YouTube emotes and emojis are processed and described naturally, just like Twitch emotes.
- **URL Handling:** Links are smartly shortened or read in full depending on your dashboard settings.
- **Voice Preferences:** Your channel's default voice, language boost, and pitch/speed settings apply universally to YouTube chatters.

### How to Enable YouTube TTS

Getting started takes just a few seconds through the Web Dashboard:

1. Log into the [WildcatTTS Web Dashboard](https://tts.wildcat.chat/).
2. Navigate to the **YouTube Integration** section under your settings.
3. Toggle "Enable YouTube TTS" on.
4. Enter your **YouTube Handle** (e.g., `@parfaitfair`), your Channel ID, or a specific live Video URL.

That's it! Your OBS Browser Source will automatically begin speaking YouTube chat messages.

### Reliable and Seamless

Under the hood, this feature leverages our custom [yt-chat-proxy](https://github.com/detekoi/yt-chat-proxy) infrastructure. We recently deployed major updates to ensure the connection remains completely stable:

- **Background Polling:** If you enable the feature before you actually click "Go Live" on YouTube, the system will patiently wait and connect the instant your stream begins.
- **Heartbeat System:** Even during quiet streams with slow chat, an active background heartbeat ensures your connection never times out, meaning no dropped messages when someone finally says hello.

Happy multistreaming!

<a href="https://tts.wildcat.chat/" target="_blank" rel="noopener noreferrer">Configure your dashboard →</a>
<a href="https://docs.wildcat.chat/wildcatttsdocs.html" target="_blank" rel="noopener noreferrer">Read the TTS documentation →</a>
