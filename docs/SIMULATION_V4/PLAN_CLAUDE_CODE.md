# Plan de développement — Rugby Manager V4, IA délibérative à 30 agents

**Objectif prioritaire demandé par le product owner :** de vrais **agents à base de buts individuels** tels que décrits par Russell & Norvig, réalisant de la **planification d'actions**, puis de la replanification. **Aucune IA collective :** chaque joueur connaît le plan de jeu et son placement nominal, mais les circonstances sélectionnent ses buts et le joueur décide lui-même chacun de ses déplacements. Lire `07_AGENT_INDIVIDUEL_PLACEMENT.md` avant tout code.

**Ordre impératif : moteur/IA individuelle → buts et placement émergents → phases et arbitrage → visualisation → calibration.**

**Architecture faisant autorité :** `07_AGENT_INDIVIDUEL_PLACEMENT.md`, complétée par `08_COMMUNICATION_LOCALE.md`, `09_CHOIX_STRATEGIQUES_INDIVIDUELS.md` et **`10_DIALOGUES_TACTIQUES_DU_9.md` (dernier arbitrage du propriétaire : le 9 initie questions et demandes).** Les agents connaissent la tactique mais aucune IA collective ne choisit leurs buts/positions/trajets. Les tâches précédemment consacrées à TeamBlackboard/TeamCoordinator sont remplacées par `RM4-G10` individuel et les tests `IND-01..12`.

## 0. Règles d'exécution par Claude Code

1. Une branche **par tâche ou petite tranche cohérente** `feature/rm4-Gxx-...`. Aucun développement massif non testé.
2. Les fichiers du moteur sont `engine/rugby-engine.js` (autorité), pas `docs/rugby-engine.js` (copie synchronisée en CI). Ne pas altérer la copie sans traçabilité.
3. Chaque PR fournit : scénario injecté, test automatique **qui échouait avant le patch**, détail du plan d'un agent avant/après, variation statistique sur graines appariées, liste des règles touchées, captures si visuel.
4. **NE PAS** abaisser les tests historiques pour les faire passer ni réécrire les lois via une fonction de probabilité décorative.
5. `server/test-spec-simulation-v4.js` vérifie seulement les fixtures. `server/test-v4-goap-planner.js` vérifie seulement le planificateur symbolique. **Ces tests ne prouvent pas le branchement des agents au match.**
6. Les coordonnées/timings des scénarios sont des **fixtures synthétiques**. Aucun « vrai tracking de match » n'est disponible dans le dépôt.
7. Tant que les simulations de masse ou tests navigateurs sont rouges, aucune fusion du moteur sur `main`. Les 30 agents individuels doivent préserver le déterminisme.
8. Le TMO, les lois et les sanctions restent dans un système de décision arbitral distinct ; un joueur n'écrit pas son résultat.

## 1. Vue des jalons

| Jalon | Tâches | Résultat vérifiable | Gate |
|---|---|---|---|
| **M0 — Socle** | G00–G03 | états injectables, catalogue de faits, planner de référence | mêmes graines, snapshots immuables |
| **M1 — Premier joueur autonome** | G04–G09 | n°9 perçoit, choisit but, planifie, exécute et replannifie | tests D01/D02/D03 + I01/I03 |
| **M2 — Trente agents autonomes** | G10–G17 | chacun choisit ses propres buts, trajets et cibles depuis un plan de jeu connu de tous, sans allocation centrale | IND-01..12, D04/D05/D06/D07 |
| **M3 — Phases du rugby** | G18–G24 | planification des mêlées, touches, mauls et officiels | tests S03–S10, lois |
| **M4 — Explicabilité et rendu** | G25–G27 | plans inspectables, animation originale 2D rétro | screenshots et navigateur |
| **M5 — Robustesse** | G28–G30 | statistiques réalistes, CI, livraison | 100/500 matchs, aucun invariant cassé |
| **M6 — Dialogues tactiques** | G31–G33 | 9↔10 en touche **et en mêlée**, 9↔8 sur départ du 8, décision par le 9, chandelle annoncée | DIA et STR-DIA, validation des lois |
| **M7 — Recherche de matchs réels** | G34–G36 | observations sourcées, matchs de référence rejoués en branches, calibration des choix | REAL-01..16, comparaisons chiffrées et sources |
| **M8 — Sortie 8→9 et styles internationaux** | G37–G38 | le 8 prévient le 9 avant son départ réel ; styles ENG/RSA/NZ documentés et interchangeables | S8-01..09 et STYLE-04..10 |
| **M9 — Benchmark Top 14** | G39–G41 | neuf matchs documentés, 19 scènes, six feuilles statistiques LNR valides et données manquantes exclues | TOP14-01..19, 30/100/500 graines, aucun script de club |
| **M10 — Micro-actions en match** | G42–G44 | 7 décompositions, 47 micro-choix par joueur, 22 branches de décision, 51 buts et 66 actions | MIC-01..12, 22 contre-tests, positionnement individuel |

Les tâches G00 et G01 sont **commencées comme références/documentation** ; leur complétion finale exige toujours les tests mentionnés. La branche de documentation ne remplace pas le développement M1–M5.

---

## M0 — Fondations et recherche d'états

### RM4-G00 — Geler et mesurer le moteur existant

- **Prérequis :** aucun ; lire `CLAUDE.md`, `AGENTS.md`, `docs/REGLES_RUGBY.md` et `docs/SPEC_PLACEMENT_TACTIQUE.md`.
- **Fichiers :** `server/simulate-batch.js`, `server/test-invariants.js`; créer `server/v4/measure-baseline.js`, `docs/SIMULATION_V4/BASELINE.md`.
- **Réalisation :** capturer le SHA de `main`, 30 graines identiques, durée 4 800 s, `dt` fixé ; compter passes, rucks, mêlées, touches, essais, scores, fautes, possession, temps de jeu effectif. Faire aussi 8 captures de match avec positions de joueurs (sans nouveaux sprites).
- **Critères :** `BASELINE.md` contient SHA, paramètres, moyennes, dispersion, données brutes par graine ; le script est relançable et ne modifie pas le moteur.
- **Tests :** `node server/test-invariants.js`, `node server/test-scores-abstraits.js`, `node server/test-calibration-moteur.js`.
- **Rejet si :** statistiques copiées d'un vieux audit sans nouvelle mesure.
- **Statut (9 nov. 2026) : LIVRÉ** — `server/v4/measure-baseline.js` (lecture seule, déterministe), `BASELINE.md`, `fixtures/baseline_30_graines.json` (30 graines, 8 captures de positions). Mesure sur la branche de travail fusionnée avec `main` 8024bcc : 6,5 essais, 412 passes, 210 rucks, 17,8 mêlées, 25,6 touches, 59,5 coups de pied par match ; essais du n°15 : 0,23 par match.

### RM4-G01 — Planificateur symbolique GOAP minimal **(socle fourni)**

- **Fichiers :** `engine/ai/goal-planner.js`, `server/test-v4-goap-planner.js`.
- **Réalisation :** Dijkstra sur faits symboliques, coûts positifs, préconditions/effets, états canonisés, limites `maxExpanded/maxDepth`, `NO_PLAN` explicite, sélection parmi buts réalisables.
- **Critères :** un but obtenu via plusieurs actions, choix différent si état change, coût minimal, déterminisme, no-op en but satisfait. **Aucune intégration physique revendiquée.**
- **Tests :** `node server/test-v4-local-communication.js
node server/test-v4-tactical-dialogue.js
node server/test-v4-observations-matchs.js
node server/test-v4-styles-match-data.js
node server/test-v4-goals-actions-doc.js
node server/test-v4-top14-data.js
node server/test-v4-top14-micro-actions.js
node server/test-v4-goap-planner.js` (G01–G14).
- **Rejet si :** un script spécial `if(numero === 9)` est utilisé comme « planner ».

### RM4-G02 — Injecteur de scénarios déterministes

- **Fichiers :** créer `server/v4/scenario-harness.js`, `server/test-v4-scenario-harness.js`; lire `docs/SIMULATION_V4/fixtures/scenarios.json`, `engine/rugby-engine.js`.
- **Réalisation :** construire un match de test avec positions/possessions/états légaux à partir des fixtures ; utiliser une API **de test** dédiée (`MatchEngine.fromFixture()` ou factory interne) ; corriger proprement les invariants dérivés (`ruckPoint`, participants, `ball`), sans modifier `getState()` public pour produire de faux états.
- **Critères :** chaque S01–S10 injectable ; après un tick, coordonnées finies, 30 joueurs, phase cohérente ; même fixture+graine => mêmes positions et événements.
- **Tests :** `node server/test-spec-simulation-v4.js`, nouveau `test-v4-scenario-harness.js`.
- **Rejet si :** l'injecteur corrige des états impossibles en silence ; documenter ses préconditions.
- **Statut (9 nov. 2026) : LIVRÉ** — `server/v4/scenario-harness.js` (`createScenarioEngine(fixture, {strict})`, préconditions en tête de fichier) et `server/test-v4-scenario-harness.js` (8 tests). S01–S10 injectables par les portes légales du moteur (`_plaquerSurPlace`, `_formerMelee`, `_accorderTouche`, `_formerMaul`, `_tenterCoupDePiedJeu`). **Constat : les fixtures sont incohérentes** (ballon à 12–50 m de son porteur en S06–S10 ; aucun joueur à moins de 11 m du ballon en S02/S05) ; le harnais les rend légales par UN écart déclaré dans `moteur.scenarioEcarts` (jamais silencieux, refusé en mode `strict`), figé par test. **Constat moteur :** à la transition PORTE→RUCK un joueur saute de 1,2 à 1,9 m en un tick (S01, S07, S08, S09) — à traiter par G07/G10.

### RM4-G03 — Ontologie, modèles et horloge de décision

