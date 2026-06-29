# Proposal: DevOps CI/CD Strategy

## Problema

El workflow actual tiene un solo job en GitHub Actions: push a `main` → `railway up`. Sin validación previa, sin control de artifacts binarios, sin observabilidad del agente en producción.

Tres riesgos concretos:
1. **Typo en prod** — un SyntaxError rompe el bot sin gate previo
2. **Artifacts binarios en repo** — `graph.db.zst` committeado expone estructura interna y contamina el diff
3. **Agente ciego** — no hay traces de decisions del agente, cost tracking, ni alertas de degradación

## Qué cambia

1. **Branch strategy**: GitHub Flow mínimo — `main` (prod) + `feature/*` + `hotfix/*`
2. **CI pipeline**: PR → syntax check; merge main → deploy + re-index artifact
3. **Artifact management**: `.codebase-memory/` en `.gitignore`, artifact en Railway Object Storage
4. **Observabilidad agentic**: trace logging estructurado, cost tracking por conversación, health endpoint con métricas

## Por qué ahora

Contexto: certificación Agentic AI Developer GH-600. Un agente en producción sin observabilidad no es un agente — es un proceso opaco. Los "sensores" son requisito arquitectural para iterar con confianza.

## Qué NO entra (ponytail)

- Branch `develop` o `qa` — 1 dev, overhead puro hasta que haya +1 dev o stakeholder externo que apruebe
- Testing framework completo — `node --check` cubre el riesgo real ahora
- Distributed tracing (OpenTelemetry) — structured logs en Railway son suficientes hasta que el volumen lo justifique
