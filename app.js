const STORAGE_KEY = "fitly:v1";
const todayKey = () => new Date().toISOString().slice(0, 10);

const mealNames = ["Breakfast", "Lunch", "Snack", "Dinner"];
const state = loadState();
let autoSaveTimer;

function loadState() {
  const fallback = { profile: null, plan: null, entries: {}, view: "today" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculatePlan(profile) {
  const weightGap = profile.currentWeight - profile.targetWeight;
  const direction = weightGap > 1 ? "loss" : weightGap < -1 ? "gain" : "maintain";
  const bmi = profile.currentWeight / Math.pow(profile.height / 100, 2);
  const baseSteps = direction === "loss" ? 9500 : direction === "gain" ? 7500 : 8500;
  const stepGoal = Math.round(clamp(baseSteps + Math.max(0, bmi - 25) * 260, 6500, 12500) / 100) * 100;
  const waterLiters = Math.round(clamp(profile.currentWeight * 0.035, 2, 4.2) * 10) / 10;
  const weeklyWeightChange = direction === "loss" ? -0.45 : direction === "gain" ? 0.3 : 0;
  const weeks = weeklyWeightChange === 0 ? 0 : Math.ceil(Math.abs(weightGap / Math.abs(weeklyWeightChange)));
  const calories = Math.round(estimateCalories(profile, direction) / 25) * 25;

  return {
    bmi: Math.round(bmi * 10) / 10,
    direction,
    stepGoal,
    waterLiters,
    calories,
    weeks,
    meals: [
      { name: "Breakfast", time: "7:00 - 9:00", focus: "Protein, fiber, slow carbs" },
      { name: "Lunch", time: "12:00 - 2:00", focus: "Lean protein, vegetables, grains" },
      { name: "Snack", time: "4:00 - 5:30", focus: "Fruit, nuts, yogurt, or hummus" },
      { name: "Dinner", time: "7:00 - 9:00", focus: "Light protein, vegetables, hydration" },
    ],
    extras: [
      "Sleep 7-8 hours and keep your wake time steady.",
      "Add 20-30 minutes of strength training 3 days per week.",
      "Take a 5-minute walk after two meals to smooth energy levels.",
    ],
  };
}

function estimateCalories(profile, direction) {
  const genderOffset = profile.gender === "female" ? -161 : 5;
  const bmr = 10 * profile.currentWeight + 6.25 * profile.height - 5 * profile.age + genderOffset;
  const maintenance = bmr * 1.45;
  if (direction === "loss") return maintenance - 350;
  if (direction === "gain") return maintenance + 250;
  return maintenance;
}

function blankEntry() {
  return {
    steps: 0,
    water: 0,
    meals: Object.fromEntries(mealNames.map((meal) => [meal, false])),
    workout: false,
    sleep: 7,
    mood: "steady",
    notes: "",
  };
}

function entryFor(date = todayKey()) {
  state.entries[date] = { ...blankEntry(), ...(state.entries[date] || {}) };
  state.entries[date].meals = { ...blankEntry().meals, ...(state.entries[date].meals || {}) };
  return state.entries[date];
}

function completionFor(entry, plan) {
  const stepScore = clamp(entry.steps / plan.stepGoal, 0, 1);
  const waterScore = clamp(entry.water / plan.waterLiters, 0, 1);
  const mealScore = Object.values(entry.meals).filter(Boolean).length / 4;
  const workoutScore = entry.workout ? 1 : 0;
  return Math.round(((stepScore + waterScore + mealScore + workoutScore) / 4) * 100);
}

function render() {
  document.querySelector("#app").innerHTML = `
    <main class="app">
      ${state.profile ? renderTopbar() : ""}
      <section class="shell">${state.profile ? renderView() : renderOnboarding()}</section>
      <div id="toast" class="toast" role="status"></div>
    </main>
  `;
  bindEvents();
}

function renderTopbar() {
  const navItems = [
    ["today", "Today"],
    ["history", "History"],
    ["profile", "Profile"],
  ];

  return `
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true">F</div>
        <div>
          <h1>Fitly</h1>
          <p>Daily plan, tracker, and history</p>
        </div>
      </div>
      <nav class="nav" aria-label="Primary">
        ${navItems
          .map(
            ([id, label]) => `
              <button type="button" data-view="${id}" aria-current="${state.view === id ? "page" : "false"}">
                ${label}
              </button>
            `,
          )
          .join("")}
      </nav>
    </header>
  `;
}

function renderOnboarding() {
  return `
    <div class="hero">
      <div>
        <h2>Your realistic fitness plan, ready today.</h2>
        <p>
          Add your basics once. Fitly creates a daily movement, hydration, meal timing,
          and habit plan, then keeps your tracker and history on this device.
        </p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="track-arc"><span>72%</span></div>
      </div>
    </div>
    <form id="profile-form" class="panel" autocomplete="on">
      <div class="form-grid">
        ${field("name", "Name", "text", "", "Aarav", true)}
        ${field("age", "Age", "number", "16", "28", true)}
        ${field("height", "Height (cm)", "number", "120", "172", true)}
        <label class="field">
          <span>Gender</span>
          <select name="gender" required>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other / prefer not to say</option>
          </select>
        </label>
        ${field("currentWeight", "Current weight (kg)", "number", "35", "78", true)}
        ${field("targetWeight", "Target weight (kg)", "number", "35", "70", true)}
      </div>
      <div class="actions">
        <button class="primary-btn" type="submit">Create plan</button>
      </div>
    </form>
  `;
}

function field(name, label, type, min, placeholder, required, value = "") {
  return `
    <label class="field">
      <span>${label}</span>
      <input
        name="${name}"
        type="${type}"
        ${min ? `min="${min}"` : ""}
        ${type === "number" ? 'step="0.1"' : ""}
        placeholder="${placeholder}"
        value="${value}"
        ${required ? "required" : ""}
      />
    </label>
  `;
}

function renderView() {
  if (state.view === "history") return renderHistory();
  if (state.view === "profile") return renderProfile();
  return renderToday();
}

function renderToday() {
  const profile = state.profile;
  const plan = state.plan;
  const entry = entryFor();
  const complete = completionFor(entry, plan);

  return `
    <div class="section-band">
      <div>
        <p class="small-title">${new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}</p>
        <h2 class="view-title">Hi ${escapeHtml(profile.name)}, this is your plan.</h2>
        <p class="lede">
          Your target is ${profile.targetWeight} kg from ${profile.currentWeight} kg.
          ${plan.weeks ? `A steady timeline is about ${plan.weeks} weeks.` : "You are in maintenance mode."}
        </p>
      </div>
      <div class="hero-visual" aria-label="${complete}% complete today">
        <div class="track-arc" style="background: conic-gradient(var(--brand) 0 ${complete}%, #e5eee9 ${complete}% 100%);">
          <span>${complete}%</span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      ${stat("Steps", plan.stepGoal.toLocaleString())}
      ${stat("Water", `${plan.waterLiters} L`)}
      ${stat("Calories", `${plan.calories}`)}
      ${stat("BMI", `${plan.bmi}`)}
    </div>

    <div class="dashboard">
      <form id="tracker-form" class="panel">
        <h3>Daily tracker</h3>
        <div class="tracker-grid">
          <div class="tracker-tile">
            <h3>Steps</h3>
            <input name="steps" type="number" min="0" step="100" value="${entry.steps}" />
            ${progress(entry.steps, plan.stepGoal)}
          </div>
          <div class="tracker-tile">
            <h3>Water</h3>
            <input name="water" type="number" min="0" step="0.1" value="${entry.water}" />
            ${progress(entry.water, plan.waterLiters)}
          </div>
          <div class="tracker-tile">
            <h3>Sleep</h3>
            <input name="sleep" type="number" min="0" max="14" step="0.5" value="${entry.sleep}" />
            ${progress(entry.sleep, 8)}
          </div>
          <div class="tracker-tile">
            <h3>Mood</h3>
            <select name="mood">
              ${["energized", "steady", "tired", "stressed"]
                .map((mood) => `<option value="${mood}" ${entry.mood === mood ? "selected" : ""}>${title(mood)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="tracker-tile">
            <h3>Meals on time</h3>
            <div class="meal-list">
              ${mealNames
                .map(
                  (meal) => `
                    <label class="check-row">
                      <input type="checkbox" name="meal-${meal}" ${entry.meals[meal] ? "checked" : ""} />
                      <span>${meal}</span>
                    </label>
                  `,
                )
                .join("")}
            </div>
          </div>
          <div class="tracker-tile">
            <h3>Movement</h3>
            <label class="check-row">
              <input type="checkbox" name="workout" ${entry.workout ? "checked" : ""} />
              <span>Strength, mobility, sport, or active recovery</span>
            </label>
            <label class="field" style="margin-top:12px">
              <span>Notes</span>
              <textarea name="notes" rows="4" placeholder="What helped today?">${escapeHtml(entry.notes)}</textarea>
            </label>
          </div>
        </div>
        <div class="actions">
          <button class="primary-btn" type="submit">Save today</button>
          <span id="save-status" class="save-status" aria-live="polite">Autosave is on</span>
        </div>
      </form>

      <aside class="panel">
        <h3>Food timing</h3>
        <div class="plan-list">
          ${plan.meals
            .map(
              (meal) => `
                <div class="plan-item">
                  <b>${meal.name} · ${meal.time}</b>
                  <span class="muted">${meal.focus}</span>
                </div>
              `,
            )
            .join("")}
        </div>
        <h3 style="margin-top:22px">Extra habits</h3>
        <div class="plan-list">
          ${plan.extras.map((extra) => `<div class="plan-item">${extra}</div>`).join("")}
        </div>
      </aside>
    </div>
  `;
}

function stat(label, value) {
  return `<div class="stat"><span class="small-title">${label}</span><strong>${value}</strong></div>`;
}

function progress(value, target) {
  const percent = Math.round(clamp(number(value) / number(target, 1), 0, 1) * 100);
  return `<div class="progress-line" aria-label="${percent}%"><span style="--progress:${percent}%"></span></div>`;
}

function renderHistory() {
  const plan = state.plan;
  const items = Object.entries(state.entries)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entry]) => ({ date, entry, complete: completionFor(entry, plan) }));

  return `
    <div class="split">
      <div>
        <h2 class="view-title">History</h2>
        <p class="lede">Review saved days and spot the patterns that are actually helping.</p>
      </div>
      <div class="panel">
        <h3>Last ${items.length || 0} saved day${items.length === 1 ? "" : "s"}</h3>
        <p class="muted">${historySummary(items)}</p>
      </div>
    </div>
    <section class="history-list" style="margin-top:24px">
      ${
        items.length
          ? items
              .map(
                ({ date, entry, complete }) => `
                  <article class="history-item">
                    <b>${formatDate(date)} · ${complete}% complete</b>
                    <div class="history-bars">
                      <span>Steps: ${number(entry.steps).toLocaleString()} / ${plan.stepGoal.toLocaleString()}</span>
                      ${progress(entry.steps, plan.stepGoal)}
                      <span>Water: ${entry.water} / ${plan.waterLiters} L</span>
                      ${progress(entry.water, plan.waterLiters)}
                    </div>
                    <span class="muted">
                      Meals ${Object.values(entry.meals).filter(Boolean).length}/4 ·
                      Sleep ${entry.sleep}h · Mood ${title(entry.mood)}${entry.workout ? " · Workout done" : ""}
                    </span>
                    ${entry.notes ? `<span>${escapeHtml(entry.notes)}</span>` : ""}
                  </article>
                `,
              )
              .join("")
          : '<div class="empty">Track today once and your history will appear here.</div>'
      }
    </section>
  `;
}

function historySummary(items) {
  if (!items.length) return "No history yet.";
  const avg = Math.round(items.reduce((sum, item) => sum + item.complete, 0) / items.length);
  const best = items.reduce((top, item) => (item.complete > top.complete ? item : top), items[0]);
  return `Average completion is ${avg}%. Best day was ${formatDate(best.date)} at ${best.complete}%.`;
}

function renderProfile() {
  const profile = state.profile;
  return `
    <div class="split">
      <div>
        <h2 class="view-title">Profile</h2>
        <p class="lede">Update your details any time. Fitly recalculates your plan from the latest profile.</p>
      </div>
      <div class="panel">
        <h3>Local data</h3>
        <p class="muted">Your profile, plan, and history are stored in this browser for offline use.</p>
      </div>
    </div>
    <form id="profile-form" class="panel" style="margin-top:24px">
      <div class="form-grid">
        ${field("name", "Name", "text", "", "Name", true, escapeHtml(profile.name))}
        ${field("age", "Age", "number", "16", "Age", true, profile.age)}
        ${field("height", "Height (cm)", "number", "120", "Height", true, profile.height)}
        <label class="field">
          <span>Gender</span>
          <select name="gender" required>
            ${["male", "female", "other"]
              .map((gender) => `<option value="${gender}" ${profile.gender === gender ? "selected" : ""}>${title(gender)}</option>`)
              .join("")}
          </select>
        </label>
        ${field("currentWeight", "Current weight (kg)", "number", "35", "Weight", true, profile.currentWeight)}
        ${field("targetWeight", "Target weight (kg)", "number", "35", "Target", true, profile.targetWeight)}
      </div>
      <div class="actions">
        <button class="primary-btn" type="submit">Update plan</button>
        <button class="danger-btn" type="button" id="reset-data">Reset Fitly</button>
      </div>
    </form>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      saveState();
      render();
    });
  });

  document.querySelector("#profile-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.profile = {
      name: String(form.get("name")).trim() || "Friend",
      age: number(form.get("age")),
      height: number(form.get("height")),
      gender: String(form.get("gender")),
      currentWeight: number(form.get("currentWeight")),
      targetWeight: number(form.get("targetWeight")),
    };
    state.plan = calculatePlan(state.profile);
    state.view = "today";
    saveState();
    render();
    showToast("Your Fitly plan is ready.");
  });

  document.querySelector("#tracker-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveTrackerForm(event.currentTarget);
    render();
    showToast("Today is saved.");
  });

  document.querySelector("#tracker-form")?.addEventListener("input", (event) => {
    scheduleAutoSave(event.currentTarget);
  });

  document.querySelector("#tracker-form")?.addEventListener("change", (event) => {
    scheduleAutoSave(event.currentTarget, 0);
  });

  document.querySelector("#reset-data")?.addEventListener("click", () => {
    if (!confirm("Reset your Fitly profile and history on this device?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, { profile: null, plan: null, entries: {}, view: "today" });
    render();
  });
}

function saveTrackerForm(formElement) {
  const form = new FormData(formElement);
  const entry = entryFor();
  entry.steps = number(form.get("steps"));
  entry.water = number(form.get("water"));
  entry.sleep = number(form.get("sleep"));
  entry.mood = String(form.get("mood"));
  entry.workout = form.has("workout");
  entry.notes = String(form.get("notes") || "").trim();
  mealNames.forEach((meal) => {
    entry.meals[meal] = form.has(`meal-${meal}`);
  });
  saveState();
}

function scheduleAutoSave(formElement, delay = 500) {
  const status = document.querySelector("#save-status");
  if (status) status.textContent = "Saving...";
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    saveTrackerForm(formElement);
    if (status) status.textContent = `Autosaved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, delay);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function title(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

render();
