---
title: "New WildcatTTS Features: Pronunciation Dictionary & Profanity Filter"
date: 2026-08-14
description: "WildcatTTS now reads common chat acronyms as words instead of spelling them out, and a new opt-in profanity filter swaps rude words for milder ones before they reach the audio."
---

WildcatTTS now reads common chat acronyms as words instead of spelling them out, and a new opt-in profanity filter swaps rude words for milder ones before they reach the audio.

## Pronunciation Dictionary

Chat is full of short forms that TTS handled badly. `ngl` came out as "N. G. L." and `iykyk` came out as something closer to "ikyk". WildcatTTS now ships with a built-in list of about 70 of them, so `ngl` reads as "not gonna lie" and `glhf` reads as "good luck have fun".

I picked the list by testing every candidate against the live TTS engine rather than guessing at it. Some acronyms the engine already handles fine, and those were left alone — `lol` still reads as "el oh el", which is how people actually say it out loud.

### Adding your own

Moderators can add entries from chat or from the dashboard:

```
!tts pronounce wcat = wildcat
!tts pronounce list
!tts pronounce remove wcat
!tts pronounce test ngl that was wild
```

The `test` sub-command shows you the result without spending a TTS call on it, which is handy when you're working out whether an entry does what you expect.

Your own entries override the built-in ones. If you want a built-in entry gone without losing the ability to get it back, `!tts pronounce off lfg` disables it and `!tts pronounce remove lfg` brings it back. There's a Pronunciation Dictionary card in the [dashboard](https://tts.wildcat.chat/) that does the same thing with a form.

Matching is case-insensitive and only fires on whole words, so an entry for `fr` won't mangle "friend" and `lol` survives inside "lollipop".

## Profanity Filter

The profanity filter replaces rude words with milder ones before the audio is generated. "What the fuck" becomes "what the freak." Turn it on with `!tts profanity on` or the toggle in the dashboard.

Dropping the word entirely can leave a sentence that makes no sense, or in the worst case an empty message that never gets read at all.

Slurs work differently. Those are replaced with the word "slur," not with a milder insult. A softened slur still lands as the thing it was, so there's no point laundering it.

### Why substitute instead of bleep?

Bleeping is an audio change, not a text change.

Everything WildcatTTS does before generating speech is a text operation. The bot swaps acronyms and rude words in text, hands the cleaned sentence to the voice engine, and the engine streams the audio directly to your browser source. At no point does my server hold the raw audio data.

To bleep a word, you have to edit the audio waveform itself. Doing that means adding an audio processing step that does not exist today:

You could try downloading the generated audio to the server, mixing a tone over the swear word, and re-hosting the file. But that adds extra delay to every message on stream, against a voice service that already needs to stay fast.

You could try splicing the audio inside the browser player instead. That requires exact word-level timestamps from the voice engine and turns a simple browser player into a full audio editing tool.

Or you could split the message at every swear word, generate separate voice clips for each side, and play a bleep sound in between. The problem is that every split costs an extra API call, which burns through rate limits fast. It also ruins sentence flow. The voice engine reads each piece as its own standalone sentence, leaving awkward pauses and broken intonation at every cut.

Substituting words with milder text, or having the voice speak the word "beep," gets the point across without stream delay or robotic pauses.

If you want a specific word bleeped in your channel, you can already do it today with the pronunciation dictionary. Custom pronunciations run first and are set per channel, so a moderator can add:

```
!tts pronounce shitbird = beep
```

That gives you an immediate spoken bleep for any word you choose.

### How it interacts with the dictionary

These two features are connected in a way worth explaining, because it caught me out during testing.

Some acronyms expand into profanity. `lfg` is "let's fucking go" whether we like it or not. Rather than ship a sanitized expansion that's wrong, the dictionary expands honestly and the filter cleans up afterwards. With the filter on you get "let's freaking go." With it off you get the real thing.

This is also why acronyms the engine used to expand on its own, like `wtf` and `lmao`, now have explicit dictionary entries. When the engine did the expanding, the profanity only existed in the audio, downstream of the filter, so the filter never saw it. Pinning the expansion puts it back under our control.

### Languages

There are word lists for all 40 languages that Language Boost supports. The filter uses your channel language, and if a viewer has set a different language for their own messages it uses both. English is always included, because the acronym dictionary is English.

Coverage isn't uniform. The English list is by far the largest, and the major European and Asian languages are in decent shape. For the long tail I shipped a short list of words I was confident about instead of padding it out. A missing word means unfiltered text, which is no worse than the feature being off, whereas a wrong substitution is actively bad. Slurs are English-only for now.

If your Language Boost is set to Automatic, the filter uses English. There's no per-message language detection.

## Not the same as Banned Words

[Banned Words](https://wildcat.chat/blog/posts/banned-words/) drops the whole message. The profanity filter reads the message, just cleaned up. They stack, so a word on both lists still means the message is skipped entirely.

Full details are in the [WildcatTTS documentation](https://docs.wildcat.chat/wildcatttsdocs.html#pronunciation).
