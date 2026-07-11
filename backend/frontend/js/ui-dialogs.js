(() => {
  if (window.AppDialog) return;

  const STYLE_ID = "app-dialog-styles";
  let dialogQueue = Promise.resolve();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .app-dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(15, 23, 42, 0.48);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        opacity: 0;
        transition: opacity 160ms ease;
      }

      .app-dialog-overlay.is-open {
        opacity: 1;
      }

      .app-dialog-card {
        width: min(560px, 92vw);
        background:
          radial-gradient(circle at top right, rgba(79, 70, 229, 0.12), transparent 38%),
          rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(99, 102, 241, 0.18);
        border-radius: 24px;
        box-shadow: 0 30px 90px rgba(15, 23, 42, 0.28);
        color: #0f172a;
        transform: translateY(14px) scale(0.98);
        transition: transform 180ms ease;
        overflow: hidden;
      }

      .app-dialog-overlay.is-open .app-dialog-card {
        transform: translateY(0) scale(1);
      }

      .app-dialog-head {
        padding: 24px 28px 10px;
      }

      .app-dialog-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(79, 70, 229, 0.08);
        color: #4f46e5;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .app-dialog-card[data-intent="danger"] .app-dialog-kicker {
        background: rgba(225, 29, 72, 0.1);
        color: #e11d48;
      }

      .app-dialog-title {
        margin: 14px 0 0;
        font-size: 28px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .app-dialog-body {
        padding: 0 28px 20px;
      }

      .app-dialog-message {
        margin: 0;
        color: #475569;
        font-size: 15px;
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .app-dialog-input-wrap {
        margin-top: 18px;
      }

      .app-dialog-input {
        width: 100%;
        border: 1.5px solid rgba(99, 102, 241, 0.22);
        border-radius: 16px;
        padding: 14px 16px;
        background: rgba(248, 250, 252, 0.96);
        color: #0f172a;
        font-size: 15px;
        outline: none;
        transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .app-dialog-input:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.14);
        transform: translateY(-1px);
      }

      .app-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 0 28px 28px;
      }

      .app-dialog-btn {
        min-width: 112px;
        border-radius: 999px;
        border: 1px solid transparent;
        padding: 12px 18px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease, border-color 140ms ease;
      }

      .app-dialog-btn:hover {
        transform: translateY(-1px);
      }

      .app-dialog-btn:active {
        transform: scale(0.98);
      }

      .app-dialog-btn-secondary {
        background: #ffffff;
        border-color: rgba(148, 163, 184, 0.4);
        color: #334155;
      }

      .app-dialog-btn-secondary:hover {
        box-shadow: 0 10px 24px rgba(148, 163, 184, 0.16);
      }

      .app-dialog-btn-primary {
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: #ffffff;
        box-shadow: 0 14px 30px rgba(79, 70, 229, 0.28);
      }

      .app-dialog-btn-primary:hover {
        box-shadow: 0 18px 34px rgba(79, 70, 229, 0.34);
      }

      .app-dialog-card[data-intent="danger"] .app-dialog-btn-primary {
        background: linear-gradient(135deg, #e11d48, #f43f5e);
        box-shadow: 0 14px 30px rgba(225, 29, 72, 0.24);
      }

      .app-dialog-card[data-intent="danger"] .app-dialog-btn-primary:hover {
        box-shadow: 0 18px 34px rgba(225, 29, 72, 0.3);
      }

      @media (max-width: 640px) {
        .app-dialog-overlay {
          padding: 18px;
        }

        .app-dialog-card {
          border-radius: 20px;
        }

        .app-dialog-head {
          padding: 20px 20px 8px;
        }

        .app-dialog-body {
          padding: 0 20px 18px;
        }

        .app-dialog-actions {
          padding: 0 20px 20px;
          flex-direction: column-reverse;
        }

        .app-dialog-btn {
          width: 100%;
        }

        .app-dialog-title {
          font-size: 24px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeArgs(mode, input, options = {}) {
    const base = typeof input === "object" && input !== null
      ? { ...input }
      : { ...options, message: input };

    return {
      mode,
      title: base.title || (mode === "confirm"
        ? "Confirm Action"
        : mode === "prompt"
          ? "Action Verification"
          : "Notice"),
      label: base.label || (mode === "confirm"
        ? "Confirmation Required"
        : mode === "prompt"
          ? "Secure Action"
          : "System Dialog"),
      message: base.message || "",
      confirmText: base.confirmText || (mode === "prompt" ? "Continue" : "OK"),
      cancelText: base.cancelText || "Cancel",
      placeholder: base.placeholder || "",
      defaultValue: base.defaultValue || "",
      inputType: base.inputType || "text",
      intent: base.intent || "primary"
    };
  }

  function enqueue(factory) {
    const run = dialogQueue.then(factory, factory);
    dialogQueue = run.catch(() => {});
    return run;
  }

  function openDialog(config) {
    ensureStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "app-dialog-overlay";

      overlay.innerHTML = `
        <div class="app-dialog-card" data-intent="${escapeHtml(config.intent)}" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
          <div class="app-dialog-head">
            <div class="app-dialog-kicker">${escapeHtml(config.label)}</div>
            <h2 class="app-dialog-title" id="appDialogTitle">${escapeHtml(config.title)}</h2>
          </div>
          <div class="app-dialog-body">
            <p class="app-dialog-message">${escapeHtml(config.message)}</p>
            ${config.mode === "prompt" ? `
              <div class="app-dialog-input-wrap">
                <input class="app-dialog-input" type="${escapeHtml(config.inputType)}" placeholder="${escapeHtml(config.placeholder)}" value="${escapeHtml(config.defaultValue)}" autocomplete="off" />
              </div>
            ` : ""}
          </div>
          <div class="app-dialog-actions">
            ${config.mode !== "alert" ? `<button type="button" class="app-dialog-btn app-dialog-btn-secondary" data-role="cancel">${escapeHtml(config.cancelText)}</button>` : ""}
            <button type="button" class="app-dialog-btn app-dialog-btn-primary" data-role="confirm">${escapeHtml(config.confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector(".app-dialog-input");
      const confirmButton = overlay.querySelector('[data-role="confirm"]');
      const cancelButton = overlay.querySelector('[data-role="cancel"]');

      function cleanup(result) {
        document.removeEventListener("keydown", onKeyDown);
        overlay.classList.remove("is-open");
        setTimeout(() => overlay.remove(), 160);
        resolve(result);
      }

      function cancel() {
        cleanup(config.mode === "confirm" ? false : null);
      }

      function confirm() {
        if (config.mode === "prompt") {
          cleanup(input ? input.value : "");
          return;
        }

        cleanup(true);
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          if (config.mode !== "alert") {
            event.preventDefault();
            cancel();
          }
          return;
        }

        if (event.key === "Enter") {
          if (document.activeElement === cancelButton) return;
          event.preventDefault();
          confirm();
        }
      }

      document.addEventListener("keydown", onKeyDown);
      confirmButton.addEventListener("click", confirm);
      cancelButton?.addEventListener("click", cancel);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay && config.mode !== "alert") {
          cancel();
        }
      });

      requestAnimationFrame(() => {
        overlay.classList.add("is-open");
        if (input) {
          input.focus();
          input.select();
        } else {
          confirmButton.focus();
        }
      });
    });
  }

  window.AppDialog = {
    alert(input, options) {
      return enqueue(() => openDialog(normalizeArgs("alert", input, options)));
    },
    confirm(input, options) {
      return enqueue(() => openDialog(normalizeArgs("confirm", input, options)));
    },
    prompt(input, options) {
      return enqueue(() => openDialog(normalizeArgs("prompt", input, options)));
    }
  };

  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.__nativeAlert = nativeAlert;
  window.alert = function themedAlert(message) {
    return window.AppDialog.alert({
      title: "Notice",
      label: "System Dialog",
      message: String(message ?? "")
    });
  };
})();
