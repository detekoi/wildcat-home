---
title: "WildcatTTS: Emote Description Cache & Management"
date: 2026-03-10
description: "Emote descriptions are now permanently cached and moderators can view, regenerate, or manually set descriptions with the new !tts emote command."
---

Emote descriptions are now permanently cached so the bot doesn't need to re-generate them every time an emote appears. Moderators also get a new command to manage descriptions directly from chat.

### Persistent Caching

Previously, emote descriptions were only cached in memory and lost on restart. Now they're stored permanently — each emote only needs to be described once, ever. This means:

- **Faster TTS** — no delay waiting for a description to be generated for emotes the bot has seen before.
- **Consistent descriptions** — the same emote always gets the same description across sessions and channels.

### New Command: `!tts emote`

Moderators can view and regenerate descriptions, and broadcasters can manually set them:

- **`!tts emote LUL`** — view the current cached description for an emote.
- **`!tts emote regenerate LUL`** — clear the cached description so it gets re-generated next time.
- **`!tts emote set LUL = a person laughing`** — manually set a custom description *(broadcaster only)*.

This is useful when a generated description doesn't quite capture what an emote looks like, or when you want a specific phrasing for your channel.

### Documentation

Full details are available in the [WildcatTTS Docs](https://docs.wildcat.chat/wildcatttsdocs.html#emote-descriptions) under the new **Emote Descriptions** section.
