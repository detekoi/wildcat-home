---
title: "Bug Fix: WildcatSage Settings Persistence"
date: 2026-01-24
description: "Fixed issues causing dashboard settings to reset unexpectedly, specifically affecting ad break notifications and auto-chat/ad notification conflicts."
---

Fixed issues causing dashboard settings to reset unexpectedly:
 - Ad break notifications were being disabled on bot deploys/syncs
 - Auto-chat and ad notification settings were overwriting each other when either was changed

Both issues are now resolved. Your preferences will persist correctly. You may want to log in to [https://app.wildcat.chat/](https://app.wildcat.chat/) and double-check your auto-chat and ad notification settings.
