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
| **M6 — Dialogues tactiques** | G31–G33 | 9↔10 en touche, 9↔avants en mêlée, annonce de chandelle avant pied | DIA et STR-DIA, validation des lois |

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

### RM4-G01 — Planificateur symbolique GOAP minimal **(socle fourni)**

- **Fichiers :** `engine/ai/goal-planner.js`, `server/test-v4-goap-planner.js`.
- **Réalisation :** Dijkstra sur faits symboliques, coûts positifs, préconditions/effets, états canonisés, limites `maxExpanded/maxDepth`, `NO_PLAN` explicite, sélection parmi buts réalisables.
- **Critères :** un but obtenu via plusieurs actions, choix différent si état change, coût minimal, déterminisme, no-op en but satisfait. **Aucune intégration physique revendiquée.**
- **Tests :** `node server/test-v4-local-communication.js
node server/test-v4-tactical-dialogue.js
node server/test-v4-goap-planner.js` (G01–G14).
- **Rejet si :** un script spécial `if(numero === 9)` est utilisé comme « planner ».

### RM4-G02 — Injecteur de scénarios déterministes

- **Fichiers :** créer `server/v4/scenario-harness.js`, `server/test-v4-scenario-harness.js`; lire `docs/SIMULATION_V4/fixtures/scenarios.json`, `engine/rugby-engine.js`.
- **Réalisation :** construire un match de test avec positions/possessions/états légaux à partir des fixtures ; utiliser une API **de test** dédiée (`MatchEngine.fromFixture()` ou factory interne) ; corriger proprement les invariants dérivés (`ruckPoint`, participants, `ball`), sans modifier `getState()` public pour produire de faux états.
- **Critères :** chaque S01–S10 injectable ; après un tick, coordonnées finies, 30 joueurs, phase cohérente ; même fixture+graine => mêmes positions et événements.
- **Tests :** `node server/test-spec-simulation-v4.js`, nouveau `test-v4-scenario-harness.js`.
- **Rejet si :** l'injecteur corrige des états impossibles en silence ; documenter ses préconditions.

### RM4-G03 — Ontologie, modèles et horloge de décision

- **Fichiers :** créer `engine/ai/facts.js`, `engine/ai/world-model.js`, `server/test-v4-facts.js`.
- **Réalisation :** faits canoniques de `05_CATALOGUE_GOALS_ACTIONS.md` ; extraction **pure** depuis `getState()`, séparation faits observables/autoritatifs, faits de perception horodatés ; version de schéma.
- **Critères :** 0 conflit de faits (ballon en vol + porté, au sol + lié), tous types validés ; `SCRUM_BALL_IN` (orthographe canonique).
- **Tests :** nouveaux tests de faits + snapshots S01/S03/S07.
- **Rejet si :** duplication de la possession dans un second moteur.

## M1 — Premier vrai agent autonome et exécuteur

### RM4-G04 — Perception d'agent et mémoire locale

- **Fichiers :** `engine/ai/perception.js`, `engine/ai/agent-context.js`, `server/test-v4-perception.js`.
- **Réalisation :** capteurs (porteur, ballon, coéquipiers, adversaires, distance, hors-jeu, phase), **appels adressés reçus** via `LocalCommunication.hear()` avec auteur/âge/confiance ; information partielle, délai paramétré, observation précédente avec âge/confiance ; mode debug omniscient **désactivé par défaut** quand le test D07 mesure une visibilité limitée.
- **Critères :** un joueur privé d'information ne connaît pas instantanément une nouvelle position adversaire ; deux agents à positions distinctes peuvent avoir croyances distinctes.
- **Tests :** D07, S06/S07 ; vérifier que l'état physique source n'est pas muté.

### RM4-G05 — Sélecteur de buts contextualisé

- **Fichiers :** `engine/ai/goals.js`, `engine/ai/goal-selector.js`, `server/test-v4-goals.js`.
- **Réalisation :** conditions de satisfaction, éligibilité, priorité tactique/danger/compétence/fatigue/score, préemption de sécurité, engagement anti-oscillation. Inclure `DEFEND`, `RETAIN_POSSESSION`, `GAIN_TERRITORY`, `CONTEST_AERIAL_BALL` et les choix individuels de stratégie mêlée/touche/plein jeu. Les numéros de poste sont **profils**, pas scripts exclusifs.
- **Critères :** A15 préfère couverture puis sauvetage d'essai lorsque le risque change ; A7 choisit repli si hors-jeu ; le même agent peut changer de but au cours du match.
- **Tests :** D05 ; comparer 2 états opposés de S06.

### RM4-G06 — Catalogue des actions et adaptateurs de coût

