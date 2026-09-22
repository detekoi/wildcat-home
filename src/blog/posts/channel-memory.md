---
title: "New: Channel Memory"
date: 2026-09-22
description: "WildcatSage now remembers your channel's running jokes, in-jokes, and regulars from one stream to the next. It learns from chat and from mods, and viewers can ask it to forget them."
---

A viewer recently asked WildcatSage whether it remembered what "ball knowledge" was. It was a joke the channel had been running for days. The bot gave the dictionary answer about knowing sports, and the viewer's next message was "he doesn't remember."

The viewer was right. Until now the bot only kept a few minutes of chat plus a short rolling summary, and a restart wiped both. Nothing carried over reliably from one stream to the next. Channel Memory fixes that.

## How It Learns

There are two ways a memory gets in.

The first is chat. As messages scroll out of the bot's short-term window, it reads them in batches and asks one question: is there anything here this community will bring up again? A phrase that means something specific in your channel, a running joke, a nickname, the fact that a regular mains Pichu. Most batches have nothing like that, and the bot stores nothing, which is how it's meant to work.

It skips its own messages, anything starting with `!`, and viewers who have opted out. The reading is done by Gemini Flash Lite, the same model that handles translation, and it runs at a lower priority tier because nobody is waiting on it.

The second way is a mod teaching it directly:

```
!remember ball knowledge is knowing what the pokeballs are actually called
```
(This is just an example, I don't actually know what "ball knowledge" means.)

A mod's wording wins. If the bot later picks up the same phrase from chat, it counts that as the lore coming up again but won't overwrite what the mod wrote.

## How It Uses Them

When someone mentions the bot or uses `!ask`, it checks the message against what it has stored. If something matches, up to five memories get handed to the model along with that one question, and the model is told that your channel's meaning beats the general one.

The lookup is plain word matching, so it costs no extra AI call and adds no delay. The trade-off is that it only finds a memory if the message uses the same words. "What's ball knowledge?" works. "What was that pokeball joke?" probably won't. I went with the cheap version first because the question that started all this used the exact phrase, and I'd rather see how often paraphrases actually miss before opting for something smarter, but more expensive and potentially slower.

If nothing matches and someone asks whether the bot remembers something, it's told to say it doesn't, instead of making something up.

## Turning It Off

Channel Memory is on by default.

A mod can turn it off with `!memory off`. The bot stops reading chat for it and stops using what's stored. The stored memories stay put, so `!memory on` picks up where it left off. `!memory` on its own shows whether it's on and how many memories the channel has.

Any viewer can type `!forgetme`. The bot deletes everything it has stored about them in that channel and ignores their messages from then on. It only applies to the channel they typed it in.

Twitch chat is public, and anyone watching can remember what gets said in it. I still think people should have a way to say "not me," so the option is there and it doesn't need a mod.

The chat the bot reads for memory goes to Google through the paid Gemini API, and Google doesn't use prompts or responses from paid API use to train its models. When a memory is used in a reply, it goes to OpenAI along with the question, and OpenAI doesn't train on API data by default either.

## Fixing Mistakes

The model deciding what's worth keeping can get it wrong. It's told to leave out sensitive personal details like health, addresses, real names, age, and finances, but that's an instruction, not a guarantee.

If it stores something wrong or something you don't want, a mod can delete it:

```
!forget ball knowledge
```

That removes every memory containing the phrase. Running `!remember` again with the same phrase replaces the old text.

## Limits

- Up to 300 memories per channel, 200 characters each.
- When a channel hits 300, the bot drops the least-used memory it picked up from chat. It never drops one a mod added.
- Memories don't expire.
- Each channel's memories are its own. Nothing is shared between channels.

One more thing: the bot only starts remembering from the day this went live. It can't go back and learn a joke from last month. If there's lore you want it to know right away, `!remember` it.

## Commands

```
!remember <fact>     teach the bot something (mods)
!forget <phrase>     delete memories containing a phrase (mods)
!memory              show whether memory is on and how many are stored (mods)
!memory off          stop learning and using memories (mods)
!memory on           turn it back on (mods)
!forgetme            delete what the bot knows about you here, and opt out
```

Full details are in the [Channel Memory documentation](https://docs.wildcat.chat/botcommands.html#channel-memory). If you have questions or feedback, [get in touch](https://parfaitfair.com/#contact).
