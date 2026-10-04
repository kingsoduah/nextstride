/* NextStride frontend — owns rendering, navigation, and input collection (PRD 28).
   Core prioritization lives in the backend; this file only displays results. */
const API = "";
const state = { token: localStorage.getItem("ns_token") || "", situation: null, recommendation: null };

function show(id) {
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  document.querySelectorAll("#view-feedback").forEach(el => {
    if (id === "view-recommendation") el.classList.remove("hidden");
  });
  if (id !== "view-recommendation") document.getElementById("view-feedback").classList.add("hidden");
}

async function api(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: "Bearer " + state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setUser(name) {
  document.getElementById("userLabel").textContent = name ? `Hi, ${name}` : "";
  document.getElementById("logoutBtn").classList.toggle("hidden", !name);
}

// Navigation
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.go === "auth") show(state.token ? "view-onboarding" : "view-auth");
  else if (b.dataset.go === "hub") show("view-hub");
}));

// Auth
document.getElementById("registerBtn").onclick = async () => {
  try {
    const data = await api("/api/auth/register", "POST", {
      name: document.getElementById("regName").value,
      email: document.getElementById("regEmail").value,
      password: document.getElementById("regPassword").value,
    });
    state.token = data.token; localStorage.setItem("ns_token", data.token);
    setUser(data.user.name); show("view-onboarding");
  } catch (e) { document.getElementById("authError").textContent = e.message; }
};
document.getElementById("loginBtn").onclick = async () => {
  try {
    const data = await api("/api/auth/login", "POST", {
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value,
    });
    state.token = data.token; localStorage.setItem("ns_token", data.token);
    setUser(data.user.name); show("view-onboarding");
  } catch (e) { document.getElementById("authError").textContent = e.message; }
};
document.getElementById("logoutBtn").onclick = async () => {
  try { await api("/api/auth/logout", "POST", {}); } catch {}
  state.token = ""; localStorage.removeItem("ns_token"); setUser(""); show("view-landing");
};

// Priority Hub -> Understanding
document.getElementById("analyzeBtn").onclick = async () => {
  const text = document.getElementById("situationInput").value.trim();
  if (!text) { document.getElementById("hubError").textContent = "Describe what's competing for your attention first."; return; }
  document.getElementById("hubError").textContent = "";
  try {
    const { situation } = await api("/api/situations", "POST", { text });
    state.situation = situation;
    renderUnderstanding(situation);
    show("view-understanding");
  } catch (e) { document.getElementById("hubError").textContent = e.message; }
};

function renderUnderstanding(s) {
  const box = document.getElementById("understandingBox");
  const resps = s.context.responsibilities.map(r =>
    `<li><strong>[${r.category}]</strong> ${escapeHtml(r.title)} <span class="pill">${escapeHtml(r.time_ref || "no time")}</span>${r.delegatable ? '<span class="pill">delegatable</span>' : ""}${r.fixed_time ? '<span class="pill">fixed time</span>' : ""}</li>`).join("");
  const conflicts = s.context.conflicts.map(c => `<li>${escapeHtml(c.description)}</li>`).join("") || "<li>No direct overlap detected yet.</li>";
  const uncert = s.context.uncertainties.map(u => `<li>${escapeHtml(u)}</li>`).join("") || "<li>None.</li>";
  box.innerHTML = `<h4>Responsibilities</h4><ul>${resps}</ul><h4>Conflicts</h4><ul>${conflicts}</ul><h4>Uncertainties</h4><ul>${uncert}</ul>`;
  document.getElementById("editInput").value = s.text;
  document.getElementById("editInput").classList.add("hidden");
  document.getElementById("editRow").classList.add("hidden");
}

document.getElementById("editBtn").onclick = () => {
  document.getElementById("editInput").classList.remove("hidden");
  document.getElementById("editRow").classList.remove("hidden");
};
document.getElementById("saveEditBtn").onclick = async () => {
  const text = document.getElementById("editInput").value.trim();
  const { situation } = await api(`/api/situations/${state.situation.id}`, "PATCH", { text });
  state.situation = situation;
  renderUnderstanding(situation);
};

// Understanding -> Recommendation
document.getElementById("confirmBtn").onclick = async () => {
  const { recommendation, situation } = await api(`/api/situations/${state.situation.id}/prioritize`, "POST", {});
  state.situation = situation; state.recommendation = recommendation;
  renderRecommendation(recommendation);
  show("view-recommendation");
};

function renderRecommendation(r) {
  const others = r.others.map(o => `<li><strong>${escapeHtml(o.title)}</strong> — ${escapeHtml(o.suggested_handling)}</li>`).join("") || "<li>Nothing else pending.</li>";
  document.getElementById("recommendationBox").innerHTML = `
    <div class="rec-box"><strong>Recommended next step (v${r.version}):</strong><br>${escapeHtml(r.recommended_priority)}</div>
    <div class="rec-box"><strong>Why:</strong><br>${escapeHtml(r.why)}</div>
    <div class="rec-box"><strong>Do this now:</strong><br>${escapeHtml(r.next_action)}</div>
    <div class="rec-box"><strong>What happens to the others:</strong><ul>${others}</ul></div>
    <div class="rec-box"><strong>Reassess if:</strong><ul>${r.reassess_if.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
    <p class="muted">${escapeHtml(r.uncertainty_notes || "")}</p>`;
}

// Reassessment
document.getElementById("reassessBtn").onclick = async () => {
  const update_text = document.getElementById("updateInput").value.trim();
  if (!update_text) return;
  const { recommendation, situation } = await api(`/api/situations/${state.situation.id}/reassess`, "POST", { update_text });
  state.situation = situation; state.recommendation = recommendation;
  renderRecommendation(recommendation);
  document.getElementById("updateInput").value = "";
};
document.getElementById("newSituationBtn").onclick = () => { show("view-hub"); };

// Feedback
async function sendFeedback(helpful) {
  const note = document.getElementById("feedbackNote").value;
  await api(`/api/situations/${state.situation.id}/feedback`, "POST", { helpful, note });
  document.getElementById("feedbackMsg").textContent = "Thanks — your feedback was recorded.";
}
document.getElementById("helpfulBtn").onclick = () => sendFeedback(true).catch(e => alert(e.message));
document.getElementById("notHelpfulBtn").onclick = () => sendFeedback(false).catch(e => alert(e.message));

function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// Restore session
(async () => {
  if (!state.token) { show("view-landing"); return; }
  try {
    const { user } = await api("/api/auth/me");
    setUser(user.name); show("view-onboarding");
  } catch { state.token = ""; localStorage.removeItem("ns_token"); show("view-landing"); }
})();
