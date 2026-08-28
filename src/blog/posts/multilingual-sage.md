---
title: "New: WildcatSage in 8 Languages"
date: 2026-08-28
description: "Game messages, command replies, and the whole dashboard now come pre-translated in eight languages. Channels that already declare a language on Twitch get it without typing a command."
---

Game messages, command replies, and the whole dashboard now come pre-translated in eight languages. Channels that already declare a language on Twitch get it without typing a command.

## The Bot Could Already Do This. It Was Just Slow.

`!botlang spanish` has worked for a long time. Every outgoing message went to a model, came back translated, and then got sent. That is fine for one message and wrong for a game.

A single round of trivia sends the question, the result, and a header announcing the next round, and each one waited on a network round trip before it reached chat. The wording drifted between rounds, because a model asked the same question twice does not answer identically. And every `!command`, every `$(user)` token and every emoji in the string went through a step that had no obligation to leave them intact.

The 353 fixed strings the bot sends are now translated once, ahead of time, into Spanish, French, German, Italian, Portuguese, Japanese and Russian. On a channel set to one of those, sending a message is a lookup, so it arrives at the speed an English one always did and says the same thing every time.

Anything the bot makes up on the spot still goes the old way. Answers to questions, trivia questions themselves, the text of a quote: none of that exists until the moment it is needed, so none of it can be translated in advance. `!botlang thai` also still works exactly as before. Thai has no catalog, so those messages take the live route, and so does every other language the command accepts.

## Games

Trivia, riddles and geo-guessing send the most messages per minute, so they went first. The same line in three of the eight:

```
en  🎯 Starting {roundText} of Trivia! Topic: {topic}. You have {questionTimeSeconds}
    seconds to answer each question. Type your answers in chat!
es  🎯 ¡Comienza {roundText} de Trivia! Tema: {topic}. Tienes {questionTimeSeconds}
    segundos para responder cada pregunta. ¡Escribe tus respuestas en el chat!
ja  🎯 トリビア（{roundText}）スタート！トピック: {topic}。回答時間は各問
    {questionTimeSeconds}秒。チャットで答えを入力してね！
```

Japanese moves the round count into brackets right after the game name, where English trails it after a preposition. That reordering is a property of the sentence, so it lives in the translation rather than in the code that assembles it.

### The English Hiding Inside the Templates

`{roundText}` is where this got interesting. The old code picked the phrase with a ternary:

```js
totalRounds > 1 ? `${totalRounds} rounds` : 'a round'
```

Translate only the sentence around it and you get a Spanish announcement with the words "3 rounds" sitting in the middle of it. The fragment never reaches the translator, because by the time the sentence is assembled it is already a finished string.

So both branches became catalog entries of their own:

```
en    a round        /  {totalRounds} rounds
es    una ronda      /  {totalRounds} rondas
ja    1ラウンド       /  {totalRounds}ラウンド
```

The round header (`[Round 1/3] `) and the pieces the result line is built from, the elapsed time, the streak counter and the points, all had the same problem. Each is its own catalog entry now rather than a fragment glued on afterwards.

## Follow Age and Language Names

`!followage` and the `$(followage)` variable built their answer by gluing a number to a unit and adding an `s` when the number was not 1. Only English pluralises that way, and only sometimes.

Both now hand the numbers to the platform's own formatter, which knows the rules for each language:

```
en    2 years 3 months 1 week 3 days
es    2 años, 3 meses, 1 semana y 3 días
ru    2 года, 3 месяца, 1 неделя и 3 дня
```

Russian is why this is not a catalog. It picks between `года` and `лет` based on the number, and the boundary is not where an English speaker would guess. Encoding that by hand would mean a phrase per unit per plural category per language, and it is already encoded correctly somewhere else.

Language names get the same treatment. `!botlang status` on a Russian channel says `русский`, not `russian`.

## The Dashboard

All five pages are translated, 245 strings, with the bulk of them on the dashboard itself. The picker sits in the bottom corner of every page.

If you have never touched it, the page follows your browser. Set it once and it sticks. `?lang=ja` on the end of the URL forces a language for one visit, which is the fastest way to check something.

A further 81 messages come from the server rather than the page. Those are the ones that appear as toasts when you save something or when a save fails, and the dashboard prints them exactly as it receives them. Before this, you could translate the entire interface and still get an English sentence thrown at you the first time something went wrong. The page now tells the server which language it is showing, and the reply comes back to match.

## Your Channel Language Gets Detected

Twitch already knows what language you stream in, because you set it on your own channel. The bot reads it and uses it as the default.

It is only ever a default. If a mod has run `!botlang`, that wins, and detection cannot undo it or overwrite it. Nothing gets saved to your channel behind your back either; the detected value is read live, so changing your language on Twitch changes the bot with it.

Channels declaring English are skipped, because English is already what the bot does and naming it would change nothing. `!botlang status` tells you which of the two you are getting:

```
El bot está configurado actualmente para hablar en español
(detectado del idioma de tu stream de Twitch).

El bot está configurado actualmente para hablar en español
(establecido por un moderador).
```

## The Personality Prompt

The bot's own replies were never catalogued and never will be, but the instructions it works from were written as if everyone reading them spoke English.

It now gets the stream's language as context and one rule about what to do with it: answer people in whatever language they wrote to you in, and if that is unclear, use the language of the stream. There is no instruction anywhere telling it to speak a particular language, which matters for channels where chat is genuinely mixed. Someone typing English into a Spanish stream gets English back, and nobody gets a comment on which language they picked.

The style rules got scoped too. The persona carries a list of overused words to avoid, and the list is English:

```
When writing in English, avoid these words: chaos, vibe(s), basically, bold move.
In other languages, avoid the same kind of overused filler rather than
translating this list.
```

Translated literally, that rule would have banned four ordinary Spanish words for no reason while leaving actual Spanish filler untouched.

## How the Translations Are Made

Gemini writes them once and the result is committed, same as WildcatTTS. Each English string is stored with a hash of itself, so editing one line re-translates that line and nothing else.

Nothing ships without being checked against the English first. A translation is rejected outright if it dropped or renamed a `{placeholder}`, changed a `!command` literal, came back empty, or altered the HTML tags in the strings that carry markup. The command literals are the check that most obviously earns its place: `!trivia` looks like a word to a translator and is an instruction to the bot, and translating it produces a help message telling people to type something that does nothing.

There is one rule underneath all of it: a language is either completely translated or absent. There is no half-catalogued state, which is what makes it safe for the bot to decide once per message whether to do a lookup or call the model, rather than checking key by key and producing a message that switches languages partway through. A test enforces it, and a translation run that dies partway through fails that test rather than shipping.

## What's Still English

Everything the bot generates rather than sends. Where that text can be produced in the target language directly it is, and where it cannot it still gets translated live, which is slower and less consistent than a catalog but is the only option for text that did not exist a second ago.

There is no bot language control in the dashboard yet. `!botlang` in chat is still the only way to set one explicitly, though most channels no longer need to.

This website is English only.

Full details are in the [WildcatSage documentation](https://docs.wildcat.chat/botcommands.html#general).
