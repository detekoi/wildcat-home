---
title: "New: Automated Chat Timers with AI Support"
date: 2026-07-08
description: "Keep your chat engaged with automated timed messages. Broadcast standard announcements, or use AI prompts to generate fresh, unique messages on an interval."
---

I'm excited to introduce **Chat Timers** for WildcatSage! Whether you want to remind viewers to drop a follow, promote your Discord, or just add some random fun to the stream, Timers make it effortless to keep your chat active and engaged.

## Standard and AI Timers

Just like my Custom Commands, Timers come in two flavors:

1. **Standard Timers:** Perfect for static announcements like "Join our community Discord!" or "Don't forget to use your Twitch Prime sub!"
2. **AI Timers:** Write a prompt instead of a fixed message, and WildcatSage will generate a fresh, unique message every time it fires. For example, you can tell the AI to "Hype up the current game" or "Share a recent news update about the game I'm playing."

## Smart Scheduling

I want to make sure the bot doesn't feel spammy, so every timer uses two smart constraints:
- **Interval:** The minimum number of minutes between messages (e.g., 15 minutes).
- **Minimum Chat Lines:** The minimum number of real chat messages that must occur before the timer fires again (e.g., 10 lines).

This ensures timers only fire when your stream is active and chat is moving, and they automatically pause when you're offline.

## How to Set Up Timers

You can manage your timers directly from the [web dashboard](https://bot.wildcat.chat) under the new **Timers** section, or you can manage them on the fly in your Twitch chat:

- `!timer add <name> <interval> <message>`
- `!timer edit <name> <new message>`
- `!timer interval <name> <minutes>`
- `!timer lines <name> <number>`
- `!timer enable <name>` / `!timer disable <name>`
- `!timer remove <name>`
- `!timer list` (to see all your timers)

Timers are live right now — set one up and keep your community engaged!
