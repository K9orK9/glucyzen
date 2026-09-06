# GlucyZen v0.6 LAB

Dashboard local pour agréger les données Nightscout envoyées par Loop (Dexcom ONE+ + Omnipod DASH), avec **assistant conseil** et **Mode labo**.

## v0.6 LAB

Cette version ajoute :

- une analyse locale enrichie des données LIVE ;
- des observations sur la fraîcheur des données, la tendance, l'IOB visible, le temps dans la plage et les rappels matériel ;
- un bouton `Analyser maintenant` ;
- un Mode labo permettant de tester l'UX d'un bolus, d'une pause, d'une cible temporaire et d'un rappel ;
- un journal local des simulations.

### Limite volontaire

Les contrôles du Mode labo sont **100 % simulés dans le navigateur**. Ils n'effectuent aucun appel d'écriture vers Nightscout, Loop, Dexcom ou Omnipod.

L'assistant est pour l'instant une **couche de synthèse locale déterministe**, pas encore un LLM externe. Cela permet de tester le produit sans envoyer de données médicales vers un tiers. Il reste strictement descriptif : aucune recommandation de dose et aucune décision thérapeutique.

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

### Changer Nightscout / le token

Double-cliquer sur :

`Configurer.cmd`

## Mises à jour en 1 clic

Le dépôt officiel est :

`K9orK9/glucyzen`

Double-cliquer sur :

`Mettre-a-jour.cmd`

Le script télécharge la dernière branche `main`, remplace les fichiers applicatifs et **préserve intégralement le dossier `data/`**. Il n'est plus nécessaire de télécharger un nouveau ZIP ni de ressaisir le token à chaque version.

## Sécurité

- flux Nightscout réel en lecture seule ;
- toute écriture `/api/*` est rejetée avec HTTP 405 ;
- token Nightscout attendu : rôle `readable` ;
- l'assistant reste **conseil uniquement** ;
- le Mode labo ne fait que des simulations locales ;
- aucune route de bolus, suspension, profil, cible, override ou commande pompe n'existe dans GlucyZen ;
- en mode LIVE, aucune donnée de démonstration ne remplace silencieusement une panne Nightscout ;
- `data/` est ignoré par Git.

## Endpoints

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/live`
- `http://localhost:8787`

Ce prototype n'est pas un dispositif médical et ne doit pas être utilisé comme unique source d'alertes ou pour décider d'une dose d'insuline.
