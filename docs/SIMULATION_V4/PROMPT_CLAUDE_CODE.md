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
9. Les 30 agents doivent avoir des CONTEXTES distincts. Chacun connaît
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

**D'abord G02 → G03 → G04 → G05 → G06 → G07 → G08**, puis G09, G10 (**buts et positions individuels, pas coordinateur**) et G11. Sans un cycle complet et testé sur un n°9, ne pas coder les sprites, le TMO ni l'ensemble des autres rôles.