- **Fichiers :** `engine/ai/actions.js`, `engine/ai/action-cost.js`, `server/test-v4-actions.js`.
- **Réalisation :** coder progressivement A01–A15 de la bibliothèque, avec `preconditions/effects/cost/estimatedDuration`, identifiants sans doublon, coûts strictement positifs et vérifications de faisabilité avant recherche.
- **Critères :** l'action `SECURE_BALL` ne peut être sélectionnée si le ballon n'est pas disponible ; `GET_ONSIDE` peut rendre un plan légal ; `PASS_TO_10` échoue à la planification si le 10 est couvert.
- **Tests :** G04–G06, G13 et tests de catalogues ; ne pas brancher 36 actions d'un coup.

### RM4-G07 — Exécuteur physique, gardes d'action, succès/échec

- **Fichiers :** `engine/ai/action-executor.js`, adaptateurs dans `engine/rugby-engine.js`, `server/test-v4-executor.js`.
- **Réalisation :** convertir une action choisie en intention physique bornée (courir, passer, plaquer). `startGuard`, `successGuard`, `abortGuard` interrogent le **monde réel**. Un effet GOAP n'est appliqué au plan suivant que s'il a effectivement eu lieu, sinon événement `ACTION_FAILED`. **Prévoir explicitement le chargement navigateur** : le prototype `engine/ai/goal-planner.js` expose aujourd'hui `module.exports` pour Node ; fournir un module UMD/ESM compatible avec les scripts de `docs/index.html` ou un bundle contrôlé, sans dupliquer deux implémentations divergentes. Ajouter un test de chargement navigateur.
- **Critères :** A9 met un temps physique >0 pour parcourir 6 m, une passe ratée ne donne pas un ballon reçu, plaquage manqué ne donne pas `CARRIER_TACKLED`.
- **Tests :** I01, D03, aucun saut, G01/G02 branchés au moteur.
- **Rejet si :** le planner écrit directement `porteur`, `ruckPoint`, score ou `possession`.

### RM4-G08 — Contrôleur `GoalBasedRugbyAgent`

- **Fichiers :** `engine/ai/agent-controller.js`, `server/test-v4-agent-controller.js`.
- **Réalisation :** boucle `PERCEIVE→UPDATE→SELECT_GOAL→PLAN→ACT→MONITOR` ; mémorise but/plan/index, événements de démarrage/fin/échec ; replan si précondition invalidée, danger urgent ou appel pertinent. `maybeSpeak()` décide localement de poser une question, répondre ou prévenir ; `hear()` informe la perception sans imposer de plan.
- **Critères :** quand le 10 est couvert à la troisième étape, A9 remplace `PASS_TO_10` par `PASS_TO_POD` sans recommencer depuis la remise en jeu si déjà au ruck.
- **Tests :** D01/D02, I03 ; deux trajectoires différentes, même but.

### RM4-G09 — Scheduler déterministe et enveloppe CPU

- **Fichiers :** `engine/ai/agent-scheduler.js`, `server/test-v4-budget.js`.
- **Réalisation :** décisions à intervalle logique, événements urgents sans attendre, maximum expansions/tick et report des plans non urgents ; ordre stable des agents et des **appels** ; aucun `Date.now()` pour décider d'un but ou recevoir un appel ; statistiques coût CPU hors simulation seulement.
- **Critères :** 30 agents en mémoire, aucun tick bloqué indéfiniment par recherche, mêmes événements sous même graine.
- **Tests :** D08, G09/G10 ; comparaison 10 matchs à dt constant.

## M2 — Intelligence individuelle de 30 joueurs et placements émergents

### RM4-G10 — Buts de placement et décision **individuelle** sans coordinateur

- **Fichiers :** `engine/ai/individual-placement.js`, `engine/ai/position-goals.js`, `server/test-v4-individual-placement.js`.
- **Réalisation :** chaque joueur calcule ses références de placement depuis un plan de jeu en lecture seule et ses perceptions ; il évalue `DEFEND`, `CLOSE_GAP`, `HOLD_LINE`, `MARK_OPPONENT`, `COVER_BACKFIELD`, `SUPPORT_CARRIER`, `BE_PASS_OPTION`, `PRESERVE_WIDTH`, `RETURN_TO_PLAYBOOK`. Il compare la présence **observée** des coéquipiers et les risques de laisser un espace ; chaque trajectoire est choisie localement, sans `TeamCoordinator`, blackboard, réservation ni enchère.
- **Critères :** deux joueurs dans des situations différentes ne suivent pas un placement collectif imposé ; défense prioritaire lorsque l'adversaire a la balle, mais aucune ruée systématique sur le porteur ; aucun déplacement choisi par un autre agent.
- **Tests :** IND-01..06, IND-08..12, D04, S01/S06/S07.

### RM4-G11 — Première instanciation des **30 agents**

