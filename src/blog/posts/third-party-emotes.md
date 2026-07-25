---
title: "Third-Party Emote Support: BTTV, FFZ, & 7TV in the Chat Overlay"
date: 2026-07-25
description: "The Chat Overlay now natively renders BetterTTV, FrankerFaceZ, and 7TV emotes, including full zero-width emote stacking and animated emotes."
---

The Wildcat Chat Overlay just received a major upgrade for Twitch streamers and viewers: native support for **BetterTTV (BTTV)**, **FrankerFaceZ (FFZ)**, and **7TV** emotes!

The overlay fetches and renders both channel-specific and global emote sets across all three popular platforms.

## Zero-Width & Overlay Stacking

Many communities rely on zero-width overlay emotes (such as putting Santa hats, hazmat masks, or rain effects over other emotes). The Chat Overlay now accurately renders zero-width stacking!

When a viewer types an emote followed immediately by a zero-width modifier (e.g. `catJAM cvHazmat`), the overlay layers the modifier directly on top of the base emote while cleanly preserving spacing and text flow. Multi-emote stacking chains are also fully supported.

## Animated Emotes & High Quality

All animated WebP and GIF emotes from BTTV, FFZ, and 7TV are rendered in high resolution. Single-emote messages continue to enlarge automatically, including messages containing zero-width stacked emotes.

## Zero Setup Required

Third-party emote support is enabled by default for all Twitch channels. Simply open your overlay or launch your OBS browser source, and your channel's emotes will load automatically when you connect.

If you ever wish to disable third-party emotes, you can easily toggle them off in the overlay's settings panel under **Third-Party Emotes (BTTV, FFZ, 7TV)**.

## Content Safety & Granular Control

You may not want every unmoderated emote showing up on stream. The Chat Overlay now includes explicit support for **7TV's content safety flags**.

By default, the overlay safely filters out emotes flagged by 7TV as **"Twitch Disallowed"**. You can further customize these safety filters directly in the settings panel by selectively turning on filters for:

- Twitch Disallowed
- Sexual Content
- Epilepsy / Flashing
- Edgy / Offensive

Additionally, if you only want to use global emotes and prefer to ignore all channel-specific uploads, you can use the **Show Channel Emotes** master toggle to restrict all third-party emotes to global sets only.

## Built for Speed & Reliability

- **Instant Local Caching**: Emote sets are cached locally in your browser to minimize startup delay and reduce external API calls.
- **Resilient Fallbacks**: Network failures or unregistered channels won't interrupt chat rendering or cause lag spikes.

[Launch the Chat Overlay](https://wildcat.chat/chat-overlay/)

[Read the setup documentation](https://docs.wildcat.chat/chatoverlay.html)
