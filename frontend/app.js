// ============================================================
// Skill Charts — a star-chart style frontend for the Skill Tree API.
// Vanilla JS, no build step. Open index.html via a static server
// (see README) and it talks to the FastAPI backend over fetch.
// ============================================================

const root = document.getElementById("app");

const state = {
  user: null,
  view: "loading", // loading | auth | teacher | student
  authMode: "login", // login | signup
  signupRole: "teacher",
  errorMessage: null,
  toast: null,

  teacherTab: "trees", // trees | groups | students | evidence
  groups: [],
  trees: [],
  selectedTreeId: null,
  selectedTreeDetail: null,
  pendingEvidenceList: [],
  allStudents: [],
  studentsSearchQuery: "",

  studentTab: "trees", // trees | evidence
  myTrees: [],
  myEvidenceList: [],
  selectedStudentTreeId: null,
  selectedStudentTreeDetail: null,

  modal: null,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function showToast(message) {
  state.toast = message;
  render();
  setTimeout(() => { state.toast = null; render(); }, 2600);
}

function showError(err) {
  state.errorMessage = err.message || String(err);
  render();
}

// ============================================================
// Bootstrapping — restore session if a token is already stored
// ============================================================

async function bootstrap() {
  if (!Api.getToken()) {
    setState({ view: "auth" });
    return;
  }
  try {
    const user = await Api.me();
    state.user = user;
    if (user.role === "teacher") {
      await loadTeacherHome();
    } else {
      await loadStudentHome();
    }
  } catch (err) {
    Api.clearToken();
    setState({ view: "auth" });
  }
}

// ============================================================
// Auth actions
// ============================================================

async function handleLogin(email, password) {
  state.errorMessage = null;
  try {
    const { access_token } = await Api.login(email, password);
    Api.setToken(access_token);
    const user = await Api.me();
    state.user = user;
    if (user.role === "teacher") await loadTeacherHome();
    else await loadStudentHome();
  } catch (err) {
    showError(err);
  }
}

async function handleSignup(payload) {
  state.errorMessage = null;
  try {
    await Api.signup(payload);
    await handleLogin(payload.email, payload.password);
  } catch (err) {
    showError(err);
  }
}

function handleLogout() {
  Api.clearToken();
  Object.assign(state, {
    user: null, view: "auth", groups: [], trees: [], myTrees: [],
    selectedTreeId: null, selectedTreeDetail: null,
    selectedStudentTreeId: null, selectedStudentTreeDetail: null,
    pendingEvidenceList: [], myEvidenceList: [], modal: null,
    allStudents: [], studentsSearchQuery: "",
  });
  render();
}

// ============================================================
// Teacher data loading
// ============================================================

async function loadTeacherHome() {
  try {
    const [groups, trees, allStudents] = await Promise.all([
      Api.listGroups(), Api.listSkillTrees(), Api.listStudents(),
    ]);
    state.groups = groups;
    state.trees = trees;
    state.allStudents = allStudents;
    setState({ view: "teacher", teacherTab: state.teacherTab || "trees" });
  } catch (err) {
    showError(err);
  }
}

async function refreshGroups() {
  state.groups = await Api.listGroups();
  render();
}

async function openTeacherTree(treeId) {
  try {
    const detail = await Api.getSkillTree(treeId);
    setState({ selectedTreeId: treeId, selectedTreeDetail: detail, teacherTab: "treeDetail" });
  } catch (err) {
    showError(err);
  }
}

async function loadPendingEvidence() {
  try {
    const list = await Api.pendingEvidence();
    setState({ pendingEvidenceList: list, teacherTab: "evidence" });
  } catch (err) {
    showError(err);
  }
}

// ============================================================
// Student data loading
// ============================================================

async function loadStudentHome() {
  try {
    const [trees, evidence] = await Promise.all([Api.listSkillTrees(), Api.myEvidence()]);
    state.myTrees = trees;
    state.myEvidenceList = evidence;
    setState({ view: "student", studentTab: state.studentTab || "trees" });
  } catch (err) {
    showError(err);
  }
}

async function openStudentTree(treeId) {
  try {
    const [detail, evidence] = await Promise.all([Api.getSkillTree(treeId), Api.myEvidence()]);
    state.myEvidenceList = evidence;
    setState({
      selectedStudentTreeId: treeId,
      selectedStudentTreeDetail: detail,
      studentTab: "treeDetail",
    });
  } catch (err) {
    showError(err);
  }
}

// ============================================================
// Skill status computation (student side)
// ============================================================

function latestEvidenceForSkill(skillId) {
  const matches = state.myEvidenceList
    .filter((e) => e.skill_id === skillId)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  return matches[0] || null;
}

function isSkillUnlocked(skill, skillsById) {
  if (!skill.prerequisite_ids || skill.prerequisite_ids.length === 0) return true;
  return skill.prerequisite_ids.every((pid) => {
    const ev = latestEvidenceForSkill(pid);
    return ev && ev.status === "approved";
  });
}

function skillStatus(skill, skillsById) {
  const ev = latestEvidenceForSkill(skill.id);
  if (ev && ev.status === "approved") return "mastered";
  if (ev && ev.status === "pending") return "pending";
  const unlocked = isSkillUnlocked(skill, skillsById);
  if (!unlocked) return "locked";
  if (ev && ev.status === "rejected") return "rejected";
  return "available";
}

// ============================================================
// Tree layout — positions nodes by prerequisite depth, columns
// left (foundational) to right (advanced), like a star chart
// unfolding outward.
// ============================================================

function layoutTree(skills) {
  const byId = {};
  skills.forEach((s) => (byId[s.id] = s));

  const depthCache = {};
  function depthOf(skill, seen = new Set()) {
    if (depthCache[skill.id] !== undefined) return depthCache[skill.id];
    if (seen.has(skill.id)) return 0; // guard against accidental cycles
    seen.add(skill.id);
    if (!skill.prerequisite_ids || skill.prerequisite_ids.length === 0) {
      depthCache[skill.id] = 0;
      return 0;
    }
    const d = 1 + Math.max(
      ...skill.prerequisite_ids.map((pid) => (byId[pid] ? depthOf(byId[pid], seen) : 0))
    );
    depthCache[skill.id] = d;
    return d;
  }

  skills.forEach((s) => depthOf(s));

  const columns = {};
  skills.forEach((s) => {
    const d = depthCache[s.id];
    columns[d] = columns[d] || [];
    columns[d].push(s);
  });

  const colWidth = 190;
  const rowHeight = 96;
  const positions = {};
  let maxRows = 1;

  Object.keys(columns).forEach((d) => {
    const col = columns[d];
    maxRows = Math.max(maxRows, col.length);
    col.forEach((skill, i) => {
      const x = 90 + Number(d) * colWidth;
      const y = 70 + i * rowHeight + (i % 2 === 0 ? 0 : 14); // slight offset, constellation feel
      positions[skill.id] = { x, y };
    });
  });

  const maxDepth = Math.max(0, ...Object.keys(columns).map(Number));
  const width = 90 + (maxDepth + 1) * colWidth;
  const height = 70 + maxRows * rowHeight + 40;

  return { positions, width: Math.max(width, 400), height: Math.max(height, 260), byId };
}

const STATUS_COLOR = {
  mastered: "var(--mastered)",
  pending: "var(--pending)",
  rejected: "var(--danger)",
  available: "var(--available)",
  locked: "var(--locked)",
  structure: "var(--available)", // teacher read-only view
};

function renderTreeSvg(skills, { studentView, onNodeClick }) {
  const { positions, width, height, byId } = layoutTree(skills);

  const edges = [];
  skills.forEach((skill) => {
    (skill.prerequisite_ids || []).forEach((pid) => {
      if (!positions[pid] || !positions[skill.id]) return;
      const from = positions[pid];
      const to = positions[skill.id];
      let lit = "var(--line-locked)";
      if (studentView) {
        const fromStatus = skillStatus(byId[pid], byId);
        const toStatus = skillStatus(skill, byId);
        if (fromStatus === "mastered" && (toStatus === "mastered" || toStatus === "pending" || toStatus === "available")) {
          lit = "var(--line-lit)";
        }
        if (fromStatus === "mastered" && toStatus === "mastered") lit = "var(--line-mastered)";
      } else {
        lit = "var(--line-lit)";
      }
      const midX = (from.x + to.x) / 2;
      edges.push(
        `<path class="skill-edge" d="M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}" stroke="${lit}" />`
      );
    });
  });

  const nodes = skills.map((skill) => {
    const pos = positions[skill.id];
    const status = studentView ? skillStatus(skill, byId) : "structure";
    const color = STATUS_COLOR[status];
    const locked = status === "locked";
    const completed = status === "mastered";
    const clickable = studentView ? !locked && !completed : true;
    const pulseClass = status === "pending" ? "pulse" : "";
    const radius = 22;
    const label = escapeHtml(truncate(skill.title, 20));
    const tooltip = skill.evidence_required || "No evidence details added yet.";

    let icon = "";
    if (status === "mastered") icon = "&#10003;"; // check
    else if (status === "locked") icon = "&#128274;"; // lock
    else if (status === "pending") icon = "&#8230;"; // ellipsis
    else if (status === "rejected") icon = "!";

    return `
      <g class="skill-node-group ${locked ? "locked" : ""}" data-action="${clickable ? "select-skill" : ""}" data-skill-id="${skill.id}" transform="translate(${pos.x}, ${pos.y})">
        <title>${escapeHtml(tooltip)}</title>
        <circle class="skill-node-circle ${pulseClass}" r="${radius}" fill="${locked ? "transparent" : color}" fill-opacity="${locked ? 0 : 0.18}" stroke="${color}" stroke-width="2" stroke-dasharray="${locked ? "4 3" : "0"}"></circle>
        <text text-anchor="middle" dy="6" font-size="15" fill="${color}">${icon}</text>
        <text class="skill-node-label ${locked ? "locked-label" : ""}" text-anchor="middle" y="${radius + 18}">${label}</text>
      </g>
    `;
  });

  return `
    <svg class="tree-canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${edges.join("")}
      ${nodes.join("")}
    </svg>
  `;
}

// ============================================================
// Small helpers
// ============================================================

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ============================================================
// Render: top-level dispatcher
// ============================================================

function render() {
  root.innerHTML = "";
  let content;

  if (state.view === "loading") {
    content = `<div class="main centered"><p style="color:var(--text-dim)">Loading…</p></div>`;
  } else if (state.view === "auth") {
    content = renderTopbar(false) + renderAuth();
  } else if (state.view === "teacher") {
    content = renderTopbar(true) + renderTeacherLayout();
  } else if (state.view === "student") {
    content = renderTopbar(true) + renderStudentLayout();
  }

  root.innerHTML = content + renderModal() + renderToast();
  wireEvents();
}

function renderTopbar(showUser) {
  return `
    <div class="topbar">
      <div class="brand"><span class="mark"></span> Skill Charts</div>
      ${showUser && state.user ? `
        <div class="topbar-right">
          <span class="user-chip">${escapeHtml(state.user.full_name)} · ${state.user.role}</span>
          <button class="btn btn-ghost btn-sm" data-action="logout">Sign out</button>
        </div>` : ""}
    </div>
  `;
}

function renderToast() {
  if (!state.toast) return "";
  return `<div class="toast">${escapeHtml(state.toast)}</div>`;
}

// ============================================================
// Render: auth screen
// ============================================================

function renderAuth() {
  const err = state.errorMessage
    ? `<div class="error-banner">${escapeHtml(state.errorMessage)}</div>` : "";

  if (state.authMode === "login") {
    return `
      <div class="main centered">
        <div class="auth-card">
          <h1 class="auth-title">Welcome back</h1>
          <p class="auth-subtitle">Sign in to see your skill trees.</p>
          ${err}
          <form data-form="login">
            <div class="field">
              <label>Email</label>
              <input type="email" name="email" required placeholder="you@school.edu" />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" name="password" required placeholder="••••••••" />
            </div>
            <button class="btn btn-primary" style="width:100%; justify-content:center" type="submit">Sign in</button>
          </form>
          <div class="auth-switch">
            New here? <button data-action="switch-to-signup">Create an account</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="main centered">
      <div class="auth-card">
        <h1 class="auth-title">Create an account</h1>
        <p class="auth-subtitle">Set up a teacher or student account.</p>
        ${err}
        <form data-form="signup">
          <div class="field">
            <label>I am a</label>
            <div class="role-toggle">
              <div class="role-option ${state.signupRole === "teacher" ? "selected" : ""}" data-action="set-signup-role" data-role="teacher">Teacher</div>
              <div class="role-option ${state.signupRole === "student" ? "selected" : ""}" data-action="set-signup-role" data-role="student">Student</div>
            </div>
          </div>
          <div class="field">
            <label>Full name</label>
            <input type="text" name="full_name" required placeholder="Jamie Rivera" />
          </div>
          <div class="field">
            <label>Email</label>
            <input type="email" name="email" required placeholder="you@school.edu" />
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" name="password" required minlength="6" placeholder="At least 6 characters" />
          </div>
          <button class="btn btn-primary" style="width:100%; justify-content:center" type="submit">Create account</button>
        </form>
        <div class="auth-switch">
          Already have an account? <button data-action="switch-to-login">Sign in</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// Render: teacher layout
// ============================================================

function renderTeacherLayout() {
  const sidebar = `
    <div class="sidebar">
      <button class="nav-item ${state.teacherTab === "trees" || state.teacherTab === "treeDetail" ? "active" : ""}" data-action="teacher-tab" data-tab="trees">Skill trees</button>
      <button class="nav-item ${state.teacherTab === "groups" ? "active" : ""}" data-action="teacher-tab" data-tab="groups">Groups</button>
      <button class="nav-item ${state.teacherTab === "students" ? "active" : ""}" data-action="teacher-tab" data-tab="students">Students</button>
      <button class="nav-item ${state.teacherTab === "evidence" ? "active" : ""}" data-action="teacher-tab" data-tab="evidence-load">Evidence review</button>
    </div>
  `;

  let content;
  if (state.teacherTab === "treeDetail" && state.selectedTreeDetail) {
    content = renderTeacherTreeDetail();
  } else if (state.teacherTab === "groups") {
    content = renderTeacherGroups();
  } else if (state.teacherTab === "students") {
    content = renderTeacherStudents();
  } else if (state.teacherTab === "evidence") {
    content = renderTeacherEvidence();
  } else {
    content = renderTeacherTrees();
  }

  return `<div class="main">${sidebar}<div class="content">${content}</div>${renderStudentDatalist()}</div>`;
}

function studentLabel(s) {
  return `${s.full_name} (${s.email})`;
}

function findStudentByLabel(label) {
  const target = (label || "").trim();
  return state.allStudents.find((s) => studentLabel(s) === target);
}

function renderStudentDatalist() {
  const options = state.allStudents.map((s) => `<option value="${escapeHtml(studentLabel(s))}"></option>`).join("");
  return `<datalist id="student-options">${options}</datalist>`;
}

function renderTeacherTrees() {
  const cards = state.trees.map((t) => `
    <div class="tree-card" data-action="open-tree" data-tree-id="${t.id}">
      <h3>${escapeHtml(t.title)}</h3>
      <p>${escapeHtml(t.description || "No description yet.")}</p>
    </div>
  `).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Your skill trees</h2>
        <p class="page-subtitle">Create trees, add skills, and assign them to groups or students.</p>
      </div>
      <button class="btn btn-primary" data-action="open-modal" data-modal="createTree">+ New skill tree</button>
    </div>
    ${state.trees.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>No skill trees yet. Create your first one to start mapping out skills.</p>
      </div>
    ` : `<div class="card-grid">${cards}</div>`}
  `;
}

function renderTeacherTreeDetail() {
  const tree = state.selectedTreeDetail;
  const svg = renderTreeSvg(tree.skills, { studentView: false });

  const skillOptions = tree.skills.map((s) => `
    <div class="checkbox-row">
      <input type="checkbox" name="prereq" value="${s.id}" id="prereq-${s.id}" />
      <label for="prereq-${s.id}" style="text-transform:none; font-size:0.85rem; color:var(--text)">${escapeHtml(s.title)}</label>
    </div>
  `).join("") || `<p class="helper-text">No skills yet — add the first one, it can't have prerequisites.</p>`;

  const groupOptions = state.groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">${escapeHtml(tree.title)}</h2>
        <p class="page-subtitle">${escapeHtml(tree.description || "")}</p>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="teacher-tab" data-tab="trees">&larr; All trees</button>
    </div>

    <div class="two-col">
      <div>
        <div class="tree-canvas-wrap">
          ${tree.skills.length === 0
            ? `<div class="empty-state"><div class="glyph">✦</div><p>This tree has no skills yet.</p></div>`
            : svg}
        </div>
        <div class="tree-legend">
          <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--available)"></span> Skill</span>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0; font-family:var(--font-display); font-size:1rem;">Add a skill</h3>
          <form data-form="add-skill" data-tree-id="${tree.id}">
            <div class="field">
              <label>Title</label>
              <input type="text" name="title" required placeholder="e.g. Solving quadratic equations" />
            </div>
            <div class="field">
              <label>Evidence required</label>
              <textarea name="evidence_required" placeholder="Detail what evidence is required to demonstrate this skill and include specific filetype if there is one."></textarea>
            </div>
            <div class="field">
              <label>Requires (prerequisites)</label>
              <div class="checkbox-list">${skillOptions}</div>
            </div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center">Add skill</button>
          </form>
        </div>

        <div class="card">
          <h3 style="margin-top:0; font-family:var(--font-display); font-size:1rem;">Assign this tree</h3>
          <form data-form="assign-group" data-tree-id="${tree.id}" style="margin-bottom:12px;">
            <div class="field">
              <label>To a group</label>
              <select name="group_id" required ${state.groups.length === 0 ? "disabled" : ""}>
                <option value="" disabled selected>${state.groups.length ? "Choose a group…" : "Create a group first"}</option>
                ${groupOptions}
              </select>
            </div>
            <button class="btn btn-sm" type="submit" style="width:100%; justify-content:center" ${state.groups.length === 0 ? "disabled" : ""}>Assign to group</button>
          </form>
          <form data-form="assign-student" data-tree-id="${tree.id}">
            <div class="field">
              <label>To an individual student</label>
              <input type="text" name="student_label" list="student-options" required placeholder="Search by name…" autocomplete="off" />
            </div>
            <button class="btn btn-sm" type="submit" style="width:100%; justify-content:center">Assign to student</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

function renderTeacherGroups() {
  const groupRows = state.groups.map((g) => {
    const memberRows = g.students.length
      ? g.students.map((s) => `
        <div class="list-row">
          <div class="list-row-main">
            <span class="list-row-title">${escapeHtml(s.full_name)}</span>
            <span class="list-row-meta">${escapeHtml(s.email)}</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="remove-student" data-group-id="${g.id}" data-student-id="${s.id}">Remove</button>
        </div>
      `).join("")
      : `<p class="helper-text">No students in this group yet.</p>`;

    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <h3 style="margin:0; font-family:var(--font-display); font-size:1rem;">${escapeHtml(g.name)}</h3>
          <span class="user-chip">${g.students.length} student${g.students.length === 1 ? "" : "s"}</span>
        </div>
        <div style="margin-bottom:12px;">${memberRows}</div>
        <form data-form="add-student" data-group-id="${g.id}" style="display:flex; gap:8px; align-items:flex-end;">
          <div class="field" style="flex:1; margin-bottom:0;">
            <label>Add student</label>
            <input type="text" name="student_label" list="student-options" required placeholder="Search by name…" autocomplete="off" />
          </div>
          <button class="btn btn-sm" type="submit">Add</button>
        </form>
      </div>
    `;
  }).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Groups</h2>
        <p class="page-subtitle">Organize students into classes or cohorts.</p>
      </div>
      <button class="btn btn-primary" data-action="open-modal" data-modal="createGroup">+ New group</button>
    </div>
    ${state.groups.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>No groups yet. Create one, then search for students by name to add them.</p>
      </div>
    ` : groupRows}
  `;
}

function renderTeacherStudents() {
  const query = state.studentsSearchQuery.trim().toLowerCase();
  const filtered = query
    ? state.allStudents.filter((s) => s.full_name.toLowerCase().includes(query))
    : state.allStudents;

  const rows = filtered.map((s) => {
    const groupNames = state.groups
      .filter((g) => g.students.some((gs) => gs.id === s.id))
      .map((g) => g.name);
    return `
      <div class="list-row">
        <div class="list-row-main">
          <span class="list-row-title">${escapeHtml(s.full_name)}</span>
          <span class="list-row-meta">${escapeHtml(s.email)}</span>
          <span class="helper-text" style="margin-top:2px;">${groupNames.length ? escapeHtml(groupNames.join(", ")) : "No groups yet"}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Students</h2>
        <p class="page-subtitle">Everyone with a student account, regardless of group.</p>
      </div>
    </div>
    <form data-form="search-students" style="max-width:320px; margin-bottom:16px;">
      <div class="field" style="margin-bottom:8px;">
        <label>Search by name</label>
        <input type="text" name="q" placeholder="Jamie…" value="${escapeHtml(state.studentsSearchQuery)}" autocomplete="off" />
      </div>
      <button class="btn btn-sm" type="submit">Search</button>
    </form>
    ${filtered.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>${state.allStudents.length === 0 ? "No students have signed up yet." : "No students match that search."}</p>
      </div>
    ` : `<div class="card">${rows}</div>`}
  `;
}

function renderTeacherEvidence() {
  const rows = state.pendingEvidenceList.map((e) => `
    <div class="list-row">
      <div class="list-row-main">
        <span class="list-row-title">${escapeHtml(e.student_name || `Student #${e.student_id}`)}</span>
        <span class="list-row-meta" style="display:flex; gap:24px;">
          <span>Skill Tree: ${escapeHtml(e.skill_tree_title || "—")}</span>
          <span>Skill: ${escapeHtml(e.skill_title || `Skill #${e.skill_id}`)}</span>
        </span>
        <span class="list-row-meta">${formatDate(e.submitted_at)}</span>
        ${e.content_text ? `<span style="font-size:0.85rem; color:var(--text-dim); margin-top:4px; max-width:480px;">${escapeHtml(truncate(e.content_text, 140))}</span>` : ""}
        ${e.link_url ? `<a href="${escapeHtml(e.link_url)}" target="_blank" rel="noopener" style="font-size:0.8rem;">View submitted link →</a>` : ""}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-sm" data-action="open-modal" data-modal="reviewEvidence" data-evidence-id="${e.id}">Review</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Evidence awaiting review</h2>
        <p class="page-subtitle">Approve or send back evidence students have submitted.</p>
      </div>
    </div>
    ${state.pendingEvidenceList.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>Nothing pending — you're all caught up.</p>
      </div>
    ` : rows}
  `;
}

// ============================================================
// Render: student layout
// ============================================================

function renderStudentLayout() {
  const sidebar = `
    <div class="sidebar">
      <button class="nav-item ${state.studentTab === "trees" || state.studentTab === "treeDetail" ? "active" : ""}" data-action="student-tab" data-tab="trees">My skill trees</button>
      <button class="nav-item ${state.studentTab === "submissions" ? "active" : ""}" data-action="student-tab" data-tab="submissions">My submissions</button>
    </div>
  `;

  let content;
  if (state.studentTab === "treeDetail" && state.selectedStudentTreeDetail) {
    content = renderStudentTreeDetail();
  } else if (state.studentTab === "submissions") {
    content = renderStudentSubmissions();
  } else {
    content = renderStudentTrees();
  }

  return `<div class="main">${sidebar}<div class="content">${content}</div></div>`;
}

function renderStudentTrees() {
  const cards = state.myTrees.map((t) => `
    <div class="tree-card" data-action="open-student-tree" data-tree-id="${t.id}">
      <h3>${escapeHtml(t.title)}</h3>
      <p>${escapeHtml(t.description || "No description yet.")}</p>
    </div>
  `).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">Your skill trees</h2>
        <p class="page-subtitle">Trees assigned to you by your teacher.</p>
      </div>
    </div>
    ${state.myTrees.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>No skill trees assigned yet. Check back once your teacher assigns one.</p>
      </div>
    ` : `<div class="card-grid">${cards}</div>`}
  `;
}

function renderStudentTreeDetail() {
  const tree = state.selectedStudentTreeDetail;
  const svg = renderTreeSvg(tree.skills, { studentView: true });

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">${escapeHtml(tree.title)}</h2>
        <p class="page-subtitle">${escapeHtml(tree.description || "")}</p>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="student-tab" data-tab="trees">&larr; All trees</button>
    </div>
    <div class="tree-canvas-wrap">
      ${tree.skills.length === 0
        ? `<div class="empty-state"><div class="glyph">✦</div><p>This tree has no skills yet.</p></div>`
        : svg}
    </div>
    <div class="tree-legend">
      <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--mastered)"></span> Mastered</span>
      <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--pending)"></span> Awaiting review</span>
      <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--danger)"></span> Needs revision</span>
      <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--available)"></span> Ready to attempt</span>
      <span class="tree-legend-item"><span class="tree-legend-dot" style="background:var(--locked)"></span> Locked</span>
    </div>
  `;
}

function renderStudentSubmissions() {
  const rows = [...state.myEvidenceList]
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .map((e) => `
      <div class="list-row">
        <div class="list-row-main">
          <span class="list-row-title">${escapeHtml(e.skill_title || `Skill #${e.skill_id}`)}</span>
          <span class="list-row-meta">Submitted ${formatDate(e.submitted_at)}</span>
          ${e.teacher_feedback ? `<span style="font-size:0.85rem; color:var(--text-dim); margin-top:4px;">"${escapeHtml(e.teacher_feedback)}"</span>` : ""}
        </div>
        <span class="badge badge-${e.status}">${e.status}</span>
      </div>
    `).join("");

  return `
    <div class="page-header">
      <div>
        <h2 class="page-title">My submissions</h2>
        <p class="page-subtitle">Everything you've submitted, and how it was reviewed.</p>
      </div>
    </div>
    ${state.myEvidenceList.length === 0 ? `
      <div class="empty-state card">
        <div class="glyph">✦</div>
        <p>You haven't submitted any evidence yet.</p>
      </div>
    ` : rows}
  `;
}

// ============================================================
// Render: modals
// ============================================================

function renderModal() {
  if (!state.modal) return "";
  const m = state.modal;

  if (m.type === "createTree") {
    return modalShell("New skill tree", `
      <form data-form="create-tree">
        <div class="field">
          <label>Title</label>
          <input type="text" name="title" required placeholder="e.g. Algebra Basics" />
        </div>
        <div class="field">
          <label>Description (optional)</label>
          <textarea name="description" placeholder="What does this tree cover?"></textarea>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center">Create tree</button>
      </form>
    `);
  }

  if (m.type === "createGroup") {
    return modalShell("New group", `
      <form data-form="create-group">
        <div class="field">
          <label>Group name</label>
          <input type="text" name="name" required placeholder="e.g. Period 3" />
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center">Create group</button>
      </form>
    `);
  }

  if (m.type === "reviewEvidence") {
    const e = state.pendingEvidenceList.find((x) => x.id === m.evidenceId);
    if (!e) return "";
    return modalShell("Review evidence", `
      <p class="helper-text" style="margin-bottom:14px;">${escapeHtml(e.skill_title || `Skill #${e.skill_id}`)} · ${escapeHtml(e.student_name || `Student #${e.student_id}`)} · ${formatDate(e.submitted_at)}</p>
      ${e.content_text ? `<div class="card" style="margin-bottom:14px; font-size:0.9rem;">${escapeHtml(e.content_text)}</div>` : ""}
      ${e.link_url ? `<p style="margin-bottom:14px;"><a href="${escapeHtml(e.link_url)}" target="_blank" rel="noopener">View submitted link →</a></p>` : ""}
      ${e.file_url ? `<p style="margin-bottom:14px;"><a href="${escapeHtml(API_BASE + e.file_url)}" download="${escapeHtml(e.file_name || "")}" target="_blank" rel="noopener">⬇ ${escapeHtml(e.file_name || "Download submitted file")}</a></p>` : ""}
      <form data-form="review-evidence" data-evidence-id="${e.id}">
        <div class="field">
          <label>Feedback (optional)</label>
          <textarea name="teacher_feedback" placeholder="Notes for the student"></textarea>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-danger" type="submit" data-status="rejected" style="flex:1; justify-content:center">Send back</button>
          <button class="btn btn-primary" type="submit" data-status="approved" style="flex:1; justify-content:center">Approve</button>
        </div>
      </form>
    `);
  }

  if (m.type === "editSkill") {
    const tree = state.selectedTreeDetail;
    const skill = tree && tree.skills.find((s) => s.id === m.skillId);
    if (!skill) return "";

    const skillOptions = tree.skills
      .filter((s) => s.id !== skill.id)
      .map((s) => `
        <div class="checkbox-row">
          <input type="checkbox" name="prereq" value="${s.id}" id="edit-prereq-${s.id}" ${skill.prerequisite_ids.includes(s.id) ? "checked" : ""} />
          <label for="edit-prereq-${s.id}" style="text-transform:none; font-size:0.85rem; color:var(--text)">${escapeHtml(s.title)}</label>
        </div>
      `).join("") || `<p class="helper-text">No other skills yet to depend on.</p>`;

    return modalShell("Edit skill", `
      <form data-form="edit-skill" data-tree-id="${tree.id}" data-skill-id="${skill.id}">
        <div class="field">
          <label>Title</label>
          <input type="text" name="title" required value="${escapeHtml(skill.title)}" />
        </div>
        <div class="field">
          <label>Evidence required</label>
          <textarea name="evidence_required" placeholder="Detail what evidence is required to demonstrate this skill and include specific filetype if there is one.">${escapeHtml(skill.evidence_required || "")}</textarea>
        </div>
        <div class="field">
          <label>Requires (prerequisites)</label>
          <div class="checkbox-list">${skillOptions}</div>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center">Save changes</button>
      </form>
    `);
  }

  if (m.type === "submitEvidence") {
    return modalShell(`Submit evidence — ${escapeHtml(m.skillTitle)}`, `
      ${m.evidenceRequired ? `<div class="card" style="margin-bottom:14px; font-size:0.9rem;"><strong>Evidence required:</strong> ${escapeHtml(m.evidenceRequired)}</div>` : ""}
      <form data-form="submit-evidence" data-skill-id="${m.skillId}">
        <div class="field">
          <label>Explain what you did</label>
          <textarea name="content_text" placeholder="Describe how you demonstrated this skill…"></textarea>
        </div>
        <div class="field">
          <label>Link (optional)</label>
          <input type="url" name="link_url" placeholder="https://…" />
        </div>
        <div class="field">
          <label>Upload a file (optional)</label>
          <input type="file" name="evidence_file" />
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center">Submit</button>
      </form>
    `);
  }

  return "";
}

function modalShell(title, bodyHtml) {
  return `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal" data-stop-propagation>
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" data-action="close-modal">&times;</button>
        </div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

// ============================================================
// Event wiring — delegated listeners, attached fresh each render
// ============================================================

function wireEvents() {
  root.querySelectorAll("[data-stop-propagation]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  root.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", handleAction);
  });

  root.querySelectorAll("form[data-form]").forEach((el) => {
    el.addEventListener("submit", handleFormSubmit);
  });
}

function handleAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;
  if (!action) return;

  switch (action) {
    case "switch-to-signup": setState({ authMode: "signup", errorMessage: null }); break;
    case "switch-to-login": setState({ authMode: "login", errorMessage: null }); break;
    case "set-signup-role": setState({ signupRole: el.dataset.role }); break;
    case "logout": handleLogout(); break;

    case "teacher-tab":
      if (el.dataset.tab === "evidence-load") loadPendingEvidence();
      else setState({ teacherTab: el.dataset.tab });
      break;
    case "student-tab": setState({ studentTab: el.dataset.tab }); break;

    case "open-tree": openTeacherTree(Number(el.dataset.treeId)); break;
    case "open-student-tree": openStudentTree(Number(el.dataset.treeId)); break;

    case "remove-student": {
      const groupId = Number(el.dataset.groupId);
      const studentId = Number(el.dataset.studentId);
      Api.removeStudentFromGroup(groupId, studentId)
        .then(refreshGroups)
        .catch(showError);
      break;
    }

    case "open-modal":
      setState({ modal: { type: el.dataset.modal, evidenceId: Number(el.dataset.evidenceId) || undefined } });
      break;
    case "close-modal": setState({ modal: null }); break;

    case "select-skill": {
      const skillId = Number(el.dataset.skillId);
      if (state.view === "teacher") {
        setState({ modal: { type: "editSkill", skillId } });
      } else if (state.view === "student") {
        const skill = state.selectedStudentTreeDetail.skills.find((s) => s.id === skillId);
        if (skill) {
          setState({ modal: { type: "submitEvidence", skillId, skillTitle: skill.title, evidenceRequired: skill.evidence_required } });
        }
      }
      break;
    }
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const formType = form.dataset.form;
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    if (formType === "login") {
      await handleLogin(data.email, data.password);
    }

    else if (formType === "signup") {
      await handleSignup({
        full_name: data.full_name, email: data.email,
        password: data.password, role: state.signupRole,
      });
    }

    else if (formType === "create-tree") {
      await Api.createSkillTree({ title: data.title, description: data.description || null });
      setState({ modal: null });
      await loadTeacherHome();
      showToast("Skill tree created");
    }

    else if (formType === "create-group") {
      await Api.createGroup(data.name);
      setState({ modal: null });
      await loadTeacherHome();
      showToast("Group created");
    }

    else if (formType === "add-student") {
      const groupId = Number(form.dataset.groupId);
      const student = findStudentByLabel(data.student_label);
      if (!student) throw new Error("Pick a student from the search results.");
      await Api.addStudentToGroup(groupId, student.id);
      form.reset();
      await refreshGroups();
      showToast("Student added");
    }

    else if (formType === "search-students") {
      setState({ studentsSearchQuery: data.q || "" });
    }

    else if (formType === "add-skill") {
      const treeId = Number(form.dataset.treeId);
      const prereqIds = Array.from(form.querySelectorAll('input[name="prereq"]:checked')).map((i) => Number(i.value));
      await Api.addSkill(treeId, {
        title: data.title, evidence_required: data.evidence_required || null,
        prerequisite_ids: prereqIds,
      });
      await openTeacherTree(treeId);
      showToast("Skill added");
    }

    else if (formType === "edit-skill") {
      const treeId = Number(form.dataset.treeId);
      const skillId = Number(form.dataset.skillId);
      const prereqIds = Array.from(form.querySelectorAll('input[name="prereq"]:checked')).map((i) => Number(i.value));
      await Api.updateSkill(treeId, skillId, {
        title: data.title, evidence_required: data.evidence_required || null,
        prerequisite_ids: prereqIds,
      });
      setState({ modal: null });
      await openTeacherTree(treeId);
      showToast("Skill updated");
    }

    else if (formType === "assign-group") {
      const treeId = Number(form.dataset.treeId);
      await Api.assignToGroup(treeId, Number(data.group_id));
      showToast("Tree assigned to group");
    }

    else if (formType === "assign-student") {
      const treeId = Number(form.dataset.treeId);
      const student = findStudentByLabel(data.student_label);
      if (!student) throw new Error("Pick a student from the search results.");
      await Api.assignToStudent(treeId, student.id);
      form.reset();
      showToast("Tree assigned to student");
    }

    else if (formType === "review-evidence") {
      const evidenceId = Number(form.dataset.evidenceId);
      const status = e.submitter ? e.submitter.dataset.status : "approved";
      await Api.reviewEvidence(evidenceId, { status, teacher_feedback: data.teacher_feedback || null });
      setState({ modal: null });
      await loadPendingEvidence();
      showToast(status === "approved" ? "Evidence approved" : "Sent back for revision");
    }

    else if (formType === "submit-evidence") {
      const skillId = Number(form.dataset.skillId);
      const fileInput = form.querySelector('input[name="evidence_file"]');
      let file_url = null;
      let file_name = null;
      if (fileInput && fileInput.files[0]) {
        const uploaded = await Api.uploadEvidenceFile(fileInput.files[0]);
        file_url = uploaded.file_url;
        file_name = fileInput.files[0].name;
      }
      await Api.submitEvidence({
        skill_id: skillId,
        content_text: data.content_text || null,
        link_url: data.link_url || null,
        file_url,
        file_name,
      });
      setState({ modal: null });
      await openStudentTree(state.selectedStudentTreeId);
      showToast("Evidence submitted");
    }
  } catch (err) {
    showError(err);
  }
}

bootstrap();

// Exposed for debugging/testing only — not required for the app to function.
if (typeof window !== "undefined") window.__debugState = state;
