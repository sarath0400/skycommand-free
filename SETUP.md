# skycommand-free — Setup (all free tiers)

A free mirror of the skyCommand architecture:
**GitHub → GitHub Actions → ghcr.io → Render (Dev/QA/Prod) → Neon Postgres → Gemini AI.**

Everything below is free. No credit card needed for Neon, Gemini, GitHub Actions, or Render's free tier.

---

## Service map (same setup, free)

| skyCommand (paid) | Free replacement | Sign-up |
|---|---|---|
| Azure DevOps + GCP agents | **Azure DevOps (free tier, same tool)** — see `.ado/pipelines/app-deployment.yml`. | dev.azure.com |
| Azure Container Registry | GitHub Container Registry (ghcr.io) | github.com |
| Azure App Service | Render web service | https://render.com |
| GCP Cloud SQL / Lakebase | Neon Postgres | https://neon.tech |
| Azure Key Vault | GitHub + Render secrets | (built in) |
| Azure AD | Microsoft Entra External ID (optional) | https://entra.microsoft.com |
| Google Gemini | Gemini API (same, free) | https://aistudio.google.com/apikey |
| Teams webhook | Discord/Slack webhook (optional) | — |

---

## 1. Run it locally first (2 minutes)

```bash
cd skycommand-free
docker build -t skycommand-free .
docker run -p 5000:5000 -e MIGRATE_ON_BOOT=false skycommand-free
# open http://localhost:5000
```

(KPIs need a database — see step 2. Without one it still loads; the forecast works offline.)

---

## 2. Free database — Neon

1. Sign up at https://neon.tech → **New Project**.
2. Copy the **connection string** (looks like `postgresql://...neon.tech/neondb?sslmode=require`).
3. Run locally with it:
   ```bash
   docker run -p 5000:5000 \
     -e MIGRATE_ON_BOOT=true \
     -e DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" \
     skycommand-free
   ```
   On boot the app creates + seeds the `kpis` table itself (the MIGRATE_ON_BOOT trick), then serves them.

---

## 3. Free AI — Gemini

1. Get a key at https://aistudio.google.com/apikey (free).
2. Add `-e GEMINI_API_KEY=your_key` to the `docker run` command. The AI insight line will light up.

---

## 4. Push code to Azure DevOps Repos

```bash
cd skycommand-free
git init && git add . && git commit -m "skycommand-free"
git branch -M release
git remote add origin https://dev.azure.com/<org>/<project>/_git/skycommand-free
git push -u origin release
```
Then create the pipeline (step 6) pointing at `.ado/pipelines/app-deployment.yml`.

---

## 5. Free hosting — Render (Dev/QA/Prod)

1. Sign up at https://render.com → **New > Web Service > Deploy an existing image**.
2. Image URL: `ghcr.io/<you>/skycommand-free:latest` (make the package public, or add a pull secret).
3. Add env vars `DATABASE_URL`, `GEMINI_API_KEY`, `MIGRATE_ON_BOOT=true`. Health check path: `/api/health`.
4. Repeat to create **dev**, **qa**, **prod** services (or start with one).
5. For each, copy its **Deploy Hook** URL (Settings > Deploy Hook).

---

## 6. Create the Azure DevOps pipeline + approval gates (the Dev→QA→Prod flow)

In Azure DevOps (dev.azure.com, free):
1. **Project Settings > Service connections** → new **Docker Registry** connection named `free-registry` (ghcr.io or Docker Hub).
2. **Pipelines > Environments** → create `dev`, `qa`, `prod`. On `qa` and `prod` add **Approvals & checks > Approvals** (yourself) — these are the gates.
3. **Pipelines > Library** → variable group `skycommand-free` with:
   `imageRepo`, `renderDeployHookDev`, `renderDeployHookQA`, `renderDeployHookProd` (mark the hooks secret).
4. **Pipelines > New pipeline** → Azure Repos Git → select this repo → **Existing YAML** → `.ado/pipelines/app-deployment.yml`.

Now every push to `release` builds once, deploys to Dev automatically, then **waits for your approval** before QA, then again before Prod — exactly like skyCommand.

---

## What maps to what (so you can explain it)

- `Dockerfile` = same two-round build (workshop → clean box).
- `server/migrate.js` = boot-time self-migration (`MIGRATE_ON_BOOT`).
- `server/index.js` = the app engine + dashboard + health checks.
- `server/forecast.py` = the Python "predict the future" piece.
- `.ado/pipelines/app-deployment.yml` = the Azure DevOps pipeline (build → registry → Dev/QA/Prod).
- `render.yaml` = the "App Service" definition.
