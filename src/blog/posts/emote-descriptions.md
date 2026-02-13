---
title: "New WildcatTTS Feature: Emote Descriptions"
date: 2026-02-07
description: "WildcatTTS can now describe what emotes look like instead of reading out the emote name. This makes emote-heavy messages much more accessible and natural to listen to."
---

WildcatTTS can now describe what emotes look like instead of reading out the emote name. This makes emote-heavy messages much more accessible and natural to listen to.

### How it works:

- When someone sends a message like `hello LUL nice play Kappa`, TTS will say:  
  "hello, laughing face emote, nice play, smirking face emote."
- Repeated emotes get collapsed.  
  `LUL LUL LUL` becomes "3 laughing face emotes."
- Descriptions appear inline where the emote was used, keeping conversational flow.
- Descriptions are cached so repeated emotes are instant.

### Emote modes available:

- **Describe emotes** — describes what the emote depicts visually (new).
- **Read emote names** — reads the emote code as-is (e.g. "LUL", "Kappa").
- **Skip emotes** — removes emotes from TTS entirely.

### How to configure:

1. Go to the [WildcatTTS Dashboard](https://tts.wildcat.chat/).
2. Open the Broadcaster tab (the default tab).
3. Find the Emote Mode dropdown.
4. Select Describe emotes.
5. The setting saves automatically.

This works with all Twitch emotes including channel-specific and subscriber emotes.
