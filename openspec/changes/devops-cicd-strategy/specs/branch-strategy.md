# Spec: Branch Strategy & Artifact Governance

## Branch Model: GitHub Flow

```
main          ← producción, Railway autodeploy
feature/<name> ← features (openspec-driven, convención existente)
hotfix/<name>  ← fixes urgentes
```

**Regla única**: toda línea de código llega a `main` por PR. Nunca push directo.

## Branch Protection (configurar en GitHub → Settings → Branches)

```
Branch: main
✓ Require a pull request before merging
✓ Require status checks to pass before merging
  - Status check requerido: validate (de ci.yml)
✓ Do not allow bypassing the above settings
✗ Require linear history (opcional, no obligatorio ahora)
```

## Cuándo agregar ramas adicionales

| Trigger | Rama a agregar |
|---|---|
| +1 dev colaborando simultáneamente | `develop` como buffer de integración |
| Stakeholder externo aprueba antes de prod | `staging` con deploy a env Railway staging |
| Regulación / compliance requiere aprobación formal | `release/*` |

Hoy nada de esto aplica → no se agrega.

## Artifact Governance

### Qué NO va en el repo

```gitignore
# Codebase memory index — re-generar local o descargar del bucket
.codebase-memory/

# Build outputs
*.zst
*.db

# Secrets
.env
.env.local
```

### Ciclo de vida del artifact `graph.db.zst`

```
Dev local:
  Si .codebase-memory/ no existe → correr index_repository (~5s) O descargar del bucket

CI (merge a main):
  1. Deploy a Railway
  2. Re-index codebase-memory
  3. Upload graph.db.zst → Railway Object Storage bucket "codebase-memory"

Otro dev / nueva sesión:
  Descargar de bucket → skip re-index
```

### Storage: Railway Object Storage

Bucket: `codebase-memory`  
Path: `graph.db.zst` (un solo archivo, se sobreescribe en cada merge a main)  
Acceso: Railway CLI o `@aws-sdk/client-s3` con credenciales del bucket.

**Hasta que el bucket esté configurado**: re-index local. No bloquea nada.

## Deterministic test

CI pasa → `ci.yml` status check verde → PR mergeable.  
Verificar: abrir PR, confirmar que aparece check "validate" en la PR.
