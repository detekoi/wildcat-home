---
title: "New: WildcatTTS in 40 Languages"
date: 2026-08-28
description: "Announcements, chat replies, and the dashboard now come in all 40 languages the voice engine supports. Most channels get it without changing a setting."
# ICU plural samples below contain `{#`, which Nunjucks parses as a comment opener.
templateEngineOverride: md
---

Announcements, chat replies, and the dashboard now come in all 40 languages the voice engine supports. Most channels get it without changing a setting.

## Spoken Announcements

The voice engine has spoken 40 languages for a long time. The bot only ever wrote English. So a Spanish channel running a Spanish voice heard "Bob just followed!" read aloud in a Spanish accent, and there was nothing a viewer could do about it. A label in the wrong language you can skip past. This one gets spoken to everybody watching.

Subs, resubs, gift subs, raids, cheers, follows, watch streaks, and channel point redemptions are all translated now. So are the YouTube equivalents: Super Chats, Super Stickers, and memberships.

### Plurals were the hard part

English has two forms of a countable noun, "1 month" and "5 months", so the old code picked between them with a ternary. That is an English rule dressed up as a general one. Russian, Polish and Czech have four forms. Arabic has six. Machine translation of the English template would have produced text that reads as the wrong grammatical form for most numbers.

The resub message in Arabic ended up like this:

```
{months, plural, zero {0 شهر} one {شهر واحد} two {شهرين}
                 few {# أشهر} many {# شهراً} other {# شهر}}
```

Six branches, one per category the language actually uses, chosen at render time from the number.

### Verbs that change with gender

WildcatTTS reads out a viewer's pronouns when it announces their message. In Russian the verb has to agree:

```
ru    {g, select, he {сказал} she {сказала} other {сказал(а)}}
pl    {g, select, he {powiedział} she {powiedziała} other {mówi}}
```

The bot usually does not know anyone's gender, so the translations were written to avoid the problem wherever possible. Polish gets there by switching tense for the neutral case: `mówi` is "says" rather than "said", and it works for anyone. Where that was impossible, the neutral branch is explicit about being neutral, like the Russian `сказал(а)`.

Hebrew and Arabic inflect verbs for gender in every tense, so there is no neutral phrasing available in either. Those two carry a masculine default.

## The Dashboard

Every page is translated, 643 strings in all. There is a language picker at the top of the [dashboard](https://tts.wildcat.chat/), the viewer settings page, and the home page.

If you have never touched the picker, the page uses your browser's language. Set it once and it sticks. You can also force a language with `?lang=ja` on the end of the URL, which is the quickest way to see what your viewers see.

Arabic, Hebrew and Persian lay the page out right to left.

### Two different language settings

There are two language controls on the viewer settings page and they do different things.

Language Boost tells the voice engine what language to expect in the text, which changes how it pronounces things. The picker at the top of the page changes the language of the page itself. A Japanese speaker who wants an English voice can have exactly that.

## Emotes and Emoji

Emote descriptions are generated in your channel's language rather than translated into it. A description is two to six words with no surrounding context, which is far too little for a translation pass to work from, so the request now asks for the description in the target language directly. Descriptions are cached per emote per language, so switching languages does not throw away the work already done in the other one.

Emoji descriptions come from a public dataset that ships labels for 26 languages, covering 22 of our 40. The other 18 fall back to English labels.

Word order moves around more than you would expect, so the brackets and the position of the description are part of what gets translated rather than something the code decides:

```
en    ({description} emoji)
es    (emoji {description})
ja    ({description}の絵文字)
```

## Your Channel Language Gets Detected

Most streamers never open the language setting, so the bot now reads the language you already declared on Twitch and fills it in for you.

It only writes when you have made no choice at all. If you picked a language yourself, it stays picked, and nothing here can undo it. If your Twitch language has no equivalent in the voice engine, the channel stays on Automatic rather than getting a guess at a near neighbour, because a wrong guess changes what the bot says out loud with nothing to explain why.

You can still set it yourself:

```
!tts defaultlanguage spanish
!tts lang japanese
```

## The Pronunciation Dictionary Knows About Languages Now

The dictionary expands chat acronyms, and it used to fire on every channel regardless of language. Some of those acronyms are ordinary words somewhere else.

`ty` is "thank you" in chat and "you" in Polish, Czech and Slovak. `af` expands to "as fuck" in chat and means "off" in Afrikaans and Dutch, which is worse than it sounds: on an Afrikaans channel with the profanity filter on, a normal sentence got profanity injected into it and then bleeped.

Word boundaries cannot help here. Polish `ty` is a whole word, and being a whole word is exactly the problem. So dictionary entries can now be scoped to languages, and four of the built-ins are scoped by which languages they collide with: `ty`, `af`, `np` and `nvm`. Everything else still applies everywhere, because Twitch acronyms travel. A German channel's chat is full of `gg` and `brb` too.

Your own entries can be scoped the same way. An entry you add without saying anything about language keeps working in every language, so nothing you already set up has changed.

## How the Translations Are Made

They are generated once with Gemini and committed to the repo, not translated live. These messages are a closed set of templates, so translating them per message would put a network round trip in front of every announcement and give slightly different wording each time.

Machine translation is only safe to ship because everything it produces gets checked before it lands. Every catalog is validated against the English one: keys all present, no leftovers, every placeholder preserved, and the plural branches matched against the categories the language actually has. That last check is the one that earns its keep. Asked to translate an English one/other message into Arabic, a model will happily hand back one/other, and the result reads wrong for most numbers. The catalog gets rejected instead.

## What's Still English

Voice names are provider identifiers and stay as they are. The voice preview phrases are pre-rendered audio files, so translating the text would desync it from what you hear.

Emoji labels are missing for 18 of the 40 languages, and slur replacements in the profanity filter are English only for now.

Full details are in the [WildcatTTS documentation](https://docs.wildcat.chat/wildcatttsdocs.html#language-boost).
