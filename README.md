# GlucyZen v0.5

Dashboard local **lecture seule** pour agréger les données Nightscout envoyées par Loop (Dexcom ONE+ + Omnipod DASH).

## Lancement en 1 clic

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

## Mises à jour en 1 clic

Le dépôt officiel est :

`K9orK9/glucyzen`

Double-cliquer sur :

`Mettre-a-jour.cmd`

Le script télécharge la dernière branche `main`, remplace les fichiers applicatifs et **préserve intégralement le dossier `data/`**. Il n'est plus nécessaire de télécharger un nouveau ZIP ni de ressaisir le token à chaque version.

Un fichier local `data/repo.json` peut éventuellement surcharger le dépôt/branche pour un fork ou des tests. Ce fichier reste local et n'est jamais poussé sur GitHub.

## Sécurité

- API locale uniquement en GET.
- Toute écriture `/api/*` est rejetée avec HTTP 405.
- Token Nightscout attendu : rôle `readable`.
- L'IA reste **conseil uniquement**.
- Aucune route de bolus, suspension, profil, cible, override ou commande pompe n'existe dans GlucyZen.
- En mode LIVE, aucune donnée de démonstration ne remplace silencieusement une panne Nightscout.
- `data/` est ignoré par Git : aucune configuration Nightscout locale n'est publiée dans le dépôt.

## Endpoints

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/live`
- `http://localhost:8787`

Ce prototype n'est pas un dispositif médical et ne doit pas être utilisé comme unique source d'alertes ou pour décider d'une dose d'insuline.
