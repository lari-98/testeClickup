O script `generate-csv.js` puxa as tarefas da Lista pela API e grava um `data.csv`
já no formato que o `dashboard-csv.html` lê. O token fica no script (nunca no navegador).

```
Agendador (cron)  →  generate-csv.js (API + token)  →  data.csv  →  TV (dashboard-csv.html)
```

## Colunas geradas
`Task Name, Status, Status Type, Assignees, Assignee Avatar, Start Date, Due Date`
Datas em Unix ms; assignees separados por `;`; a coluna **Assignee Avatar** traz a URL da
foto (o export manual do ClickUp não tem isso — só a API).

## Escopo: lista inteira OU tarefa-mãe + subtarefas
O script tem dois modos, combináveis:

- **`CLICKUP_LIST_IDS`** — traz as tarefas de nível superior de cada lista.
- **`CLICKUP_PARENTS`** — aponta para uma tarefa-mãe e traz só as **subtarefas** dela
  (em qualquer nível). É o modo certo quando a lista tem várias coisas e você quer
  limitar a uma tarefa específica e suas filhas. A "descrição" vira o nome do projeto na TV.

## Formatos aceitos (vale para CLICKUP_LIST_IDS e CLICKUP_PARENTS)
Aceita três formatos:
- **IDs por vírgula:** `901234567,901234568`
- **Dicionário nome→id (recomendado)** — nomeia cada projeto na TV:
  `{"SIRGEO Creativity":"901234567","Rotas & Frota":"901234568"}`
- **Array JSON:** `["901234567","901234568"]`
