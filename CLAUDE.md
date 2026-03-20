# Portal Pessoal — Contexto do Projeto

> Atualizado em: 2026-03-20

---

## O que é esse projeto

Portal pessoal e de gestão empresarial do Pedro Pertel (Vitória-ES). Web app PWA single-page com dashboard, chat com IA (Claude), kanban de tarefas, gerenciador de documentos e agenda de eventos. Gerencia 5 empresas + vida pessoal em uma interface unificada.

---

## Stack (completa e atualizada)

| Camada | Tecnologia | Detalhes |
|--------|-----------|---------|
| **Frontend** | HTML/CSS/JS puro | Arquivo único `index.html` (~1700 linhas), sem framework |
| **Estilo** | CSS Variables | Dark/Light theme, design system com cores e tokens |
| **Gráficos** | Chart.js 4 | Line chart (performance) + Doughnut (por empresa) |
| **Banco** | Supabase (PostgreSQL) | Projeto ID: `msbwplsknncnxwsalumd` |
| **Auth** | Supabase Auth | Email/senha, JWT, `onAuthStateChange` como source of truth |
| **Storage** | Supabase Storage | Bucket `documentos` para upload de arquivos |
| **IA** | Claude Haiku 4.5 | Via Edge Function `chat-claude` no Supabase |
| **Hospedagem** | Vercel | Deploy automático via push no GitHub |
| **PWA** | Service Worker + Manifest | Cache offline, push notifications, instalável |
| **Repositório** | GitHub | `pedropertel/portal-pessoal` |

### URLs principais
- **App**: https://portal-pessoal-plum.vercel.app
- **Supabase**: https://msbwplsknncnxwsalumd.supabase.co
- **GitHub**: https://github.com/pedropertel/portal-pessoal

### Credenciais (não compartilhar)
- Supabase Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYndwbHNrbm5jbnh3c2FsdW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUzMTAsImV4cCI6MjA4OTQzMTMxMH0.qDSAYC8KQO_PQsdRrwsIdYWdkrwqO2riFiDjJ08zctI`
- ANTHROPIC_API_KEY: configurada nos Secrets da Edge Function do Supabase
- Usuário: pedro.pertel@gmail.com

---

## O que está funcionando agora

- **Auth**: login/logout com email e senha, sessão persistida em localStorage, auto-refresh de token
- **Dashboard**: 4 stat cards (tarefas pendentes, eventos hoje, documentos, gráfica), gráfico de performance de tarefas (7 dias), gráfico de pizza por empresa (dados reais), tabela de tarefas recentes
- **Tarefas (Kanban)**: 3 colunas (pendente, em andamento, concluída), drag & drop entre colunas, criar/editar/excluir, campos: título, descrição, empresa, prioridade, status, data de vencimento, lembrete (data+hora), ordenação por prioridade (urgentes primeiro), filtro por empresa, ícone 🔔 no kanban para tarefas com lembrete, alarme automático com banner + som + Web Notification no horário agendado
- **Documentos**: navegação por pastas/subpastas, criar/renomear/excluir pastas, renomear/excluir arquivos, upload de múltiplos arquivos para Supabase Storage, visualizador inline de PDFs e imagens (estilo WhatsApp), compartilhamento nativo (Web Share API com fallback clipboard), breadcrumb de navegação, menu de contexto
- **Chat IA (Claude Dispatch)**: classificação automática em 2 etapas (domínio → agente especializado), 5 agentes: tarefas, agenda, gráfica, sítio, geral. Histórico persistido em `chat_mensagens`, ações automáticas (criar tarefa, evento, gasto), reconhecimento de voz com texto parcial em tempo real (interimResults), renderização de Markdown, badge do agente na resposta
- **Módulo Sítio**: 5 sub-abas (Visão geral, Lançamentos, Centros de custo, Cronograma, Relatórios). CRUD completo de centros de custo e lançamentos, gráficos de barras e pizza, filtros por centro e tipo (realizado/planejado)
- **Agenda**: lista de eventos agrupados por dia, mini calendário do mês atual, resumo (semana, mês, próximo evento), CRUD completo de eventos (criar, editar, excluir), associação com empresa
- **Busca global**: `Ctrl+K` abre busca, pesquisa em tarefas, documentos, eventos e empresas, dropdown com resultados clicáveis
- **Tema claro/escuro**: toggle no header, persiste em localStorage
- **Notificações**: push notifications para eventos próximos, alerta sonoro, banner in-app
- **Atalhos de teclado**: `Ctrl+K` busca, `N` nova tarefa, `E` novo evento, `1-5` navegação, `Esc` fechar modal
- **PWA**: Service Worker com cache, manifest.json, instalável em mobile

---

## Bugs conhecidos / limitações atuais

- **Bug 403 RESOLVIDO**: era falta de GRANT SELECT/INSERT/UPDATE/DELETE para roles `authenticated` e `anon`. Corrigido via migração `grant_authenticated_data_privileges`.
- **deploy.sh não existe**: o script referenciado no CLAUDE.md antigo nunca foi criado. Deploy é feito via `git push origin main` (Vercel detecta automaticamente).
- **Ícones PWA faltando**: `manifest.json` referencia `/icon-192.png` e `/icon-512.png` que não existem no repositório.
- **Service Worker básico**: só cache de assets estáticos, não tem sincronização offline real.
- **Chat não faz streaming**: resposta do Claude chega toda de uma vez, sem efeito de digitação progressiva.
- **Gráfico de pizza**: border color hardcoded `#1E2435` não adapta ao tema claro.
- **Sem validação de formulários**: modais aceitam dados vazios em alguns campos opcionais sem feedback.

