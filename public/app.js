"use strict";

/* =========================================
   YARDJOBSJA MARKETPLACE
========================================= */

const $ = (selector) => document.querySelector(selector);

const state = {
  user: null,
  tasks: [],
  view: localStorage.getItem("yj-job-view") || "hybrid",
  dashboard: null,
  originalPositions: new Map()
};

const publicSections = [
  ".hero",
  "#jobs",
  "#how"
];

const $safe = (selector) => $(selector);

function money(value) {
  if (value === null || value === undefined) {
    return "Budget not specified";
  }

  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: "JMD",
    maximumFractionDigits: 0
  }).format(value);
}

function dateLabel(value) {
  if (!value) return "Date to be agreed";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date to be agreed";
  }

  return date.toLocaleString("en-JM", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function setMessage(selector, message, error = false) {
  const element = $(selector);

  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error-message", error);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "The request could not be completed."
    );
  }

  return data;
}

/* =========================================
   PAGE LAYOUT
========================================= */

function rememberOriginalPosition(element) {
  if (!element || state.originalPositions.has(element)) {
    return;
  }

  state.originalPositions.set(element, {
    parent: element.parentNode,
    next: element.nextSibling
  });
}

function restoreOriginalPosition(element) {
  const original = state.originalPositions.get(element);

  if (!original || !original.parent) return;

  if (
    original.next &&
    original.next.parentNode === original.parent
  ) {
    original.parent.insertBefore(element, original.next);
  } else {
    original.parent.appendChild(element);
  }
}

