class CodexPromptCard extends HTMLElement {
  setConfig(config) {
    this.config = config;

    this._hass = null;
    this._activeTaskId = null;
    this._waitingTaskId = null;
    this._displayedTaskId = null;

    this._pollTimer = null;
    this._pollBusy = false;
    this._cancelling = false;

    this._messages = [];
    this._initialTaskLoaded = false;

    this.innerHTML = `
      <ha-card class="${config.full_height ? "full-height" : ""}">
        <div class="wrap">

          <div class="header">
            <div class="header-main">
              <ha-icon icon="mdi:robot-outline"></ha-icon>

              <div class="header-text">
                <div class="title">Codex</div>
                <div class="subtitle">Home Assistant AI assistant</div>
              </div>
            </div>

            <div class="header-actions">
              <button
                id="clear"
                class="clear-button"
                title="Clear conversation"
              >
                Clear
              </button>

              <div id="topStatus" class="status-badge ready">
                Ready
              </div>
            </div>
          </div>

          <div id="conversation" class="conversation">
            <div id="emptyState" class="empty-state">
              <ha-icon icon="mdi:message-text-outline"></ha-icon>
              <div>Write a task for Codex below.</div>
            </div>
          </div>

          <div id="workingIndicator" class="working-indicator hidden">
            <div class="working-dot"></div>
            <div class="working-dot"></div>
            <div class="working-dot"></div>
            <span id="workingText">Codex is working</span>
          </div>

          <div class="composer">
            <div id="inputLabel" class="input-label">
              New task
            </div>

            <textarea
              id="prompt"
              rows="4"
              placeholder="Write a task for Codex..."
            ></textarea>

            <div class="composer-footer">
              <div id="statusText">
                Cmd/Ctrl + Enter to send
              </div>

              <div class="action-buttons">
                <button
                  id="stop"
                  class="stop-button hidden"
                  title="Stop current task"
                >
                  Stop
                </button>

                <button
                  id="send"
                  class="send-button"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

        </div>
      </ha-card>

      <style>
        ha-card {
          overflow: hidden;
          user-select: text;
          -webkit-user-select: text;
        }

        ha-card.full-height {
          box-sizing: border-box;
          height: calc(100dvh - var(--header-height, 56px));
        }

        .wrap {
          padding: 16px;
        }

        .full-height .wrap {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          margin-bottom: 12px;
        }

        .header-main {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .header-main ha-icon {
          --mdc-icon-size: 27px;
          color: var(--primary-color);
        }

        .header-text {
          min-width: 0;
        }

        .title {
          font-size: 20px;
          font-weight: 500;
        }

        .subtitle {
          margin-top: 1px;
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }

        .status-badge {
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          white-space: nowrap;
        }

        .status-badge.running {
          color: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 12%,
            var(--card-background-color)
          );
        }

        .status-badge.waiting {
          color: var(--warning-color, #ff9800);
          background: color-mix(
            in srgb,
            var(--warning-color, #ff9800) 12%,
            var(--card-background-color)
          );
        }

        .status-badge.error {
          color: var(--error-color, #f44336);
          background: color-mix(
            in srgb,
            var(--error-color, #f44336) 12%,
            var(--card-background-color)
          );
        }

        .status-badge.cancelling {
          color: var(--warning-color, #ff9800);
          background: color-mix(
            in srgb,
            var(--warning-color, #ff9800) 12%,
            var(--card-background-color)
          );
        }

        .clear-button {
          border: none;
          background: transparent;
          color: var(--secondary-text-color);
          font: inherit;
          font-size: 11px;
          padding: 5px 7px;
          cursor: pointer;
          border-radius: 8px;
        }

        .clear-button:hover:not(:disabled) {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }

        .clear-button:disabled {
          opacity: 0.4;
          cursor: default;
        }

        .conversation {
          height: 330px;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 3px 5px 3px 1px;
          margin-bottom: 8px;
          scroll-behavior: smooth;

          scrollbar-width: thin;
          scrollbar-color:
            color-mix(
              in srgb,
              var(--secondary-text-color) 25%,
              transparent
            )
            transparent;

          user-select: text;
          -webkit-user-select: text;
        }

        .full-height .conversation {
          flex: 1 1 auto;
          min-height: 0;
          height: auto;
        }

        .conversation::-webkit-scrollbar {
          width: 4px;
        }

        .conversation::-webkit-scrollbar-track {
          background: transparent;
        }

        .conversation::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: color-mix(
            in srgb,
            var(--secondary-text-color) 25%,
            transparent
          );
        }

        .empty-state {
          box-sizing: border-box;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 8px;
          text-align: center;
          font-size: 13px;
          color: var(--secondary-text-color);
          user-select: none;
        }

        .empty-state ha-icon {
          --mdc-icon-size: 28px;
          opacity: 0.55;
        }

        .message-row {
          display: flex;
          margin: 7px 0;
          user-select: text;
          -webkit-user-select: text;
        }

        .message-row.user {
          justify-content: flex-end;
        }

        .message-row.codex {
          justify-content: flex-start;
        }

        .bubble {
          box-sizing: border-box;
          max-width: 90%;
          padding: 9px 12px;
          border-radius: 14px;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
        }

        .bubble.user {
          max-width: 82%;
          background: color-mix(
            in srgb,
            var(--primary-color) 15%,
            var(--card-background-color)
          );
          border-bottom-right-radius: 5px;
        }

        .bubble.codex {
          background: var(--secondary-background-color);
          border-bottom-left-radius: 5px;
        }

        .bubble.question {
          border-left: 3px solid var(--warning-color, #ff9800);
        }

        .bubble.error {
          border-left: 3px solid var(--error-color, #f44336);
        }

        .bubble.cancelled {
          border-left: 3px solid var(--secondary-text-color);
        }

        .bubble-label {
          margin-bottom: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--secondary-text-color);
          user-select: text;
          -webkit-user-select: text;
        }

        .bubble-text {
          font-size: 14px;
          user-select: text;
          -webkit-user-select: text;
          cursor: text;
        }

        .bubble-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 12px;
          margin-top: 7px;
          font-size: 9px;
          color: var(--secondary-text-color);
          opacity: 0.75;
          user-select: text;
          -webkit-user-select: text;
        }

        .bubble-meta {
          white-space: nowrap;
        }

        .bubble-task {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: right;
          opacity: 0.65;
        }

        .working-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          min-height: 22px;
          margin: 1px 4px 9px;
          font-size: 11px;
          color: var(--secondary-text-color);
          user-select: none;
        }

        .working-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--primary-color);
          opacity: 0.35;
          animation: codexPulse 1.25s infinite ease-in-out;
        }

        .working-dot:nth-child(2) {
          animation-delay: 0.15s;
        }

        .working-dot:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes codexPulse {
          0%,
          60%,
          100% {
            opacity: 0.25;
            transform: translateY(0);
          }

          30% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }

        .composer {
          border-top: 1px solid
            color-mix(
              in srgb,
              var(--divider-color) 70%,
              transparent
            );
          padding-top: 11px;
        }

        .input-label {
          margin-bottom: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color);
        }

        textarea {
          box-sizing: border-box;
          display: block;
          width: 100%;
          min-height: 100px;
          max-height: 240px;
          resize: vertical;
          padding: 11px 12px;
          border-radius: 13px;
          border: 1px solid var(--divider-color);

          background: color-mix(
            in srgb,
            var(--card-background-color) 92%,
            var(--secondary-background-color)
          );

          color: var(--primary-text-color);
          font: inherit;
          font-size: 14px;
          line-height: 1.45;
          outline: none;
        }

        textarea:focus {
          border-color: var(--primary-color);
        }

        textarea:disabled {
          opacity: 0.65;
        }

        .composer-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
        }

        #statusText {
          min-width: 0;
          font-size: 11px;
          color: var(--secondary-text-color);
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }

        .send-button,
        .stop-button {
          border: none;
          border-radius: 11px;
          padding: 9px 16px;
          font: inherit;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        .send-button {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }

        .stop-button {
          background: transparent;
          color: var(--error-color, #f44336);
          border: 1px solid
            color-mix(
              in srgb,
              var(--error-color, #f44336) 45%,
              transparent
            );
        }

        .stop-button:hover:not(:disabled) {
          background: color-mix(
            in srgb,
            var(--error-color, #f44336) 10%,
            transparent
          );
        }

        .send-button:hover:not(:disabled) {
          filter: brightness(1.05);
        }

        .send-button:disabled,
        .stop-button:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .hidden {
          display: none !important;
        }

        @media (max-width: 500px) {
          .wrap {
            padding: 14px;
          }

          .conversation {
            height: 290px;
          }

          .full-height .conversation {
            height: auto;
          }

          .bubble {
            max-width: 95%;
          }

          .bubble.user {
            max-width: 90%;
          }

          .subtitle {
            display: none;
          }

          .bubble-task {
            max-width: 120px;
          }

          .composer-footer {
            align-items: flex-end;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .conversation {
            scroll-behavior: auto;
          }

          .working-dot {
            animation: none;
          }
        }
      </style>
    `;

    this.querySelector("#send").addEventListener(
      "click",
      () => this.handleSend()
    );

    this.querySelector("#stop").addEventListener(
      "click",
      () => this.cancelCurrentTask()
    );

    this.querySelector("#clear").addEventListener(
      "click",
      () => this.clearConversation()
    );

    this.querySelector("#prompt").addEventListener(
      "keydown",
      event => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === "Enter"
        ) {
          event.preventDefault();
          this.handleSend();
        }
      }
    );
  }

  set hass(hass) {
    this._hass = hass;

    if (
      !this._initialTaskLoaded &&
      !this._activeTaskId
    ) {
      const lastTask =
        hass.states["sensor.codex_last_task"];

      const taskId =
        lastTask?.attributes?.task_id;

      this._initialTaskLoaded = true;

      if (taskId) {
        this.loadLatestTask(taskId);
      }
    }
  }

  async handleSend() {
    if (!this._hass || this._cancelling) {
      return;
    }

    const textarea =
      this.querySelector("#prompt");

    const text =
      textarea.value.trim();

    if (!text) {
      return;
    }

    if (this._waitingTaskId) {
      await this.replyToTask(
        this._waitingTaskId,
        text
      );

      return;
    }

    await this.startTask(text);
  }

  async startTask(prompt) {
    this.stopPolling();

    this.addMessage(
      "user",
      prompt
    );

    this.setWorking(
      true,
      "Sending"
    );

    this.querySelector("#prompt").value = "";

    try {
      const response =
        await this.callServiceWithResponse(
          "codex_cli",
          "start_task",
          {
            prompt
          }
        );

      const taskId =
        response?.task_id ||
        response?.task?.task_id;

      if (!taskId) {
        throw new Error(
          "Codex started the task but did not return a task_id."
        );
      }

      this._activeTaskId =
        taskId;

      this._cancelling =
        false;

      this.setWorking(
        true,
        "Working"
      );

      this.scrollConversationToBottom();

      await this.pollTask();
    }

    catch (error) {
      console.error(
        "Codex start_task failed:",
        error
      );

      this.addMessage(
        "codex",
        `Could not start the task.\n\n${this.errorText(error)}`,
        {
          error: true
        }
      );

      this._activeTaskId =
        null;

      this.setWorking(
        false,
        "Error",
        "error"
      );
    }
  }

  async replyToTask(
    taskId,
    reply
  ) {
    this.addMessage(
      "user",
      reply
    );

    this.querySelector("#prompt").value = "";

    this.setWorking(
      true,
      "Sending"
    );

    try {
      const response =
        await this.callServiceWithResponse(
          "codex_cli",
          "reply_task",
          {
            task_id: taskId,
            reply
          }
        );

      const returnedTaskId =
        response?.task_id ||
        response?.task?.task_id ||
        taskId;

      this._waitingTaskId =
        null;

      this._activeTaskId =
        returnedTaskId;

      this._cancelling =
        false;

      this.setInputMode(false);

      this.setWorking(
        true,
        "Working"
      );

      await this.pollTask();
    }

    catch (error) {
      console.error(
        "Codex reply_task failed:",
        error
      );

      this.addMessage(
        "codex",
        `Could not send the reply.\n\n${this.errorText(error)}`,
        {
          error: true
        }
      );

      this.setWorking(
        false,
        "Error",
        "error"
      );
    }
  }

  async cancelCurrentTask() {
    if (
      !this._hass ||
      !this._activeTaskId ||
      this._cancelling
    ) {
      return;
    }

    const taskId =
      this._activeTaskId;

    this._cancelling =
      true;

    this.setCancellingUI();

    try {
      await this.callServiceWithResponse(
        "codex_cli",
        "cancel_task",
        {
          task_id: taskId
        }
      );

      /*
       * Do not assume cancellation is immediate.
       * Keep polling the same task until the worker
       * reports a terminal state.
       */
      this.querySelector(
        "#statusText"
      ).textContent =
        "Cancellation requested — waiting for worker…";

      this.schedulePoll(1000);
    }

    catch (error) {
      console.error(
        "Codex cancel_task failed:",
        error
      );

      this._cancelling =
        false;

      this.addMessage(
        "codex",
        `Could not stop the task.\n\n${this.errorText(error)}`,
        {
          error: true
        }
      );

      this.setWorking(
        true,
        "Working"
      );

      this.schedulePoll();
    }
  }

  async pollTask() {
    if (
      !this._hass ||
      !this._activeTaskId ||
      this._pollBusy
    ) {
      return;
    }

    this._pollBusy = true;

    try {
      const response =
        await this.callServiceWithResponse(
          "codex_cli",
          "get_task",
          {
            task_id:
              this._activeTaskId
          }
        );

      const task =
        response?.task ||
        response;

      if (!task) {
        throw new Error(
          "The worker returned no task data."
        );
      }

      const status =
        String(
          task.status || ""
        ).toLowerCase();

      if (
        task.question ||
        status === "needs_input" ||
        status === "waiting"
      ) {
        this.addMessage(
          "codex",
          task.question ||
            "I need your input before I can continue.",
          {
            question: true,
            meta:
              "Waiting for reply",
            taskId:
              task.task_id
          }
        );

        this._waitingTaskId =
          task.task_id;

        this._activeTaskId =
          null;

        this._cancelling =
          false;

        this.stopPolling();

        this.setInputMode(true);

        this.setWorking(
          false,
          "Waiting",
          "waiting"
        );

        return;
      }

      if (status === "completed") {
        const text =
          task.details ||
          task.summary ||
          "The task is complete.";

        this.addMessage(
          "codex",
          text,
          {
            meta:
              this.buildShortMeta(task),

            taskId:
              task.task_id
          }
        );

        this._displayedTaskId =
          task.task_id;

        this._activeTaskId =
          null;

        this._cancelling =
          false;

        this.stopPolling();

        this.setInputMode(false);

        this.setWorking(
          false,
          "Ready",
          "ready"
        );

        return;
      }

      if (
        [
          "cancelled",
          "canceled"
        ].includes(status)
      ) {
        this.addMessage(
          "codex",
          task.details ||
            task.summary ||
            "The task was cancelled.",
          {
            cancelled: true,
            meta:
              "Cancelled",
            taskId:
              task.task_id
          }
        );

        this._displayedTaskId =
          task.task_id;

        this._activeTaskId =
          null;

        this._cancelling =
          false;

        this.stopPolling();

        this.setInputMode(false);

        this.setWorking(
          false,
          "Ready",
          "ready"
        );

        return;
      }

      if (
        [
          "failed",
          "error"
        ].includes(status)
      ) {
        this.addMessage(
          "codex",
          task.error ||
            task.details ||
            "The task failed.",
          {
            error: true,
            meta:
              this.buildShortMeta(task),
            taskId:
              task.task_id
          }
        );

        this._activeTaskId =
          null;

        this._cancelling =
          false;

        this.stopPolling();

        this.setWorking(
          false,
          "Error",
          "error"
        );

        return;
      }

      /*
       * Still running or cancelling.
       */
      if (this._cancelling) {
        this.setCancellingUI();
      }

      else {
        this.setWorking(
          true,
          "Working"
        );
      }

      this.schedulePoll(
        this._cancelling
          ? 1000
          : 2500
      );
    }

    catch (error) {
      console.error(
        "Codex polling failed:",
        error
      );

      this.querySelector(
        "#statusText"
      ).textContent =
        "Connection interrupted — retrying…";

      this.schedulePoll(5000);
    }

    finally {
      this._pollBusy =
        false;
    }
  }

  schedulePoll(
    delay = 2500
  ) {
    this.stopPolling();

    if (!this._activeTaskId) {
      return;
    }

    this._pollTimer =
      setTimeout(
        () => this.pollTask(),
        delay
      );
  }

  stopPolling() {
    if (!this._pollTimer) {
      return;
    }

    clearTimeout(
      this._pollTimer
    );

    this._pollTimer =
      null;
  }

  async loadLatestTask(
    taskId
  ) {
    if (
      !this._hass ||
      !taskId
    ) {
      return;
    }

    try {
      const response =
        await this.callServiceWithResponse(
          "codex_cli",
          "get_task",
          {
            task_id:
              taskId
          }
        );

      const task =
        response?.task ||
        response;

      if (!task) {
        return;
      }

      if (task.prompt) {
        this.addMessage(
          "user",
          task.prompt
        );
      }

      const status =
        String(
          task.status || ""
        ).toLowerCase();

      if (
        [
          "queued",
          "starting",
          "running"
        ].includes(status)
      ) {
        this._activeTaskId =
          task.task_id;

        this._waitingTaskId =
          null;

        this._cancelling =
          false;

        this.setInputMode(false);

        this.setWorking(
          true,
          "Working"
        );

        this.schedulePoll();
      }

      else if (
        task.question ||
        [
          "needs_input",
          "waiting",
          "waiting_for_input",
          "question"
        ].includes(status)
      ) {
        this.addMessage(
          "codex",
          task.question ||
            "I need your input before I can continue.",
          {
            question: true,
            meta:
              "Waiting for reply",
            taskId:
              task.task_id
          }
        );

        this._waitingTaskId =
          task.task_id;

        this._activeTaskId =
          null;

        this._cancelling =
          false;

        this.stopPolling();

        this.setInputMode(true);

        this.setWorking(
          false,
          "Waiting",
          "waiting"
        );
      }

      else if (
        status === "completed"
      ) {
        this.addMessage(
          "codex",
          task.details ||
            task.summary ||
            "The task is complete.",
          {
            meta:
              this.buildShortMeta(task),

            taskId:
              task.task_id
          }
        );

        this.setWorking(
          false,
          "Ready",
          "ready"
        );
      }

      else if (
        [
          "cancelled",
          "canceled"
        ].includes(status)
      ) {
        this.addMessage(
          "codex",
          task.details ||
            task.summary ||
            "The task was cancelled.",
          {
            cancelled: true,
            meta:
              "Cancelled",
            taskId:
              task.task_id
          }
        );

        this.setWorking(
          false,
          "Ready",
          "ready"
        );
      }

      else if (
        [
          "failed",
          "error"
        ].includes(status)
      ) {
        this.addMessage(
          "codex",
          task.error ||
            task.details ||
            "The task failed.",
          {
            error: true,
            meta:
              this.buildShortMeta(task),

            taskId:
              task.task_id
          }
        );

        this.setWorking(
          false,
          "Error",
          "error"
        );
      }

      else {
        this.addMessage(
          "codex",
          `Unknown task status: ${status || "missing"}.`,
          {
            error: true,
            meta:
              "Unknown status",
            taskId:
              task.task_id
          }
        );

        this.setWorking(
          false,
          "Error",
          "error"
        );
      }

      this._displayedTaskId =
        task.task_id;
    }

    catch (error) {
      console.error(
        "Could not load latest Codex task:",
        error
      );
    }
  }

  clearConversation() {
    if (
      this._activeTaskId ||
      this._cancelling
    ) {
      return;
    }

    this._messages = [];

    this._waitingTaskId =
      null;

    this._displayedTaskId =
      null;

    this.setInputMode(false);

    const textarea =
      this.querySelector("#prompt");

    textarea.value = "";

    const conversation =
      this.querySelector("#conversation");

    conversation.innerHTML = `
      <div id="emptyState" class="empty-state">
        <ha-icon icon="mdi:message-text-outline"></ha-icon>
        <div>Write a task for Codex below.</div>
      </div>
    `;

    this.setWorking(
      false,
      "Ready",
      "ready"
    );
  }

  addMessage(
    role,
    text,
    options = {}
  ) {
    if (!text) {
      return;
    }

    this._messages.push({
      id:
        `${Date.now()}-${Math.random()}`,

      role,

      text,

      meta:
        options.meta || "",

      question:
        Boolean(
          options.question
        ),

      error:
        Boolean(
          options.error
        ),

      cancelled:
        Boolean(
          options.cancelled
        ),

      taskId:
        options.taskId || ""
    });

    this.renderMessages();
  }

  renderMessages() {
    const conversation =
      this.querySelector(
        "#conversation"
      );

    if (
      this._messages.length === 0
    ) {
      return;
    }

    conversation.innerHTML =
      "";

    for (
      const message
      of this._messages
    ) {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        `message-row ${message.role}`;

      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        `bubble ${message.role}`;

      if (message.question) {
        bubble.classList.add(
          "question"
        );
      }

      if (message.error) {
        bubble.classList.add(
          "error"
        );
      }

      if (message.cancelled) {
        bubble.classList.add(
          "cancelled"
        );
      }

      const label =
        document.createElement(
          "div"
        );

      label.className =
        "bubble-label";

      label.textContent =
        message.role === "user"
          ? "You"
          : message.question
            ? "Codex asks"
            : "Codex";

      const body =
        document.createElement(
          "div"
        );

      body.className =
        "bubble-text";

      body.textContent =
        message.text;

      bubble.appendChild(
        label
      );

      bubble.appendChild(
        body
      );

      if (
        message.meta ||
        message.taskId
      ) {
        const footer =
          document.createElement(
            "div"
          );

        footer.className =
          "bubble-footer";

        const meta =
          document.createElement(
            "div"
          );

        meta.className =
          "bubble-meta";

        meta.textContent =
          message.meta;

        const task =
          document.createElement(
            "div"
          );

        task.className =
          "bubble-task";

        task.textContent =
          message.taskId
            ? `Task ${message.taskId}`
            : "";

        footer.appendChild(
          meta
        );

        footer.appendChild(
          task
        );

        bubble.appendChild(
          footer
        );
      }

      row.appendChild(
        bubble
      );

      conversation.appendChild(
        row
      );
    }

    this.scrollConversationToBottom();
  }

  setInputMode(
    replyMode
  ) {
    const label =
      this.querySelector(
        "#inputLabel"
      );

    const textarea =
      this.querySelector(
        "#prompt"
      );

    const button =
      this.querySelector(
        "#send"
      );

    if (replyMode) {
      label.textContent =
        "Reply to Codex";

      textarea.placeholder =
        "Write your reply to Codex...";

      button.textContent =
        "Reply";
    }

    else {
      label.textContent =
        "New task";

      textarea.placeholder =
        "Write a task for Codex...";

      button.textContent =
        "Send";
    }
  }

  setWorking(
    running,
    label,
    stateClass = null
  ) {
    const button =
      this.querySelector(
        "#send"
      );

    const stopButton =
      this.querySelector(
        "#stop"
      );

    const clearButton =
      this.querySelector(
        "#clear"
      );

    const status =
      this.querySelector(
        "#topStatus"
      );

    const statusText =
      this.querySelector(
        "#statusText"
      );

    const indicator =
      this.querySelector(
        "#workingIndicator"
      );

    const workingText =
      this.querySelector(
        "#workingText"
      );

    button.disabled =
      running;

    clearButton.disabled =
      running;

    status.textContent =
      label ||
      (
        running
          ? "Working"
          : "Ready"
      );

    status.className =
      "status-badge";

    if (stateClass) {
      status.classList.add(
        stateClass
      );
    }

    else if (running) {
      status.classList.add(
        "running"
      );
    }

    else {
      status.classList.add(
        "ready"
      );
    }

    if (running) {
      indicator.classList.remove(
        "hidden"
      );

      workingText.textContent =
        "Codex is working";

      stopButton.classList.remove(
        "hidden"
      );

      stopButton.disabled =
        false;

      button.textContent =
        "Working…";

      statusText.textContent =
        "Following task automatically";

      this.scrollConversationToBottom();
    }

    else {
      indicator.classList.add(
        "hidden"
      );

      stopButton.classList.add(
        "hidden"
      );

      button.textContent =
        this._waitingTaskId
          ? "Reply"
          : "Send";

      statusText.textContent =
        this._waitingTaskId
          ? "Codex is waiting for your reply"
          : "Cmd/Ctrl + Enter to send";
    }
  }

  setCancellingUI() {
    const sendButton =
      this.querySelector("#send");

    const stopButton =
      this.querySelector("#stop");

    const clearButton =
      this.querySelector("#clear");

    const status =
      this.querySelector("#topStatus");

    const statusText =
      this.querySelector("#statusText");

    const indicator =
      this.querySelector("#workingIndicator");

    const workingText =
      this.querySelector("#workingText");

    sendButton.disabled =
      true;

    sendButton.textContent =
      "Working…";

    clearButton.disabled =
      true;

    stopButton.classList.remove(
      "hidden"
    );

    stopButton.disabled =
      true;

    stopButton.textContent =
      "Stopping…";

    status.textContent =
      "Stopping";

    status.className =
      "status-badge cancelling";

    indicator.classList.remove(
      "hidden"
    );

    workingText.textContent =
      "Stopping Codex";

    statusText.textContent =
      "Cancellation requested — waiting for worker…";
  }

  scrollConversationToBottom() {
    requestAnimationFrame(
      () => {
        const conversation =
          this.querySelector(
            "#conversation"
          );

        if (!conversation) {
          return;
        }

        conversation.scrollTo({
          top:
            conversation.scrollHeight,

          behavior:
            "smooth"
        });
      }
    );
  }

  async callServiceWithResponse(
    domain,
    service,
    data = {}
  ) {
    const result =
      await this._hass.callService(
        domain,
        service,
        data,
        undefined,
        true,
        true
      );

    return (
      result?.response ||
      {}
    );
  }

  buildShortMeta(task) {
    const parts = [];

    if (
      task.started_at &&
      task.completed_at
    ) {
      const start =
        new Date(
          task.started_at
        );

      const end =
        new Date(
          task.completed_at
        );

      const seconds =
        Math.max(
          0,
          Math.round(
            (end - start) / 1000
          )
        );

      parts.push(
        `Done · ${this.formatDuration(seconds)}`
      );
    }

    else if (task.status) {
      parts.push(
        task.status
      );
    }

    return parts.join(
      " · "
    );
  }

  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes =
      Math.floor(
        seconds / 60
      );

    const remaining =
      seconds % 60;

    if (
      minutes >= 60
    ) {
      const hours =
        Math.floor(
          minutes / 60
        );

      const leftoverMinutes =
        minutes % 60;

      return `${hours}h ${leftoverMinutes}m`;
    }

    return `${minutes}m ${remaining}s`;
  }

  errorText(error) {
    if (!error) {
      return "Unknown error";
    }

    return (
      error.message ||
      error.body?.message ||
      String(error)
    );
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  getCardSize() {
    return 7;
  }
}

if (
  !customElements.get(
    "codex-prompt-card"
  )
) {
  customElements.define(
    "codex-prompt-card",
    CodexPromptCard
  );
}

window.customCards =
  window.customCards || [];

if (
  !window.customCards.some(
    card =>
      card.type ===
      "codex-prompt-card"
  )
) {
  window.customCards.push({
    type:
      "codex-prompt-card",

    name:
      "Codex Chat",

    description:
      "Interactive Codex chat client for Home Assistant"
  });
}
