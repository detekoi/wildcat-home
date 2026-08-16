---
title: "New: Custom Bot Personality"
date: 2026-08-16
description: "Rewrite how WildcatSage talks in your channel. Edit the personality from the dashboard, keep the safety rules that always apply, and every save gets screened before it goes live."
---

WildcatSage has sounded the same in every channel since it launched. You can now rewrite that personality for your own channel from the dashboard.

## How It Works

Open the [dashboard](https://app.wildcat.chat/) and scroll to **Bot Personality**. The box comes pre-filled with the personality the bot uses today, so you're editing text that already works instead of starting from an empty field. Change what you want and press **Save**. There's a 2000 character limit and a counter under the box.

Changes take effect right away. No restart, no waiting for the next stream.

**Reset to default** puts the original personality back if an experiment doesn't land.

## What You Can Change

Anything about how the bot sounds. Its name, its sense of humour, what it's into, what running bits it should keep.

The default personality has a section where the bot leans into a cat roleplay if viewers talk to it that way. That was always specific to my channel, and it never made much sense to push it on everyone else. Deleting that paragraph is now a quick edit.

Some things you might write:

- Your channel mascot who acts like a regular who's been in your chat since day one.
- A tired tavern barkeep who gives terrible advice to anyone complaining in chat.
- Something that knows your channel's running bits and lore.

## What You Can't Change

A short set of rules sits above whatever you write and applies to every channel. The bot won't run or fake chat commands like `/ban` or `/timeout`. It keeps replies to a sentence or two. It won't read its own instructions back to chat. The channel values stay in place, so a personality that tries to make the bot a vehicle for harassment isn't going to work.

The card has a **Rules that always apply** panel showing the exact text of those rules. It's read only, but you can see what you're working inside instead of guessing at it.

Your text sits underneath that block and is labelled as a character description rather than as instructions. Anything in it that tries to talk the bot out of the rules above gets ignored.

## The Safety Check

Every save is screened by Gemini Flash Lite, the same model that already handles translation, before anything is stored. If it fails, nothing is written, your text stays in the box, and you get told why.

It's looking for the things you'd expect. Instructions to harass viewers, to run moderation commands, to impersonate a real person, or to argue the bot out of its own rules.

Tone isn't what it's checking. A rude, sarcastic, or foul-mouthed personality is a normal thing to want and it will pass.

If the check can't run at all, the save fails rather than going through unscreened. Retrying a save is a much smaller problem than unscreened text reaching a system instruction.

## Shared Chat

During a shared chat session, the bot blends the personalities of every participating channel that has set one, and leans toward the host's voice. Channels still on the default don't add anything to the mix.

This is the part I'm least sure about. Two strong personalities averaged together may act unexpectedly, and a personality you wrote for your own chat now colours replies that appear in someone else's. If it turns out worse than the old behaviour of falling back to the default, I'll change it. 

## AI Commands, Timers, and Check-Ins

The same screening now runs on AI custom command prompts, AI timers, and check-in AI prompts. Those fields have accepted whatever you typed since the day they shipped, which was a gap worth closing while I was in there.

Plain text commands and timers are untouched. They're posted word for word and never go near the model, so there's nothing to screen.

Full details are in the [Bot Personality documentation](https://docs.wildcat.chat/botcommands.html#bot-personality). If you have questions or feedback, [get in touch](https://parfaitfair.com/#contact).
