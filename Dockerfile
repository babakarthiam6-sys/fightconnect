# --- Étape 1 : construction de l'application web ---------------------------
# L'export web du mobile est bâti ici puis servi par l'API : un seul
# déploiement suffit alors pour les deux, ce qui évite d'avoir à héberger et à
# configurer un second service.
FROM node:20-slim AS webapp

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./

# L'application web est servie par la même origine que l'API : une adresse
# relative évite toute configuration et supprime la question du CORS.
ENV EXPO_PUBLIC_API_BASE_URL=/api/v1
ENV EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --clear --output-dir /build/web-dist \
    && node scripts/theme-web-shell.mjs /build/web-dist/index.html


# --- Étape 2 : l'API, qui sert aussi l'application ------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WEB_DIR=/app/webapp

WORKDIR /app

# Les dépendances sont installées avant le code : le cache Docker est conservé
# tant que requirements.txt ne change pas.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=webapp /build/web-dist /app/webapp

EXPOSE 8000

# $PORT est fourni par l'hébergeur (Railway, Render…), 8000 en local.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