- **Fichiers :** `engine/rugby-engine.js`, `engine/ai/agent-controller.js`, `server/test-v4-thirty-agents.js`.
- **Réalisation :** créer AgentContext pour A1–A15/B1–B15, croyances/buts/plans/trajets propres à chacun ; tous lisent le plan de jeu sans pouvoir écrire sur les intentions d'un partenaire ; **feature flag** `aiMode:'GOAP'|'LEGACY'`, LEGACY par défaut tant que validations non passées.
- **Critères :** 30 contextes distincts ; chaque agent décide seul de ses buts et mouvements ; aucun joueur sans contrôleur ; aucun coordinateur décisionnel central ; même simulation LEGACY produit exactement les anciennes stats et comportements.
- **Tests :** D04, déterminisme sur 10 seeds, invariants et tests de sauvegarde.

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
- **Réalisation :** tâches `ASSEMBLE→BIND→SET→INTRODUCE→HOOK→CONTEST→RELEASE`, sélection de sortie n°8/n°9, arbitrage des positions, ressource `SCRUM_BALL_IN`. **Le 9 consulte les avants puis peut demander stabilité ou forte poussée**, sans commander leurs mouvements. Tourner et tomber sont des événements physiques ; poussée de travers/écroulement intentionnel sont des fautes possibles, pas des stratégies légales.
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

### RM4-G32 — Demande de poussée en mêlée, stabilité, rotation, effondrement et arbitre

- **Dépendances :** G02–G11, G19, G22/G23.
- **Fichiers :** `engine/ai/roles/halfback.js`, `engine/ai/plans/scrum.js`, `engine/rugby-engine.js`, `server/test-v4-scrum-dialogue.js`.
- **Réalisation :** le 9 consulte le 8/première ligne par `SCRUM_ASK`, reçoit `SCRUM_STEADY/PRESSURE/UNSTABLE`, choisit éventuellement `SCRUM_DRIVE` ou `SCRUM_STEADY`. **Chaque avant** choisit son propre niveau d'effort et ses appuis, soumis au contact et à l'arbitrage ; pas de « +10 force pour tout le pack » déclenché magiquement par l'appel. Faire tourner la mêlée est une **résultante physique** ; si elle tourne de >90° sans infraction, remise en place ; poussée volontaire de travers sanctionnable. Effondrement provoque sifflet immédiat ; volontaire = faute dangereuse avec pénalité, jamais un moyen légal de gagner.
- **Critères :** demande forte après introduction peut produire un recul adverse sans le garantir ; des piliers fatigués peuvent perdre la stabilité ; durée/efforts/déplacements physiques et liaisons observables ; aucun effet avant introduction.
- **Tests :** STR-DIA-S01–S07, SCR-01..05, loi 19.17/19/25/34/37, `server/test-melee.js` et invariants.
- **Rejet si :** la demande du 9 déclenche directement un recul/rotation/effondrement sans simulation physique ou si l'écroulement volontaire est valorisé comme règle du rugby.

### RM4-G33 — Chandelle (*up-and-under*) annoncée à l'avance aux trois-quarts

- **Dépendances :** G02–G11, G12, G16, G18.
- **Fichiers :** `engine/ai/roles/halfback.js`, `engine/ai/roles/kick.js`, `engine/ai/local-communication.js`, `engine/rugby-engine.js`, `server/test-v4-up-and-under.js`.
- **Réalisation :** détecter **plusieurs phases sans progression mesurable**, comparer `CONTEST_AERIAL_BALL` aux alternatives porte/passe/pied d'occupation. Si le 9 choisit le coup de pied et **possède** le ballon, il annonce `KICK_HIGH` (« Chandelle ! ») **avant** de botter. Les trois-quarts qui entendent peuvent choisir individuellement `CHASE_KICK_ONSIDE`, `HOLD_WIDTH` ou `COVER_BACKFIELD` ; les joueurs hors-jeu ne chassent pas. Le ballon doit être botté par le moteur, et le 9 peut annuler après l'annonce.
- **Critères :** 9 peut annoncer sans ensuite botter si pression nouvelle ; un arrière lointain n'a pas de réception magique de l'appel ; chasseurs pas toujours les mêmes ; pas de ballon en vol avant la frappe ; statistiques coups de pied et turnovers réévaluées sur 30/100 graines.
- **Tests :** STR-DIA-K01–K08, COM-I01..I10, `test-v4-tactical-dialogue.js` (transport), `test-invariants.js`, `test-calibration-moteur.js`.
- **Rejet si :** chaque troisième phase déclenche obligatoirement un pied, si l'annonce devient un ordre individuel forcé, ou si le 9 botte alors que le ballon est encore au ruck.

**Statut :** les tests `server/test-v4-local-communication.js` (24 cas) et `server/test-v4-tactical-dialogue.js` (10 cas) valident uniquement le transport symbolique. Les scénarios STR-DIA exigent encore des tests de **moteur** réalisés par G31–G33.

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
