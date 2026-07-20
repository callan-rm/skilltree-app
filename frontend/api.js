// Thin wrapper around fetch for talking to the FastAPI backend.
// Every function returns a parsed JSON body, or throws an Error with a
// human-readable message pulled from the backend's `detail` field.

const Api = (() => {
  function getToken() {
    return localStorage.getItem("skilltree_token");
  }

  async function request(path, { method = "GET", body, form, auth = true } = {}) {
    const headers = {};
    if (auth && getToken()) {
      headers["Authorization"] = `Bearer ${getToken()}`;
    }

    let fetchBody;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchBody = new URLSearchParams(form).toString();
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { method, headers, body: fetchBody });
    } catch (err) {
      throw new Error(
        `Couldn't reach the server at ${API_BASE}. Is the backend running?`
      );
    }

    if (res.status === 204) return null;

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }
    }

    if (!res.ok) {
      const detail = data && data.detail ? data.detail : `Request failed (${res.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }

    return data;
  }

  async function uploadFile(file) {
    const headers = {};
    if (getToken()) headers["Authorization"] = `Bearer ${getToken()}`;

    const formData = new FormData();
    formData.append("file", file);

    let res;
    try {
      res = await fetch(`${API_BASE}/evidence/upload`, { method: "POST", headers, body: formData });
    } catch (err) {
      throw new Error(
        `Couldn't reach the server at ${API_BASE}. Is the backend running?`
      );
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }
    }

    if (!res.ok) {
      const detail = data && data.detail ? data.detail : `Request failed (${res.status})`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }

    return data;
  }

  return {
    // --- auth ---
    signup: (payload) => request("/auth/signup", { method: "POST", body: payload, auth: false }),
    login: (email, password) =>
      request("/auth/login", { method: "POST", form: { username: email, password }, auth: false }),
    me: () => request("/auth/me"),

    // --- groups ---
    listGroups: () => request("/groups/"),
    createGroup: (name) => request("/groups/", { method: "POST", body: { name } }),
    addStudentToGroup: (groupId, studentId) =>
      request(`/groups/${groupId}/students/${studentId}`, { method: "POST" }),
    removeStudentFromGroup: (groupId, studentId) =>
      request(`/groups/${groupId}/students/${studentId}`, { method: "DELETE" }),

    // --- students ---
    listStudents: () => request("/students/"),

    // --- skill trees ---
    listSkillTrees: () => request("/skill-trees/"),
    getSkillTree: (id) => request(`/skill-trees/${id}`),
    createSkillTree: (payload) => request("/skill-trees/", { method: "POST", body: payload }),
    addSkill: (treeId, payload) =>
      request(`/skill-trees/${treeId}/skills`, { method: "POST", body: payload }),
    updateSkill: (treeId, skillId, payload) =>
      request(`/skill-trees/${treeId}/skills/${skillId}`, { method: "PUT", body: payload }),
    deleteSkill: (treeId, skillId) =>
      request(`/skill-trees/${treeId}/skills/${skillId}`, { method: "DELETE" }),
    assignToGroup: (treeId, groupId) =>
      request(`/skill-trees/${treeId}/assign-group/${groupId}`, { method: "POST" }),
    assignToStudent: (treeId, studentId) =>
      request(`/skill-trees/${treeId}/assign-student/${studentId}`, { method: "POST" }),

    // --- evidence ---
    uploadEvidenceFile: (file) => uploadFile(file),
    submitEvidence: (payload) => request("/evidence/", { method: "POST", body: payload }),
    deleteEvidenceFile: (evidenceId) => request(`/evidence/${evidenceId}/file`, { method: "DELETE" }),
    myEvidence: () => request("/evidence/mine"),
    pendingEvidence: () => request("/evidence/pending"),
    reviewEvidence: (id, payload) =>
      request(`/evidence/${id}/review`, { method: "POST", body: payload }),

    setToken(token) { localStorage.setItem("skilltree_token", token); },
    clearToken() { localStorage.removeItem("skilltree_token"); },
    getToken,
  };
})();
