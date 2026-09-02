---
name: web-interface-guidelines
description: Audite du code d'interface web (accessibilité, UX, performance) contre les Web Interface Guidelines publiées par Vercel, récupérées à chaud. Utilise ce skill quand on demande de relire une UI, vérifier l'accessibilité, auditer un écran ou une page, ou contrôler une interface contre les bonnes pratiques.
---

# Audit d'interface web

Relit des fichiers d'interface et signale les écarts avec les Web Interface
Guidelines de Vercel.

## Marche à suivre

1. Récupère les règles à jour avec WebFetch :

   ```
   https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
   ```

   Récupère-les **à chaque audit** : elles changent en amont, et rien n'est figé
   dans ce fichier exprès pour ça.

2. Demande quels fichiers auditer si l'utilisateur n'a rien précisé.

3. Applique les règles récupérées et rends les constats au format `fichier:ligne`,
   un constat par ligne, sans reformuler les règles ni pavé d'introduction.

4. Si la récupération échoue (réseau coupé, dépôt déplacé), dis-le franchement et
   n'audite pas de mémoire : des règles inventées valent moins que pas d'audit.

## Portée dans ce projet

`frontend/` est du React Native (Expo) servi aussi en web. Les règles visent le
web : celles qui portent sur le HTML sémantique, les rôles ARIA ou le focus
clavier ne s'appliquent pas aux écrans natifs. Signale l'écart quand la règle
n'a pas de sens sur mobile plutôt que de la forcer.
