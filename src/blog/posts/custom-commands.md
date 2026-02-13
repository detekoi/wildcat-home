---
title: "New WildcatSage Feature: Custom Commands"
date: 2026-02-11
description: "WildcatSage now supports custom commands. Create your own `!commands` with dynamic responses."
---

WildcatSage now supports custom commands. Create your own `!commands` with dynamic responses.

### What You Can Do

- **Add commands** — `!command add hello Hello $(user), welcome to the stream!`
- **Edit commands** — `!command edit hello` to update the response.
- **Remove commands** — `!command remove hello`
- **Set permissions** — Restrict commands to subs, VIPs, mods, or everyone.
- **Set cooldowns** — Prevent spam with per-command cooldowns.

### Dynamic Response Variables

Make your commands come alive with variables that fill in automatically:

- `$(user)` — Name of whoever used the command.
- `$(channel)` — Your channel name.
- `$(args)` — Everything typed after the command.
- `$(count)` — How many times the command has been used.
- `$(uptime)` — Current stream uptime.
- `$(game)` — Current game/category.
- `$(followage)` — How long the user has followed.
- `$(random X-Y)` — A random number in a range.

Full variable docs & examples:  
[https://docs.wildcat.chat/botcommands.html#response-variables](https://docs.wildcat.chat/botcommands.html#response-variables)

### Web Dashboard

Manage your custom commands through the [web dashboard](https://app.wildcat.chat)

Add, edit, and configure commands with clickable variable chips — no chat commands needed.
