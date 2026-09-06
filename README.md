# GlucyZen v0.5

Dashboard local **lecture seule** pour agréger les données Nightscout envoyées par Loop (Dexcom ONE+ + Omnipod DASH).

## Nouveau : installation puis lancement en 1 clic

### Premier lancement

Double-cliquer sur :

`GlucyZen.cmd`

Au premier lancement seulement, GlucyZen ouvre automatiquement la configuration et demande :

1. l'URL Nightscout ;
2. le token Nightscout avec rôle `readable`.

Le token est ensuite chiffré par **Windows DPAPI**, lié au compte Windows courant, puis enregistré dans `data/config.json`. Il n'est pas stocké en clair.

### Lancements suivants

Double-cliquer simplement sur :

`GlucyZen.cmd`

GlucyZen déchiffre localement le token, démarre le serveur et ouvre automatiquement `http://localhost:8787`.

### Changer Nightscout / le token

Double-cliquer sur :

`Configurer.cmd`

## Mises à jour depuis GitHub

Le but de la v0.5 est de ne plus distribuer un nouveau ZIP à chaque version.

Une fois le dépôt GitHub publié, `Mettre-a-jour.cmd` télécharge directement la dernière branche `main`, remplace les fichiers applicatifs et **préserve intégralement le dossier `data/`**.

Au premier clic sur `Mettre-a-jour.cmd`, il demande une seule fois le dépôt GitHub (`owner/repo`). Ensuite, les mises à jour sont en 1 clic.

## Publication initiale du dépôt

Après avoir créé un dépôt GitHub vide, `Publier-sur-GitHub.cmd` peut initialiser Git, installer Git automatiquement si nécessaire, publier le projet sur `main` et mémoriser le dépôt pour l'updater.

Le dossier `data/` est dans `.gitignore` : l'URL Nightscout et le token chiffré local ne sont donc jamais poussés dans le dépôt.

## Sécurité

- API locale uniquement en GET.
- Toute écriture `/api/*` est rejetée avec HTTP 405.
- Token Nightscout attendu : rôle `readable`.
- L'IA reste **conseil uniquement**.
- Aucune route de bolus, suspension, profil, cible, override ou commande pompe n'existe dans GlucyZen.
- En mode LIVE, aucune donnée de démonstration ne remplace silencieusement une panne Nightscout.

## Endpoints

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/live`
- `http://localhost:8787`

Ce prototype n'est pas un dispositif médical et ne doit pas être utilisé comme unique source d'alertes ou pour décider d'une dose d'insuline.
