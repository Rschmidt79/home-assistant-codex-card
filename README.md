# Home Assistant Codex Card

A standalone Lovelace chat card for the [Home Assistant Codex CLI Worker integration](https://github.com/moryoav/home-assistant-codex).

The card gives you a direct Codex task interface inside a Home Assistant dashboard while keeping the worker and integration unchanged.

## Features

- Start Codex tasks directly from Lovelace.
- Follow queued, starting, and running tasks automatically.
- Restore the latest task after a dashboard or frontend reload.
- Display full task details and summaries.
- Follow new messages only while the conversation is already at the bottom.
- Keep the viewport stable while reading history and offer a **Latest** shortcut.
- Reply when Codex actually enters a waiting-for-input state.
- Recover gracefully from transient HTTP 409 conflicts while replying.
- Ignore stale question text after a task has already resumed.
- Keep a failed reply in the text box so it is not lost.
- Show the current/reported Codex model when available.
- Show remaining 5-hour and weekly Codex usage directly in the card.
- Show reset information in the usage tooltips.
- Highlight low remaining quota below 25% and critical quota at 10% or below.
- Stop active tasks.
- Clear the card conversation without deleting worker tasks.
- Retry temporary polling failures silently without Home Assistant error toasts.
- Use Home Assistant theme variables with a responsive layout.
- No external JavaScript dependencies.

## Requirements

Install and configure the worker and integration from:

- [moryoav/home-assistant-codex](https://github.com/moryoav/home-assistant-codex)

This repository contains only the optional dashboard card. It does not include or replace the worker or integration.

For the usage display, the card uses the entities exposed by the Codex integration:

- `sensor.codex_5_hour_limit`
- `sensor.codex_5_hour_reset`
- `sensor.codex_weekly_limit`
- `sensor.codex_weekly_reset`

Task restoration uses:

- `sensor.codex_last_task`

If a usage entity is missing or unavailable, the card continues to work and displays `—` for that value.

## Installation

1. Download [`codex-prompt-card.js`](codex-prompt-card.js).
2. Copy it to:

   ```text
   /config/www/codex-prompt-card.js
   ```

3. In Home Assistant, open **Settings → Dashboards**.
4. Open the top-right menu and select **Resources**.
5. Add the following as a **JavaScript module**:

   ```text
   /local/codex-prompt-card.js?v=3
   ```

6. Add the card to a dashboard:

   ```yaml
   type: custom:codex-prompt-card
   ```

## Full-screen / panel layout

For a dedicated full-screen chat, create a Home Assistant **Panel** view and enable the card's full-height layout:

```yaml
type: custom:codex-prompt-card
full_height: true
```

The header and composer remain visible while the conversation uses the remaining screen height and scrolls independently. Leave `full_height` out, or set it to `false`, when the card shares a view with other cards.

## Conversation scrolling

The card follows new messages only while the conversation is already at, or very close to, the bottom. If you scroll up to read earlier messages, polling and new task updates leave the viewport in place.

A **Latest** button appears when the conversation is away from the bottom. It is highlighted when a new message has arrived and returns the conversation to the latest message when selected.

## Model and usage display

By default the card tries to obtain the model name from the `raw_excerpt` attribute exposed by the Codex usage sensors.

If the integration does not report a model there, the card displays `Model Auto`. You can set a manual label if you prefer:

```yaml
type: custom:codex-prompt-card
full_height: true
model_label: gpt-5.6-codex
```

The usage entities can also be overridden if your entity IDs differ:

```yaml
type: custom:codex-prompt-card
five_hour_entity: sensor.codex_5_hour_limit
five_hour_reset_entity: sensor.codex_5_hour_reset
weekly_entity: sensor.codex_weekly_limit
weekly_reset_entity: sensor.codex_weekly_reset
```

The percentages shown are the remaining quota reported by the Codex integration.

## Reply handling and HTTP 409

The Codex worker only accepts `reply_task` while a task is actually waiting for input.

A task can still contain its previous `question` text after the reply has been accepted and the task has returned to `queued` or `running`. The card therefore uses the task **status**, rather than the presence of `task.question`, to decide whether Reply mode should be active.

If the worker returns HTTP 409 during a reply, the card briefly re-checks the task state and retries when the task is still waiting. If the task has already resumed, the card follows the running task instead of sending the same reply again.

If the reply still cannot be accepted, the text is restored to the composer so it can be retried without retyping it.

Expected HTTP 409 responses are handled inside the card and do not produce intermediate Home Assistant error notifications. A final reply failure is still shown clearly in the conversation.

## Task restoration

After a frontend reload, task states are restored explicitly:

- `queued`, `starting`, `running`: Working mode and polling resume.
- `needs_input`, `waiting`, `waiting_for_input`, `question`: Waiting/Reply mode.
- `completed`: final details or summary.
- `cancelled`, `canceled`: cancelled result.
- `failed`, `error`: error result.
- Unknown states are shown as errors and are never treated as completed.

Temporary `get_task` connection failures are retried with a bounded backoff. Background polling and task restoration do not show Home Assistant error toasts, while failures from explicit **Send**, **Reply**, and **Stop** actions remain visible to the user.

## Current conversation limitation

The worker API supports replying to a task while it is waiting for input, but a completely finished task cannot currently be continued as an open-ended chat thread through this card.

After a task reaches `completed`, the next message starts a new Codex task. Supporting a true continuous ChatGPT-style conversation would require an additional resume/continue API in the worker integration.

## Clear and Stop

**Clear** resets only the conversation shown in this card. It does not cancel or delete work in the Codex worker.

**Stop** requests cancellation of the active worker task.

## Updating

Replace `/config/www/codex-prompt-card.js` with the new version, then increment the resource query value, for example:

```text
/local/codex-prompt-card.js?v=3
```

Incrementing the value prevents Home Assistant and the browser from continuing to use an older cached copy. A Home Assistant restart is normally not required.

## Development tests

The automated tests cover intelligent scrolling, silent polling recovery, stale task responses, active-task send guards, and HTTP 409 reply recovery.

```bash
pnpm install
pnpm test
```

## Security

Codex can modify Home Assistant configuration when the worker has permission to do so. Review prompts and results carefully, keep backups, and test changes safely.

## License

MIT
