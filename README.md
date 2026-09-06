# GlucyZen v0.8 — Advanced Timeline

Dashboard local pour agréger les données Nightscout envoyées par Loop (Dexcom ONE+ + Omnipod DASH), avec assistant conseil, navigation multi-vues et Mode labo.

## v0.8 — Advanced Timeline

La vue glycémie affiche désormais une timeline proche de Nightscout :

- un point pour chaque relevé Dexcom ;
- une ligne reliant les relevés ;
- couleurs distinctes sous / dans / au-dessus de la plage 70–180 mg/dL ;
- bolus Nightscout positionnés à l'heure exacte ;
- glucides positionnés à l'heure exacte ;
- basale / temp basal en bandeau supérieur lorsqu'elle est exposée par Nightscout ;
- infobulles au survol des points et événements ;
- même timeline sur le dashboard, la vue Glycémie et l'Historique.

Les événements sont construits uniquement à partir des données Nightscout réellement disponibles. GlucyZen n'invente pas d'événement manquant.

## Assistant et Mode labo

- analyse locale enrichie des données LIVE ;
- observations sur la fraîcheur des données, la tendance, l'IOB visible, le temps dans la plage et les rappels matériel ;
- aucune recommandation de dose ;
- Mode labo permettant de tester l'UX d'un bolus, d'une pause, d'une cible temporaire et d'un rappel ;
- les contrôles du Mode labo sont 100 % simulés dans le navigateur.

L'assistant est pour l'instant une couche de synthèse locale déterministe, pas un LLM externe.

## Lancement en 1 clic

### Premier lancement

Double-cliquer sur `GlucyZen.cmd`.

Au premier lancement seulement, GlucyZen demande :

1. l'URL Nightscout ;
2. le token Nightscout avec rôle `readable`.

Le token est chiffré par Windows DPAPI puis enregistré localement dans `data/config.json`.

### Lancements suivants

Double-cliquer simplement sur `GlucyZen.cmd`.

### Changer Nightscout / le token

Double-cliquer sur `Configurer.cmd`.

## Mises à jour en 1 clic

Double-cliquer sur `Mettre-a-jour.cmd`.

Le script récupère la branche `main` du dépôt `K9orK9/glucyzen` et préserve le dossier local `data/`.

## Sécurité

- flux Nightscout réel en lecture seule ;
- toute écriture `/api/*` est rejetée avec HTTP 405 ;
- token Nightscout attendu : rôle `readable` ;
- l'assistant reste conseil uniquement ;
- le Mode labo ne fait que des simulations locales ;
- aucune route de bolus, suspension, profil, cible, override ou commande pompe n'existe dans GlucyZen ;
- en mode LIVE, aucune donnée de démonstration ne remplace silencieusement une panne Nightscout ;
- `data/` est ignoré par Git.

## Endpoints

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/live`
- `http://localhost:8787`

Ce prototype n'est pas un dispositif médical et ne doit pas être utilisé comme unique source d'alertes ou pour décider d'une dose d'insuline.
