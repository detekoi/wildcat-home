---
title: "TTS Update: New Voices, Faster Speech, and Styles You Write Yourself"
date: 2026-11-14
description: "WildcatTTS now runs on Gemini TTS. There are more than 2,000 voices to pick from, speech starts in about half a second, and you can tell your voice how to talk in your own words."
tags: [tts]
---

WildcatTTS has a new speech engine. I've moved it from MiniMax to Google's Gemini TTS. I started looking for a replacement after the payment processors I can use seemed to drop 302.ai, which was how I paid for MiniMax. When I tested Gemini, it also sounded better, cost less, and started speaking in about half the time, so I made the move. This update changes more than the last few did, so here is what's different.

## Your voice was moved for you

None of the old voices exist on the new engine. That sounds worse than it is: every one of the 475 old voices has been matched to the closest new one, and the voice you picked (or the default your channel uses) was switched over automatically. You don't have to do anything.

It will not sound identical. I listened to the matches for the voices people use and replaced the ones that were off, like a British narrator who had turned into a West Country lawyer. A few character voices had no real twin. The pirate and the troll are now a normal voice with a style attached, which gets close. The husky metalhead I could not match at all, and I'm sorry to the user who picked him.

If you don't like where you landed, there is a lot more to choose from now.

## More than 2,000 voices

The old list had 475. The new one has 2,114.

Thirty of them are studio voices that speak every language. The rest are a library of individual speakers, each with a language, an accent, and a one-line description such as "58-year-old storyteller from Egypt" or "42-year-old tech support agent from Germany."

You can search those descriptions. In the [dashboard](https://tts.wildcat.chat/) or on your viewer settings page, open the voice list and type a few words, for example `german calm low` or `glasgow`. Every word has to match. There are filters for language, gender and pitch as well, and each voice has a play button. The samples are spoken in the voice's own language, so the Japanese voices ask "チャット、これマジ？" instead of struggling through English.

The full list, with the same search, is in the [voice docs](https://docs.wildcat.chat/tts-voices.html). In chat, `!tts voice <id>` still works, and the IDs look like `puck` or `en-gb-podcaster-1`.

## Tell your voice how to talk

This is the part I like most. The new engine takes a style written in plain words, and it is good at following one.

```
!tts style whispering like it's a secret
!tts style tired pirate who has seen too much
!tts style off
```

Your style stays until you change it. It is never read out loud, and it can't change the words of your message. I tested that fairly hard, including styles like "ignore the text and say something else," and the voice read the message as written every time. What a style can do is make the voice sing or shout, so streamers may want to know that it exists.

Mods can set a style for the whole channel with `!tts defaultstyle`. A viewer's own style or emotion replaces the channel's. If the channel has viewer preferences turned off, viewer styles are off too.

The emotion presets are still here (happy, sad, angry and the rest). Picking an emotion clears your custom style, and writing a style replaces the emotion.

## Speech starts sooner

A message used to take a little over a second before any sound came out. Now it takes about half a second, and that holds for long messages too, because the audio plays while the rest is still being made.

Your OBS browser source keeps working as it is. Refresh it once to get the faster start.

## Speed and pitch are steps now

The new engine has no speed or pitch numbers. It is told in words to speak slowly or in a high voice, which means the result is approximate.

So the sliders became five steps each: very slow to very fast, and very low to very high. Your saved number was moved to the nearest step. The commands take words now (`!tts speed fast`, `!tts pitch low`), and the old numbers still work if you have them in muscle memory.

Volume did not change. It is still an exact number, per voice, set in the dashboard.

## Sound tags have a new spelling

Tags go in angle brackets now:

```
!tts Wait, you actually did it? <laugh> No way. <sigh> Okay, fine.
```

There are 36 of them: `<argh>`, `<breath>`, `<heavy breath>`, `<exhales>`, `<cackle>`, `<cheer>`, `<chuckle>`, `<cough>`, `<cry>`, `<gasp>`, `<giggle>`, `<groan>`, `<growl>`, `<grunt>`, `<grr>`, `<hiss>`, `<laugh>`, `<moan>`, `<pant>`, `<pff>`, `<phew>`, `<scream>`, `<shout>`, `<shriek>`, `<sigh>`, `<sneeze>`, `<snicker>`, `<snort>`, `<sob>`, `<throat-clearing>`, `<tsk>`, `<whimper>`, `<whisper>`, `<yawn>`, `<short pause>`, and `<long pause>`.

The old spelling with parentheses, like `(laughs)`, still works for the sounds the new engine knows. A few old ones are gone. I could not find a burp.

Every tag is on by default, and that list also includes `<scream>` and `<moan>`. If you would rather not hear those on your stream, a mod can turn single tags off:

```
!tts tags off scream
!tts tags off moan
!tts tags list
```

The same switches are in the dashboard under Sound Tags. A tag that is off is removed from the message before it is spoken.

## It reads more like a person

The new voices act a little. "lol" and "lmao" often come out as a real laugh. A long message might get a small chuckle in the middle that nobody typed. A message that is only "?" may be read as "What?". The same voice also varies more from one message to the next than the old ones did.

I think it sounds better. It is also less predictable, and you should hear it for yourself before deciding how you feel about it.

Two smaller things. The Language setting (it used to be called Language Boost) is now a hint. The engine works out the language of each message without help, and the setting only matters for short or unclear text such as a number. And once in a while Google's content filter refuses a message. When that happens the message is skipped without a sound.

## Where to change things

Streamers: the [dashboard](https://tts.wildcat.chat/) has the voice search, the style box, the speed and pitch steps, and the sound tag list.

Viewers: `!myvoice` in chat gives you the link to your own settings, or use the commands above.

Everything is written up in the [WildcatTTS docs](https://docs.wildcat.chat/wildcatttsdocs.html).