- **Fichiers :** créer `engine/ai/facts.js`, `engine/ai/world-model.js`, `server/test-v4-facts.js`.
- **Réalisation :** faits canoniques de `05_CATALOGUE_GOALS_ACTIONS.md` ; extraction **pure** depuis `getState()`, séparation faits observables/autoritatifs, faits de perception horodatés ; version de schéma.
- **Critères :** 0 conflit de faits (ballon en vol + porté, au sol + lié), tous types validés ; `SCRUM_BALL_IN` (orthographe canonique).
- **Tests :** nouveaux tests de faits + snapshots S01/S03/S07.
- **Rejet si :** duplication de la possession dans un second moteur.
- **Statut (9 nov. 2026) : LIVRÉ** — `engine/ai/facts.js` (29 faits canoniques identiques au catalogue 05, schéma 1.0.0, détection de conflits), `engine/ai/world-model.js` (`extractFacts(state, {team, numero}, {target})`, pure, résultat gelé, faits perçus horodatés, faits non calculables **absents** et listés), `server/test-v4-facts.js` (16 tests : snapshots S01/S03/S07, 30 joueurs × 300 états d'un vrai match sans conflit, compatibilité avec `planGoal`). 18 faits calculés, 11 absents (RUCK_WON, GAP_NEARBY, DEFENSIVE_GAP_CLOSED, LINEOUT_READY, MAUL_BIND_LEGAL, DISTRIBUTED, TRY_PREVENTED, POSSESSION_SECURED, SAFE_SUPPORT_LANE, PASS_LANE_POD_OPEN, SELF_AT_TARGET sans cible). **Constat moteur :** `getState().ballon.enVol` reste vrai pendant l'introduction en mêlée (ballon à 3 cm dans le tunnel) alors que `ball.state` vaut SCRUM ; `BALL_IN_FLIGHT` lit donc `ball.state === 'AIR'` (une première version lisant `enVol` produisait « ballon en vol ET dans la mêlée » : test rouge).

## M1 — Premier vrai agent autonome et exécuteur

### RM4-G04 — Perception d'agent et mémoire locale

- **Fichiers :** `engine/ai/perception.js`, `engine/ai/agent-context.js`, `server/test-v4-perception.js`.
- **Réalisation :** capteurs (porteur, ballon, coéquipiers, adversaires, distance, hors-jeu, phase), **appels adressés reçus** via `LocalCommunication.hear()` avec auteur/âge/confiance ; information partielle, délai paramétré, observation précédente avec âge/confiance ; mode debug omniscient **désactivé par défaut** quand le test D07 mesure une visibilité limitée.
- **Critères :** un joueur privé d'information ne connaît pas instantanément une nouvelle position adversaire ; deux agents à positions distinctes peuvent avoir croyances distinctes.
- **Tests :** D07, S06/S07 ; vérifier que l'état physique source n'est pas muté.
- **Statut (9 nov. 2026) : LIVRÉ** — `engine/ai/perception.js` (`observe`, pure : cône de vue 200°, portée 45 m, rayon périphérique 6 m, ballon caché par ≥ 3 joueurs sur la ligne de vue ; mode `omniscient` **désactivé par défaut**), `engine/ai/agent-context.js` (`AgentContext.update(state, comm)` : délai de réaction 0,2 s, mémoire 6 s avec âge/confiance, oubli, appels reçus via `LocalCommunication.hear()` avec auteur/âge/confiance, résultat gelé), `server/test-v4-perception.js` (9 tests dont D07). Mutants vérifiés : omniscient par défaut → 5 tests rouges ; occlusion supprimée → D07 rouge. **Limites :** pas de bruit de position (déterministe), occlusion simplifiée (corps sur la ligne de vue), les faits symboliques de G03 restent calculés sur l'état complet (leur version fondée sur les croyances viendra avec G05). Constat : au ruck, un paquet cache naturellement le ballon à plusieurs joueurs (A7, A12 ne le voient pas en S01).

### RM4-G05 — Sélecteur de buts contextualisé

- **Fichiers :** `engine/ai/goals.js`, `engine/ai/goal-selector.js`, `server/test-v4-goals.js`.
- **Réalisation :** conditions de satisfaction, éligibilité, priorité tactique/danger/compétence/fatigue/score, préemption de sécurité, engagement anti-oscillation. Inclure `DEFEND`, `RETAIN_POSSESSION`, `GAIN_TERRITORY`, `CONTEST_AERIAL_BALL` et les choix individuels de stratégie mêlée/touche/plein jeu. Les numéros de poste sont **profils**, pas scripts exclusifs.
- **Critères :** A15 préfère couverture puis sauvetage d'essai lorsque le risque change ; A7 choisit repli si hors-jeu ; le même agent peut changer de but au cours du match.
- **Tests :** D05 ; comparer 2 états opposés de S06.
- **Statut (9 nov. 2026) : LIVRÉ (choix de but seulement, sans exécution physique)** — `engine/ai/goals.js` (16 buts individuels dont DEFEND, RETAIN_POSSESSION, GAIN_TERRITORY, CONTEST_AERIAL_BALL, FORM_SCRUM/LINEOUT_LEGALLY ; profils par poste = poids, jamais scripts ; `deriveSituation` à partir des **croyances** uniquement), `engine/ai/goal-selector.js` (`GoalSelector.select` : priorité, engagement 1 s + marge 12, préemption SAFETY vitale ≥ 80, événements `GOAL_CHANGED` avec raison), `server/test-v4-goals.js` (13 tests : D05, A7 hors-jeu → BECOME_ONSIDE, deux états opposés de S06, changements de but sur 5 min de vrai match sans oscillation, un 10 qui distribue si le 9 est absent, test architectural anti-`TeamCoordinator`). Mutants vérifiés : sans engagement → test de match rouge ; sans préemption → D05 rouge. `AgentContext` expose en plus sensAttaque, kickOffside et score. **Hypothèses :** poids et seuils = hypothèses d'ingénierie à calibrer (G28/G36) ; le danger d'essai est une heuristique (distance à la ligne × défenseurs vus entre le porteur et la ligne). **Constat :** l'`orientation` du moteur est la direction de course, pas le regard : un arrière qui recule peut ne pas voir un porteur 'devant' lui hors de son cône de 200° ; à traiter avec l'exécuteur (G07) ou en élargissant le champ.

### RM4-G06 — Catalogue des actions et adaptateurs de coût

- **Fichiers :** `engine/ai/actions.js`, `engine/ai/action-cost.js`, `server/test-v4-actions.js`.
- **Réalisation :** coder progressivement A01–A15 de la bibliothèque, avec `preconditions/effects/cost/estimatedDuration`, identifiants sans doublon, coûts strictement positifs et vérifications de faisabilité avant recherche.
- **Critères :** l'action `SECURE_BALL` ne peut être sélectionnée si le ballon n'est pas disponible ; `GET_ONSIDE` peut rendre un plan légal ; `PASS_TO_10` échoue à la planification si le 10 est couvert.
- **Tests :** G04–G06, G13 et tests de catalogues ; ne pas brancher 36 actions d'un coup.
- **Statut (9 nov. 2026) : LIVRÉ (A01–A15 seulement, planification sans exécution)** — `engine/ai/actions.js` (15 actions gelées, faits de l'ontologie G03 uniquement, aucun conflit après effets), `engine/ai/action-cost.js` (`factsFromBeliefs` : faits d'UN agent depuis ses croyances, un fait non connaissable est **absent** ; `buildPlannerActions` : coût > 0 = temps + fatigue + risque de perte + risque de faute + abandon ; `feasibleActions`), `server/test-v4-actions.js` (12 tests : identifiants/noms identiques au catalogue 05, SECURE_BALL refusé si ballon indisponible, GET_ONSIDE avant d'entrer au ruck, A9 → SECURE_BALL puis PASS_TO_10, PASS_TO_10 sans plan si le 10 est marqué ou le couloir barré, coûts positifs sur 300 couples agent/état). Mutants vérifiés (précondition BALL_AVAILABLE, RECEIVER_OPEN, ONSIDE retirées) : tests rouges. Perception : le statut du ruck (ballon jouable, défenseurs engagés) est désormais observé si le ballon est vu. **Choix de modélisation :** SAFE_SUPPORT_LANE appartient à un porteur (SECURE_BALL le remet à faux, A13/A14 exigent HAS_BALL=faux), sinon un 9 pouvait planifier de se soutenir lui-même. **Limites :** coefficients de coût = hypothèses ; A16–A66 non codées ; PASS_LANE_POD_OPEN, GAP_NEARBY, SAFE_SUPPORT_LANE ne sont pas encore perçus (seulement planifiables si fournis) ; un 9 qui regarde vers l'avant ne voit pas son 10 placé derrière lui (orientation = direction de course).

### RM4-G07 — Exécuteur physique, gardes d'action, succès/échec

- **Fichiers :** `engine/ai/action-executor.js`, adaptateurs dans `engine/rugby-engine.js`, `server/test-v4-executor.js`.
- **Réalisation :** convertir une action choisie en intention physique bornée (courir, passer, plaquer). `startGuard`, `successGuard`, `abortGuard` interrogent le **monde réel**. Un effet GOAP n'est appliqué au plan suivant que s'il a effectivement eu lieu, sinon événement `ACTION_FAILED`. **Prévoir explicitement le chargement navigateur** : le prototype `engine/ai/goal-planner.js` expose aujourd'hui `module.exports` pour Node ; fournir un module UMD/ESM compatible avec les scripts de `docs/index.html` ou un bundle contrôlé, sans dupliquer deux implémentations divergentes. Ajouter un test de chargement navigateur.
- **Critères :** A9 met un temps physique >0 pour parcourir 6 m, une passe ratée ne donne pas un ballon reçu, plaquage manqué ne donne pas `CARRIER_TACKLED`.
- **Tests :** I01, D03, aucun saut, G01/G02 branchés au moteur.
- **Rejet si :** le planner écrit directement `porteur`, `ruckPoint`, score ou `possession`.
- **Statut (9 nov. 2026) : LIVRÉ PARTIELLEMENT (mouvements seulement)** — `engine/ai/action-executor.js` (`ActionExecutor` : startGuard/successGuard/abortGuard sur le **monde réel**, événements `ACTION_STARTED/SUCCEEDED/FAILED/ABORTED` avec raison, délai ; `PlanRunner` : un effet n'est confirmé que si l'étape a réellement réussi), hook **opt-in** `setAgentIntent/clearAgentIntent` dans `engine/rugby-engine.js` (blocs `AGENT_INTENTS`, copie `docs/` synchronisée : une intention ne porte que sur le déplacement d'UN joueur, via `avancer()` ; un joueur au sol ou exclu est ignoré ; sans appel le jeu est strictement identique), `server/test-v4-executor.js` (13 tests : 6 m prennent > 0,9 s sans dépasser 8 m/s, GET_ONSIDE puis MOVE_TO_RUCK exécutés dans le moteur, plan issu des croyances (G04→G06) exécuté, abandon si le ruck se termine, TIMEOUT, NO_ACTUATOR explicite, déterminisme, test architectural). **Actuateurs réels : A01–A05, A13–A15 seulement.** **NON livré :** passe, plaquage, nettoyage, prise de balle (A06–A12) n'ont pas d'acteur dans le moteur : ils échouent en `NO_ACTUATOR`, donc les critères « passe ratée ≠ ballon reçu » et « plaquage manqué ≠ CARRIER_TACKLED » (D03) restent à faire ; **chargement navigateur (UMD) non fait** — les modules `engine/ai/*` sont CommonJS, à traiter avant tout branchement UI (G08/G30). Mutants vérifiés : hook sans restauration, réussite non vérifiée → tests rouges.

### RM4-G08 — Contrôleur `GoalBasedRugbyAgent`

- **Fichiers :** `engine/ai/agent-controller.js`, `server/test-v4-agent-controller.js`.
- **Réalisation :** boucle `PERCEIVE→UPDATE→SELECT_GOAL→PLAN→ACT→MONITOR` ; mémorise but/plan/index, événements de démarrage/fin/échec ; replan si précondition invalidée, danger urgent ou appel pertinent. `maybeSpeak()` décide localement de poser une question, répondre ou prévenir ; `hear()` informe la perception sans imposer de plan.
- **Critères :** quand le 10 est couvert à la troisième étape, A9 remplace `PASS_TO_10` par `PASS_TO_POD` sans recommencer depuis la remise en jeu si déjà au ruck.
- **Tests :** D01/D02, I03 ; deux trajectoires différentes, même but.
- **Statut (9 nov. 2026) : LIVRÉ (boucle d'un joueur ; mouvements réels, actions de ballon en doublures de test)** — `engine/ai/agent-controller.js` (`GoalBasedRugbyAgent.tick(state, comm)` : PERCEIVE→UPDATE→SELECT_GOAL→PLAN→ACT→MONITOR ; décision toutes les 0,4 s et sur événement urgent, exécution suivie à chaque tick ; replanification depuis les faits **actuels** ; une action échouée/sans acteur est écartée 3 s ; `maybeSpeak` : appels `SUPPORT/MINE/COVER` posés par le joueur ; `hear()` informe sans imposer de plan ; événements GOAL_CHANGED, PLAN_CREATED, PLAN_REPLANNED, NO_PLAN, ACTION_*, SPOKE), `server/test-v4-agent-controller.js` (10 tests : boucle réelle dans le moteur (B6 atteint le ruck), **critère G08** (10 couvert à la 3e étape → `PASS_TO_POD`, sans MOVE_TO_RUCK ni GET_UP), D01 (même but, deux plans), I03 (aucune option légale → NO_PLAN, aucune passe lancée), deux trajectoires pour le même but, cadence, NO_ACTUATOR borné, parole, déterminisme, anti-coordinateur). Mutants vérifiés : sans suivi des préconditions → critère rouge ; sans écartement des échecs → boucle rouge. **Réserves :** SECURE_BALL/PASS_* sont des **doublures déclarées** dans les tests (aucun acteur moteur) ; le couloir du pod est fourni par une doublure de perception (`extraFacts`) ; seuls 7 buts sont planifiables (RECOVER_AND_REJOIN, BECOME_ONSIDE, CONTEST_BREAKDOWN, SECURE_RUCK, DISTRIBUTE_BALL, SUPPORT_CARRIER, BE_PASS_OPTION), les autres sont tenus sans plan faute d'actions A16+ ; un seul agent testé à la fois, pas de scheduler (G09). **Bug trouvé en route :** surveiller les préconditions d'une action en cours l'abandonnait dès qu'elle atteignait son but (SELF_AT_RUCK=faux exigé avant MOVE_TO_RUCK) ; les faits qu'elle a pour effet de changer sont désormais exclus du suivi.

### RM4-G09 — Scheduler déterministe et enveloppe CPU

- **Fichiers :** `engine/ai/agent-scheduler.js`, `server/test-v4-budget.js`.
- **Réalisation :** décisions à intervalle logique, événements urgents sans attendre, maximum expansions/tick et report des plans non urgents ; ordre stable des agents et des **appels** ; aucun `Date.now()` pour décider d'un but ou recevoir un appel ; statistiques coût CPU hors simulation seulement.
- **Critères :** 30 agents en mémoire, aucun tick bloqué indéfiniment par recherche, mêmes événements sous même graine.
- **Tests :** D08, G09/G10 ; comparaison 10 matchs à dt constant.
- **Statut (9 nov. 2026) : LIVRÉ** — `engine/ai/agent-scheduler.js` (`AgentScheduler`, `creerAgents` : 30 agents, ordre stable A1..A15/B1..B15 pour décisions et appels ; observation et suivi d'exécution à chaque tick, **décision accordée** dans un budget de 6 par tick, tri par ancienneté puis identifiant (pas de famine), **urgences** (phase, possession, appel, action terminée) accordées sans attendre, départs étalés sur une période ; le scheduler ne choisit ni but ni plan ni position et n'utilise aucune horloge), contrôleur scindé en `observe()` / `decide()` / `act()` (`tick()` inchangé pour un agent seul), budget de recherche `maxExpanded` (128) avec **secours D08** `NO_PLAN` + `HOLD_SAFE_POSITION` (le moteur garde la conduite du joueur), `server/test-v4-budget.js` (9 tests : 30 agents, étalement, pas de famine, urgence malgré budget ordinaire = 1, D08, expansions bornées, déterminisme avec appels vocaux, 10 matchs à pas constant sains, test d'architecture). **Mesure (hors décision, `hrtime` dans le test seulement) :** 1,4 ms/tick en moyenne et 8,7–10 ms au pire pour 30 agents, soit ≪ 50 ms (20 Hz) ; 10 matchs de 120 s, 5 536 plans, aucune position non finie. Mutants vérifiés : budget supprimé, urgences traitées comme ordinaires, tri par identifiant seul → tests rouges. **Réserves :** CPU mesuré sur la machine de test (indicatif, non contractuel) ; **aucun effet sur le jeu normal** : les 30 agents ne pilotent encore que des mouvements (A01–A05, A13–A15), le reste du temps le moteur conduit ; la comparaison « 10 matchs » vérifie la santé du moteur, pas encore des statistiques de jeu (les agents n'ont pas d'acteur de ballon).

## M2 — Intelligence individuelle de 30 joueurs et placements émergents

### RM4-G10 — Buts de placement et décision **individuelle** sans coordinateur

- **Fichiers :** `engine/ai/individual-placement.js`, `engine/ai/position-goals.js`, `server/test-v4-individual-placement.js`.
- **Réalisation :** chaque joueur calcule ses références de placement depuis un plan de jeu en lecture seule et ses perceptions ; il évalue `DEFEND`, `CLOSE_GAP`, `HOLD_LINE`, `MARK_OPPONENT`, `COVER_BACKFIELD`, `SUPPORT_CARRIER`, `BE_PASS_OPTION`, `PRESERVE_WIDTH`, `RETURN_TO_PLAYBOOK`. Il compare la présence **observée** des coéquipiers et les risques de laisser un espace ; chaque trajectoire est choisie localement, sans `TeamCoordinator`, blackboard, réservation ni enchère.
- **Critères :** deux joueurs dans des situations différentes ne suivent pas un placement collectif imposé ; défense prioritaire lorsque l'adversaire a la balle, mais aucune ruée systématique sur le porteur ; aucun déplacement choisi par un autre agent.
- **Tests :** IND-01..06, IND-08..12, D04, S01/S06/S07.
- **Statut (9 nov. 2026) : LIVRÉ comme LOGIQUE INDIVIDUELLE OPT-IN — NE PAS ACTIVER dans le jeu, effet mesuré négatif** — `engine/ai/position-goals.js` (plan de jeu en lecture seule : références d'attaque 1-3-3-1/2-4-2, ligne défensive PRESS/DRIFT/CONSERVATIVE, canaux défensifs, fond), `engine/ai/individual-placement.js` (`individualPlacement(beliefs, goal, playbook, profile)` : candidats HOLD_LINE, CLOSE_GAP, MARK_OPPONENT, PRESS_CARRIER (seulement le défenseur observé le plus proche), COVER_BACKFIELD, PREVENT_TRY, SUPPORT_CARRIER, BE_PASS_OPTION, PRESERVE_WIDTH, RETURN_TO_PLAYBOOK ; candidat hors-jeu = invalide et jamais choisi ; aucune fonction ne calcule les cibles de plusieurs joueurs), option `placement: true` du contrôleur (le placement ne conduit que hors porteur, en `PORTE`), `server/test-v4-individual-placement.js` (17 tests : IND-01..06, 08..12, D04, absence de ruée, hors-jeu, architecture). Mutants vérifiés : « tous pressent » et « candidat hors-jeu choisi » → rouges. Correctif au passage : le sélecteur levait « aucun but applicable » pour un joueur en récupération ; `RETURN_TO_PLAYBOOK` est désormais toujours applicable et toute erreur de décision est journalisée (`DECISION_ERROR`, comptée, zéro attendu en test). **Mesure appariée moteur seul vs moteur + 30 agents (outil `server/v4/compare-placement.js`, 6 graines × 900 s) :** points +33 %, essais +44 %, mais passes −41 %, courses −42 %, plaquages −42 %, rucks −41 %, coups de pied +56 %, possession de A 60→45 % ; la première version (les 30 joueurs conduits, porteur compris) donnait −80 % de plaquages/rucks/courses sur 8 × 1200 s. **Conclusion : le placement naïf casse le rythme de jeu — il remplace la logique de poursuite/plaquage du moteur sans acteur de plaquage ni de passe ; il ne doit pas être activé tant que G11–G17 (agents par poste) et un acteur de plaquage n'existent pas.**

### RM4-G11 — Première instanciation des **30 agents**

- **Fichiers :** `engine/rugby-engine.js`, `engine/ai/agent-controller.js`, `server/test-v4-thirty-agents.js`.
- **Réalisation :** créer AgentContext pour A1–A15/B1–B15, croyances/buts/plans/trajets propres à chacun ; tous lisent le plan de jeu sans pouvoir écrire sur les intentions d'un partenaire ; **feature flag** `aiMode:'GOAP'|'LEGACY'`, LEGACY par défaut tant que validations non passées.
- **Critères :** 30 contextes distincts ; chaque agent décide seul de ses buts et mouvements ; aucun joueur sans contrôleur ; aucun coordinateur décisionnel central ; même simulation LEGACY produit exactement les anciennes stats et comportements.
- **Tests :** D04, déterminisme sur 10 seeds, invariants et tests de sauvegarde.
- **Statut (10 nov. 2026) : LIVRÉ derrière le drapeau — GOAP EXPÉRIMENTAL, NON VALIDÉ pour le jeu** — `aiMode: 'LEGACY' | 'GOAP'` dans `engine/rugby-engine.js` (LEGACY par défaut ; GOAP exige `config.agentDriver`, sans repli silencieux ; le moteur appelle le pilote avant chaque tick physique), `engine/ai/goap-mode.js` (`configGOAP`, `creerPiloteGOAP` : 30 `GoalBasedRugbyAgent` + ordonnanceur + voix locale), **premier acteur de contact** `TACKLE_CARRIER` (A20) : le joueur va au porteur, le moteur résout ; réussite = un plaquage réussi de plus à SON compteur réel, manqué = `ACTION_FAILED TACKLE_MISSED` (D03), `server/test-v4-thirty-agents.js` (10 tests : LEGACY identique au tick près et à la baseline G00 sur 3 matchs complets, drapeau strict, 30 contextes/sélecteurs/exécuteurs distincts, déterminisme sur 10 graines, 6 × 240 s sains sans DECISION_ERROR, D03, sérialisation de getState). Portes moteur : invariants 137/137, calibration LEGACY inchangée (13/14). **Mesure GOAP vs LEGACY (6 graines × 900 s) : plaquages −45 %, rucks −44 %, passes −47 %, coups de pied +61 %, essais +67 %, possession de A 60→44 %.** Seuls 3 plaquages d'agents aboutissent sur 8 × 240 s : l'action est le plus souvent annulée par un changement de but (`GOAL_CHANGED`) pendant la poursuite. **GOAP n'est donc pas jouable : ne pas l'activer dans l'interface.** Chargement navigateur des modules `engine/ai` toujours non fait (le drapeau n'est utilisable que sous Node).
- **Suite du 11 nov. 2026 — défense GOAP stabilisée, encore insuffisante.** Causes trouvées par mesure : (1) la ligne défensive restait 5 m derrière le ballon EN JEU COURANT, donc reculait à la vitesse du porteur ; (2) un tiers des défenseurs ne voyaient pas le ballon (regard = direction de course) ; (3) presque personne ne pressait (4 échantillons sur 840) ; (4) la règle « pas plus de 1 m devant ses voisins » retenait toute la ligne ; (5) un changement de but annulait le plaquage en cours. Corrections : profondeur de ligne réservée aux phases arrêtées (en jeu courant la ligne monte 3 m devant le porteur), **regard** tourné vers le dernier ballon connu (`gaze`), plaqueur + assistant (2 au plus, jamais de ruée), montée collective bornée à 3 m devant les voisins, glissement latéral de 35 % vers le ballon, plaquage engagé conservé quand le but défensif change de nom, option `placementScope` ('all'/'defense'/'attack'). **Mesure GOAP vs LEGACY, mêmes 6 graines × 900 s : plaquages −32 % (−45 % avant), rucks −26 % (−44 %), passes −32 % (−47 %), coups de pied +68 %, essais +67 %, mètres +58 %.** Défense seule conduite (6 × 600 s) : plaquages −20 %, essais +17 %, mètres +51 %. GOAP reste non jouable et désactivé.
- **RM4-G17, première mesure (11 nov. 2026).** Outil `server/v4/compare-defense.js` (géométrie défensive en jeu courant). Constat sur 4 × 600 s : LEGACY a 7,8 défenseurs devant le porteur dans un couloir de 30 m et un plus grand trou de 10,9 m ; GOAP 5,7 défenseurs et 16,0 m. Correction : glissement latéral porté de 35 % à 60 % → 7,5 défenseurs, trou 13,6 m. Bug corrigé : le moteur désigne encore porteur un joueur déjà au sol le temps du plaquage ; `extractFacts` levait « au sol et porteur » en plein tick GOAP (HAS_BALL est désormais faux pour un joueur au sol). **Défense seule conduite (6 × 600 s) : plaquages −4 %, rucks −7 % (−20 % / −25 % avant), mais mètres +78 % et coups de pied +100 %. Les 30 agents (6 × 900 s) : plaquages −27 %, rucks −26 %, passes −38 %, coups de pied +93 %, essais +11 %.** Le reste de l'écart vient donc surtout du placement d'ATTAQUE des agents. GOAP reste désactivé.
- **Attaque seule conduite (6 × 600 s, 11 nov.)** : passes −21 %, plaquages −21 %, essais −33 %, **coups de pied +109 %**, mètres −14 %. Hypothèse testée et rejetée : rapprocher les trois-quarts du porteur (références 7/9/11 m au lieu de 10/12/14 m, le moteur compte un soutien à moins de 15 m) n'a rien changé (kicks +136 %). La cause des coups de pied doublés est donc ailleurs (à chercher dans `choisirActionPorteur` : pression, zone ou rôle des soutiens lus par le moteur). Aucun code modifié ; GOAP reste désactivé.

### RM4-G12 — Agent 9 : distribution véritablement planifiée

- **Fichiers :** `engine/ai/roles/halfback.js`, `actions.js`, `server/test-v4-halfback.js`.
- **Réalisation :** bâtir plan ruck→ramassage→10/pod/petit côté, repli légal, absence du 9, sortie 8 alternative. L'orientation et la disponibilité des receveurs doivent être réellement observées.
- **Critères :** I01–I04, D01/D02 ; au moins deux plans distincts selon changement de couloir ; aucune passe avant réception.
- **Tests :** `test-v4-halfback.js`, `test-ruck.js`, `test-invariants.js`.

### RM4-G13 — Agents 6/7/8 : contest ou continuité

- **Fichiers :** `engine/ai/roles/back-row.js`, `actions.js`, `server/test-v4-back-row.js`.
- **Réalisation :** `GET_ONSIDE`, `APPROACH_FROM_GATE`, `CONTEST_BREAKDOWN`, `COVER_NEAREST_GAP`, `SUPPORT_CARRIER` suivant règles et disponibilité ; un contest illégal n'est pas une option de plan.
- **Critères :** A7 contest s'il peut légalement et à temps ; sinon plan de repli à plusieurs étapes, pénalité arbitre non créée par l'agent.
- **Tests :** S01/S02, ARB-01/02, I02.

### RM4-G14 — Agent 15 et ailiers en couverture

- **Fichiers :** `engine/ai/roles/back-three.js`, `server/test-v4-back-three.js`.
- **Réalisation :** `COVER_BACKFIELD`, `SECURE_KICK_RECEIPT`, `PREVENT_TRY`, courses d'interception, couverture du triangle arrière issue des perceptions de chacun, gestion individuelle de l'aile fermée.
- **Critères :** A15 ne monte pas automatiquement ; intercepte si dernier défenseur ; les ailes ne quittent pas simultanément leur couloir.
- **Tests :** D05, I12/I18, S07/S10.

### RM4-G15 — Agents 1–5 : soutien, pods et collisions

- **Fichiers :** `engine/ai/roles/forwards.js`, `engine/ai/individual-placement.js`, `server/test-v4-forwards.js`.
- **Réalisation :** une même logique de buts pour piliers, talonneur et deuxième ligne ; chacun estime par observation s'il est le mieux placé pour protéger le ruck ou plutôt couvrir la prochaine phase. Les pods émergent de la connaissance du plan de jeu, de la disponibilité et du déplacement individuel, sans assignation.
- **Critères :** joueurs engagés au sol/maul ne reçoivent pas de rôle irréalisable ; rôle peut migrer sans téléportation ; aucun soutien ne traverse le ruck.
- **Tests :** S01/S05, I02/I19 ; stats comparées sur 30 matchs.

### RM4-G16 — Agents 10–14 : fixation, combinaison et jeu large

- **Fichiers :** `engine/ai/roles/backs.js`, `server/test-v4-backs.js`.
- **Réalisation :** `FIX_DEFENDER`, `CREATE_OUTSIDE_OVERLAP`, `HOLD_WIDTH`, `SUPPORT_INSIDE` ; démarre une course parce que les faits du monde changent, non au t+7 s codé en dur.
- **Critères :** si B13 mord sur A12, A13/A14 changent le plan ; si l'espace se referme, une solution intérieure ou le portage peut remplacer une passe.
- **Tests :** S01, D06, I17 ; aucune passe en avant générée par cible physique illégale.

### RM4-G17 — Défense émergente depuis les buts de chaque joueur

- **Fichiers :** `engine/ai/individual-defense.js`, `engine/ai/individual-placement.js`, `server/test-v4-defensive-shape.js`.
- **Réalisation :** chaque défenseur déduit de son plan connu et de ses perceptions s'il doit `BECOME_ONSIDE`, `DEFEND`, `HOLD_LINE`, `CLOSE_NEAREST_GAP`, `MARK_OPPONENT`, `TACKLE` ou `COVER_BACKFIELD`. Il peut boucher un trou puis revenir à son rôle de référence ; vitesse, angle et itinéraire sont décidés localement.
- **Critères :** la défense apparaît organisée sans ordres ni placements centraux ; un pilier peut boucher l'espace provisoire du centre sans traverser un équipier ; les arrières couvrent sans tous monter ; erreurs réalistes de lecture possibles.
- **Tests :** S06/S07, D04/D05, I10/I17, IND-03/04/05/08.

## M3 — Planification des phases, règles et officiels

### RM4-G18 — Coups de pied, hors-jeu et couverture

- **Fichiers :** `engine/ai/roles/kick.js`, `engine/rugby-engine.js`, `server/test-v4-kick-ai.js`.
- **Réalisation :** buts `EXIT_22`, `CHASE_KICK_ONSIDE`, `SECURE_KICK_RECEIPT` et `CONTEST_AERIAL_BALL` ; latence de perception, chasseurs qui se portent candidats **individuellement**, loi 10 contraint actions ; **le 9 peut annoncer `KICK_HIGH` avant son up-and-under**, sans garantir les réactions.
- **Critères :** aucun joueur devant botteur ne peut agir hors-jeu, même si plan `TACKLE` coûte moins cher ; réception non instantanée.
- **Tests :** S07, I11/I12 + test hors-jeu existant.

### RM4-G19 — Mêlée : protocole partagé, plans individuels de formation et de sortie

- **Fichiers :** `engine/ai/plans/scrum.js`, adaptateur `ETATS_MELEE`, `server/test-v4-scrum-ai.js`.
- **Réalisation :** tâches `ASSEMBLE→BIND→SET→INTRODUCE→HOOK→CONTEST→RELEASE`, sélection de sortie n°8/n°9, arbitrage des positions, ressource `SCRUM_BALL_IN`. **Le 9 consulte le 10 pour près/large/avance, puis le 8 pour un départ éventuel, et prend la décision tactique**. Il peut aussi demander aux avants stabilité ou forte poussée, sans commander leurs mouvements. Tourner et tomber sont des événements physiques ; poussée de travers/écroulement intentionnel sont des fautes possibles, pas des stratégies légales.
- **Critères :** commande de mêlée et ses conditions restent dans le moteur ; A8/A9 choisissent sorties alternatives selon opportunité ; aucune poussée pré-introduction.
- **Tests :** S03, SCR-01..05, `server/test-melee.js`.

### RM4-G20 — Touche : sauteurs, lanceur et plan alternatif

- **Fichiers :** `engine/ai/plans/lineout.js`, `server/test-v4-lineout-ai.js`.
- **Réalisation :** **le 9 pose la question au 10, reçoit son avis puis demande une option de touche** (devant/milieu/fond/maul/large). Chaque joueur connaît son rôle (`THROWER`, `JUMPER`, `LIFTER`) depuis le plan de jeu et l'effectif ; il choisit son déplacement, timing et action selon perception ; le lanceur exécute réellement et légalement son lancer. Aucun coordinateur n'attribue les positions en direct.
- **Critères :** 5–15 m et effectifs légaux ; ballon a une trajectoire visible ; lancer contestable ; si sauteur indisponible, autre plan.
- **Tests :** S04, LINE-01..05, `RM_TOUCHE_RAPIDE=1 node server/test-touche.js`.

### RM4-G21 — Maul à liaisons physiques et objectifs

- **Fichiers :** `engine/ai/plans/maul.js`, physique `_tickMaul`, `server/test-v4-maul-ai.js`.
- **Réalisation :** participants en graphe de liaisons, entrée légale, `MAUL_BIND`, `MAUL_DRIVE`, `PRESENT_BALL`, réallocation si rupture de liaison.
- **Critères :** les joueurs déliés ne poussent pas, le maul peut s'arrêter et le ballon être joué ; aucun plan ne donne un essai automatique.
- **Tests :** S05, MAUL-01..04, `test-invariants.js`.

### RM4-G22 — Loi 2026, profils par compétition et événements

- **Fichiers :** `engine/ai/law-profile.js` ou `engine/referee/law-profile.js`, `docs/REGLES_RUGBY.md`, `server/test-v4-law-profiles.js`.
- **Réalisation :** créer profils à partir de dates de commencement de compétition et des textes applicables ; unifié avec moteur existant, pas deux arbitres concurrents.
- **Critères :** le même contact peut être évalué suivant deux profils et donner des conséquences configurables ; critères documentés, pas de lois inventées.
- **Tests :** ARB-03–10, S05/S08 ; tests antérieurs verts.

### RM4-G23 — Agent arbitre, décisions et avantage

- **Fichiers :** `engine/referee/referee-controller.js`, `engine/rugby-engine.js`, `server/test-v4-referee-controller.js`.
- **Réalisation :** arbitre détecte violations à partir de faits/événements autoritatifs, conserve marque d'infraction, décision `PLAY_ON/ADVANTAGE/PENALTY/SCRUM` explicable et justifiée ; utiliser logique existante, pas créer une deuxième autorité d'arbitrage.
- **Critères :** avantage réel, retour à la marque si non obtenu, aucun sifflet contradictoire, signal associé à l'événement correct.
- **Tests :** S08/S10, ARB-01..16.

### RM4-G24 — Assistants et TMO optionnel

- **Fichiers :** `engine/referee/assistant-controller.js`, `engine/referee/tmo-controller.js`, `server/test-v4-officials.js`.
- **Réalisation :** assistants suivent la touche et émettent de **vraies observations** (`TOUCH_MARK`, `FLAG`, `REPORT`) ; TMO si règlement autorise, décision attribuée au central.
- **Critères :** pas de TMO amateur par défaut ; fanions cohérents avec touche et marque ; n°15 ne peut pas ignorer une touche parce que visuellement un drapeau est levé.
- **Tests :** S04/S10, ARB-07/13/14.

## M4 — Observabilité et présentation

### RM4-G25 — Débogueur des buts, plans et preuves

- **Fichiers :** `docs/js/renderer.js`, `docs/js/main.js`, `docs/js/matchState.js`, `server/test-v4-debug-overlay.js`.
- **Réalisation :** sélection d'un des 30 joueurs, panneau `goal/plan/step/facts/replanReason`, flèche cible, trace des décisions ; ne pas stocker journaux lourds en sauvegarde de carrière.
- **Critères :** en S01 on voit le 9 changer de `PASS_TO_10` en `PASS_TO_POD` après fermeture de ligne. L'overlay doit lire le **même** plan que le contrôleur.
- **Tests :** D01/D02 en replay, captures comparatives.

### RM4-G26 — Animations 2D rétro originales

- **Fichiers :** `docs/js/renderer.js`, nouveau `docs/js/sprites.js`, `docs/css/*`, `server/test-v4-renderer.js`.
- **Réalisation :** silhouettes 8 directions, marches/sprint, réception, passe, plaquage, ruck, mêlée, touche, maul ; s'appuyer uniquement sur événements et positions réellement produits.
- **Critères :** aucune passe rendue avant `BALL_RELEASE` ; une mêlée n'est pas un ruck visuel ; au sol, pas d'animation de sprint.
- **Tests :** captures S01/S03/S04/S05/S07 et Playwright ; mobile Android.

### RM4-G27 — Tactique manager et personnalités d'agents

- **Fichiers :** `docs/js/club.js`, `docs/js/club-composition.js`, `docs/js/clubUI.js`, `engine/ai/goals.js`, `server/test-v4-tactics-ui.js`.
- **Réalisation :** traduire 1-3-3-1/2-4-2, largeur, rythme, défense et jeu au pied en **priorités individuelles de buts, budgets de risque et références de placement connues par chaque joueur**. Introduire attributs décision, lecture, discipline et cohésion sans casser les anciennes sauvegardes.
- **Critères :** deux tactiques produisent des **plans** statistiquement distincts, pas seulement des dessins de pods, et anciennes sauvegardes migrent.
- **Tests :** D06, S01/S06, `server/test-parcours-club.js`.

## M5 — Validation et livraison

### RM4-G28 — Relecture, instrumentation et rapport de couverture

- **Fichiers :** `server/v4/measure-before-after.js`, `docs/SIMULATION_V4/RESULTATS.md`, `server/test-v4-integration.js`.
- **Réalisation :** enregistrer taux `NO_PLAN`, replan, durée et réussite par but/action, coût IA par tick, 30 matchs appariés, 10 fixtures scénarios + 8 preuves différenciantes.
- **Critères :** aucun objectif important sans couverture de test ; mode GOAP vs LEGACY comparés à règles identiques.
- **Tests :** I01–I20, D01–D08, **IND-01–IND-12** ; `test-invariants.js`.

### RM4-G29 — Tests massif et navigateur

- **Fichiers :** `server/test-v4-calibration.js`, `.github/workflows/tests-longs.yml`, `server/test-v4-screenshots.js`.
- **Réalisation :** 100 à 500 matchs selon coût, distributions passe/ruck/mêlée/touche/essai, comparaisons historiques **date et SHA visibles**, capturer la fréquence des actions de tous les 30 agents, mesurer ralentissement / rendu.
- **Critères :** aucun test existant désactivé ; maintien des ordres de grandeur du rugby, stabilité du classement abstrait vs moteur ; mobile lisible.
- **Tests :** `test-stats-matchs.js`, `test-scores-abstraits.js`, `test-parcours-navigateur.js`.

### RM4-G30 — Activation progressive, fusion et contrôle de production

- **Fichiers :** `docs/SIMULATION_V4/RELEASE.md`, feature flag du moteur, `README.md`, `bugs.md`.
- **Réalisation :** activer le mode GOAP en test puis optionnel dans Mode Club, conserver LEGACY comme comparaison et rollback ; valider export de match, replay, sauvegardes, suivi version sur GitHub Pages.
- **Critères :** page déployée du **SHA effectivement fusionné**, `version.json` cohérent, CI intégralement verte ; ouvrir un ticket séparé pour ce qui n'est pas implémenté.
- **Tests :** `.github/workflows/deploy-pages.yml` tests+verify, tests longs selon budget.
- **Rejet si :** fusion de la documentation présentée comme **livraison de 30 agents GOAP vivants**, ou ajout d'une IA collective contre l'architecture spécifiée.

---

## M6 — Dialogues tactiques et décisions des joueurs (lots complémentaires)

Ces trois tâches étendent l'architecture **individuelle** des tâches G04–G20, mais ne doivent pas devenir une nouvelle IA centrale. Le document de référence est `10_DIALOGUES_TACTIQUES_DU_9.md`.

### RM4-G31 — Dialogue touche entre 9 et 10 puis demande du 9

- **Dépendances :** G02–G09, G10, G11, G20.
- **Fichiers :** `engine/ai/local-communication.js`, `engine/ai/agent-controller.js`, `engine/ai/roles/halfback.js`, `engine/ai/roles/backs.js`, `engine/ai/plans/lineout.js`, nouveau `server/test-v4-lineout-dialogue.js`.
- **Réalisation :** le 9 voit une touche, questionne `A10` par `LINEOUT_ASK`, le 10 répond par `LINEOUT_FRONT/MIDDLE/BACK/WIDE/MAUL` en faisant référence à la question. Le 9 fait sa **propre** demande aux joueurs proches, peut choisir autre chose que le 10. Le lanceur et les sauteurs interprètent eux-mêmes cette demande ; les distances, la latence, le temps réglementaire et les changements de situation comptent.
- **Critères :** deux réponses du 10 sur deux configurations identiques sauf défense ; deux demandes possibles du 9 ; aucune « réception de touche » autorisée par message ; pas d'attente infinie si 10 absent.
- **Tests :** STR-DIA-L01–L05, COM-I01..I10, `node server/test-v4-tactical-dialogue.js` (transport seul), `test-touche.js`.
- **Rejet si :** 10 ou 9 écrit directement dans le plan du talonneur/sauteur, ou le 9 annonce un résultat avant que le ballon sorte des mains.

### RM4-G32 — Stratégie de mêlée décidée par le 9 avec avis du 10 et départ discuté avec le 8

- **Dépendances :** G02–G11, G19, G22/G23.
- **Fichiers :** `engine/ai/roles/halfback.js`, `engine/ai/plans/scrum.js`, `engine/rugby-engine.js`, `server/test-v4-scrum-dialogue.js`.
- **Réalisation :** **le 9 demande d'abord au 10** par `SCRUM_OPTIONS_ASK` de conseiller jeu au près, au large ou avancer (`SCRUM_NEAR/WIDE/ADVANCE`). **Il interroge ensuite le 8** par `SCRUM_8_ASK` sur un départ possible (`SCRUM_8_READY/BLOCKED`). Il peut également obtenir des renseignements techniques des avants par `SCRUM_ASK` et `SCRUM_STEADY/PRESSURE/UNSTABLE`. **C'est le 9 qui choisit finalement** jeu au près, au large, avancée ou départ du 8 (`SCRUM_8_BREAK`). Le 8 ne part qu'à la sortie légale du ballon, via le moteur physique. Chaque avant choisit son niveau d'effort et ses appuis, sous contrôle de l'arbitre ; pas de « +10 force » magique déclenché par une parole. Faire tourner la mêlée est une **résultante physique** ; si elle tourne de >90° sans infraction, remise en place ; poussée volontaire de travers sanctionnable. Effondrement provoque sifflet immédiat ; volontaire = faute dangereuse avec pénalité, jamais un moyen légal de gagner.
- **Critères :** 9 obtient une réponse du 10 et du 8, peut choisir différemment de leurs conseils, départ du 8 discuté et conditionné au contrôle réel du ballon ; 8 et 9 ne possèdent jamais simultanément le ballon ; demande forte après introduction peut reculer l'adversaire sans garantie ; aucun effet avant introduction.
- **Tests :** STR-DIA-S01–S12, SCR-01..05, `server/test-v4-tactical-dialogue.js`, loi 19.17/19/25/34/37, `server/test-melee.js` et invariants.
- **Rejet si :** la demande du 9 déclenche directement un recul/rotation/effondrement sans simulation physique ou si l'écroulement volontaire est valorisé comme règle du rugby.

### RM4-G33 — Chandelle (*up-and-under*) annoncée à l'avance aux trois-quarts

- **Dépendances :** G02–G11, G12, G16, G18.
- **Fichiers :** `engine/ai/roles/halfback.js`, `engine/ai/roles/kick.js`, `engine/ai/local-communication.js`, `engine/rugby-engine.js`, `server/test-v4-up-and-under.js`.
- **Réalisation :** détecter **plusieurs phases sans progression mesurable**, comparer `CONTEST_AERIAL_BALL` aux alternatives porte/passe/pied d'occupation. Si le 9 choisit le coup de pied et **possède** le ballon, il annonce `KICK_HIGH` (« Chandelle ! ») **avant** de botter. Les trois-quarts qui entendent peuvent choisir individuellement `CHASE_KICK_ONSIDE`, `HOLD_WIDTH` ou `COVER_BACKFIELD` ; les joueurs hors-jeu ne chassent pas. Le ballon doit être botté par le moteur, et le 9 peut annuler après l'annonce.
- **Critères :** 9 peut annoncer sans ensuite botter si pression nouvelle ; un arrière lointain n'a pas de réception magique de l'appel ; chasseurs pas toujours les mêmes ; pas de ballon en vol avant la frappe ; statistiques coups de pied et turnovers réévaluées sur 30/100 graines.
- **Tests :** STR-DIA-K01–K08, COM-I01..I10, `test-v4-tactical-dialogue.js` (transport), `test-invariants.js`, `test-calibration-moteur.js`.
- **Rejet si :** chaque troisième phase déclenche obligatoirement un pied, si l'annonce devient un ordre individuel forcé, ou si le 9 botte alors que le ballon est encore au ruck.

**Statut :** les tests `server/test-v4-local-communication.js` (28 cas) et `server/test-v4-tactical-dialogue.js` (14 cas) valident uniquement le transport symbolique. Les scénarios STR-DIA exigent encore des tests de **moteur** réalisés par G31–G33.

## M7 — Étudier de vrais matchs et tester les décisions alternatives

**Documents prioritaires :** `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md` et `fixtures/observations_matchs_reels.json` (16 séquences provenant de 4 matchs sourcés). Les paroles des joueurs et les 30 trajectoires exactes sont **inconnues** ; ne jamais les inventer en tant qu'« observations ».

### RM4-G34 — Corpus réel, provenance et baseline mesurée

- **Dépendances :** G00, G01 ; G02 seulement pour injecter des scénarios moteurs, pas pour valider des sources.
- **Fichiers :** `docs/SIMULATION_V4/11_MATCHS_REELS_ET_PRISES_DE_DECISION.md`, `fixtures/observations_matchs_reels.json`, `server/test-v4-observations-matchs.js`, `server/v4/measure-baseline.js`, `docs/SIMULATION_V4/BASELINE.md`.
- **Réalisation :** valider les 16 actions observées **une par une** depuis les comptes rendus (ENW01, IRF01–06, ENF01–04, FIF01–05). Pour chacune conserver `sourceUrl`, phase, acteurs connus, fenêtre temporelle **non chronométrée** et issue observée ; séparer scénarios contrefactuels **synthétiques**. Ajouter données supplémentaires uniquement si source authentique. Effectuer 100 graines sur la version courante `main` avec `aiMode:LEGACY`; mesurer points, essais, rucks, passes, mauls, coups de pied, touches, mêlées, turnovers, pénalités, temps de jeu effectif. Comparer World Rugby Six Nations 2023 en indiquant explicitement **année, compétition, définition des compteurs**.
- **Critères :** chaque observation sourcée et non mélangée à une transcription fictive ; aucune fausse position `x/y`, pas de dates de secondes inventées ; `BASELINE.md` contient SHA, graines, méthodes, moyennes, médianes et dispersion.
- **Tests :** `node server/test-v4-observations-matchs.js` (déjà fourni : validation structurelle), `test-invariants.js`, `test-calibration-moteur.js` ; code de mesure relançable.
- **Rejet si :** les dialogues de Dupont/Fin Smith sont présentés comme des citations réelles sans enregistrement ; une observation devient une scène à 30 coordonnées « historiques » sans vidéo/annotation.

### RM4-G35 — Reproduction **causale** de 16 séquences en scènes de moteur

- **Dépendances :** G02–G11, puis G12–G20, G31–G33 selon les actions ; ne pas simuler une action de mêlée avant le socle d'injection/IA.
- **Fichiers :** `server/v4/scenario-harness.js`, nouveau `server/test-v4-real-match-decisions.js`, `engine/ai/actions.js`, `engine/ai/roles/halfback.js`, `engine/ai/roles/back-row.js`, `engine/ai/roles/backs.js`, `engine/rugby-engine.js`.
- **Réalisation :** convertir les **observations** en fixtures **hypothétiques** claires, sans prétendre connaître les positions réelles. Couvrir `REAL-01..16` du document 11, en deux variantes chacune : par exemple 8 libre/bloqué en mêlée, maul libérable/bloqué, aile libre/couverte, pied haut poursuivi/isolé, arbitre reconnaît ou non une infraction selon action physique. Vérifier actions et buts du nouveau catalogue G36–G43, A37–A50. Les décisions sont faites par chaque agent, **aucun** `TeamCoordinator`.
- **Critères :** un même but peut donner deux plans selon observation ; chaque résultat dépend d'une prise de balle, course, collision ou faute réelle ; score jamais écrit par GOAP ; rapports détaillent graines/ticks/actions avant/après.
- **Tests :** `test-v4-real-match-decisions.js`, `test-v4-goap-planner.js`, tests de mêlée/touche/ruck/maul/hors-jeu existants.
- **Rejet si :** `plan = '8_PICK'` produit directement un essai à la minute connue ou si le 9 reçoit les positions et plans cachés des partenaires.

### RM4-G36 — Calibration des **choix** et taux d'échec par agent, pas seulement des scores

- **Dépendances :** G28/G29, G34/G35.
- **Fichiers :** `server/v4/measure-strategies.js`, `docs/SIMULATION_V4/CALIBRATION_DECISIONS.md`, `server/test-v4-strategies-stats.js`, `.github/workflows/tests-longs.yml`.
- **Réalisation :** comparer 100 puis 500 matchs identiques en deux modes `LEGACY` / `GOAP`. Pour chaque n°9/n°8/n°10/ailier/15 mesurer par possession et zone : choix 8 départ vs sortie 9, maul→9→large/près, fréquence des chandelles selon stagnation réelle, coups de pied hauts par poste, turnover→contre-attaque, 15 couvre vs monte, appels entendus/ignorés, indisponibilités, erreurs techniques, mauvaises décisions et réajustements. Inclure temps de calcul/nœuds GOAP et les métriques agrégées World Rugby 2023 comme **point de comparaison historique daté**, pas seuil universel de 2026.
- **Critères :** les agents ne réussissent pas 100% des prises de balle/pieds/plaquages ; changement de plan démontré sous une variation de défense ; données de simulation à métadonnées (SHA, seed, durée, profil légal, tactique, mode IA) ; écarts de stats analysés et assumés.
- **Tests :** `REAL-01..16`, `STYLE-01..03`, 30 graines PR ciblée, 100 graines intégration, 500 en suite longue ; tableaux de dispersion, tests d'invariants, tests navigateur ; capture d'au moins 4 replays de décisions (ENW01/IRF01/ENF02/FIF05) rejoués à graines connues.
- **Rejet si :** reproduire les 16 essais identiques avec des scripts par joueur, annoncer une vérité historique depuis une scène inventée ou faire baisser les tests de lois pour « retrouver » le score exact d'un match.

**Le corpus de 16 événements n'est pas un dataset de suivi spatial** ; il permet d'écrire des tests sur des **possibilités de décisions**, pas de copier des trajectoires exactes.

## M8 — Le 8 annonce sa prise et trois styles de jeu fondés sur des matchs

**Document prioritaire :** `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md`.

### RM4-G37 — Signal 8→9 **AVANT** le départ, prévention des doubles prises

- **Dépendances :** G04–G11, G19, G32. Ne pas annoncer une fonctionnalité moteur sans le vrai contrôleur GOAP.
- **Fichiers :** `engine/ai/local-communication.js`, `engine/ai/roles/back-row.js`, `engine/ai/roles/halfback.js`, `engine/ai/agent-controller.js`, `engine/rugby-engine.js`, nouveau `server/test-v4-scrum8-going.js`.
- **Réalisation :** distinguer `SCRUM_8_READY` (capacité), `SCRUM_8_BREAK` (choix du 9) de **`SCRUM_8_GOING` (le 8 prévient le 9 juste avant de réellement prendre le ballon)** ; `SCRUM_8_ABORT` (8 se ravise) ; `SCRUM_9_ACK` (réception facultative). Les appels ont un identifiant `phaseId` par mêlée, une portée courte et une durée limitée ; les alertes urgentes contournent le cooldown **sans permettre de spam**. Le 9 **qui entend le bon appel** invalide son plan `SECURE_BALL` si annulable, replanifie vers `SUPPORT_8`, `BE_PASS_OPTION`, `PROTECT_BLIND_SIDE` ou autre but contextuel. Le 8 n'accède à `SCRUM_8_PICK_FROM_BACK` qu'après avoir émis sa tentative d'alerte. Si le 9 n'entend pas et court aussi, la physique/arbitrage établit un porteur unique, jamais un « joueur propriétaire » décidé par une IA collective.
- **Cas limites :** le 8 a crié prêt puis part en moins de 0,7 s ; alerte tardive, perdue, annulée ; 9 déjà en action ; mêlée 2 reçoit un message de mêlée 1 ; balle encore liée/inaccessible ; 8 donne ensuite la balle au 9.
- **Critères :** après appel entendu, le 9 ne continue pas à courir reprendre le même ballon par un ordre statique ; aucune attribution du ballon par le bus ; pas de téléportation ni de double porteur ; la prise du 8 se produit dans les conditions de la loi 19.36 et le mouvement est individuel.
- **Tests :** `S8-01..S8-09`, `node server/test-v4-local-communication.js` (39 tests symboliques), `node server/test-v4-tactical-dialogue.js` (18 tests symboliques), `test-melee.js`, `test-invariants.js`.
- **Rejet si :** le signal du 8 déplace directement le 9, si un gestionnaire central réserve la balle, si un message « je suis prêt » est interprété comme « je l'ai » ou si le 9 reprend un ballon déjà porté par le 8.

### RM4-G38 — Styles Angleterre/Springboks/All Blacks à partir de **cinq matchs**

- **Dépendances :** G34–G36, G37, G16–G20 ; pour les profils complets, G11 doit déjà instancier 30 agents.
- **Fichiers :** `docs/SIMULATION_V4/12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md`, `docs/SIMULATION_V4/fixtures/observations_styles_2023_2026.json`, `server/test-v4-styles-match-data.js`, `engine/ai/individual-playbook.js`, `server/test-v4-styles-integration.js`.
- **Réalisation :** intégrer 5 matchs sourcés : Angleterre–Afrique du Sud (2023, pression de mêlée, pénalité finale), Angleterre–Nouvelle-Zélande (2025, 35 coups de pied mais aussi combinaison de touche), SA–NZ (Le Cap 29/08/2026, 246 vs 93 passes), Johannesburg (05/09/2026, maul et contre-attaque au pied), Baltimore (12/09/2026, 6–4 essais, départ de **ruck** du 8 et non de mêlée). Enrichir le corpus JSON de **12 observations**, clairement documentaires sans vidéo-tracking. Utiliser le comparatif All Blacks du **04/09/2026** (passes 230/NZ vs 112/SA par match, pied 19,8 vs 29,7) comme *instantané daté*, pas statistique saison définitive.
- **Presets interchangeables :** `ENG_TERRITORY_AND_AERIAL`, `RSA_SET_PIECE_AND_PRESSURE`, `NZ_MULTIPHASE_AND_COUNTER` ; chaque agent applique son propre `playbook` lu, **aucun code spécial sur la nationalité**, aucune IA collective. Tester un club anglais fictif jouant le plan néo-zélandais, des 9 individuels et des défenses différentes.
- **Critères :** mêmes joueurs/graines, plan différent => distributions de choix différentes ; même plan, menace différente => plan individuel révisable ; pas de jeu au pied systématique pour un Anglais ni de passe obligatoire pour un Néo-Zélandais ; les avants sud-africains n'obtiennent aucune pénalité par « bonus ».
- **Tests :** `STYLE-04..STYLE-10`, `node server/test-v4-styles-match-data.js` (**données seulement**), `REAL-01..16`, `test-v4-goals-actions-doc.js`, séries appariées 30/100/500 matchs.
- **Rejet si :** prise au ruck confondue avec prise au fond de mêlée ; propriété « Afrique du Sud » choisit la cible d'un autre joueur ; des statistiques de 2026 sont interprétées comme un état exact de tous les matchs.

**Statut actuel :** le prototype de transport vocal et les corpus de matchs passent leurs **tests unitaires/documentaires**. Les tests `S8` et `STYLE` décrits ci-dessus restent **des scénarios d'intégration à développer**. Les deux premières priorités d'implémentation moteur sont l'injecteur G02 et la boucle GOAP G03–G08.

## M9 — Matchs de Top 14 et choix tactiques en rugby de club

**Référence :** `13_MATCHS_TOP14_DECISIONS.md`. Ne pas confondre observation du rapport, statistique agrégée et décision intérieure des joueurs.

### RM4-G39 — Corpus Top 14 sourcé et données de statistiques propres

- **Dépendances :** G00 et G34, sans avoir besoin d'un AgentController déjà en match pour la validation documentaire.
- **Fichiers :** `docs/SIMULATION_V4/13_MATCHS_TOP14_DECISIONS.md`, `docs/SIMULATION_V4/fixtures/observations_top14_2025_2026.json`, `server/test-v4-top14-data.js`, `server/v4/top14-benchmark.js`.
- **Réalisation :** consolider **9 rencontres Top 14 2025–2026/2026–2027**, **19 observations sourcées** et **6 jeux de statistiques LNR**. Couvrir Racing–Bayonne (Hughes 8 pick et choix pénalité→mêlée), Toulouse–Bayonne (touche→Brennan→Ntamack), finales Toulouse–UBB 2025 et Toulouse–Montpellier 2026 (une-deux 9/talonneur et coup franc rapide), Toulon–UBB/Toulouse, Racing–La Rochelle (Jegou→Le Garrec et drop manqué), Toulon–La Rochelle, Pau–Toulouse (n°8 Isa marque sans sortie de mêlée démontrée). Distinguer les événements et les chiffres de match dans le schéma.
- **Qualité de données critique :** la page statistique LNR de la finale 2026 Toulouse–Montpellier affiche **zéro** pour mêlées, touches, plaquages, passes et pieds : **données manifestement manquantes**, `null` / `MISSING_OR_INCONSISTENT`, pas des vrais zéros ; **ne pas les intégrer au benchmark**. Compte rendu officiel utilisable pour score, chronologie, événements.
- **Critères :** URLs de provenance par observation, minutes approximatives, aucune parole 8/9 ou trajectoire « réelle » inventée, aucune inférence automatique « n°8 marque = sortie de mêlée ». Stats avec saison, date, compétition, match, équipe, méthode de calcul et statut.
- **Tests :** `node server/test-v4-top14-data.js` (**déjà présent**, corpus/documentaire), plus validation externe et comparaison à la source pour chaque chiffre.

### RM4-G40 — 19 scènes Top 14 à exécuter réellement par GOAP + physique

- **Dépendances :** G02–G11, G12–G20, G31–G33, G37. Commencer par séquences contenant déjà un 9/8/10 et la touche.
- **Fichiers :** `server/test-v4-top14-scenarios.js`, `server/v4/scenario-harness.js`, `engine/ai/agent-controller.js`, `engine/ai/roles/halfback.js`, `engine/ai/roles/back-row.js`, `engine/ai/roles/backs.js`, `engine/rugby-engine.js`.
- **Réalisation :** coder `TOP14-01..19` en deux variantes contrefactuelles chacune : le 8 avertit le 9/9 n'entend pas, petit côté ouvert/fermé, pénalité→mêlée ou tir, touche gagnée→maul ou Brennan, 9↔talonneur une-deux possible/impossible, joueur reçoit / ballon indisponible, petit pied derrière ou défenseur en couverture, mêlée→coup franc rapide, point après 80e avec/sans prolongation, 9 receveur d'un troisième ligne, drop tenté et manqué, interruption météo avec état sauvegardé, même nombre d'essais mais score différent.
- **Critères :** chaque joueur évalue ses propres buts et déplacement, appels seulement perçus, un seul possesseur, aucun changement de phase sans loi arbitre, aucune action GOAP marquant directement un essai, replays reproductibles. La tactique du 9 influe sur les propositions mais ne sélectionne pas les trajectoires des partenaires.
- **Tests :** `TOP14-01..19`, `IND-01..12`, `S8-01..09`, `test-melee.js`, `test-touche.js`, `test-ruck.js`, `test-invariants.js`, 30 graines appariées.
- **Rejet si :** les 19 séquences sont des scripts de résultats, si le 9 obtient deux fois la balle lors du départ du 8 ou si un essai « historique » est forcé au score du match.

### RM4-G41 — Calibrer des matchs **de clubs** selon contexte, pas un archétype de nationale

- **Dépendances :** G28/G29, G34–G36, G39/G40.
- **Fichiers :** `server/v4/top14-calibration.js`, `docs/SIMULATION_V4/CALIBRATION_TOP14.md`, `server/test-v4-top14-calibration.js`, CI longue.
- **Réalisation :** même seed et joueurs, `aiMode=LEGACY` versus `GOAP` ; variétés tactiques **interchangeables**. Comparer distribution de passes, coups de pied, touches, mêlées, pénalités, essais, nombre de points au pied ; **conditionner** les choix à score/terrain/opposition et disponibilité des 8/9/10. Mesurer les prises du 8 et les réponses 9 après `SCRUM_8_GOING`, le talonneur qui reçoit du 9 après touche, le 9 recevant d'un troisième ligne, les drops manqués en fin de match.
- **Repères réels :** Toulon–UBB 31/05/2026 **212 vs 112 passes et 18 vs 37 coups de pied** ; Toulon–Toulouse 09/05/2026 **110 vs 211 passes** ; Pau–Toulouse 01/11/2026 **46% vs 54% possession mais 4 vs 2 essais** ; Toulon–La Rochelle 12/09/2026 **3 vs 2 essais mais 20–21 au score**. Ces observations ne décrivent **pas** un style figé pour chaque club.
- **Critères :** 30 graines PR, 100 intégration, 500 en CI longue ; variance statistique, sorties de phases légales, fatigue et erreurs réalistes ; courbes + écarts LNR datés ; aucun ajout des faux zéros 2026.
- **Tests :** `TOP14-12..19`, tests de stats, scénario de données manquantes, simulation 30/100/500 graines. Ne pas déclarer « calibré » avant vrai moteur.

**Statut :** le nouveau test `server/test-v4-top14-data.js` valide **le corpus** (9 matchs, 19 observations, 6 feuilles fiables) et son garde-fou contre les faux zéros. Les tests `TOP14-01..19` et la calibration GOAP Top 14 sont **à développer**, pas réalisés.

## M10 — Ne plus coder les matchs comme des résumés : micro-décisions des 30 agents

**Référence prioritaire :** `14_ANALYSE_MICRO_ACTIONS_TOP14.md`, corpus détaillé `fixtures/micro_actions_top14.json` : **sept études, 47 micro-étapes, 22 variantes contrefactuelles**. Les buts et mouvements proposés sont explicitement **des inférences**, même quand les actions de match sont vérifiées par Eurosport/Rugbyrama/LNR. Un scénario (La Rochelle–Bayonne J9 2026/27) est exclusivement **synthétique fondé sur des statistiques**. **51 buts GOAP et 66 actions candidates** sont définis dans `05_CATALOGUE_GOALS_ACTIONS.md`.

### RM4-G42 — Analyse tactique détaillée et trace individuelle action par action

- **Dépendances :** G34/G39 pour les corpus ; G04/G05/G08 pour le raccordement à la perception et au contrôleur individuel.
- **Fichiers :** `docs/SIMULATION_V4/14_ANALYSE_MICRO_ACTIONS_TOP14.md`, `fixtures/micro_actions_top14.json`, `server/test-v4-top14-micro-actions.js`, `engine/ai/agent-controller.js`, `engine/ai/telemetry.js`, `server/v4/decision-trace.js`.
- **Réalisation :** chaque étape décrit ACTEUR, fait sourcé, observation **partielle**, but, 2+ options, gardes, déplacement individuel et conséquence physique éventuelle. Traces de match `{tick,agentId,beliefs,goalBefore,goalAfter,optionsRejected,chosenAction,individualMovement,guards,outcome}`, avec cause du choix et âge des croyances. Le 9, le 8, le 10, le talonneur, les avants, les leurres et les défenseurs doivent tous produire **leurs propres décisions**. Ne jamais prêter les intentions réelles d'un joueur à la source, ni déduire une trajectoire exacte des statistiques.
- **Particularité :** dans Toulouse–UBB 2025, Rugbyrama/Eurosport décrivent un bloc près de Flament, la montée Samu/Moefana désynchronisée de Gazzotti, le leurre Willis, la course Jelonch et la passe de Flament. **Le point de reprise est décrit comme pénalité/coup franc selon la source : afficher la divergence, ne pas inventer un type de restart historique.** Prendre une configuration réglementaire explicite pour le test moteur.
- **Tests :** `node server/test-v4-top14-micro-actions.js` (déjà livré, 47/22 vérifiés **documentairement**), `node server/test-v4-goals-actions-doc.js` (51 buts / 66 actions), plus tests de traçage réel à créer.
- **Rejet si :** un événement historique devient un résultat forcé, une trace utilise l'état omniscient de l'adversaire comme perception du joueur ou la vidéo non visionnée reçoit un faux horodatage.

### RM4-G43 — Intégrer 22 branches de micro-actions dans le vrai moteur, avec adversaires qui choisissent

- **Dépendances :** G02–G11, G15–G20, G31–G33, G37, G40.
- **Fichiers :** `server/v4/scenario-harness.js`, `server/test-v4-micro-actions-engine.js`, `engine/ai/roles/backs.js`, `engine/ai/roles/back-row.js`, `engine/ai/roles/halfback.js`, `engine/ai/actions.js`, `engine/rugby-engine.js`.
- **Réalisation :** sept cas, 47 décisions nominatives et 22 contre-factuels. D'abord Jelonch en finale 2025 (13 étapes, **4 variantes**). Faire en sorte que Willis court pour devenir une **option/leurre crédible**, sans garantir que Moefana le suive ; Flament voit l'espace changer et choisit entre `CARRY`, `PASS_WILLIS`, `PASS_JELONCH`. Moefana/Samu/Gazzotti ne reçoivent aucune affectation centrale : chacun marque la menace qu'il **perçoit**, avec délai de réaction, inertie et possibilité d'erreur. Puis Lucu→Penaud rasant, Hughes départ du 8 et notification au 9, Dupont→Ntamack feinte puis pied rasant vers Dupont→Chocobares, Dupont–Mauvaka touche et une-deux, sortie des 22 de Dupont et six variantes statistiques rochelaises.
- **Contraintes :** les appels 8→9 restent locaux et distincts de la possession ; le 9 ne se déplace jamais directement à cause du bus vocal ; un seul porteur ; pas de plaquage avant possession ; ballon en l'air / au sol / au pied réellement simulé ; défense replanifiée localement ; aucun résultat d'essai issu directement de GOAP.
- **Tests :** `MIC-01..MIC-12` (nouveaux) + les 22 branches du JSON ; vérifier pour chaque variante le **changement d'option ou de faisabilité**, pas un résultat identique forcé ; test d'invariants de mêlée, touche, ruck, passe avant, hors-jeu et du porteur unique.
- **Rejet si :** un joueur leurre « force » le cerveau d'un défenseur, si un 10 feinte une passe réellement libérée, si le 9 reçoit son ballon par télépathie, ou si le même schéma produit toujours un essai.

### RM4-G44 — Calibrer les transitions causales et les erreurs, pas seulement la possession ou les points

- **Dépendances :** G28/G29/G36/G41 puis G42/G43.
- **Fichiers :** `server/v4/compare-micro-traces.js`, `server/test-v4-micro-decisions-stats.js`, `docs/SIMULATION_V4/CALIBRATION_MICRO_ACTIONS.md`.
- **Réalisation :** 30 graines pour PR, 100 pour intégration, 500 pour campagnes longues, avec les mêmes 30 joueurs/seed et un seul changement : défenseur suit/ignore le leurre, 9 entend/n'entend pas 8, soutiens onside/hors-jeu, 10 botte/court, maul bloque/passe possible, petit côté libre/couvert. Mesurer `P(goalChange|observationChanged)`, succès/échec de chaque passe, erreur de marquage, temps d'arrivée soutien, nombre de courses avortées, réceptions contestées, nombre de violations de lois, distribution des buts. Calibrer en utilisant les données LNR **datées** ; un taux moyen de 3,18 s de ruck n'est pas le chronomètre de tous les rucks.
- **Critères :** au moins deux plans/trajectoires pour une même scène selon circonstances ; variations de décisions par joueur et non par script de club ; temps simulé indépendant FPS ; aucun échec impossible à déclencher ; aucune position / audio réel inventé.
- **Tests :** `MIC-01..12`, `STYLE-01..10`, `TOP14-01..19`, invariants, décisions multi-graines ; signaux 8/9 avec perte/expiration/annulation.
- **Rejet si :** l'agent dispose de coordonnées/historiques cachés, si une passe est encore jouée après que le porteur a perdu le ballon, ou si la distribution correspond à une ligne de score déterministe.

**Ordre de réalisation recommandé** : une **seule séquence complète** du début à la fin (Jelonch) avec les défenseurs autonomes et preuve par contre-factuel, puis départ Hughes (8↔9), puis pied Lucu→Penaud et touche Dupont–Mauvaka. Ne pas multiplier les catalogues de scénarios moteur sans avoir un agent réellement branché à `MatchEngine`.

## 2. Commandes générales de garde (sur chaque tranche pertinente)

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

**Attention** : certaines suites longues simulent de nombreux matchs ; ne pas lancer aveuglément en boucle. Avant une PR, exécuter les tests directement concernés puis les gardes obligatoires. La CI de `main` et la suite nocturne prennent le relais des campagnes lourdes.

## 3. Rapport de tâche que Claude doit produire

```markdown
### RM4-Gxx — intitulé
- Branche / SHA :
- État avant : (cas reproductible, graine, assertion rouge)
- Fichiers modifiés :
- But(s) de l'agent :
- Préconditions/actions/effets :
- Plan avant observation / plan après changement :
- Garanties légales et physiques :
- Commandes exécutées et résultats exacts :
- Statistiques avant/après (N graines identiques) :
- Captures si visible :
- Régressions non résolues :
- PR et décision de fusion :
```

**Premier développement recommandé après ce dossier : RM4-G02 puis G03–G08.** N'attaquer ni le TMO ni les sprites tant qu'un n°9 ne sait pas réellement construire, exécuter et réviser son plan.
