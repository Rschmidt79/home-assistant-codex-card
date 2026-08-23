const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(
  path.join(__dirname, "..", "codex-prompt-card.js"),
  "utf8"
);

function createCard() {
  const dom = new JSDOM(
    "<!doctype html><html><body></body></html>",
    {
      runScripts: "outside-only",
      pretendToBeVisual: true,
      url: "http://localhost"
    }
  );

  dom.window.eval(source);

  const card = dom.window.document.createElement(
    "codex-prompt-card"
  );

  dom.window.document.body.appendChild(card);
  card.setConfig({});

  card.hass = {
    states: {
      "sensor.codex_last_task": {
        attributes: {}
      }
    },
    callService: async () => ({ response: {} })
  };

  return { card, dom };
}

function setScrollMetrics(
  conversation,
  {
    scrollHeight = 1000,
    clientHeight = 300,
    scrollTop = 0
  } = {}
) {
  Object.defineProperty(
    conversation,
    "scrollHeight",
    {
      configurable: true,
      get: () => scrollHeight
    }
  );

  Object.defineProperty(
    conversation,
    "clientHeight",
    {
      configurable: true,
      get: () => clientHeight
    }
  );

  conversation.scrollTop = scrollTop;
  conversation.scrollTo = ({ top }) => {
    conversation.scrollTop = top;
  };
}

test("new messages preserve the viewport when the user reads history", () => {
  const { card, dom } = createCard();
  const conversation = card.querySelector("#conversation");

  setScrollMetrics(
    conversation,
    { scrollTop: 180 }
  );

  card.handleConversationScroll();
  card.addMessage("codex", "A new result arrived");

  assert.equal(conversation.scrollTop, 180);
  assert.equal(card._isFollowingLatest, false);
  assert.equal(card._hasUnreadMessages, true);
  assert.equal(
    card.querySelector("#jumpToLatest").classList.contains("hidden"),
    false
  );

  dom.window.close();
});

test("new messages follow the bottom only when already near it", () => {
  const { card, dom } = createCard();
  const conversation = card.querySelector("#conversation");

  setScrollMetrics(
    conversation,
    { scrollTop: 680 }
  );

  card.handleConversationScroll();

  let scrollCalls = 0;
  card.scrollConversationToBottom = () => {
    scrollCalls += 1;
  };

  card.addMessage("codex", "Latest message");

  assert.equal(scrollCalls, 1);

  dom.window.close();
});

test("working status updates do not scroll the conversation", () => {
  const { card, dom } = createCard();

  let scrollCalls = 0;
  card.scrollConversationToBottom = () => {
    scrollCalls += 1;
  };

  card._activeTaskId = "task-1";
  card.setWorking(true, "Working");

  assert.equal(scrollCalls, 0);
  dom.window.close();
});

test("background polling suppresses Home Assistant error notifications", async () => {
  const { card, dom } = createCard();
  const calls = [];

  dom.window.console.error = () => {};

  card._hass.callService = async (...args) => {
    calls.push(args);
    throw new Error("connection lost");
  };

  card._activeTaskId = "task-1";
  await card.pollTask();

  assert.equal(calls[0][1], "get_task");
  assert.equal(calls[0][4], false);
  assert.equal(card._activeTaskId, "task-1");
  assert.equal(card._pollFailureCount, 1);
  assert.match(
    card.querySelector("#statusText").textContent,
    /retrying/i
  );

  card.stopPolling();
  dom.window.close();
});

test("user action failures remain explicit and notify Home Assistant", async () => {
  const { card, dom } = createCard();
  const calls = [];

  dom.window.console.error = () => {};

  card._hass.callService = async (...args) => {
    calls.push(args);
    throw new Error("start failed");
  };

  await card.startTask("Do the work");

  assert.equal(calls[0][1], "start_task");
  assert.equal(calls[0][4], true);
  assert.match(
    card._messages.at(-1).text,
    /Could not start the task/
  );

  dom.window.close();
});