---

## Empresas do Pedro (entidades no banco)

| Empresa | Tipo | Ícone | Cor |
|---------|------|-------|-----|
| Pincel Atômico | empresa | ✏️ | #2196F3 |
| CEDTEC | empresa | 🎓 | #FF5722 |
| Gráfica | empresa | 🖨️ | #607D8B |
| Agência de Marketing | empresa | 📣 | #9C27B0 |
| Sítio Monte da Vitória | propriedade | 🌱 | #4A9B5F |
| Pessoal / Família | pessoal | 👤 | #C4A84F |

---

## Módulos implementados

### 1. Dashboard (`page-dashboard`)
- Stat cards com contadores ao vivo
- Gráfico de performance de tarefas (últimos 7 dias)
- Gráfico de pizza por empresa (dados reais do banco)
- Tabela de tarefas recentes (8 últimas)

### 2. Assistente IA — Claude Dispatch (`page-chat`)
- **Dispatch em 2 etapas**: Etapa 1 classifica domínio (max_tokens: 20), Etapa 2 responde com system prompt especializado
- 5 agentes: `tarefas`, `agenda`, `grafica`, `sitio`, `geral`
- Resposta inclui campo `agente` — frontend exibe badge do agente
- Ações automáticas: o assistente pode criar tarefas, eventos e gastos
- Histórico salvo na tabela `chat_mensagens`
- Reconhecimento de voz (Web Speech API)
- Renderização de Markdown

### 3. Agenda (`page-agenda`)
- Lista de eventos agrupados por dia
- Mini calendário com indicação de dias com eventos
- Resumo: eventos da semana, do mês, próximo evento
- CRUD completo (criar, editar, excluir)
- Associação com empresa via `entidade_id`

### 4. Tarefas (`page-tasks`)
- Kanban com 3 colunas e drag & drop
- Campos: título, descrição, empresa, prioridade, status, data, lembrete (data+hora)
- Ordenação por prioridade (urgentes no topo)
- Filtro por empresa
- `data_conclusao` preenchida automaticamente ao concluir
- Lembretes: 🔔 no kanban, alarme automático via `scheduleReminders()` com setTimeout até horário exato, banner + som + Web Notification, reavaliação a cada hora

### 5. Documentos (`page-docs`)
- Navegação hierárquica por pastas (até 3 níveis)
- Upload de múltiplos arquivos (Supabase Storage)
- Visualizador inline: PDFs em iframe, imagens centralizadas com pinch-to-zoom
- Compartilhamento nativo: Web Share API (WhatsApp, AirDrop, email) com fallback clipboard (7 dias)
- Download, renomear, excluir
- Menu de contexto: Visualizar, Download, Compartilhar, Renomear, Excluir

### 6. Sítio Monte da Vitória (`page-sitio`)
- 5 sub-abas: Visão geral, Lançamentos, Centros de custo, Cronograma, Relatórios
- **Visão geral**: 4 stat cards (total investido, gasto mensal, planejado 3 meses, qtd centros), barras de progresso por centro, últimos lançamentos
- **Lançamentos**: tabela com filtros por centro de custo e tipo (realizado/planejado), CRUD completo, anexo de comprovantes (foto/arquivo/PDF), ícone 📎 clicável na tabela
- **Centros de custo**: grid de cards com ícone, cor, tipo e valor. CRUD com color picker
- **Cronograma**: gráfico de barras realizado vs planejado por mês (6 passados + 3 futuros)
- **Relatórios**: gráfico de pizza por centro de custo + resumo financeiro
- 6 centros iniciais: Terreno, Casa sede, Infraestrutura, Café arábica, Azeitona, Galpão/tulha

---

## Módulos pendentes (roadmap)

