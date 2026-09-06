# GlucyZen v0.11 — Historical Intelligence

Dashboard local pour agréger les données Nightscout envoyées par Loop (Dexcom ONE+ + Omnipod DASH), avec timeline enrichie, assistant conseil et analyse historique personnalisée.

## v0.11 — Historical Intelligence

Cette version ajoute un moteur local de comparaison avec l'historique Nightscout :

- synchronisation en arrière-plan jusqu'à 90 jours de données ;
- recherche de situations historiques similaires ;
- projections descriptives à +30 / +60 / +90 / +120 min ;
- médiane historique + fourchette 20e–80e percentile ;
- nombre de situations comparables utilisées ;
- niveau de confiance volontairement conservateur ;
- comparaison du dernier apport glucidique avec des repas historiques similaires lorsqu'il y a assez de données ;
- Historical Intelligence visible dans l'onglet Assistant IA.

Le moteur s'appuie notamment sur la glycémie actuelle, l'évolution récente, l'heure de la journée ainsi que les glucides et bolus récemment enregistrés dans Nightscout.

Les projections sont descriptives et expérimentales. Elles ne calculent aucune dose et ne doivent pas être utilisées pour décider une correction, traiter une hypo/hyperglycémie ou modifier le fonctionnement de Loop.

## Confidentialité de l'historique

L'historique long terme utilisé par v0.11 est conservé **en mémoire uniquement** pendant l'exécution. GlucyZen n'écrit pas de cache médical 90 jours sur le disque dans cette version.

Au redémarrage, la synchronisation Nightscout est donc relancée en arrière-plan.

## Timeline Nightscout-like

- point pour chaque relevé Dexcom ;
- ligne reliant les relevés ;
- périodes 1 h / 2 h / 3 h / 4 h / 6 h / 12 h / 24 h ;
- glucides, bolus et basale affichables/masquables ;
- événements Nightscout détaillés au survol/clic ;
- traitement type, carbs, insulin, absorption, entered by et notes lorsque ces champs sont disponibles.

## Lancement en 1 clic

Double-cliquer sur `GlucyZen.cmd`.

Au premier lancement seulement, GlucyZen demande l'URL Nightscout et un token avec rôle `readable`. Le token est chiffré avec Windows DPAPI dans `data/config.json`.

Pour changer la connexion : `Configurer.cmd`.

## Mise à jour

Fermer GlucyZen puis double-cliquer sur `Mettre-a-jour.cmd`, puis relancer `GlucyZen.cmd`.

## Sécurité

- Nightscout reste en lecture seule ;
- toute écriture `/api/*` est rejetée avec HTTP 405 ;
- aucune route réelle de bolus, suspension, cible, profil ou commande pompe ;
- le Mode labo ne produit que des simulations locales ;
- Historical Intelligence ne prend aucune décision thérapeutique ;
- l'assistant explique et contextualise uniquement.

## Endpoints

- `http://localhost:8787/api/health`
- `http://localhost:8787/api/live`
- `http://localhost:8787`

GlucyZen est un prototype expérimental et ne remplace ni Loop, ni Dexcom, ni les consignes de l'équipe soignante.