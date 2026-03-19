# Portal Pessoal — Contexto do Projeto

## O que é esse projeto
Portal pessoal e de gestão empresarial do Pedro Pertel (Vitória-ES). Web app PWA com sidebar, dashboard, chat com IA, tarefas, documentos e agenda. Hospedado no Vercel, banco no Supabase.

## Stack
- **Frontend**: HTML/CSS/JS puro (single file `index.html`) — sem framework
- **Banco**: Supabase (PostgreSQL) — projeto ID: `msbwplsknncnxwsalumd`
- **Storage**: Supabase Storage — bucket `documentos`
- **IA**: Anthropic Claude Haiku via Edge Function `chat-claude` no Supabase
- **Hospedagem**: Vercel — https://portal-pessoal-plum.vercel.app
- **Repositório**: https://github.com/pedropertel/portal-pessoal

## Credenciais (não compartilhar)
- Supabase URL: `https://msbwplsknncnxwsalumd.supabase.co`
- Supabase Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYndwbHNrbm5jbnh3c2FsdW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUzMTAsImV4cCI6MjA4OTQzMTMxMH0.qDSAYC8KQO_PQsdRrwsIdYWdkrwqO2riFiDjJ08zctI`
- ANTHROPIC_API_KEY: configurada nos Secrets da Edge Function do Supabase
- Usuário do portal: pedro.pertel@gmail.com

## Empresas do Pedro (contexto para o assistente IA)
1. **Pincel Atômico** — sistema de gestão escolar, papel de marketing/vendas
2. **Agência de Marketing** — dono
3. **CEDTEC** — escola técnica em Vila Velha-ES, dono, foco em marketing e Meta Ads
4. **Gráfica** — dono, apostilas, receitas parceladas por cidade, conciliação bancária
5. **Sítio Monte da Vitória** — propriedade em Pedra Azul-ES, lavoura de café arábica

## Banco de dados — Tabelas principais
```
entidades, pastas, documentos, projetos, tarefas, eventos,
grafica_pedidos, grafica_parcelas, grafica_extratos, grafica_conciliacao,
meta_conexoes, meta_campanhas_cache, sitio_categorias, sitio_lancamentos,
notificacoes, chat_mensagens
```
Todas com RLS habilitado, policy `allow_authenticated_*` com `USING (true)`.

## Problema atual — CRÍTICO a resolver
**Todos os requests ao banco retornam 403 Forbidden.**

O auth funciona (login OK, token refreshado com sucesso), mas as queries REST falham.
Logs do Supabase mostram centenas de `GET/POST 403` em tarefas, pastas, documentos, eventos.

**Causa identificada:** o cliente Supabase no frontend não está enviando o JWT do usuário
nas requisições REST. O script do Supabase estava duplicado no HTML (no HEAD e no body),
causando conflito de inicialização.

**O que já foi tentado:**
- Múltiplas versões das policies RLS (todas corretas no banco)
- Insert via service_role funciona perfeitamente
- Fix da duplicação do script (feito na última versão do index.html)
- Supabase JS fixado na versão 2.39.3
- `persistSession: true`, `storage: window.localStorage` explícito
- Auth apenas via `onAuthStateChange` com guard `appInitialized`

**A última versão do index.html tem todas essas correções mas ainda não foi testada.**

## Como fazer deploy
```bash
cd ~/Desktop/portal-pessoal
./deploy.sh   # faz git add + commit + push, Vercel deploya automaticamente
```

## Estrutura do index.html
- Todo o app em um único arquivo HTML
- Scripts no final do body: Supabase 2.39.3 + Chart.js
- Sidebar com navegação, header, main content com pages (.page.active)
- Chat persistido na tabela `chat_mensagens`
- Tarefas em kanban (pendente / em_andamento / concluida)
- Documentos com pastas/subpastas (CRUD completo)

## Edge Function chat-claude
- URL: `https://msbwplsknncnxwsalumd.supabase.co/functions/v1/chat-claude`
- `verify_jwt: false` (faz validação manual internamente)
- Usa `claude-haiku-4-5-20251001`
- Retorna `{ reply, action, actionData }` onde action pode ser `tarefa|evento|gasto`
- O frontend lê o action e chama `handleActionTarefa/Evento/Gasto`

## O que falta implementar (roadmap)
- [ ] **BUG CRÍTICO**: resolver o 403 no banco para todas as operações funcionarem
- [ ] Google Calendar OAuth (Client ID ainda não configurado)
- [ ] Módulo Gráfica (receitas parceladas por cidade + conciliação)
- [ ] Módulo Marketing (Meta API — CEDTEC e Agência)
- [ ] Módulo Sítio/Café (lançamentos, gastos, planejamento)
- [ ] Módulo Pincel Atômico (tarefas e projetos)
- [ ] Upload de arquivos (botão existe, lógica implementada, depende do fix do 403)
- [ ] Notificações push (Service Worker registrado, lógica de som implementada)

## Instrução para o Claude Code
Ao iniciar, **primeiro resolva o bug do 403**. O arquivo `index.html` está na raiz da pasta.
Após qualquer mudança, rode `./deploy.sh` para subir automaticamente.

Para debug, peça ao Pedro para abrir o Console do browser (F12) e colar os erros.
