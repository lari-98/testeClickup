/**
 * generate-csv.js — gera o data.csv a partir da API do ClickUp
 * ---------------------------------------------------------------------------
 * Dois modos (pode usar um, o outro, ou os dois juntos):
 *
 *   A) LISTAS INTEIRAS  →  CLICKUP_LIST_IDS
 *      Traz as tarefas de nível superior de cada lista.
 *
 *   B) TAREFA-MÃE + SUBTAREFAS  →  CLICKUP_PARENTS   (o que você quer)
 *      Aponta para uma tarefa específica e traz só as filhas dela (em qualquer
 *      nível de aninhamento). A "descrição" vira o nome do projeto na TV.
 *
 * Formatos (iguais nos dois): id por vírgula, dicionário JSON nome→id, ou array JSON.
 *   CLICKUP_PARENTS='{"SIRGEO":"86abc123","SISVIAS":"86def456"}'
 *   CLICKUP_PARENTS="86abc123,86def456"
 *
 * Como achar o ID da tarefa-mãe: abra a tarefa no ClickUp; o id é o trecho depois
 * de /t/ na URL (app.clickup.com/t/86abc123), ou use "..." → Copy ID.
 *
 * Variáveis:
 *   CLICKUP_TOKEN     (obrigatória)  pk_...
 *   CLICKUP_PARENTS   e/ou CLICKUP_LIST_IDS  (pelo menos um)
 *   OUT_FILE          (opcional)     saída — padrão ./data.csv
 *   ONLY_MILESTONES   (opcional)     "1" para manter só tarefas marcadas como milestone
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const CLICKUP = "https://api.clickup.com/api/v2";

const TOKEN = process.env.CLICKUP_TOKEN;
const OUT_FILE = process.env.OUT_FILE || "data.csv";
const ONLY_MILESTONES = process.env.ONLY_MILESTONES === "1";

/** "id,id" | '{"nome":"id"}' | '["id"]'  →  [{ id, name|null }] */
function parseColl(raw) {
  raw = (raw || "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") || raw.startsWith("[")) {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(id => ({ id: String(id).trim(), name: null }));
    return Object.entries(j).map(([name, id]) => ({ id: String(id).trim(), name: String(name) }));
  }
  return raw.split(/[,\s]+/).filter(Boolean).map(id => ({ id, name: null }));
}

const LISTS = parseColl(process.env.CLICKUP_LIST_IDS || process.env.CLICKUP_LIST_ID);
const PARENTS = parseColl(process.env.CLICKUP_PARENTS || process.env.CLICKUP_PARENT_ID);

if (!TOKEN || (LISTS.length + PARENTS.length === 0)) {
  console.error("Faltou CLICKUP_TOKEN e pelo menos um de CLICKUP_PARENTS / CLICKUP_LIST_IDS.");
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${CLICKUP}${path}`, {
    headers: { Authorization: TOKEN, "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status} em ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function fetchListTasks(listId, withSubtasks) {
  const all = [];
  for (let page = 0; page < 60; page++) {
    const qs = new URLSearchParams({
      archived: "false", include_closed: "true",
      subtasks: withSubtasks ? "true" : "false",
      order_by: "due_date", page: String(page)
    });
    const data = await api(`/list/${listId}/task?${qs}`);
    const batch = data.tasks || [];
    all.push(...batch);
    if (data.last_page || batch.length < 100) break;
  }
  return all;
}

// cache de listas (evita rebaixar a mesma lista várias vezes quando há vários pais nela)
const listCache = new Map();
async function getListWithSubtasks(listId) {
  if (!listCache.has(listId)) listCache.set(listId, await fetchListTasks(listId, true));
  return listCache.get(listId);
}

/** true se `task` descende de `parentId` seguindo a cadeia de `parent` */
function isDescendant(task, parentId, byId) {
  let p = task.parent, guard = 0;
  while (p && guard++ < 100) {
    if (p === parentId) return true;
    const pt = byId.get(p);
    p = pt ? pt.parent : null;
  }
  return false;
}

function cell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows) {
  const header = ["List", "Task Name", "Status", "Status Type", "Assignees", "Assignee Avatar", "Start Date", "Due Date"];
  const out = [header.join(",")];
  for (const t of rows) {
    const assignees = (t.assignees || []).map(a => a.username || a.email || "").filter(Boolean);
    const avatar = (t.assignees && t.assignees[0] && t.assignees[0].profilePicture) || "";
    out.push([
      cell(t.__group), cell(t.name),
      cell(t.status ? t.status.status : ""), cell(t.status ? t.status.type : ""),
      cell(assignees.join("; ")), cell(avatar),
      cell(t.start_date || ""), cell(t.due_date || "")
    ].join(","));
  }
  return out.join("\r\n") + "\r\n";
}

(async () => {
  try {
    const seen = new Set();
    const rows = [];

    // ---- A) listas inteiras (nível superior) ----
    for (const L of LISTS) {
      let batch = await fetchListTasks(L.id, false);
      if (ONLY_MILESTONES) batch = batch.filter(t => t.milestone);
      for (const t of batch) {
        if (seen.has(t.id)) continue; seen.add(t.id);
        t.__group = L.name || (t.list && t.list.name) || ("Lista " + L.id);
        rows.push(t);
      }
      console.log(`  [lista] ${L.name || L.id}: ${batch.length} tarefas`);
    }

    // ---- B) tarefa-mãe + subtarefas ----
    for (const P of PARENTS) {
      const parent = await api(`/task/${P.id}?include_subtasks=true`);
      const listId = parent.list && parent.list.id;
      if (!listId) throw new Error(`Não achei a lista da tarefa-mãe ${P.id}.`);
      const group = P.name || parent.name || ("Tarefa " + P.id);

      const all = await getListWithSubtasks(listId);
      const byId = new Map(all.map(t => [t.id, t]));
      let kids = all.filter(t => t.id !== P.id && isDescendant(t, P.id, byId));
      if (ONLY_MILESTONES) kids = kids.filter(t => t.milestone);

      for (const t of kids) {
        if (seen.has(t.id)) continue; seen.add(t.id);
        t.__group = group;
        rows.push(t);
      }
      console.log(`  [mãe]   ${group}: ${kids.length} subtarefas`);
    }

    fs.writeFileSync(OUT_FILE, toCSV(rows), "utf8");
    console.log(`OK — ${rows.length} tarefas em ${OUT_FILE}`);
  } catch (err) {
    console.error("Falhou:", err.message || err);
    process.exit(1);
  }
})();
