# Automação do data.csv via API do ClickUp

O script `generate-csv.js` puxa as tarefas da Lista pela API e grava um `data.csv`
já no formato que o `dashboard-csv.html` lê. O token fica no script (nunca no navegador).

```
Agendador (cron)  →  generate-csv.js (API + token)  →  data.csv  →  TV (dashboard-csv.html)
```

## Colunas geradas
`Task Name, Status, Status Type, Assignees, Assignee Avatar, Start Date, Due Date`
Datas em Unix ms; assignees separados por `;`; a coluna **Assignee Avatar** traz a URL da
foto (o export manual do ClickUp não tem isso — só a API).

## Definindo as listas (`CLICKUP_LIST_IDS`)
Aceita três formatos:
- **IDs por vírgula:** `901234567,901234568`
- **Dicionário nome→id (recomendado)** — nomeia cada projeto na TV:
  `{"SIRGEO Creativity":"901234567","Rotas & Frota":"901234568"}`
- **Array JSON:** `["901234567","901234568"]`

Nos formatos sem nome, o script usa o nome que a própria API devolve para a lista.
Tarefas que aparecem em mais de uma lista entram só uma vez (dedupe por id).

## Testar na sua máquina (uma vez)
Precisa de Node 18+.
```bash
# Linux/macOS
CLICKUP_TOKEN=pk_seu_token CLICKUP_LIST_IDS="901234567,901234568" node generate-csv.js
# Windows PowerShell
$env:CLICKUP_TOKEN="pk_seu_token"; $env:CLICKUP_LIST_IDS="901234567,901234568"; node generate-csv.js
```
Deve criar `data.csv` e imprimir "OK — N tarefas gravadas". Coloque esse `data.csv` ao lado
do `dashboard-csv.html` e abra a página.

## Rodar sozinho todo dia — GitHub Actions (grátis, sem servidor)
1. Crie um repositório e coloque nele: `dashboard-csv.html`, `generate-csv.js`, e o workflow
   em `.github/workflows/update-csv.yml` (arquivo `update-csv.yml` que te entreguei).
2. No repo: **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLICKUP_TOKEN` = seu `pk_...`
   - `CLICKUP_LIST_IDS` = as listas (veja formatos abaixo)
3. Publique a página com **GitHub Pages** (Settings → Pages → branch `main`). A TV abre a URL
   do Pages; a cada rodada o Action reescreve o `data.csv` e o Pages republica sozinho.
4. Para testar já: aba **Actions → Atualiza data.csv do ClickUp → Run workflow**.

O horário está em `cron: "0 9 * * *"` (09:00 UTC ≈ 06:00 BRT). Ajuste se quiser outro horário.
Obs.: agendamentos do GitHub Actions podem atrasar alguns minutos — irrelevante para um quadro diário.

## Alternativas de agendador
- **Servidor próprio / VM**: um `cron` chamando `node generate-csv.js` na pasta servida por HTTP.
- **Windows**: Agendador de Tarefas rodando o mesmo comando.
Em qualquer caso, o `data.csv` só precisa cair ao lado da página.

## Trazer a foto de volta (opcional)
Como o CSV agora tem a coluna **Assignee Avatar**, dá pra mostrar o rosto real na TV em vez das
iniciais. Isso exige uma pequena mudança no `dashboard-csv.html` para ler essa coluna — me avise
que eu habilito.

## Segurança
- O token só existe no ambiente do agendador (secret do GitHub / variável no servidor).
- Se publicar o repositório, confirme que o token está em **Secrets**, nunca no código.
- Regenere o token no ClickUp (Settings → Apps) se suspeitar de vazamento.
