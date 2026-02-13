---
title: "Update: Better cheer handling & controls"
date: 2025-12-29
description: "I've improved how the bot handles Cheer events to squash some bugs and give you more control, including smarter cheer reading and a new 'Announce Cheers' toggle."
---

I've improved how the bot handles Cheer events to squash some bugs and give you more control.

### what's new:
*   **Smarter Cheer Reading:** The bot now intelligently filters out cheermote names (like `Cheer1`, `Party1`, `Pride1`) from the message. It will only read your viewer's actual text—no more "party one pride one"!
*   **New "Announce Cheers" Toggle:** You can now separate cheer alerts from other events on the web UI.
    *   Want the bot to read the chat message but *skip* the "User cheered 100 bits!" announcement? You can now toggle off **Announce Cheers** in the dashboard while keeping the bits reading active.

### how to use:
1.  Go to your [**Dashboard**](https://tts.wildcat.chat/dashboard.html).
2.  Look under the **Broadcaster** tab.
3.  Find the new **Announce Cheers** toggle (under "Announce Events").
