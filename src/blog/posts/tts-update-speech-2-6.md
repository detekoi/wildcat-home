---
title: "TTS Update: Speech 2.6 Turbo"
date: 2025-11-26
description: "I've migrated the ChatVibes Text-to-Speech engine to Speech 2.6 Turbo (MiniMax via 302.ai). This model succeeds Speech-02 and provides improvements in latency, prosody, and multilingual handling."
---

I've migrated the ChatVibes Text-to-Speech engine to **Speech 2.6 Turbo** (MiniMax via 302.ai). This model succeeds Speech-02 and provides improvements in latency, prosody, and multilingual handling.

## What's New

### Audio Quality and Prosody
Speech 2.6 produces smoother phrasing and more stable prosody than Speech-02. It also handles structured text (numbers, URLs, dates) more cleanly.

### Language Coverage
Speech 2.6 supports a broad multilingual set (40+ languages and dialects, per MiniMax documentation). Performance varies by language, so users who rely on non-English output may want to test their specific cases.

### Voice Compatibility
Not all existing voice IDs are supported by Speech 2.6. Supported voices have already been upgraded automatically. Unsupported voices continue using the legacy Speech-02 engine.

### Reliability and Fallback
If Speech 2.6 encounters service issues, the system automatically falls back to Speech-02 (via Wavespeed) to maintain continuity.

## What You Need To Do
No action is required.  
- Your current voice settings carry over.  
- Supported voices now use Speech 2.6.  
- Unsupported voices remain on Speech-02.  
- Language options are available in **Viewer Preferences** and the **Channel Dashboard**.
