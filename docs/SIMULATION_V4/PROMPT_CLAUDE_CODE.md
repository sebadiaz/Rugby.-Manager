# Prompt pour Claude Code — Rugby Manager : IA à buts GOAP de 30 joueurs

> **À copier tel quel dans Claude Code dans le dépôt Rugby.-Manager.** Modifier uniquement `TASK_ID` si Claude doit traiter une tâche différente.

## Prompt de démarrage

```text
Tu es Claude Code, ingénieur IA de simulation rugby à XV. IMPORTANT : le propriétaire interdit toute IA collective décisionnelle.

L'objectif produit est explicite : 30 vrais agents à base de buts au sens de
Stuart Russell et Peter Norvig, avec représentation d'état du monde,
objectifs à atteindre, planification de séquences d'actions (GOAP), exécution
physique, observation des conséquences et replanification **par chaque joueur**. Tous connaissent le plan de jeu ; aucun cerveau collectif n'attribue les rôles ou les déplacements.

Ce n'est PAS un travail consistant seulement à placer 30 joueurs à des cibles.
Ce n'est PAS non plus la création de 30 scripts distincts par numéro, ni
l'ajout d'un LLM à chaque joueur.

TASK_ID = RM4-G02  (commencer par l'injecteur de scénarios)

PROCÉDURE OBLIGATOIRE
1. Lire CLAUDE.md, AGENTS.md, docs/REGLES_RUGBY.md,
   docs/SPEC_PLACEMENT_TACTIQUE.md et tout le dossier docs/SIMULATION_V4 :
   README.md
   07_AGENT_INDIVIDUEL_PLACEMENT.md (AUTORITÉ ARCHITECTURALE)
   08_COMMUNICATION_LOCALE.md (messages locaux, pas de chef collectif)
   09_CHOIX_STRATEGIQUES_INDIVIDUELS.md (mêlée, touche, jeu)
   10_DIALOGUES_TACTIQUES_DU_9.md (9 initie la demande, 10 conseille)
   12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md (le 8 prévient le 9, 5 matchs ENG/RSA/NZ)
   13_MATCHS_TOP14_DECISIONS.md (NEUF matchs de clubs, 19 cas, LNR)
   11_MATCHS_REELS_ET_PRISES_DE_DECISION.md (16 actions, 4 matchs, sources vérifiables)
   04_IA_AGENTS_BUTS.md (PRIORITAIRE)
   05_CATALOGUE_GOALS_ACTIONS.md (PRIORITAIRE)
   06_TESTS_AGENTS.md (PRIORITAIRE)
   PLAN_CLAUDE_CODE.md
   01_CONTRATS_ET_SCENARIOS.md
   02_ARBITRAGE_ET_TEMPOS.md
   03_RENDU_RETRO.md
   fixtures/scenarios.json
2. Localiser TASK_ID dans PLAN_CLAUDE_CODE.md et vérifier les dépendances.
   Ne travailler que cette tâche et les adaptations strictement nécessaires.
3. Inspecter le code existant : engine/rugby-engine.js, docs/js/matchState.js,
   docs/js/main.js, docs/js/renderer.js, server/test-*.js.
4. Créer une branche dédiée. Conserver la simulation JS actuelle ;
   engine/rugby-engine.js est la source de vérité, pas la copie docs/.
5. Écrire d'abord un test en échec avec graine, scénario, monde initial,
   but désiré et assertions précises. Ne pas tricher avec des fixtures
   inventant le succès à la place du moteur.
6. Implémenter l'architecture à base de buts :
   perception -> croyances locales -> sélection de but ->
   planification d'actions avec préconditions/effets/coûts ->
   exécution via moteur physique -> vérification du résultat ->
   replanification si le monde change.
7. En cas de travail sur IA : démontrer au minimum une suite d'au moins
   trois actions dont la seconde ou troisième dépend du résultat de la
   précédente, puis une alternative lorsqu'un prérequis change.
8. Le planner ne doit JAMAIS écrire directement une possession, une passe
   réussie, un plaquage, un score, un essai ou une pénalité dans le moteur :
   ce sont des événements autoritatifs, vérifiés par le moteur de rugby.
9. NOUVELLE EXIGENCE DU PRODUCT OWNER : le n°9 initie les demandes
   tactiques, sans avoir le pouvoir de commander les autres cerveaux.
   - TOUCHE : le 9 interroge le 10, reçoit son avis, puis demande
     au lanceur et aux joueurs proches une option de lancement.
   - MÊLÉE : le 9 **interroge le 10** pour connaître ses options
     au près, au large ou en avançant ; il **discute avec le 8**
     d'un départ par le 8. Le 9 prend **lui-même** la décision
     tactique et la demande. Il peut aussi consulter les avants sur
     stabilité et poussée, puis demander une poussée normale ou forte. Les avants choisissent individuellement
     effort et appuis. Rotation = conséquence physique. Une poussée de
     travers/effondrement volontaire = faute, jamais une stratégie légale.
   - JEU COURANT : si l'attaque ne progresse pas, le 9 peut choisir une
     chandelle (up-and-under) et PRÉVENIR les trois-quarts avant de botter.
     Il n'y a ni kick automatique ni chasse hors-jeu.
   Utiliser LocalCommunication (35 codes, toId, replyTo, phaseId) : appel reçu
   dans les croyances seulement, aucune mutation directe d'un partenaire.
   Tester : node server/test-v4-local-communication.js
            node server/test-v4-tactical-dialogue.js
   ATTENTION SORTIE MÊLÉE : `SCRUM_8_READY` ne signifie pas que le 8
   prend la balle. Lorsqu'il choisit réellement de partir, le 8 doit
   prévenir le 9 via `SCRUM_8_GOING` AVANT sa prise. Le 9 qui entend
   doit replanifier seul et cesser de courir vers le même ballon.
   `SCRUM_8_ABORT` peut annuler et `phaseId` empêche une fausse alerte
   provenant de la mêlée précédente. Le moteur garantit un seul porteur.
   Ne jamais brancher ce message directement sur `carrierId` ou `target`.
   Styles : ENG_TERRITORY_AND_AERIAL, RSA_SET_PIECE_AND_PRESSURE,
   NZ_MULTIPHASE_AND_COUNTER sont des presets échangeables entre clubs,
   pas trois IA nationales. Lire le document 12 et réaliser G37/G38.
   Se référer aux tâches RM4-G31, G32 et G33 du plan.
   DONNÉES DE MATCHS : valider le corpus via
   node server/test-v4-observations-matchs.js
   TOP 14 OBLIGATOIRE : étudier l'existant 13_MATCHS_TOP14_DECISIONS.md
   et fixtures/observations_top14_2025_2026.json, 9 rencontres / 19
   observations / 6 relevés statistiques LNR. Répliquer un même scénario
   avec deux contextes : départ du 8 annoncé/non entendu au 9, touche
   vers un avant/maul, passes/pieds variables, 9 receveur d'un avant,
   coup franc rapide, drop tenté et manqué, décision en prolongation,
   arrêt et reprise météo. Le programme NE doit PAS reproduire un score
   historique par script ni créer un module d'IA collective.
   DATA QUALITY : la page statistiques de la finale Toulouse-Montpellier
   2026 contient de faux zéros pour mêlées, touches, passes, coups de pied ;
   exclure ces valeurs de la calibration en les marquant MISSING/null.
   Nouvelles tâches RM4-G39, G40, G41 du PLAN_CLAUDE_CODE.md.
   Tester : node server/test-v4-top14-data.js
   Ne jamais inventer de discussions réellement tenues par Dupont/son 10
   ou Ben Earl/son 9 ni de coordonnées officielles des 30 joueurs.
   Les 16 actions historiques sont des REFERENCES OBSERVÉES, les fixtures
   concrètes des HYPOTHÈSES. Pour reproduire les alternatives, utiliser
   RM4-G34 (sources/baseline), G35 (16 paires de scènes) et G36
   (calibration des choix avec 100/500 matchs). Le même joueur doit
   savoir abandonner une stratégie devenue impossible.
10. Les 30 agents doivent avoir des CONTEXTES distincts. Chacun connaît
   le PLAN DE JEU et sa zone nominale, mais choisit INDIVIDUELLEMENT
   ses buts, son plan, son angle et son déplacement selon les circonstances.
   Défendre et ses sous-buts sont prioritaires lorsque l'équipe perd la balle,
   sans provoquer de convergence de tous les joueurs sur le porteur.
   INTERDIT : IA collective, TeamBlackboard, TeamCoordinator, attribution
   centrale de rôles, réservations, enchères, assignation centrale des cibles.
   L'effet collectif doit émerger des décisions locales et du plan connu.
   Ne pas donner de connaissance instantanée des plans adverses.
10. Chaque déplacement utilise avancer()/physique existante et respecte
    vitesse, accélération, rétablissement, hors-jeu, obstacles et collisions.
11. Exécuter les tests ciblés, puis les non-régressions :
    node server/test-v4-observations-matchs.js
    node server/test-v4-styles-match-data.js
    node server/test-v4-top14-data.js
    node server/test-v4-local-communication.js
    node server/test-v4-tactical-dialogue.js
    node server/test-v4-goap-planner.js
    node server/test-spec-simulation-v4.js
    node server/test-placement-arbitrage.js
    node server/test-invariants.js
    node server/test-ruck.js
    node server/test-melee.js
    RM_TOUCHE_RAPIDE=1 node server/test-touche.js
    node server/test-scores-abstraits.js
    node server/test-parcours-club.js
    node server/test-calibration-moteur.js
12. Si la tâche modifie le comportement de jeu, mesurer au moins 30 matchs
    à graines identiques AVANT/APRÈS avec un rapport reproductible.
    Vérifier essais, points, rucks, passes, touches, mêlées, fautes et
    phases. Les stats historiques ne remplacent pas une mesure actuelle.
13. Si un test échoue : diagnostiquer, corriger et retester. Ne pas modifier
    les seuils pour rendre le test vert. Signaler les limitations.
14. Exécuter les tests IND-01..IND-12 décrits dans le document 07.
    Vérifier explicitement qu'aucun module n'impose une destination, un
    but ou une action à l'ensemble des 30 joueurs. Pour les phases fixes,
    seules les consignes du plan de jeu et les contraintes réglementaires
    sont partagées.
15. Faire une PR limitée à cette tâche, sans merge automatique.
16. En sortie, remplir le template de rapport de
    docs/SIMULATION_V4/PLAN_CLAUDE_CODE.md :
    SHA, fichiers, scénarios, but, plan, préconditions, effets,
    alternative, tests, statistiques avant/après, limitations, PR.

DÉFINITION DE RÉUSSITE
La fonctionnalité modifie réellement le comportement d'un AgentController (qui choisit lui-même ses buts et sa trajectoire)
au cours d'un match (lorsque TASK_ID concerne son intégration), reste
compatible avec les sauvegardes, passe les tests et est démontrable sur un
scénario. Ne jamais présenter l'existence du planificateur symbolique
engine/ai/goal-planner.js comme une simulation complète de 30 agents.

Commence par un état des lieux strict des dépendances, puis réalise TASK_ID.
```

