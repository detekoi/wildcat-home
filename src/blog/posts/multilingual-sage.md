---
title: "New: WildcatSage in 8 Languages"
date: 2026-08-28
description: "Game messages, command replies, and the whole dashboard now come pre-translated in eight languages. Channels that already declare a language on Twitch get it without typing a command, and you can pick one on the dashboard now too."
---

Game messages, command replies, and the whole dashboard now come pre-translated in eight languages. Channels that already declare a language on Twitch get it without typing a command, and you can pick one on the dashboard now too.

## The Bot Could Already Do This. It Was Just Slow.

`!botlang spanish` has worked for a long time. What happened underneath was that every single message got handed off to be translated at the moment it was needed, and only then went to chat.

That is fine for one message and wrong for a game. A single round of trivia sends the question, the result, and a header announcing the next round, and each one sat waiting on a translation before anyone in chat saw it. The wording wandered too, because asking for the same sentence twice does not give you the same sentence back. "Time's up!" came out a little different every round.

It could also rewrite the parts that were never meant to be read as words. `!trivia` looks like a word to a translator. So does the `$(user)` in your custom commands. Emoji were fair game as well.

So the 353 fixed things the bot says are now translated ahead of time into Spanish, French, German, Italian, Portuguese, Japanese and Russian. On a channel set to one of those, the bot already has the sentence ready. It arrives as fast as English always did and says the same thing every time.

What the bot makes up on the spot still works the way it always has. Answers to questions, the trivia questions themselves, the text of a quote: none of that exists until the second it is needed, so none of it can be written in advance. `!botlang thai` is unchanged too. Thai is not one of the eight, so those messages still get translated as they are sent, along with every other language the command accepts.

## Games

Trivia, riddles and geo-guessing send the most messages per minute, so they went first. Here is the opening announcement in three of the eight:

```
en  🎯 Starting {roundText} of Trivia! Topic: {topic}. You have {questionTimeSeconds}
    seconds to answer each question. Type your answers in chat!
es  🎯 ¡Comienza {roundText} de Trivia! Tema: {topic}. Tienes {questionTimeSeconds}
    segundos para responder cada pregunta. ¡Escribe tus respuestas en el chat!
ja  🎯 トリビア（{roundText}）スタート！トピック: {topic}。回答時間は各問
    {questionTimeSeconds}秒。チャットで答えを入力してね！
```

The words in braces are the bits that change each game, like your topic. Japanese moves the round count into brackets straight after the game name, where English leaves it trailing at the end. Which order the sentence goes in belongs to the language, so it is part of what gets translated rather than something the bot decides.

### One Sentence, Not Pieces of One

`{roundText}` turned out to be the interesting one. That slot holds either "a round" or "3 rounds", and the bot used to choose between them separately and drop the winner into the sentence.

Translate the sentence and that piece stays behind. You get a Spanish announcement with the words "3 rounds" sitting in the middle of it, because by the time anyone looks at the sentence, the English fragment is already baked into it.

So both versions of the phrase get translated too:

```
en    a round        /  {totalRounds} rounds
es    una ronda      /  {totalRounds} rondas
ja    1ラウンド       /  {totalRounds}ラウンド
```

The same trap was hiding in the round header (`[Round 1/3] `) and in the pieces the result line is assembled from: how fast you answered, your streak, and the points. Those are all full phrases now rather than words glued on at the end.

## Follow Age and Language Names

`!followage` and the `$(followage)` variable used to count up the years and months and then stick an `s` on the end if the number was not 1. That is how English works and very little else does.

The numbers now go through the same built-in formatter your phone and browser use, which already knows the rules for each language:

```
en    2 years 3 months 1 week 3 days
es    2 años, 3 meses, 1 semana y 3 días
ru    2 года, 3 месяца, 1 неделя и 3 дня
```

Russian is the reason this is not just a list of translated words. It swaps between `года` and `лет` depending on the number, and the switch does not happen where an English speaker would expect. Writing that out by hand would mean a separate phrase for every unit, for every number pattern, in every language, and someone has already done it correctly.

Language names get read out properly too. Ask a Russian channel what language the bot is set to and it answers `русский` rather than `russian`.

## The Dashboard

