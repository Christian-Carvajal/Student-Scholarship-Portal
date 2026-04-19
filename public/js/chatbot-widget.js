(() => {
  const WIDGET_ID = "chatbotWidgetShell";
  const API_ENDPOINT = "/api/chatbot/message";
  const MAX_HISTORY = 16;
  const DEFAULT_ERROR_REPLY =
    "Sorry, I am having trouble responding right now. Please try again in a moment.";

  let conversationHistory = [];
  let isSending = false;

  const createWidgetMarkup = () => `
    <button
      type="button"
      class="chatbot-fab"
      id="chatbotFab"
      aria-label="Open chatbot messages"
      aria-controls="chatbotShell"
      aria-expanded="false"
    >
      <span class="chatbot-fab-core" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path d="M12 3C6.48 3 2 6.78 2 11.44c0 2.7 1.53 5.1 3.9 6.65V22l4.04-2.22c.67.1 1.35.15 2.06.15 5.52 0 10-3.78 10-8.44S17.52 3 12 3z" />
          <circle cx="8.4" cy="11.2" r="1" fill="#8f171b" />
          <circle cx="12" cy="11.2" r="1" fill="#8f171b" />
          <circle cx="15.6" cy="11.2" r="1" fill="#8f171b" />
        </svg>
      </span>
      <span class="chatbot-fab-dot" aria-hidden="true"></span>
    </button>

    <section
      class="chatbot-shell"
      id="chatbotShell"
      role="dialog"
      aria-modal="false"
      aria-labelledby="chatbotShellTitle"
      aria-hidden="true"
    >
      <header class="chatbot-shell-header">
        <button
          type="button"
          class="chatbot-shell-back"
          id="chatbotShellBack"
          aria-label="Close chatbot"
        >
          <svg viewBox="0 0 24 24" role="presentation" focusable="false">
            <path d="M15.4 6.6L10 12l5.4 5.4L14 18.8 7.2 12 14 5.2z" />
          </svg>
        </button>
        <h2 id="chatbotShellTitle">UPHSD Chatbot</h2>
      </header>

      <div class="chatbot-shell-body">
        <div
          class="chatbot-conversation"
          id="chatbotConversation"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        ></div>
        <p class="chatbot-status" id="chatbotStatus" aria-live="polite"></p>
        <form class="chatbot-composer" id="chatbotComposer" novalidate>
          <textarea
            id="chatbotInput"
            class="chatbot-input"
            aria-label="Type your message"
            rows="1"
            maxlength="1200"
          ></textarea>
          <span class="chatbot-input-tail" aria-hidden="true">&lt;</span>
        </form>
      </div>
    </section>
  `;

  const setOpenState = (isOpen, shell, fab) => {
    shell.classList.toggle("is-open", isOpen);
    shell.setAttribute("aria-hidden", isOpen ? "false" : "true");
    fab.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  const setStatus = (statusElement, message, isError = false) => {
    if (!statusElement) return;
    statusElement.textContent = message || "";
    statusElement.classList.toggle("is-error", Boolean(isError));
  };

  const autoResizeInput = (input) => {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  };

  const scrollConversationToBottom = (container) => {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  };

  const addMessageBubble = (conversation, role, text) => {
    if (!conversation) return;

    const message = document.createElement("article");
    message.className = `chatbot-message chatbot-message--${role}`;

    const body = document.createElement("p");
    body.className = "chatbot-message-text";
    body.textContent = text;

    message.appendChild(body);
    conversation.appendChild(message);
    scrollConversationToBottom(conversation);
  };

  const setSendingState = (value, input, sendButton) => {
    isSending = value;
    if (input) input.disabled = value;
    if (sendButton) {
      sendButton.disabled = value;
      sendButton.textContent = value ? "..." : "Send";
    }
  };

  const requestModelReply = async (message, history) => {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        history,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const reason = payload?.error || "Request failed.";
      throw new Error(reason);
    }

    const reply = typeof payload?.reply === "string" ? payload.reply.trim() : "";
    if (!reply) throw new Error("The chatbot returned an empty response.");

    return reply;
  };

  const initializeWidget = () => {
    if (document.getElementById(WIDGET_ID)) return;

    const host = document.createElement("div");
    host.id = WIDGET_ID;
    host.innerHTML = createWidgetMarkup();
    document.body.appendChild(host);

    const shell = document.getElementById("chatbotShell");
    const fab = document.getElementById("chatbotFab");
    const back = document.getElementById("chatbotShellBack");
    const conversation = document.getElementById("chatbotConversation");
    const composer = document.getElementById("chatbotComposer");
    const input = document.getElementById("chatbotInput");
    const status = document.getElementById("chatbotStatus");

    if (
      !shell ||
      !fab ||
      !back ||
      !conversation ||
      !composer ||
      !input ||
      !status
    ) {
      return;
    }

    addMessageBubble(
      conversation,
      "model",
      "Hi! I am Nolan, your UPHSD scholarship assistant. Ask me about requirements, steps, or scholarship options.",
    );
    setStatus(status, "");
    autoResizeInput(input);

    fab.addEventListener("click", () => {
      setOpenState(true, shell, fab);
      input.focus();
    });

    back.addEventListener("click", () => {
      setOpenState(false, shell, fab);
    });

    input.addEventListener("input", () => {
      autoResizeInput(input);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });

    composer.addEventListener("submit", async (event) => {
      event.preventDefault();

      const userMessage = input.value.trim();
      if (!userMessage) {
        setStatus(status, "Please type a message before sending.", true);
        input.focus();
        return;
      }

      if (isSending) return;

      const historyForRequest = conversationHistory.slice(-MAX_HISTORY);

      addMessageBubble(conversation, "user", userMessage);
      conversationHistory.push({ role: "user", text: userMessage });

      input.value = "";
      autoResizeInput(input);
      setStatus(status, "Nolan is typing...");
      setSendingState(true, input, null);

      try {
        const reply = await requestModelReply(userMessage, historyForRequest);
        addMessageBubble(conversation, "model", reply);
        conversationHistory.push({ role: "model", text: reply });
        conversationHistory = conversationHistory.slice(-MAX_HISTORY);
        setStatus(status, "");
      } catch (error) {
        const fallback =
          error instanceof Error && error.message
            ? `${DEFAULT_ERROR_REPLY} (${error.message})`
            : DEFAULT_ERROR_REPLY;

        addMessageBubble(conversation, "model", fallback);
        conversationHistory.push({ role: "model", text: fallback });
        conversationHistory = conversationHistory.slice(-MAX_HISTORY);
        setStatus(status, "Unable to reach the chatbot service.", true);
      } finally {
        setSendingState(false, input, null);
        input.focus();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && shell.classList.contains("is-open")) {
        setOpenState(false, shell, fab);
      }
    });

    document.addEventListener("click", (event) => {
      if (!shell.classList.contains("is-open")) return;
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (shell.contains(target) || fab.contains(target)) return;
      setOpenState(false, shell, fab);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWidget);
  } else {
    initializeWidget();
  }
})();
