---
title: "New: Daily Check-In with Channel Points"
date: 2026-03-05
description: "Viewers can now check in daily using a Channel Point Reward. Track streaks, use response variables, or let AI generate a unique message for every check-in."
---

WildcatSage now supports **Daily Check-In** — a Channel Point Reward that lets viewers check in once per stream and track their streak.

### How It Works

Open the [web dashboard](https://app.wildcat.chat/), scroll to **Daily Check-In**, and flip the toggle. Set a title, a Channel Point cost, and a response template. The reward is automatically created on Twitch — no need to copy any IDs.

![WildcatSage dashboard showing the Daily Check-In configuration card. The enable toggle is on, the reward title is set to "Daily Check-In" with a cost of 1 Channel Point. AI Mode is enabled with a prompt that reads "Write a cute, humorous message for $(user) checking in #$(checkin_count) times." Below the prompt are clickable variable chips for $(user), $(checkin_count), and $(channel), followed by Save and Delete Reward buttons.](/assets/images/ai-daily-check-in.png)

When a viewer redeems the reward, the bot replies with their running total:

> *"WildcatGamer checked in! Day #14 🎉"*

### AI Mode

Toggle **AI Mode** to generate a unique message every check-in. Write a prompt using response variables and the bot will produce something fresh each time:

> *"Congrats WildcatGamer — 14 days strong! At this rate you'll outlast the sun. ☀️"*

### Response Variables

Use `$(user)`, `$(checkin_count)`, and `$(channel)` in your template or AI prompt:

| Variable | What it does |
|---|---|
| `$(user)` | Viewer's display name |
| `$(checkin_count)` | Their running check-in count |
| `$(channel)` | Channel name |

### Requirements

- **Twitch Affiliate or Partner** status (required for Channel Point Rewards)
- You may need to **re-authenticate** once to grant the new `channel:manage:redemptions` permission
```markdown

Full docs:  
[https://docs.wildcat.chat/botcommands.html#daily-check-in](https://docs.wildcat.chat/botcommands.html#daily-check-in)
```