- [ ] **Google Calendar OAuth** — Client ID não configurado, modal de instrução existe
- [ ] **Módulo Gráfica** — receitas parceladas por cidade, conciliação bancária (tabelas `grafica_*` já existem no banco)
- [ ] **Módulo Marketing / Meta Ads** — integração com Meta API para CEDTEC e Agência (tabelas `meta_*` já existem)
- [ ] **Módulo Pincel Atômico** — tarefas e projetos específicos
- [ ] **Ícones PWA** — criar e adicionar `icon-192.png` e `icon-512.png`
- [ ] **Notificações push reais** — integrar com Supabase para push server-side
- [ ] **Chat streaming** — resposta progressiva do Claude
- [ ] **Offline mode** — sync via Service Worker quando sem conexão

---

## Como fazer deploy

```bash
cd ~/Desktop/portal-pessoal
git add index.html    # (ou arquivos alterados)
git commit -m "descrição da mudança"
git push origin main
# Vercel detecta o push e faz deploy automático em ~1 minuto
```

**Requisitos**:
- GitHub CLI (`gh`) autenticado — `gh auth login --web --git-protocol https`
- Credential helper configurado — `gh auth setup-git`

**Vercel**:
- Projeto: `portal-pessoal` (org: `team_DzIGTZ5VcmGCW32oJJsPOndD`)
- Deploy automático na branch `main`
- URL: https://portal-pessoal-plum.vercel.app

---

## Estrutura do código (resumo)

```
portal-pessoal/
├── index.html          # App inteiro (~2085 linhas): HTML + CSS + JS
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (cache + push)
├── .gitignore          # Ignora .vercel e .env*.local
├── .vercel/            # Config do projeto Vercel
├── CLAUDE.md           # Este arquivo — contexto para o Claude Code
└── supabase/
    └── functions/
        └── chat-claude/
            └── index.ts    # Edge Function com Claude Dispatch
                - URL: /functions/v1/chat-claude
                - verify_jwt: false (validação manual)
                - Modelo: claude-haiku-4-5-20251001
                - Dispatch: classifica domínio → agente especializado
                - 5 agentes: tarefas, agenda, grafica, sitio, geral
                - Retorna: { reply, action, actionData, agente }
                - Actions: tarefa | evento | gasto
```

### Estrutura do `index.html`

| Seção | Linhas ~aprox | Conteúdo |
|-------|-------------|----------|
| `<head>` | 1-12 | Meta tags, manifest, fonts, Chart.js |
| CSS | 13-430 | Todo o design system (variáveis, componentes, responsivo, temas, sítio) |
| HTML Auth | 430-450 | Tela de login |
| HTML App | 450-720 | Header, sidebar, pages (dashboard, chat, agenda, tasks, docs, sítio, empresas) |
| HTML Modal/Toast | 720-750 | Modal genérico, toasts, push notification |
| JavaScript | 750-2400 | Toda a lógica do app |

### Funções JS principais (~85 funções)

**Auth**: `signIn`, `initApp`
**Navegação**: `setupSidebar`, `toggleSidebar`, `goPage`
**Tema**: `setupTheme`, `updateThemeIcon`
**Atalhos**: `setupKeyboardShortcuts`
**Busca**: `setupSearch`, `doSearch`
**Dashboard**: `loadDashboard`, `renderRecentTasksTable`, `renderMainChart`, `renderPieChart`
**Tarefas**: `loadTasks`, `renderKanban`, `setupDragDrop`, `openNewTask`, `openEditTask`, `scheduleReminders`
**Documentos**: `loadDocs`, `renderDocs`, `openNewFolder`, `renameFolder`, `deleteFolder`, `triggerUpload`, `downloadDoc`, `openFileViewer`, `closeFileViewer`, `shareDoc`
**Chat**: `sendMsg`, `appendMsg`, `renderMarkdown`, `loadChatHistory`, `clearChat`, `resetMic`
**Ações IA**: `handleActionTarefa`, `handleActionEvento`, `handleActionGasto`
**Agenda**: `loadAgenda`, `renderAgendaList`, `renderMiniCalendar`, `renderAgendaStats`, `openNewEvent`, `openEditEvent`
**Sítio**: `loadSitio`, `sitioTab`, `sitioRenderVisao`, `sitioRenderLancs`, `sitioRenderCentrosGrid`, `sitioRenderCrono`, `sitioRenderRelat`, `sitioOpenNewCentro`, `sitioOpenEditCentro`, `sitioOpenNewLanc`, `sitioOpenEditLanc`, `sitioDeleteLanc`, `sitioAttachSection`, `sitioPreviewAttach`, `sitioUploadAttach`, `sitioViewAttach`, `renderIconPicker`, `renderColorPicker`, `fmtMoney`, `parseDateBR`
**Notificações**: `checkNotifs`, `triggerNotif`, `closeNotif`, `requestNotifPermission`, `scheduleReminders`
**UI**: `openModal`, `closeModal`, `showToast`, `esc`, `fmtDate`