All five pages are translated, 245 phrases in total, most of them on the [dashboard](https://bot.wildcat.chat) itself. The language picker sits in the bottom corner of every page.

If you have never touched it, the page follows whatever language your browser is set to. Choose one and it sticks. Putting `?lang=ja` on the end of the URL forces a language for a single visit, which is the quickest way to look at something.

That picker sets the language of the page, not the language of the bot. Those are two separate settings, and the second one is further down.

Not everything you read on the dashboard is written by the page. The little messages that pop up when you save a setting, or when a save goes wrong, are sent back by the bot itself, and the page shows them exactly as they arrive. Until now you could put the whole dashboard into French and still get an English sentence in your face the first time something failed. There are 81 of those messages and they are translated now. The page tells the bot which language you are looking at, and the answer comes back to match.

## Your Channel Language Gets Detected

Twitch already knows what language you stream in, because you chose it on your own channel. The bot reads that and uses it as the starting point, so most channels get this without doing anything.

It is only ever a starting point. If someone has picked a language, in chat or on the dashboard, that choice wins and detection cannot override it or quietly undo it. Nothing is written to your channel behind your back either. The bot checks the live value, so if you change your language on Twitch, the bot follows.

Channels set to English are skipped, since English is what the bot does anyway. The dashboard says which of the two you are on, and so does `!botlang status`:

```
El bot está configurado actualmente para hablar en español
(detectado del idioma de tu stream de Twitch).

El bot está configurado actualmente para hablar en español
(establecido por un moderador).
```

### Or Pick One on the Dashboard

Detection covers most channels, but the choice is on the [dashboard](https://bot.wildcat.chat) now too, in a card called Bot Language. It does what `!botlang` does, from a list rather than from a guess at the spelling.

The default is Automatic, and it says what that currently works out to instead of leaving you to figure it out: "Automatic (Spanish, from Twitch)". Pick a language instead and the channel holds that language whatever Twitch says. Pick English and it stays English, the same as `!botlang off`.

The list puts the eight pre-translated languages first and the rest underneath, so you can see which half you are choosing from. Chat still takes languages the list does not offer, and if a mod has set one of those, the dashboard shows it rather than quietly swapping it for something from the list.

Your choice saves as you make it and the bot has it within seconds. Nothing restarts and there is nothing to sync.

## Which Language It Answers You In

The bot's own replies are written fresh every time, so there is nothing to translate in advance. What changed is the instructions it works from, which were written as though everyone reading them spoke English.

It now knows what language your stream is in, and the rule is simple: reply to people in whatever language they wrote to you in, and if that is not clear, use the language of the stream. There is nothing anywhere telling it to speak one particular language, which matters on channels where chat is genuinely mixed. Type English into a Spanish stream and you get English back, with no remark about the language you chose.

The style notes needed the same care. The bot's personality includes a short list of words to stop leaning on, and those words are English ones:

```
When writing in English, avoid these words: chaos, vibe(s), basically, bold move.
In other languages, avoid the same kind of overused filler rather than
translating this list.
```

Handed over word for word, that would have banned four perfectly ordinary Spanish words while leaving actual Spanish filler alone.

## How the Translations Are Made

Gemini writes them once and they get saved, the same way WildcatTTS does it. Change the English wording of a line and only that line is redone.

None of it goes out without being compared against the English first. A translation is thrown away if it came back empty, if it lost or renamed one of the slots that get filled in later like `{topic}`, or if it touched a command name. Command names are the check that most earns its place: `!trivia` reads like an ordinary word, but it is something people are supposed to type, and translating it leaves you with a help message pointing at a command that does not exist.

One rule sits underneath all of it. A language is either finished or not offered at all, with nothing in between. That is what lets the bot decide once, for a whole message, whether it already has the sentence or needs to go and get it translated. Without that rule you would eventually get a message that starts in one language and finishes in another.

## What's Still English

Everything the bot thinks up rather than looks up. Where it can write that directly in your language it does, and where it cannot, it still gets translated on the way out, which is slower and less predictable than having the words ready but is the only option for a sentence that did not exist a moment ago.

This website is English only.

Full details are in the [WildcatSage documentation](https://docs.wildcat.chat/botcommands.html#bot-language).
