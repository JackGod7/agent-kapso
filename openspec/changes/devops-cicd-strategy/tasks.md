# Tasks: DevOps CI/CD Strategy

## Branch Protection
- [ ] Habilitar branch protection en GitHub: `main` requiere PR + CI pass + no force push

## Artifact Cleanup
- [ ] Revertir commit de `graph.db.zst` (git revert o rm + commit)
- [ ] Añadir `.codebase-memory/` a `.gitignore`
- [ ] Commit y push del `.gitignore` actualizado

## CI Pipeline
- [ ] Crear `.github/workflows/ci.yml` con job `validate` (node --check archivos core)
- [ ] Extender `.github/workflows/deploy.yml`: añadir re-index step post-deploy (placeholder hasta bucket)

## Observabilidad — Sensores
- [ ] Sensor 1: añadir `agent_trace` JSON log al final de cada `runAgent()` en `src/agent.js`
- [ ] Sensor 2: añadir cost tracking por sesión (`session.totalTokens`) + alert log en `src/agent.js`
- [x] Sensor 3: extender `/health` en `server.js` con `activeSessions`, `completedSessions`, `uptimeSeconds`
- [x] Sensor 4: añadir `webhookTotal` / `webhookErrors` counters en `server.js`, exponer en `/health`

## Artifact Storage (post-bucket)
- [ ] Crear Railway Object Storage bucket `codebase-memory`
- [ ] Añadir upload step en `deploy.yml` con Railway CLI o curl
- [ ] Documentar en CLAUDE.md cómo descargar artifact localmente

## ADR
- [ ] Persistir decisiones de diseño con `manage_adr` en codebase-memory-mcp
