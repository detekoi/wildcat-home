---
title: "Getting Started with WildcatTTS"
date: 2026-08-31
description: "A walkthrough for streamers who set up WildcatTTS for the first time. It covers how to get access, how to put the audio in OBS, and how to choose which chat messages the bot reads. The bot can read on command, all the time, only the messages it picks, or only for bits and channel points."
tags: [tts]
---

WildcatTTS reads your Twitch chat out loud on stream. This post walks through the setup from nothing. Then it explains the four common ways that streamers use WildcatTTS. One way reads only messages that start with `!tts`. Another reads every message. Another lets the bot pick the few messages worth reading. The last reads a message only after someone spends bits or channel points.

You need a Twitch channel and OBS, or any streaming app with a browser source.

## 1. Get Access

WildcatTTS is invite-only. Send a request through the [contact form](https://parfaitfair.com/#contact) with your Twitch username, and I will approve the channel. 

## 2. Sign In and Switch the Bot On

1. Go to [tts.wildcat.chat](https://tts.wildcat.chat/). Click **Manage my channel**.

   ![The WildcatTTS landing page. Under the heading "I run the channel" is a purple Manage my channel button. Under "I am a viewer" is a Set my own voice button. A notice above them says access is invite-only.](/assets/images/tts-landing.png)

2. Twitch asks you to authorize the app. The permissions let the app read your chat, subs, bits, follows and channel point redemptions. They also let it create a channel point reward on your behalf and add the bot as a moderator. Approve it.

   ![Twitch's authorization screen. It lists what WildcatTTS will be allowed to do. WildcatTTS can manage channel point rewards and redemptions, and it can grant or remove the moderator role. It can also list subscribers, view Bits information, read followers, and join chat as a bot user. Authorize and Cancel buttons are at the bottom.](/assets/images/tts-twitch-authorize.png)

3. You land on the dashboard. In the **Channel service** card on the right, click **Activate TTS service**.

   ![The WildcatTTS channel dashboard for a newly approved channel. A status bar shows Service: Inactive, the channel name, and who is signed in. The Channel service card on the right has a purple Activate TTS service button. The Engine & Mode card lists toggles for TTS Engine Enabled, Announce Events, Anonymize New Followers and more. Below the status bar are Broadcaster and Voice Defaults tabs.](/assets/images/tts-dashboard.png)

Signing in also makes the WildcatTTS account a moderator in your channel. You do not have to mod it by hand. The bot shows up under "Chat Bots" in your viewer list.

Most settings on the dashboard save the moment you change them. The channel points card is the exception. It has its own Save button.

## 3. Put the Audio in OBS

The bot does not play sound on its own. It sends audio to a small web page, and OBS plays that page as a browser source. Nothing is heard until this step is done.

1. At the top of the dashboard, click **OBS Setup**. Then click **Copy** next to your browser source URL. This URL is private to your channel. Do not paste it in chat or show it on stream.

   ![The OBS Browser Source panel. At the top is the browser source URL with a Copy button beside it. Next is a red caution box with a Regenerate URL button. Last are three expandable setup steps: Add browser source, Control audio via OBS, and Monitor and output.](/assets/images/tts-obs-setup.png)

2. In OBS, add a new **Browser** source. Name it "WildcatTTS". Paste the URL. Width and height do not matter for audio, so the defaults are fine. If you plan to use the Spotlight card described below, keep the width and height at the default 800 by 600 or larger. This is because the card is drawn inside this source.
3. Tick **Control audio via OBS**. If **Shutdown source when not visible** is ticked, TTS will go silent whenever you switch to a scene that does not contain the source. Make sure that it is *not* ticked.
4. In the OBS audio mixer, find WildcatTTS. Click the gear. Open **Advanced Audio Properties**. Set Audio Monitoring to **Monitor and Output**. That means both you and your stream hear it. "Monitor Only" is handy while testing.

Now type `!tts hello` in your own chat. You will hear it.

If you ever think that the URL leaked, **Regenerate URL** in the same panel invalidates the old one. Your OBS source stops working until you paste the new URL in the source properties.

## 4. Decide What Gets Read

This is the main decision. The setting is **TTS Mode** in the **Broadcaster** tab, under "Engine & Mode". Most channels use one of the four options below. A fifth, **Highlighted Messages**, reads only messages that viewers send with Twitch's "Highlight My Message" reward.

![Two rows from the Engine & Mode card. TTS Mode, "Choose which messages trigger TTS", is set to !tts Command Only. Below it, TTS Permission, "Who can use text-to-speech", is set to Everyone.](/assets/images/tts-mode-permission.png)

### Read only `!tts` messages

This is how a new channel starts. Regular chat is silent. When a viewer types `!tts I think you missed a chest back there`, the part after `!tts` is spoken.

Right below it, **TTS Permission** decides whose messages count:

- **Everyone**
- **Subscribers Only** (subs, VIPs, and mods)
- **VIPs Only** (VIPs and mods)
- **Moderators Only**

I suggest this mode for a busy chat. If sensory comfort is a priority, I suggest it too.

### Read every message

Choose **All Messages**. The bot reads each chat message as it arrives. This works well for a smaller chat where you can listen to everything.

The **TTS Permission** setting applies here too, so you can still limit speech to subscribers or VIPs.

Cheers bypass this permission rule. Because the viewer spent bits, the bot reads their message, even for a viewer who does not meet the permission tier. If you want to change that, turn off **Read Cheer Messages** or set **Minimum Bits** in the **Cheers** card.

![The Cheers card. The description says that a cheer is paid for, so its message is read in every TTS Mode. TTS Permission does not limit it. The card has an Announce Cheers toggle and a Read Cheer Messages toggle. Its Minimum Bits field is set to 1.](/assets/images/tts-cheers.png)

If chat gets busy, raising the permission level can be better than turning TTS off. Spotlight, the next mode, is the other way to handle a busy chat. Viewers who do not want to be read can opt out with `!tts ignore`. You can also encourage viewers to use `!myvoice` in chat. It sends them a link to a web page where they can choose a voice and manage channel opt-outs. Mods can add anyone to the ignore list with `!tts ignore add username`.

### Let the bot pick the messages

Choose **Spotlight**. A small model reads chat as it comes in. It picks the few messages worth saying out loud, such as a good joke or a real question for you. TTS reads only those, and each one starts with "Chat spotlight from" and the viewer's name. Most messages are never read, and a quiet stretch of greetings and emotes stays quiet.

Before the bot can pick a message, the message must pass the same rules as in All Messages. **TTS Permission**, the ignore list, and banned words all still apply. `!tts` messages are read as usual. Messages that start with any other `!` are left alone.

Two things are different from the other modes. First, a pick is spoken about eight to ten seconds after the viewer typed it. The bot must see a few messages together before it can choose. Second, the mode only runs while your OBS browser source is open.

When you choose Spotlight, a **Spotlight** card appears on the dashboard with three things in it:

- **What to look for** is a box where you tell the bot what you like, in your own words. "Prefer questions about the game. Skip backseating." is the kind of thing that works. You can ask for more kinds of message, such as cute or silly ones, and you can rule kinds out. The bot never reads sexual or rude messages, personal data, or spam.
- **Show a card in the browser source** puts the viewer's name and message on screen while a pick is read. The card sits in the bottom left corner of the browser source. Drag the source in OBS to where you want the card. Keep it above your game and camera in the Sources list. Do not crop it. Refresh the source once after you turn the card on.
- **Recent picks** lists the last 30 messages the bot chose, each with a short reason.

![The Spotlight card on the dashboard. The What to look for box holds the text "anything silly, fun, opinionated, absurd, cute". The switch Show a card in the browser source is on. Recent picks lists five messages. Each one has the viewer name, the time, and a reason.](/assets/images/chat-spotlight-settings.png)

The [Chat Spotlight post](https://wildcat.chat/blog/posts/chat-spotlight/) goes into more detail on this mode.

### Read only when someone spends bits or channel points

Choose **Bits/Points Only**. Regular chat is silent, and so is `!tts`. Two things trigger speech: a cheer with a message attached, and redemptions of a channel point reward that you set up.

For bits there is nothing to set up: a cheer with a message attached is read out. If you want a floor, set **Minimum Bits** in the **Cheers** card. The bot ignores cheers under it. The bot strips cheermote names like "Cheer100" before it speaks, so you hear the actual words of the viewer.

For channel points, go to **Channel Points → TTS**:

1. Turn on **Enable Channel Points TTS**.
2. Give the reward a title, a cost in points, and a prompt. The default title is "Text-to-Speech Message". The viewer sees the prompt while the viewer redeems the reward.
3. Click **Save**. The bot creates the reward on your Twitch channel. You do not have to make it yourself in the Creator Dashboard. If you already made a reward with the same name by hand, delete it there first. Otherwise, Twitch refuses the duplicate.

![The Channel Points to TTS card. Enable Channel Points TTS is toggled on. The reward title field reads "Text-to-Speech Message". The cost is 1000 points. The viewer prompt is "Share a thought to be read aloud." Skip the Reward Queue is ticked. A collapsed Cooldowns and Moderation section sits below it. At the bottom are Save, Test Redeem, and Disable & Delete buttons.](/assets/images/tts-channel-points.png)

Whatever the viewer types into the redemption is what gets spoken. Links are blocked by default, and a redemption with a blocked link or a banned word is refunded automatically. If the reward gets popular, you can add a global cooldown and per-stream limits under **Cooldowns and Moderation**.

**Skip the Reward Queue** is ticked by default. This means that the message plays the moment it is redeemed. If you want redemptions to wait in your Twitch queue until you accept them, untick it. In that case, also look at **Announce Queued Redeems Immediately** in the Engine & Mode section. It controls whether the bot announces a queued redemption right away or waits for your approval.

### Mixing them

The channel point reward works in every mode, so you can run All Messages, Spotlight or Command Only and still have the reward. Cheer messages are read in every mode too, since someone paid for them. If you do not want that, switch off **Read Cheer Messages** in the **Cheers** card. In Bits/Points Only that switch is locked on, because reading cheers is what the mode is for.

## 5. Pick a Voice

The **Voice Defaults** tab sets the voice your channel uses. There are 2,114 to choose from. Thirty of them speak every language. They carry an **Every language** tag. The rest are individual speakers, each with a language, an accent, and a short description. To search those descriptions, open the voice list and type a few words, such as `german calm low`. Each voice has a play button next to it, so you can hear a sample before you commit.

The default is "Puck". Emotion is there too. You can also pick **Custom…** and write a speaking style in your own words. Pitch and speed are five steps each, from very slow to very fast and from very low to very high.

To hear the result with your current settings, type something into the **Voice preview** card on the right and click **Send preview**. That preview plays in your browser, not through OBS.

![The Voice Defaults tab. It has rows for Default Voice, Default Emotion, Default Pitch, Default Speed, Voice Volume and Default Language. Default Voice is set to Digital Assistant 2. Default Emotion is set to Neutral. Default Pitch and Default Speed are five buttons each, with Normal selected. Voice Volume is a slider with a Reset button. Default Language is set to English.](/assets/images/tts-voice-defaults.png)

![The Default Voice picker open. At the top are a search box, filters for language, gender and pitch, and a checkbox. The checkbox is labeled Only voices that speak every language. Below, 2,114 voices are listed, such as Digital Assistant 2, Achernar and Achird. Each voice has a description, tags, and a purple play button to its right.](/assets/images/tts-voice-picker.png)

Viewers can pick their own voice. Typing `!myvoice` in chat gives them a link to the viewer settings page with your channel loaded. There they can choose a voice, a speaking style, pitch, speed, and language that follows them across channels. They can also manage channel opt-outs on that page. If you want everyone to sound the same, turn off **Allow Viewer Voice Preferences**.

If your chat is not in English, set **Default Language**. The voice works out the language of most messages without help. The setting is a hint for short or unclear text, such as a number. If you never touch **Default Language**, the bot reads the language that you declared on Twitch and fills it in for you. Announcements come out in that language too. The [40 languages post](https://wildcat.chat/blog/posts/multilingual-tts/) has more on that.

## 6. Things That Are On by Default

A few behaviors are switched on from the start. Read about them before your first stream, so nothing surprises you.

The bot announces subs, resubs, gift subs, raids, cheers, and follows. Follows are anonymized ("Someone new just followed") unless you turn that off. Each of these has its own toggle in the dashboard. The cheer toggle lives in the Cheers card, and the rest are under Engine & Mode. The command `!tts events off` turns all of them off at once.

The bot answers commands in chat. For example, it replies to `!tts status` with the current settings. If you do not want the bot to post anything, turn off **Bot Responds in Chat**. TTS keeps working. The bot only stops talking in text.

The bot expands about 70 chat acronyms before it speaks, so `ngl` reads as "not gonna lie". The profanity filter is *off* by default. Turn it on in the dashboard or with `!tts profanity block`. The [pronunciation and profanity post](https://wildcat.chat/blog/posts/pronunciation-and-profanity-filter/) covers both.

## Commands You'll Use Mid-Stream

```
!tts off            pause everything (mods)
!tts on             turn it back on (mods)
!tts mode all       enable all messages (mods)
!tts mode command   enable only !tts messages (mods)
!tts mode spotlight let the bot pick which messages to read (mods)
!tts mode bits      enable only bits and channel points (mods)
!tts stop           cut off whatever is playing right now
!tts clear          drop everything waiting in the queue (mods)
!tts pause          hold the queue without losing it (mods)
!tts resume         let it go again (mods)
!tts status         what mode and voice are set, and how long the queue is
```

Anyone can `!tts stop` their own message. Mods can stop anything.

## If Nothing Happens

Work through these in order. The first three cover most cases.

1. Is the OBS browser source in your current scene, unmuted, and set to Monitor and Output?
2. Type `!tts status` in chat. If the bot does not answer, it is not in your channel yet. In that case, make sure that **Service** at the top of the dashboard says Active. Then type `/mod WildcatTTS` in chat to be safe.
3. If it answers but says the engine is off, type `!tts on`.
4. Look at the mode. In Command Only, regular chat is meant to be silent. In Spotlight, most of it is too, and a pick comes several seconds after the message. In Bits/Points Only, cheers below the minimum are silent as well.
5. If you regenerated the browser source URL at some point, OBS still has the old one.

The [full documentation](https://docs.wildcat.chat/wildcatttsdocs.html) has every command and setting, and the [troubleshooting section](https://docs.wildcat.chat/tts-troubleshooting.html#troubleshooting) covers the rarer cases. If you are stuck, [get in touch](https://parfaitfair.com/#contact).
