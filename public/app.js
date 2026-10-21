"use strict";

const $ = (selector) => document.querySelector(selector);

const state = {
  user: null,
  tasks: [],
  view: localStorage.getItem("yj-job-view") || "hybrid"
};

$("#year").textContent = new Date().getFullYear();

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "The request could not be completed.");
  }

  return data;
}

function setMessage(selector, message, error = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.toggle("error-message", error);
}

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

async function loadCurrentUser() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
  } catch {
    state.user = null;
  }

  renderAccount();
}

function renderAccount() {
  const user = state.user;

  $("#signed-in").hidden = !user;
  $("#register").hidden = Boolean(user);
  $("#login").hidden = Boolean(user);

  $("#open-login").textContent = user ? "My account" : "Sign in";

  if (!user) {
    $("#task-form").hidden = true;
    $("#task-login-notice").hidden = false;
    return;
  }

  $("#welcome-user").textContent = `Welcome, ${user.fullName}`;

  $("#account-details").textContent =
    `Account ID: ${user.accountId} · Role: ${user.role}`;

  const isCustomer = user.role === "CUSTOMER";

  $("#task-form").hidden = !isCustomer;
  $("#task-login-notice").hidden = isCustomer;
}

$("#open-login").addEventListener("click", () => {
  if (state.user) {
    $("#account").scrollIntoView({ behavior: "smooth" });
    return;
  }

  $("#account").scrollIntoView({ behavior: "smooth" });
  $("#login").querySelector("input[name='email']").focus();
});

$("#register").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;
  setMessage("#register-message", "Creating your account...");

  const data = Object.fromEntries(new FormData(form).entries());

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
  } catch (error) {
    setMessage("#register-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;
  setMessage("#login-message", "Signing in...");

  const data = Object.fromEntries(new FormData(form).entries());

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
  } catch (error) {
    setMessage("#login-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    renderAccount();
    setMessage("#login-message", "You have signed out.");
  } catch (error) {
    setMessage("#login-message", error.message, true);
  }
});

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.user || state.user.role !== "CUSTOMER") {
    setMessage("#task-message", "Sign in with a customer account first.", true);
    return;
  }

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");

  button.disabled = true;
  setMessage("#task-message", "Publishing your task...");

  const raw = Object.fromEntries(new FormData(form).entries());

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
      setMessage("#task-message", "Choose a future date and time.", true);
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
      `Task published. Reference: ${result.task.bookingId}`
    );

    await loadJobs();
    $("#jobs").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setMessage("#task-message", error.message, true);
  } finally {
    button.disabled = false;
  }
});

function getFilteredTasks() {
  const search = $("#job-search").value.trim().toLowerCase();
  const parish = $("#parish-filter").value;

  const tasks = state.tasks.filter((task) => {
    const text = [
      task.title,
      task.description,
      task.category,
      task.parish,
      task.area
    ].join(" ").toLowerCase();

    return (!search || text.includes(search))
      && (!parish || task.parish === parish);
  });

  if ($("#job-sort").value === "budget") {
    tasks.sort((a, b) => (b.budgetJmd || 0) - (a.budgetJmd || 0));
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
    : `<div class="empty-state">
         <h3>No matching jobs right now</h3>
         <p>Try another parish or search term.</p>
       </div>`;

  $("#hybrid-jobs").innerHTML = markup;
  $("#list-jobs").innerHTML = markup;

  $("#jobs-message").textContent =
    `${tasks.length} available ${tasks.length === 1 ? "job" : "jobs"}.`;

  bindJobButtons();
}

function bindJobButtons() {
  document.querySelectorAll(".offer-button").forEach((button) => {
    button.addEventListener("click", () => openOfferForm(button.dataset.job));
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
    state.tasks = Array.isArray(result.tasks) ? result.tasks : [];
    renderJobs();
  } catch (error) {
    setMessage("#jobs-message", error.message, true);
  }
}

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
    await api(`/api/tasks/${encodeURIComponent(bookingId)}/offers`, {
      method: "POST",
      body: JSON.stringify({ requestedJmd: price })
    });

    alert("Your offer was submitted.");
  } catch (error) {
    alert(error.message);
  }
}

function setView(view) {
  state.view = view;
  localStorage.setItem("yj-job-view", view);

  $("#hybrid-view").hidden = view !== "hybrid";
  $("#list-view").hidden = view !== "list";

  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === view;

    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$("#job-search").addEventListener("input", renderJobs);
$("#parish-filter").addEventListener("change", renderJobs);
$("#job-sort").addEventListener("change", renderJobs);
$("#refresh-jobs").addEventListener("click", loadJobs);

setView(state.view === "list" ? "list" : "hybrid");

loadCurrentUser().then(loadJobs);
