# V4 — Cahier de tests falsifiables des agents à buts

Ce document définit **comment prouver que le moteur comporte une IA de planification** et non une chorégraphie de déplacements. Les fixtures initiales sont synthétiques ; aucun taux chiffré ci-dessous n'est présenté comme une mesure réelle.

## 1. Quatre couches distinctes

| Couche | Outil | Ce qui est prouvé | Ce qui n'est PAS prouvé |
|---|---|---|---|
| Validation des fixtures | `server/test-spec-simulation-v4.js` | dix scènes bien formées, 30 postes | moteur intelligent |
| GOAP symbolique | `server/test-v4-goap-planner.js` | recherche d'une séquence, alternatif, coûts, déterminisme | mouvement/règles |
| Intégration moteur | `server/test-v4-agents-integration.js` (à créer) | action réelle, état physique cohérent, replan | lisibilité écran |
| Visuel et population | Playwright + batch de graines | animation / statistiques / vitesse | légalité sans assertions ciblées |

**Interdiction** : marquer "IA opérationnelle" si seuls les tests des deux premières couches passent.

## 2. Plan de tests GOAP symboliques (socle déjà codé)

| ID | Setup | Assert |
|---|---|---|
| G01 | 9 derrière ruck, 10 libre | plan exact `MOVE_TO_RUCK → SECURE_BALL → PASS_TO_10` |
| G02 | même setup, 10 couvert, pod libre | plan **différent**, termine `PASS_TO_POD` |
| G03 | aucun receveur | `NO_PLAN`, aucune passe inventée |
| G04 | 9 hors-jeu | sans `GET_ONSIDE`, aucune prise de ballon |
| G05 | même setup avec `GET_ONSIDE` | plan légal avec étape de remise en jeu |
| G06 | route directe chère vs route à 2 actions | Dijkstra minimise le coût |
| G07 | snapshot et catalogues réutilisés | aucune mutation |
| G08 | catalogue réordonné | résultat identique |
| G09 | recherche limitée à 1 expansion | `BUDGET_EXCEEDED`, pas de plan truqué |
| G10 | profondeur 2 pour plan à 3 actions | `DEPTH_LIMIT` |
| G11 | état initial satisfait déjà le but | plan vide + statut distinct |
| G12 | but prioritaire irréalisable | but faisable suivant sélectionné |
| G13 | coût négatif, ID doublé, budget invalide | erreur explicite |
| G14 | but prioritaire déjà satisfait | sélectionner un autre objectif encore actif ; sinon `ALL_GOALS_SATISFIED` |

## 3. Scénarios moteur obligatoires (à programmer après l'injecteur)

| Test | Scénario | Déclencheur | Assertions à implémenter |
|---|---|---|---|
| I01 | S01 | 9 à 6 m du ruck | `MOVE_TO_RUCK` prend au moins distance/vitesse, sans saut |
| I02 | S01 | soutien A6 rejoint le contact | la sécurisation n'est comptée qu'après arrivée réelle |
| I03 | S01 | 10 libre puis défenseur avance | 9 replanifie, choisit option qui reste légale |
| I04 | S01 | 9 est au sol ou exclu | une autre personne est désignée, aucun 9 fantôme |
| I05 | S02 | ruck près de touche | pas de cible derrière la ligne de touche |
| I06 | S03 | mêlée non introduite | `SCRUM_HOOK` inapplicable, aucune sortie de balle |
| I07 | S03 | B9 placé illégalement | la loi l'emporte sur un plan rentable |
| I08 | S04 | alignement incomplet | l'IA n'annonce pas `LINEOUT_READY` |
| I09 | S05 | soutien de maul sans liaison | ne pousse pas, ne compte pas dans le rapport de force |
| I10 | S06 | B gagne le ballon | A replanifie attaque→défense, replie avant réaffectation |
| I11 | S07 | chasseur devant botteur | aucune poursuite illégale avant remise en jeu |
| I12 | S07 | réception profonde | au moins un joueur pertinent couvre le fond |
| I13 | S08 | avantage territorial réel | avantage joué si conditions satisfaites |
| I14 | S08 | avantage non obtenu | sanction reprise à la marque |
| I15 | S09 | remplaçant demandé jeu en cours | pas d'entrée anticipée, pas de 16e joueur |
| I16 | S10 | A14 aplati ou plaqué | le moteur reste seul à attribuer l'essai |
| I17 | défense | A13 fixe B13 | défense adapte plan en fonction du nouvel intervalle |
| I18 | ballon en arrière de la ligne | A15 seul en couverture | choix `PREVENT_TRY` prioritaire à `COVER_BACKFIELD` |
| I19 | fatigue variable | un soutien s'épuise | autre joueur peut remporter la réservation de soutien |
| I20 | replanification impossible | planner renvoie `NO_PLAN` | comportement de secours **légal**, log explicite |

Les I01–I20 sont des exigences futures : **aucune promesse qu'ils passent déjà**. Chaque PR doit implémenter les tests relatifs aux tâches modifiées.

## 4. Tests différenciants : prouver une vraie planification

### D01 — même but, deux plans

