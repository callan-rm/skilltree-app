const { JSDOM } = require("jsdom");
const fetch = require("node-fetch");
const fs = require("fs");

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(dom, predicate, timeout = 3000, label = "") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate(dom)) return true;
    await wait(50);
  }
  throw new Error(`waitFor timed out (${label}). Body was:\n` + dom.window.document.body.innerHTML.slice(0, 2500));
}

async function newApp() {
  const html = fs.readFileSync("index.html", "utf-8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });
  dom.window.fetch = fetch;
  dom.window.localStorage.clear();

  const config = fs.readFileSync("config.js", "utf-8");
  const api = fs.readFileSync("api.js", "utf-8");
  const app = fs.readFileSync("app.js", "utf-8");

  dom.window.eval([config, api, app].join("\n;\n"));

  await wait(200);
  return dom;
}

function text(dom) { return dom.window.document.body.textContent; }

function fillForm(dom, selector, values) {
  const form = dom.window.document.querySelector(selector);
  if (!form) throw new Error(`form not found: ${selector}`);
  Object.entries(values).forEach(([name, val]) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (!field) throw new Error(`field not found: ${name} in ${selector}`);
    field.value = val;
  });
  return form;
}

function submitForm(dom, form, submitterSelector) {
  const evt = new dom.window.Event("submit", { bubbles: true, cancelable: true });
  if (submitterSelector) {
    Object.defineProperty(evt, "submitter", { value: form.querySelector(submitterSelector) });
  }
  form.dispatchEvent(evt);
}