## Prompt de vérification pour un autre agent Claude Code

```text
Agis comme relecteur indépendant d'une PR Rugby Manager V4 GOAP.
Vérifie, à partir du diff et des tests, que le code contient bien une
planification d'actions à base de buts et non une suite de scripts.
Inspecte les préconditions et effets de chaque action, leur exécution
réelle, la source des décisions d'arbitrage, la replanification,
la séparation entre croyances et état autoritatif, le déterminisme et
l'autonomie des 30 agents SANS coordinateur central. Exécute des tests par mutation :
1) ferme un couloir de passe au milieu d'un plan ;
2) échoue volontairement un plaquage ;
3) rend le 9 hors-jeu ;
4) supprime une action du catalogue ;
5) change la tactique 1-3-3-1 en 2-4-2 ;
6) limite le planner à 1 nœud ;
7) rend un agent au sol au milieu d'un plan.
La PR doit échouer sur au moins un test pertinent pour chaque mutation
qui invalide une garantie. Produis un tableau preuves/manques/blocages.
Ne fusionne pas si la physique, les lois ou les tests de stats régressent.
```

## Prompt de génération d'une nouvelle tâche d'agent

```text
Implémente TASK_ID = RM4-G12 (agent demi de mêlée).
Tu dois d'abord créer un scénario S01 injecté dans MatchEngine :
A9 à 6 mètres d'un ruck gagné, A10 libre, pod disponible.
But = DISTRIBUTE_BALL ; plan initial trouvé par GOAP
MOVE_TO_RUCK -> SECURE_BALL -> PASS_TO_10.
Pendant MOVE_TO_RUCK, ferme le couloir du 10 sans modifier le reste du monde.
L'agent doit replanifier vers PASS_TO_POD et le moteur doit réellement
déplacer A9, lui faire récupérer le ballon puis effectuer une passe légale.
Un simple changement de tableau "plan" sans action physique est un échec.
Tests red/green, puis métriques appariées sur 30 matchs. Exécute les
gardes du plan général, crée une PR, ne merge pas directement.
```

## Priorité

**D'abord G02 → G03 → G04 → G05 → G06 → G07 → G08**, puis G09–G11. La recherche de matchs et Top 14 est conservée dans G34–G41 : elle oriente les capacités et les tests, mais **ne justifie pas** de sauter les dépendances GOAP/physique. Intégrer ensuite les dialogues du 9 (G31), les options de mêlée et leur arbitrage (G32) et la chandelle annoncée (G33), en lien avec G18–G20. **Le 9 demande ; chacun décide de ses actions.** Sans un cycle complet et testé sur un n°9, ne pas coder les sprites, le TMO ni l'ensemble des autres rôles.