Figer `initialWorld` et `DISTRIBUTE_BALL`; modifier uniquement `PASS_LANE_10_OPEN`. Attendu : plan 9→10 puis plan 9→pod. Échoue si code `if (nine) passToTen` est utilisé.

### D02 — plan invalidé en cours d'exécution

Le 9 commence `MOVE_TO_RUCK` ; un défenseur coupe le couloir du 10 **pendant le déplacement**. Attendu : mouvement vers ruck se poursuit légalement, `PASS_TO_10` est invalidée avant exécution, plan reconstruit. Échoue si le 9 suit inexorablement le premier plan choisi.

### D03 — intention ≠ résultat

Définir une action `TACKLE_CARRIER` dont l'effet symbolique est `CARRIER_TACKLED=true`. Forcer un plaquage manqué par le moteur physique. Attendu : `CARRIER_TACKLED=false` dans le monde réel ; l'agent observe l'échec et replanifie. Échoue si l'IA écrit l'effet symbolique dans le snapshot.

### D04 — 30 agents, un ballon

Instancier 30 `AgentController` et deux `TeamBlackboard`; créer un ruck contesté. Attendu : un nombre borné de participants désignés ; tous les autres ont un objectif distinct, et aucun joueur engagé ne reçoit `HOLD_WIDTH` réalisable immédiatement.

### D05 — priorité vitale

A15 a le but `COVER_BACKFIELD`, mais un B14 s'enfuit vers l'essai. Attendu : `PREVENT_TRY` préempte le plan précédent, avec une nouvelle trajectoire de couverture et événement d'explication.

### D06 — changement de tactique manager

Conditions et graine identiques ; changer seulement la consigne 1-3-3-1 → 2-4-2. Attendu : modification des réservations, des objectifs et des courses de certains avants, mais mêmes lois d'arbitrage.

### D07 — intelligence sans omniscience

Un joueur cache temporairement le ballon derrière un paquet. Attendu : un agent éloigné ne connaît pas instantanément la nouvelle position exacte si le système de perception active la visibilité limitée ; il agit sur son estimation ou sur la communication de l'équipe.

### D08 — stratégie de secours

Planificateur dépassant `maxExpandedNodes` ou aucun but réalisable. Attendu : `BUDGET_EXCEEDED` ou `NO_PLAN`, `HOLD_SAFE_POSITION`/repli légal, jamais exception bloquant le tick.

## 5. Instrumentation attendue pour chaque test

Un test qui échoue doit fournir au minimum :

```json
{
  "seed": 1001,
  "fixture": "S01",
  "tickIndex": 92,
  "playerId": "A9",
  "phase": "RUCK",
  "goal": "DISTRIBUTE_BALL",
  "currentAction": "PASS_TO_10",
  "failure": "precondition_invalid",
  "facts": ["SELF_AT_RUCK", "PASS_LANE_10_CLOSED"],
  "expected": "replan_to_available_receiver"
}
```

Ajouter les métriques agrégées suivantes :
- plans construits/joueur/match ;
- expansions de nœuds moyen/p95 ;
- plans sans solution / dépassement budget ;
- changements de but par minute et oscillations ;
- durées réelles / prévues des actions ;
- violations de garde légale bloquées ;
- engagements d'équipe en conflit ;
- tours de moteur/s et fps par appareil ;
- métriques rugby existantes (passes, rucks, mêlées, touches, essais, possession, pénalités, coups de pied).

## 6. Comparatif des graines

Avant chaque fusion qui touche le comportement :
- même graine initiale, même config manager, même durée, même moteur sauf patch ;
- 30 matchs en développement ;
- 100 matchs si l'action modifie les contacts, le ballon, les hors-jeu ou le scoring ;
- 500 matchs dans le test long existant ou campagne dédiée ;
- moyennes **et dispersions**, pas seulement un match spectaculaire ;
- ne pas baisser arbitrairement les seuils des tests existants ;
- conserver un rapport `before-after.md` avec `seed, commitA, commitB, n, scores, rucks, passes, touches, mêlées, turnovers`.

Un gain de réalisme de placement qui effondre les essais n'est **pas** une réussite. Les chiffres du dossier historique `docs/ANALYSE_MATCH_REEL.md` datent d'une autre version du moteur : **ne pas les présenter comme un état courant**.

## 7. Commandes concrètes

```bash
node server/test-v4-goap-planner.js
node server/test-spec-simulation-v4.js
node server/test-placement-arbitrage.js
node server/test-invariants.js
node server/test-ruck.js
node server/test-melee.js
RM_TOUCHE_RAPIDE=1 node server/test-touche.js
node server/test-scores-abstraits.js
node server/test-calibration-moteur.js
node server/test-parcours-club.js
```

Les tests lourds sont coûteux ; lancer `node server/test-stats-matchs.js` dans la campagne de validation longue. Les tests de navigateur nécessitent de servir `docs/` et Playwright, cf. `.github/workflows/deploy-pages.yml`.

**Definition of Done V4** : les plans sont utilisés par les agents vivants, les tests D01–D08 et I01–I20 passent, les critères de sécurité et de stats passent, et un navigateur permet d'observer les décisions. Le passage des tests GOAP symboliques seuls **ne suffit jamais**.