function click(dom, selector) {
  const el = dom.window.document.querySelector(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

function getState(dom, path) {
  return dom.window.eval(`(function(){ try { return JSON.stringify(${path}); } catch(e) { return null; } })()`);
}

const rand = Math.floor(Math.random() * 1000000);
let failures = 0;

function check(cond, msg) {
  if (cond) { console.log("PASS:", msg); }
  else { console.error("FAIL:", msg); failures++; }
}

async function openTreeAndAssign(dom, treeId, groupId) {
  click(dom, '[data-action="teacher-tab"][data-tab="trees"]');
  await waitFor(dom, (d) => !!d.window.document.querySelector(`[data-action="open-tree"][data-tree-id="${treeId}"]`), 2000, "trees list");
  click(dom, `[data-action="open-tree"][data-tree-id="${treeId}"]`);
  await waitFor(dom, (d) => !!d.window.document.querySelector('form[data-form="assign-group"]'), 2000, "assign form present");
  const form = dom.window.document.querySelector('form[data-form="assign-group"]');
  form.querySelector('[name="group_id"]').value = String(groupId);
  submitForm(dom, form);
  await waitFor(dom, (d) => text(d).includes("Tree assigned to group"), 3000, "assign toast");
}

async function reloadSession(oldDom) {
  const token = oldDom.window.localStorage.getItem("skilltree_token");
  const dom = await newApp();
  dom.window.localStorage.setItem("skilltree_token", token);
  dom.window.eval("bootstrap()");
  await waitFor(dom, (d) => text(d).includes("Your skill trees"), 3000, "reload dashboard");
  return dom;
}

async function main() {
  console.log("\n=== Teacher flow ===");
  let teacherDom = await newApp();
  click(teacherDom, '[data-action="switch-to-signup"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('form[data-form="signup"]'), 2000, "teacher signup form visible");
  submitForm(teacherDom, fillForm(teacherDom, 'form[data-form="signup"]', {
    full_name: "Ms Frontend Test", email: `teacher${rand}@test.com`, password: "password123",
  }));
  await waitFor(teacherDom, (d) => text(d).includes("Your skill trees"), 3000, "teacher dashboard load");
  check(true, "teacher signed up and landed on dashboard");

  click(teacherDom, '[data-action="open-modal"][data-modal="createTree"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('form[data-form="create-tree"]'), 2000, "create-tree modal open");
  submitForm(teacherDom, fillForm(teacherDom, 'form[data-form="create-tree"]', {
    title: "Algebra Basics", description: "Foundational algebra",
  }));
  await waitFor(teacherDom, (d) => text(d).includes("Algebra Basics") && !d.window.document.querySelector('form[data-form="create-tree"]'), 3000, "tree created");
  check(true, "skill tree created");

  click(teacherDom, '[data-action="open-tree"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('form[data-form="add-skill"]'), 2000, "tree detail loaded");

  submitForm(teacherDom, fillForm(teacherDom, 'form[data-form="add-skill"]', { title: "Linear equations" }));
  await waitFor(teacherDom, (d) => text(d).includes("Linear equations"), 3000, "skill 1 added");
  check(true, "skill 1 (no prereqs) added");

  let form2 = fillForm(teacherDom, 'form[data-form="add-skill"]', { title: "Quadratic equations" });
  const checkbox = form2.querySelector('input[name="prereq"]');
  check(!!checkbox, "prerequisite checkbox rendered for existing skill");
  checkbox.checked = true;
  submitForm(teacherDom, form2);
  await waitFor(teacherDom, (d) => text(d).includes("Quadratic equations"), 3000, "skill 2 added");
  check(true, "skill 2 (with prerequisite) added");

  const skillsJson = getState(teacherDom, "__debugState.selectedTreeDetail.skills");
  const skills = JSON.parse(skillsJson);
  const skill1 = skills.find((s) => s.title === "Linear equations");
  const skill2 = skills.find((s) => s.title === "Quadratic equations");
  check(skill2.prerequisite_ids.includes(skill1.id), "skill 2 correctly lists skill 1 as prerequisite");

  const treeId = Number(getState(teacherDom, "__debugState.selectedTreeId"));

  click(teacherDom, '[data-action="teacher-tab"][data-tab="groups"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('[data-modal="createGroup"]'), 2000, "groups tab");
  click(teacherDom, '[data-action="open-modal"][data-modal="createGroup"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('form[data-form="create-group"]'), 2000, "create-group modal");
  submitForm(teacherDom, fillForm(teacherDom, 'form[data-form="create-group"]', { name: "Period 3" }));
  await waitFor(teacherDom, (d) => text(d).includes("Period 3"), 3000, "group created");
  check(true, "group created");

  const groupId = Number(JSON.parse(getState(teacherDom, "__debugState.groups"))[0].id);

  console.log("\n=== Student flow ===");
  let studentDom = await newApp();
  click(studentDom, '[data-action="switch-to-signup"]');
  await waitFor(studentDom, (d) => !!d.window.document.querySelector('form[data-form="signup"]'), 2000, "signup form visible");
  click(studentDom, '[data-action="set-signup-role"][data-role="student"]');
  submitForm(studentDom, fillForm(studentDom, 'form[data-form="signup"]', {
    full_name: "Alex Student", email: `student${rand}@test.com`, password: "password123",
  }));
  await waitFor(studentDom, (d) => text(d).includes("Your skill trees") && text(d).includes("assigned to you"), 3000, "student dashboard load");
  check(true, "student signed up and landed on dashboard");

  const studentId = Number(JSON.parse(getState(studentDom, "__debugState.user")).id);

  console.log("\n=== Teacher assigns tree ===");
  submitForm(teacherDom, fillForm(teacherDom, `form[data-form="add-student"][data-group-id="${groupId}"]`, {
    student_id: String(studentId),
  }));
  await waitFor(teacherDom, (d) => text(d).includes("Student added"), 2000, "student added toast");
  check(true, "student added to group");

  await openTreeAndAssign(teacherDom, treeId, groupId);
  check(true, "tree assigned to group");

  console.log("\n=== Student attempts skills ===");
  studentDom = await reloadSession(studentDom);
  await waitFor(studentDom, (d) => text(d).includes("Algebra Basics"), 3000, "student sees assigned tree");
  check(true, "student sees the assigned tree in their list");

  click(studentDom, '[data-action="open-student-tree"]');
  await waitFor(studentDom, (d) => !!d.window.document.querySelector(".tree-canvas"), 3000, "student tree canvas rendered");
  check(true, "student tree detail renders the skill canvas");

  const svgHtml = studentDom.window.document.querySelector(".tree-canvas-wrap").innerHTML;
  check(svgHtml.includes("Linear equations"), "locked/available skill titles rendered on canvas");

  const lockedGroup = [...studentDom.window.document.querySelectorAll(".skill-node-group")]
    .find((g) => g.textContent.includes("Quadratic"));
  check(lockedGroup.classList.contains("locked"), "quadratic equations node is marked locked before prereq approval");

  const availableGroup = [...studentDom.window.document.querySelectorAll(".skill-node-group")]
    .find((g) => g.textContent.includes("Linear"));
  availableGroup.dispatchEvent(new studentDom.window.Event("click", { bubbles: true }));
  await waitFor(studentDom, (d) => !!d.window.document.querySelector('form[data-form="submit-evidence"]'), 2000, "submit evidence modal opens");
  check(true, "clicking an available (unlocked) skill opens the evidence submission modal");

  submitForm(studentDom, fillForm(studentDom, 'form[data-form="submit-evidence"]', {
    content_text: "Solved 2x + 3 = 7 step by step.",
  }));
  await waitFor(studentDom, (d) => text(d).includes("Evidence submitted"), 3000, "evidence submitted toast");
  check(true, "student submitted evidence for the unlocked skill");

  console.log("\n=== Teacher reviews evidence ===");
  click(teacherDom, '[data-action="teacher-tab"][data-tab="evidence-load"]');
  await waitFor(teacherDom, (d) => d.window.document.querySelectorAll('[data-modal="reviewEvidence"]').length > 0, 4000, "pending evidence list populated");
  check(true, "teacher sees the pending evidence submission");

  click(teacherDom, '[data-action="open-modal"][data-modal="reviewEvidence"]');
  await waitFor(teacherDom, (d) => !!d.window.document.querySelector('form[data-form="review-evidence"]'), 2000, "review modal opens");
  const reviewForm = teacherDom.window.document.querySelector('form[data-form="review-evidence"]');
  submitForm(teacherDom, reviewForm, '[data-status="approved"]');
  await waitFor(teacherDom, (d) => text(d).includes("Evidence approved"), 3000, "approval toast");
  check(true, "teacher approved the evidence");

  console.log("\n=== Student sees skill unlocked after approval ===");
  studentDom = await reloadSession(studentDom);
  click(studentDom, '[data-action="open-student-tree"]');
  await waitFor(studentDom, (d) => !!d.window.document.querySelector(".tree-canvas"), 3000, "student re-views tree");

  const quadraticGroupAfter = [...studentDom.window.document.querySelectorAll(".skill-node-group")]
    .find((g) => g.textContent.includes("Quadratic"));
  check(!quadraticGroupAfter.classList.contains("locked"), "quadratic equations is unlocked after linear equations was approved");

  const linearGroupAfter = [...studentDom.window.document.querySelectorAll(".skill-node-group")]
    .find((g) => g.textContent.includes("Linear"));
  check(linearGroupAfter.querySelector("circle").getAttribute("stroke") === "var(--mastered)", "linear equations node shows mastered color");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nTEST SCRIPT ERROR:", err.message);
  process.exit(1);
});
