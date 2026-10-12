---
name: OpenAI provider choice
description: Why the student-housing assistant uses direct OpenAI access rather than Replit's managed AI integration.
---

**Rule:** Keep the student-housing assistant on server-side OpenAI access using the project's `OPENAI_API_KEY`. Do not retry the managed AI integration setup without the user's direction.

**Why:** On October 12, 2026, the user declined the managed integration upgrade and chose to provide an OpenAI key through the secure Secrets flow.

**How to apply:** Keep the key out of the browser, prompts, logs, and source control. Changing the provider or billing path requires checking with the user first.