---

## Banco de dados — Tabelas

```
entidades              — empresas/entidades do Pedro (6 registros)
tarefas                — kanban (titulo, descricao, entidade_id, status, prioridade, data_vencimento, lembrete_em)
eventos                — agenda (titulo, data_inicio, data_fim, local, entidade_id, cor, dia_inteiro)
pastas                 — pastas de documentos (nome, pasta_pai_id)
documentos             — arquivos (nome, pasta_id, arquivo_url, arquivo_nome, arquivo_tipo)
projetos               — projetos (não implementado no frontend ainda)
chat_mensagens         — histórico do chat (role, conteudo, acao_executada, acao_dados)
notificacoes           — notificações (não implementado no frontend ainda)
grafica_pedidos        — pedidos da gráfica (módulo pendente)
grafica_parcelas       — parcelas de receitas (módulo pendente)
grafica_extratos       — extratos bancários (módulo pendente)
grafica_conciliacao    — conciliação bancária (módulo pendente)
meta_conexoes          — conexões Meta/Facebook (módulo pendente)
meta_campanhas_cache   — cache de campanhas Meta (módulo pendente)
sitio_categorias       — centros de custo do sítio (nome, cor, icone, tipo: terreno/obra/lavoura/infra/geral)
sitio_lancamentos      — lançamentos financeiros (descricao, valor, centro_custo_id, tipo: realizado/planejado, data_prevista, data_realizada, notas, comprovante_url)
```

Todas com RLS habilitado, policy `allow_authenticated_*` com `USING (true)`.
Grants: SELECT, INSERT, UPDATE, DELETE para `authenticated` e `anon`.

---

## Notas técnicas importantes

1. **Supabase JS é v2.39.3** — fixada para evitar breaking changes. Script carregado no final do `<body>`, uma única vez.

2. **Auth via `onAuthStateChange`** — é a única fonte de verdade para estado de login. Eventos: `SIGNED_IN`, `TOKEN_REFRESHED`, `INITIAL_SESSION`, `SIGNED_OUT`. Flag `appInitialized` evita dupla inicialização.

3. **Arquivo único** — todo o app está em `index.html`. Para editar, usar busca por seções marcadas com `// ── NOME ──`.

4. **Edge Function `chat-claude` (Claude Dispatch)** — `verify_jwt: false`. Modelo: `claude-haiku-4-5-20251001`. Dispatch em 2 etapas: (1) classificação rápida do domínio com max_tokens: 20, (2) resposta com system prompt especializado. 5 domínios: tarefas, agenda, grafica, sitio, geral. Código fonte em `supabase/functions/chat-claude/index.ts`. Deploy via Supabase CLI: `supabase functions deploy chat-claude --project-ref msbwplsknncnxwsalumd`.

5. **Entidades (empresas)** — carregadas uma vez no `initApp()` e armazenadas em `_entidades`. Usadas em tarefas, eventos e gráficos.

6. **Drag & Drop** — usa API nativa HTML5 (dragstart/dragover/drop). Ao soltar, faz `UPDATE` no Supabase e recarrega o kanban.

7. **Tema** — CSS variables com override via `html.light`. Persiste em `localStorage('portal-theme')`.

8. **Deploy** — não existe `deploy.sh`. Usar `git push origin main` diretamente. Vercel detecta e faz deploy automático.

9. **PWA** — `sw.js` registra Service Worker com cache de assets. `manifest.json` configurado mas faltam os ícones reais.

10. **Busca** — roda no client-side sobre dados já carregados (`_tasks`, `allDocs`, `_events`, `_entidades`). Não faz query ao banco.

11. **Módulo Sítio** — dados em `_sitioCentros` e `_sitioLancs`. `_sitioCentros` é carregado no `initApp()` (necessário para `handleActionGasto` no chat). Gráficos usando Chart.js. `fmtMoney()` formata valores. `parseDateBR()` converte DD/MM/AAAA → YYYY-MM-DD. Anexos/comprovantes são uploadeados para `documentos/sitio/comprovantes/` no Supabase Storage.

12. **Datas brasileiras** — `parseDateBR()` aceita DD/MM/AAAA, DD-MM-AAAA e DD.MM.AA. Edge Function instrui Claude a retornar datas no formato DD/MM/AAAA. O frontend converte para ISO antes de salvar no banco.
