# Politique IA — conseil uniquement

## Rôle autorisé

L'IA peut :
- résumer les données actuelles et historiques ;
- expliquer une tendance observable ;
- rappeler l'expiration prévue d'un capteur ou d'un Pod ;
- signaler qu'une donnée est absente ou ancienne ;
- proposer à l'utilisateur de vérifier Loop/Dexcom ou de suivre son protocole habituel ;
- préparer des rapports de tendance.

## Rôle interdit

L'IA ne doit jamais :
- envoyer une commande à Loop, Omnipod, Dexcom ou Nightscout ;
- recommander ou calculer une dose d'insuline ;
- recommander une quantité précise de glucides pour corriger une glycémie ;
- suspendre ou reprendre l'insuline ;
- modifier une cible, un profil, un override ou une basale ;
- se présenter comme remplaçant une décision médicale.

## Isolation technique recommandée

1. La couche d'acquisition lit Nightscout avec un secret read-only.
2. Elle normalise les données en un objet `snapshot`.
3. L'IA reçoit uniquement ce `snapshot` ou un historique dérivé.
4. Le service IA ne connaît jamais les secrets Nightscout/Loop.
5. Le service IA ne dispose d'aucun outil ou endpoint d'écriture.
6. Les alertes critiques proviennent d'un moteur de règles déterministe séparé.
7. Les réponses IA sont affichées sous une étiquette distincte `Conseil IA`.
8. Un filtre de sortie bloque toute recommandation quantitative de traitement.

## Schéma logique

Dexcom ONE+ → Loop ↔ Omnipod DASH → Nightscout → Backend read-only → Dashboard
                                                     ├→ Moteur de règles → Alertes
                                                     └→ Copie normalisée → IA conseil

## Note v0.4

Les valeurs calculées par le backend (Time in Range, âge depuis un événement Nightscout, fraîcheur des données) sont des transformations déterministes. Elles ne donnent aucun pouvoir d'action à l'IA. Les échéances dérivées d'un événement `Sensor Start` ou `Pod Change` sont étiquetées comme estimations et ne remplacent pas les échéances affichées par Loop/Dexcom.
