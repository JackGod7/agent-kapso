# Tasks: DevOps CI/CD Strategy

## Artifact Cleanup
- [x] Revertir `graph.db.zst` de git tracking (`git rm --cached`)
- [x] Añadir `.codebase-memory/` a `.gitignore`
- [x] Commit y push del `.gitignore` actualizado

## Branch Protection
- [ ] Habilitar branch protection en GitHub: `main` requiere PR + CI pass + no force push

## CI Pipeline
- [x] Crear `.github/workflows/ci.yml` con job `validate` (node --check archivos core)

## Observabilidad — Sensores
- [x] Sensor 1: añadir `agent_trace` JSON log al final de cada `runAgent()` en `src/agent.js`
- [x] Sensor 2: añadir cost tracking por sesión (`session.totalTokens`) + alert log en `src/agent.js`
- [x] Sensor 3: extender `/health` en `server.js` con `activeSessions`, `completedSessions`, `uptimeSeconds`
- [x] Sensor 4: añadir `webhookTotal` / `webhookErrors` counters en `server.js`, exponer en `/health`
