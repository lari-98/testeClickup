/**
 * generate-csv.js — gera o data.csv a partir da API do ClickUp (várias listas)
 * ---------------------------------------------------------------------------
 * Node 18+ (fetch nativo), sem dependências. O token só vive aqui, não no navegador.
 *
 * Defina as listas por variável de ambiente, em qualquer um destes formatos:
 *
 *   1) IDs separados por vírgula:
 *        CLICKUP_LIST_IDS="901234567,901234568,901234569"
 *
 *   2) Dicionário nome→id (JSON) — dá um nome de projeto a cada lista:
 *        CLICKUP_LIST_IDS='{"SIRGEO Creativity":"901234567","Rotas & Frota":"901234568"}'
 *
 *   3) Array de ids (JSON):
 *        CLICKUP_LIST_IDS='["901234567","901234568"]'
 *
 *   (CLICKUP_LIST_ID — singular — continua funcionando para uma lista só.)
 *
 * Outras variáveis:
 *   CLICKUP_TOKEN    (obrigatória)  token pk_...
 *   OUT_FILE         (opcional)     saída — padrão ./data.csv
 *   ONLY_MILESTONES  (opcional)     "1" para exportar só marcos (milestones)
 *
 * Quando o nome não é informado (formatos 1 e 3), o script usa o nome da lista
 * que a própria API devolve.
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const CLICKUP = "https://api.clickup.com/api/v2";

const TOKEN = process.env.CLICKUP_TOKEN;
const OUT_FILE = process.env.OUT_FILE || "data.csv";
const ONLY_MILESTONES = process.env.ONLY_MILESTONES === "1";

/** Lê as listas do ambiente → array de { id, name(|null) } */
function parseLists() {
  const raw = (process.env.CLICKUP_LIST_IDS || process.env.CLICKUP_LIST_ID || "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") || raw.startsWith("[")) {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(id => ({ id: String(id).trim(), name: null }));
    return Object.entries(j).map(([name, id]) => ({ id: String(id).trim(), name: String(name) }));
  }
  return raw.split(/[,\s]+/).filter(Boolean).map(id => ({ id, name: null }));
}

const LISTS = parseLists();
if (!TOKEN || LISTS.length === 0) {
  console.error("Faltou CLICKUP_TOKEN e/ou CLICKUP_LIST_IDS nas variáveis de ambiente.");
  process.exit(1);
}

async function fetchAllTasks(listId) {
  const all = [];
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({
      archived: "false", include_closed: "true", subtasks: "false",
      order_by: "due_date", page: String(page)
    });
    const res = await fetch(`${CLICKUP}/list/${listId}/task?${qs}`, {
      headers: { Authorization: TOKEN, "Content-Type": "application/json" }
    });
    if (!res.ok) throw new Error(`ClickUp ${res.status} na lista ${listId}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const batch = data.tasks || [];
    all.push(...batch);
    if (data.last_page || batch.length < 100) break;
  }
  return all;
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
      cell(t.__listName),
      cell(t.name),
      cell(t.status ? t.status.status : ""),
      cell(t.status ? t.status.type : ""),
      cell(assignees.join("; ")),
      cell(avatar),
      cell(t.start_date || ""),
      cell(t.due_date || "")
    ].join(","));
  }
  return out.join("\r\n") + "\r\n";
}

(async () => {
  try {
    const seen = new Set();     // dedupe: uma tarefa pode estar em mais de uma lista
    const rows = [];
    for (const L of LISTS) {
      let batch = await fetchAllTasks(L.id);
      if (ONLY_MILESTONES) batch = batch.filter(t => t.milestone);
      for (const t of batch) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        t.__listName = L.name || (t.list && t.list.name) || ("Lista " + L.id);
        rows.push(t);
      }
      console.log(`  ${L.name || L.id}: ${batch.length} tarefas`);
    }
    fs.writeFileSync(OUT_FILE, toCSV(rows), "utf8");
    console.log(`OK — ${rows.length} tarefas de ${LISTS.length} lista(s) em ${OUT_FILE}`);
  } catch (err) {
    console.error("Falhou:", err.message || err);
    process.exit(1);
  }
})();