test("HTTP 409 retries while the task is still waiting", async () => {
  const { card, dom } = createCard();
  let replyCalls = 0;

  card.sleep = async () => {};
  card.callServiceWithResponse = async (_domain, service, _data, options) => {
    if (service === "reply_task") {
      replyCalls += 1;
      assert.equal(options.notifyOnError, false);

      if (replyCalls === 1) {
        const error = new Error("Conflict");
        error.status = 409;
        throw error;
      }

      return { task_id: "task-1" };
    }

    throw new Error(`Unexpected service: ${service}`);
  };

  card.getTask = async () => ({
    task_id: "task-1",
    status: "waiting_for_input"
  });

  const response = await card.sendReplyWithRecovery(
    "task-1",
    "yes"
  );

  assert.equal(replyCalls, 2);
  assert.equal(response.task_id, "task-1");

  dom.window.close();
});

test("HTTP 409 follows an already resumed task without a duplicate reply", async () => {
  const { card, dom } = createCard();
  let replyCalls = 0;

  card.callServiceWithResponse = async () => {
    replyCalls += 1;
    const error = new Error("HTTP 409");
    throw error;
  };

  card.getTask = async () => ({
    task_id: "task-1",
    status: "running"
  });

  const response = await card.sendReplyWithRecovery(
    "task-1",
    "yes"
  );

  assert.equal(replyCalls, 1);
  assert.equal(response.recovered_from_conflict, true);

  dom.window.close();
});

test("HTTP 409 reconciles a task that completed during reply", async () => {
  const { card, dom } = createCard();

  card._waitingTaskId = "task-1";
  card.sendReplyWithRecovery = async () => ({
    task_id: "task-1",
    recovered_from_conflict: true,
    recovered_task: {
      task_id: "task-1",
      status: "completed",
      summary: "Finished elsewhere"
    }
  });

  await card.replyToTask("task-1", "yes");

  assert.equal(card._activeTaskId, null);
  assert.equal(card._waitingTaskId, null);
  assert.equal(
    card._messages.at(-1).text,
    "Finished elsewhere"
  );

  dom.window.close();
});

test("structured conflict errors are detected", () => {
  const { card, dom } = createCard();

  assert.equal(
    card.isConflictError({
      message: "Service failed",
      body: { statusCode: 409 }
    }),
    true
  );

  dom.window.close();
});

test("a stale restore response cannot repopulate a cleared card", async () => {
  const { card, dom } = createCard();
  let resolveRestore;

  card.callServiceWithResponse = () =>
    new Promise(resolve => {
      resolveRestore = resolve;
    });

  const loading = card.loadLatestTask("old-task");
  card.clearConversation();

  resolveRestore({
    task: {
      task_id: "old-task",
      status: "completed",
      prompt: "Old prompt",
      summary: "Old result"
    }
  });

  await loading;

  assert.equal(card._messages.length, 0);
  dom.window.close();
});

test("keyboard send cannot replace an active task", async () => {
  const { card, dom } = createCard();
  let starts = 0;

  card._activeTaskId = "active-task";
  card.querySelector("#prompt").value = "Another task";
  card.startTask = async () => {
    starts += 1;
  };

  await card.handleSend();

  assert.equal(starts, 0);
  dom.window.close();
});

test("a terminal poll result wins over an in-flight stop response", async () => {
  const { card, dom } = createCard();
  let resolveStop;

  card._activeTaskId = "task-1";
  card._hass.callService = () =>
    new Promise(resolve => {
      resolveStop = resolve;
    });

  const stopping = card.cancelCurrentTask();

  card.applyTaskSnapshot(
    {
      task_id: "task-1",
      status: "completed",
      summary: "Completed before cancellation"
    },
    { expectedTaskId: "task-1" }
  );

  resolveStop({ response: {} });
  await stopping;

  assert.equal(card._activeTaskId, null);
  assert.equal(
    card.querySelector("#topStatus").textContent,
    "Ready"
  );
  assert.equal(card._pollTimer, null);

  dom.window.close();
});

test("successful polling resets reconnect backoff state", async () => {
  const { card, dom } = createCard();
  const calls = [];

  card._pollFailureCount = 3;
  card._activeTaskId = "task-1";
  card._hass.callService = async (...args) => {
    calls.push(args);
    return {
      response: {
        task: {
          task_id: "task-1",
          status: "running"
        }
      }
    };
  };

  await card.pollTask();

  assert.equal(card._pollFailureCount, 0);
  assert.equal(calls[0][4], false);
  assert.equal(
    card.querySelector("#topStatus").textContent,
    "Working"
  );

  card.stopPolling();
  dom.window.close();
});