function ensureDashboard() {
  if (state.dashboard) return state.dashboard;

  const dashboard = document.createElement("section");

  dashboard.id = "role-dashboard";
  dashboard.className = "section role-dashboard";
  dashboard.hidden = true;

  dashboard.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">YOUR WORKSPACE</p>
      <h2 id="dashboard-title">Your dashboard</h2>
      <p id="dashboard-description">
        Manage your Yardjobsja account.
      </p>
    </div>

    <div class="account-grid">
      <article class="dashboard-card">
        <p class="eyebrow">ACCOUNT</p>
        <h3 id="dashboard-welcome">Welcome</h3>
        <p id="dashboard-account-details"></p>
        <p id="dashboard-role"></p>
      </article>

      <article class="dashboard-card">
        <p class="eyebrow">QUICK ACTIONS</p>
        <h3>Get things done</h3>
        <div id="dashboard-actions" class="dashboard-actions"></div>
      </article>
    </div>

    <section id="dashboard-workspace" class="dashboard-workspace"></section>

    <section id="admin-ticket-panel" hidden>
      <div class="section-heading">
        <p class="eyebrow">ADMINISTRATION</p>
        <h2>Payment review queue</h2>
        <p>
          Review submitted payment references and update ticket status.
          A reference or receipt alone does not confirm payment.
        </p>
      </div>

      <button id="refresh-admin-tickets"
              class="btn btn-light"
              type="button">
        Refresh payment tickets
      </button>

      <p id="admin-ticket-message"
         class="form-message"
         role="status"></p>

      <div id="admin-ticket-list" class="dashboard-ticket-list"></div>
    </section>

    <div class="dashboard-footer">
      <button id="dashboard-home"
              class="btn btn-light"
              type="button">
        Public homepage
      </button>

      <button id="dashboard-logout"
              class="btn"
              type="button">
        Sign out
      </button>
    </div>
  `;

  $("#account").insertAdjacentElement("afterend", dashboard);

  state.dashboard = dashboard;

  $("#dashboard-home").addEventListener("click", () => {
    signOutAndShowHome();
  });

  $("#dashboard-logout").addEventListener("click", logout);

  $("#refresh-admin-tickets").addEventListener(
    "click",
    loadAdminTickets
  );

  return dashboard;
}

function rememberPageSections() {
  [
    ...publicSections.map((selector) => $(selector)),
    $("#account"),
    $("#post-task")
  ].forEach(rememberOriginalPosition);
}

function showPublicHomepage() {
  ensureDashboard();

  state.dashboard.hidden = true;

  publicSections.forEach((selector) => {
    const element = $(selector);

    if (element) element.hidden = false;
  });

  $("#account").hidden = false;
  $("#post-task").hidden = false;

  restoreOriginalPosition($("#post-task"));

  $("#register").hidden = false;
  $("#login").hidden = false;
  $("#signed-in").hidden = true;

  $("#task-form").hidden = true;
  $("#task-login-notice").hidden = false;

  $("#open-login").textContent = "Sign in";
}

function showDashboard(user) {
  const dashboard = ensureDashboard();

  dashboard.hidden = false;

  $("#account").hidden = true;

  publicSections.forEach((selector) => {
    const element = $(selector);

    if (element) element.hidden = true;
  });

  $("#register").hidden = true;
  $("#login").hidden = true;
  $("#signed-in").hidden = true;

  $("#open-login").textContent = "My dashboard";

  $("#dashboard-welcome").textContent =
    `Welcome, ${user.fullName}`;

  $("#dashboard-account-details").textContent =
    `Account ID: ${user.accountId}`;

  $("#dashboard-role").textContent =
    `Account type: ${user.role}`;

  const actions = $("#dashboard-actions");
  const workspace = $("#dashboard-workspace");
  const ticketPanel = $("#admin-ticket-panel");

  actions.replaceChildren();
  workspace.replaceChildren();

  ticketPanel.hidden = true;

  if (user.role === "CUSTOMER") {
    $("#dashboard-title").textContent = "Customer dashboard";

    $("#dashboard-description").textContent =
      "Post a task and explore the services available on Yardjobsja.";

    addDashboardButton(
      actions,
      "Post a task",
      () => {
        $("#post-task").scrollIntoView({ behavior: "smooth" });
      }
    );

    addDashboardButton(
      actions,
      "Public homepage",
      () => signOutAndShowHome()
    );

    rememberOriginalPosition($("#post-task"));

    dashboard.insertBefore(
      $("#post-task"),
      $("#admin-ticket-panel")
    );

    $("#post-task").hidden = false;
    $("#task-form").hidden = false;
    $("#task-login-notice").hidden = true;

    workspace.innerHTML = `
      <div class="dashboard-notice">
        <h3>Manage your task requests</h3>
        <p>
          Use the form below to publish a task.
          Once published, it may appear in the available jobs list.
        </p>
        <p>
          Your current backend does not yet include a customer task-history
          or offer-acceptance endpoint.
        </p>
      </div>
    `;
  }

  if (user.role === "TASKER") {
    $("#dashboard-title").textContent = "Tasker dashboard";

    $("#dashboard-description").textContent =
      "Explore available jobs and submit offers with transparent pricing.";

    addDashboardButton(
      actions,
      "Browse available jobs",
      () => {
        $("#jobs").scrollIntoView({ behavior: "smooth" });
      }
    );

    addDashboardButton(
      actions,
      "Refresh jobs",
      loadJobs
    );

    restoreOriginalPosition($("#post-task"));

    $("#post-task").hidden = true;

    $("#task-form").hidden = true;
    $("#task-login-notice").hidden = true;

    workspace.innerHTML = `
      <div class="dashboard-notice">
        <h3>Find work across Jamaica</h3>
        <p>
          Browse open jobs below and submit offers.
          The 10% Yardjobsja commission is shown before an offer is submitted.
        </p>
        <p>
          Your current backend does not yet provide an offer-history
          dashboard or tasker payout-management endpoints.
        </p>
      </div>
    `;

    $("#jobs").hidden = false;
  }

  if (user.role === "ADMIN") {
    $("#dashboard-title").textContent = "Administrator dashboard";

    $("#dashboard-description").textContent =
      "Manage payment reviews and oversee marketplace administration.";

    addDashboardButton(
      actions,
      "Review payment tickets",
      () => {
        ticketPanel.hidden = false;
        loadAdminTickets();
        ticketPanel.scrollIntoView({ behavior: "smooth" });
      }
    );

    addDashboardButton(
      actions,
      "Refresh payment tickets",
      loadAdminTickets
    );

    restoreOriginalPosition($("#post-task"));

    $("#post-task").hidden = true;
    $("#jobs").hidden = true;
    $("#how").hidden = true;
    $(".hero").hidden = true;

    $("#task-form").hidden = true;
    $("#task-login-notice").hidden = true;

    ticketPanel.hidden = false;

    workspace.innerHTML = `
      <div class="dashboard-notice">
        <h3>Administrative controls</h3>
        <p>
          Review payment tickets and update their statuses.
          Customer account-management tools and other administrative
          functions still require backend endpoints.
        </p>
      </div>
    `;

    loadAdminTickets();
  }

  if (!["CUSTOMER", "TASKER", "ADMIN"].includes(user.role)) {
    workspace.innerHTML = `
      <div class="dashboard-notice">
        <h3>Account role not recognized</h3>
        <p>Please contact support for assistance.</p>
      </div>
    `;
  }
}

function addDashboardButton(container, label, callback) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "btn btn-light";
  button.textContent = label;

  button.addEventListener("click", callback);

  container.appendChild(button);
}

function renderAccount() {
  rememberPageSections();
  ensureDashboard();

  if (!state.user) {
    showPublicHomepage();
    return;
  }

  showDashboard(state.user);
}

/* =========================================
   SESSION MANAGEMENT
========================================= */

async function loadCurrentUser() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
  } catch {
    state.user = null;
  }

  renderAccount();
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });

    state.user = null;

    renderAccount();

    setMessage("#login-message", "You have signed out.");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  } catch (error) {
    alert(error.message);
  }
}

function signOutAndShowHome() {
  if (!state.user) {
    showPublicHomepage();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  logout();
}

$("#open-login").addEventListener("click", () => {
  if (state.user) {
    $("#role-dashboard").scrollIntoView({
      behavior: "smooth"
    });
    return;
  }

  $("#account").scrollIntoView({ behavior: "smooth" });

  const emailInput = $("#login input[name='email']");

  if (emailInput) emailInput.focus();
});

/* =========================================
   REGISTRATION
========================================= */

$("#register").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;

  setMessage("#register-message", "Creating your account...");

  const data = Object.fromEntries(
    new FormData(form).entries()
  );

  if (data.phone === "") {
    delete data.phone;
  }

  try {
    const result = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(data)
    });

    state.user = result.user;

    form.reset();

    setMessage(
      "#register-message",
      `Account created. Your account ID is ${result.user.accountId}.`
    );

    renderAccount();

    await loadJobs();

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage("#register-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

/* =========================================
   LOGIN
========================================= */

$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;

  setMessage("#login-message", "Signing in...");

  const data = Object.fromEntries(
    new FormData(form).entries()
  );

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(data)
    });

    state.user = result.user;

    form.reset();

    setMessage("#login-message", "You are signed in.");

    renderAccount();

    await loadJobs();

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage("#login-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", logout);

/* =========================================
   CUSTOMER TASK CREATION
========================================= */

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.user || state.user.role !== "CUSTOMER") {
    setMessage(
      "#task-message",
      "Sign in with a customer account first.",
      true
    );
    return;
  }

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;

  setMessage("#task-message", "Publishing your task...");

  const raw = Object.fromEntries(
    new FormData(form).entries()
  );

  const task = {
    title: raw.title.trim(),
    description: raw.description.trim(),
    category: raw.category,
    parish: raw.parish,
    area: raw.area.trim() || undefined
  };

  if (raw.budgetJmd) {
    task.budgetJmd = Number(raw.budgetJmd);
  }

  if (raw.scheduledAt) {
    const date = new Date(raw.scheduledAt);

    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      setMessage(
        "#task-message",
        "Choose a future date and time.",
        true
      );

      button.disabled = false;
      return;
    }

    task.scheduledAt = date.toISOString();
  }

  try {
    const result = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify(task)
    });

    form.reset();

    setMessage(
      "#task-message",
      `Task published successfully. Reference: ${result.task.bookingId}`
    );

    await loadJobs();
  } catch (error) {
    setMessage("#task-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

/* =========================================
   JOB SEARCH AND FILTERING
========================================= */

function getFilteredTasks() {
  const search = $("#job-search").value.trim().toLowerCase();
  const parish = $("#parish-filter").value;

  const tasks = state.tasks.filter((task) => {
    const searchableText = [
      task.title,
      task.description,
      task.category,
      task.parish,
      task.area
    ].join(" ").toLowerCase();

    return (!search || searchableText.includes(search))
      && (!parish || task.parish === parish);
  });

  if ($("#job-sort").value === "budget") {
    tasks.sort(
      (a, b) => (b.budgetJmd || 0) - (a.budgetJmd || 0)
    );
  } else {
    tasks.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  return tasks;
}

function taskCard(task) {
  const isTasker = state.user?.role === "TASKER";

  return `
    <article class="job-card">
      <p class="job-category">${escapeHTML(task.category)}</p>

      <h3>${escapeHTML(task.title)}</h3>

      <p class="job-location">
        📍 ${escapeHTML(task.area || task.parish)},
        ${escapeHTML(task.parish)}
      </p>

      <p class="job-description">
        ${escapeHTML(task.description)}
      </p>

      <div class="job-price">
        ${escapeHTML(money(task.budgetJmd))}
      </div>

      <p class="job-date">
        ${escapeHTML(dateLabel(task.scheduledAt))}
      </p>

      <p class="job-reference">
        Reference: ${escapeHTML(task.bookingId)}
      </p>

      ${
        isTasker
          ? `<button class="btn offer-button"
                     type="button"
                     data-job="${escapeHTML(task.bookingId)}">
               Make an offer
             </button>`
          : `<button class="btn btn-light sign-in-to-offer"
                     type="button">
               View job
             </button>`
      }
    </article>
  `;
}

function renderJobs() {
  const tasks = getFilteredTasks();

  const markup = tasks.length
    ? tasks.map(taskCard).join("")
    : `
      <div class="empty-state">
        <h3>No matching jobs right now</h3>
        <p>Try another parish or search term.</p>
      </div>
    `;

  $("#hybrid-jobs").innerHTML = markup;
  $("#list-jobs").innerHTML = markup;

  $("#jobs-message").textContent =
    `${tasks.length} available ${tasks.length === 1 ? "job" : "jobs"}.`;

  bindJobButtons();
}

function bindJobButtons() {
  document.querySelectorAll(".offer-button").forEach((button) => {
    button.addEventListener("click", () => {
      openOfferForm(button.dataset.job);
    });
  });

  document.querySelectorAll(".sign-in-to-offer").forEach((button) => {
    button.addEventListener("click", () => {
      $("#account").scrollIntoView({ behavior: "smooth" });
    });
  });
}

async function loadJobs() {
  setMessage("#jobs-message", "Loading available jobs...");

  try {
    const result = await api("/api/tasks");

    state.tasks = Array.isArray(result.tasks)
      ? result.tasks
      : [];

    renderJobs();
  } catch (error) {
    setMessage("#jobs-message", error.message, true);
  }
}

/* =========================================
   TASKER OFFERS
========================================= */

async function openOfferForm(bookingId) {
  if (!state.user || state.user.role !== "TASKER") {
    setMessage(
      "#jobs-message",
      "Sign in with a tasker account to make an offer.",
      true
    );

    $("#account").scrollIntoView({ behavior: "smooth" });

    return;
  }

  const priceInput = prompt(
    "Enter your requested price in Jamaican dollars (JMD):"
  );

  if (priceInput === null) return;

  const price = Number(priceInput);

  if (!Number.isSafeInteger(price) || price < 1) {
    alert("Enter a valid whole-number price in JMD.");
    return;
  }

  const fee = Math.round(price * 0.10);

  const confirmed = confirm(
    `Your requested price: ${money(price)}\n` +
    `Yardjobsja commission (10%): ${money(fee)}\n` +
    `Customer total: ${money(price + fee)}\n\n` +
    `Submit this offer?`
  );

  if (!confirmed) return;

  try {
    await api(
      `/api/tasks/${encodeURIComponent(bookingId)}/offers`,
      {
        method: "POST",
        body: JSON.stringify({
          requestedJmd: price
        })
      }
    );

    alert("Your offer was submitted.");
  } catch (error) {
    alert(error.message);
  }
}

/* =========================================
   ADMIN PAYMENT TICKETS
========================================= */

async function loadAdminTickets() {
  if (!state.user || state.user.role !== "ADMIN") {
    return;
  }

  const list = $("#admin-ticket-list");

  list.innerHTML = "";

  setMessage(
    "#admin-ticket-message",
    "Loading payment tickets..."
  );

  try {
    const result = await api("/api/admin/payment-tickets");

    const tickets = Array.isArray(result.tickets)
      ? result.tickets
      : [];

    if (!tickets.length) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>No payment tickets yet</h3>
          <p>New payment submissions will appear here.</p>
        </div>
      `;

      setMessage(
        "#admin-ticket-message",
        "There are currently no payment tickets."
      );

      return;
    }

    list.innerHTML = tickets.map((ticket) => `
      <article class="dashboard-card payment-ticket">
        <p class="eyebrow">
          ${escapeHTML(ticket.ticketId)}
        </p>

        <h3>
          ${escapeHTML(ticket.task?.title || "Task payment")}
        </h3>

        <p>
          Customer:
          ${escapeHTML(ticket.customer?.fullName || "Unknown")}
        </p>

        <p>
          Account ID:
          ${escapeHTML(ticket.customer?.accountId || "Unavailable")}
        </p>

        <p>
          Email:
          ${escapeHTML(ticket.customer?.email || "Unavailable")}
        </p>

        <p>
          Booking:
          ${escapeHTML(ticket.task?.bookingId || "Unavailable")}
        </p>

        <p>
          Amount:
          ${escapeHTML(money(ticket.amountJmd))}
        </p>

        <p>
          Payment method:
          ${escapeHTML(ticket.method || "Unavailable")}
        </p>

        <p>
          Transaction reference:
          ${escapeHTML(ticket.transactionRef || "Unavailable")}
        </p>

        <p>
          Current status:
          <strong>${escapeHTML(ticket.status)}</strong>
        </p>

        ${
          ticket.receiptUrl
            ? `<p>
                 <a href="${escapeHTML(ticket.receiptUrl)}"
                    target="_blank"
                    rel="noopener noreferrer">
                   View submitted receipt
                 </a>
               </p>`
            : ""
        }

        <label>
          Update status
          <select class="ticket-status">
            ${[
              "UNDER_REVIEW",
              "MORE_INFO_REQUIRED",
              "PAYMENT_VERIFIED",
              "PAYMENT_REJECTED",
              "ESCALATED"
            ].map((status) => `
              <option value="${status}"
                ${ticket.status === status ? "selected" : ""}>
                ${status.replaceAll("_", " ")}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Admin notes
          <textarea class="ticket-notes"
                    maxlength="3000"
                    rows="3"
                    placeholder="Add review notes if needed...">${escapeHTML(ticket.adminNotes || "")}</textarea>
        </label>

        <button class="btn save-ticket"
                type="button"
                data-ticket="${escapeHTML(ticket.ticketId)}">
          Save ticket status
        </button>
      </article>
    `).join("");

    list.querySelectorAll(".save-ticket").forEach((button) => {
      button.addEventListener("click", () => {
        saveAdminTicket(button);
      });
    });

    setMessage(
      "#admin-ticket-message",
      `${tickets.length} payment ticket(s) loaded.`
    );
  } catch (error) {
    setMessage(
      "#admin-ticket-message",
      error.message,
      true
    );
  }
}

async function saveAdminTicket(button) {
  const card = button.closest(".payment-ticket");

  const status = card.querySelector(".ticket-status").value;
  const adminNotes = card.querySelector(".ticket-notes").value;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await api(
      `/api/admin/payment-tickets/${encodeURIComponent(button.dataset.ticket)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status,
          adminNotes
        })
      }
    );

    setMessage(
      "#admin-ticket-message",
      "Payment ticket status updated."
    );

    await loadAdminTickets();
  } catch (error) {
    setMessage(
      "#admin-ticket-message",
      error.message,
      true
    );

    button.disabled = false;
    button.textContent = "Save ticket status";
  }
}

/* =========================================
   JOB DISPLAY
========================================= */

function setView(view) {
  state.view = view;

  localStorage.setItem("yj-job-view", view);

  $("#hybrid-view").hidden = view !== "hybrid";
  $("#list-view").hidden = view !== "list";

  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === view;

    button.classList.toggle("active", active);

    button.setAttribute(
      "aria-pressed",
      String(active)
    );
  });
}

document.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

$("#job-search").addEventListener("input", renderJobs);
$("#parish-filter").addEventListener("change", renderJobs);
$("#job-sort").addEventListener("change", renderJobs);
$("#refresh-jobs").addEventListener("click", loadJobs);

/* =========================================
   STARTUP
========================================= */

const yearElement = $("#year");

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

rememberPageSections();
ensureDashboard();

setView(state.view === "list" ? "list" : "hybrid");

loadCurrentUser().then(loadJobs);
