---
title: "Chat Overlay Update: Ultimate Color Customization & Smoother Animations"
date: 2026-07-03
description: "Take total control of your chat overlay's aesthetic with fully customizable colors for usernames, messages, timestamps, and pronoun badges. Plus, enjoy buttery-smooth new animations that respect your system's motion settings."
---

The Wildcat Chat Overlay just got a massive upgrade focused on giving you more control over its appearance and improving the feel of the chat feed. 

## Fully Customizable Colors

I've overhauled the color settings panel to give you absolute control over every aspect of your chat overlay. You are no longer limited to a few preset options or just the basic text/background colors.

You can now set custom colors for:
- Usernames
- Chat messages
- Backgrounds
- Timestamps
- Pronoun badges

Since standard color picker dialogs don't work reliably inside OBS browser source instances, the settings panel lets you input hex codes directly. The settings buttons will update to display dynamic color swatches, making it easy to see your current color scheme at a glance.

## Pronoun Badge Customization

You can now set custom colors for pronoun badges to perfectly integrate them into your theme.

## Smoother, Performant Animations

I've completely rewritten the chat message entry and exit animations using the modern Web Animations API (WAAPI). 

Instead of animating the height of individual elements (which can cause performance hiccups on busy streams), the chat window now uses a performant "glide" effect with CSS clipping. Messages enter and exit the feed fluidly, and disconnected messages now use CSS animation-based cleanup rather than manual timeouts, ensuring they animate out perfectly every time.

**Reduced Motion Support:** For users who prefer a calmer visual experience, the new animations fully respect system-level `prefers-reduced-motion` settings (such as those in macOS). If you have reduced motion enabled, the overlay will automatically adjust for a less distracting experience.

To get started, check out the [Chat Overlay page](https://wildcat.chat/chat-overlay/) or read the [Chat Overlay Documentation](https://docs.wildcat.chat/chatoverlay.html).
