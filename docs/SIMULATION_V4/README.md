# Rugby Manager — simulation V4 : dossier exécutable pour Claude Code

**Date de référence :** 8 novembre 2026 · **État :** spécification cible, non entièrement implémentée · **Responsable :** Claude Code, avec validation humaine.

## Comment utiliser ce dossier

1. Lire `CLAUDE.md`, `AGENTS.md`, `docs/REGLES_RUGBY.md` et `docs/SPEC_PLACEMENT_TACTIQUE.md`.
2. Commencer par **`07_AGENT_INDIVIDUEL_PLACEMENT.md`** puis **`04_IA_AGENTS_BUTS.md`** (architecture Russell–Norvig/GOAP), **`05_CATALOGUE_GOALS_ACTIONS.md`** (35 buts et 36 actions) puis **`06_TESTS_AGENTS.md`** (tests falsifiables). Les `01_...`–`03_...` complètent ensuite les contrats, lois et le rendu.
3. Exécuter `node server/test-v4-goap-planner.js` (preuve d'une **recherche de plan symbolique seulement**) et `node server/test-spec-simulation-v4.js` (cohérence des fixtures). **Aucun de ces deux tests n'implique que les 30 joueurs du match exécutent déjà des plans.**
4. Choisir **une seule** tâche `RM4-Gxx` de `PLAN_CLAUDE_CODE.md`, vérifier ses prérequis, ouvrir une branche dédiée.
5. Appliquer le prompt de `PROMPT_CLAUDE_CODE.md`. Ne pas déclarer une tâche terminée sans un scénario injecté et ses assertions automatiques.
6. Joindre à chaque PR le résultat des tests, un comparatif des matchs par graines identiques, et une capture/vidéo quand le visuel change.

## Périmètre réel du dépôt

- Moteur de simulation **JavaScript**, source de vérité : `engine/rugby-engine.js`; copie de livraison `docs/rugby-engine.js` (la CI les synchronise).
- `MatchEngine.tick(dt)` puis `getState()`. Rendu `docs/js/renderer.js` (Canvas), état normalisé `docs/js/matchState.js`, interpolation `docs/js/main.js`.
- Mode Club : `docs/js/club.js`, `docs/js/club-composition.js`, `docs/js/clubUI.js`.
- Acquis : mêlée à états, touche, maul, ruck, avantage, inertie de déplacement, interceptions, pénalités, statistiques, joueurs exclus, composition de match, 1-3-3-1 et 2-4-2 **partiels**, arbitre central et deux assistants visuels.
- **À ne pas réécrire en C++** pour ce chantier. Les documents `docs/SPEC_MOTEUR_MATCH.md` / `docs/SPEC_JOUEUR.md` contiennent des références C++ historiques.

## Décision d'architecture : **30 agents individuels, pas d'IA collective**

**Fait autorité :** [`07_AGENT_INDIVIDUEL_PLACEMENT.md`](07_AGENT_INDIVIDUEL_PLACEMENT.md).
Chaque joueur connaît le plan de jeu et ses positions de référence mais, en fonction des circonstances, choisit **ses propres buts** (défendre, tenir ligne, fermer intervalle, marquer, plaquer, couvrir, soutenir, être disponible, etc.) et calcule **individuellement** chaque déplacement. La priorité de défendre ne signifie pas que tous vont vers le porteur. Aucune affectation centrale, aucun TeamCoordinator, TeamBlackboard ou enchère de rôles. Le moteur reste autorité des règles et de la physique, pas des buts ou trajectoires.

## Exigence centrale : agents à base de buts

**Chaque joueur doit avoir une vraie IA délibérative** : observer l'état local du match, sélectionner un but, construire un plan composé d'actions légales avec préconditions/effets/coûts, exécuter ces actions avec le moteur physique, en constater les résultats et **replanifier** si le monde change.

**Ne pas confondre** : les rôles 1-3-3-1 / 2-4-2 déjà livrés sont des objectifs de placement **partiels**, pas un système GOAP. `engine/ai/goal-planner.js` est un **prototype de planificateur symbolique testable**, sans AgentController relié au match.

**Premier jalon de preuve** : A9, avec but `DISTRIBUTE_BALL`, planifie `MOVE_TO_RUCK → SECURE_BALL → PASS_TO_10`, puis change légalement vers `PASS_TO_POD` si le couloir du 10 se ferme. Aucun effet ne peut être simulé « par magie » dans le moteur.

Lire `PLAN_CLAUDE_CODE.md` : 31 tâches **G00–G30**, et `PROMPT_CLAUDE_CODE.md` pour le démarrage de Claude Code.

## Objectif produit

Match de rugby à XV à 30 joueurs où, pour chaque décision, le joueur comprend à l'écran :
- où se trouvent les 30 joueurs, leurs rôles et leurs cibles, sans déplacements impossibles ;
- pourquoi le 9 choisit le petit/grand côté, le 10 fixe et le 12/13 déclenchent des courses ;
- pourquoi un défenseur tient la ligne, replie ou monte, et pourquoi le 15 couvre le fond ;
- quand un regroupement devient jouable, quand l'arbitre parle, siffle ou laisse un avantage ;
- ce qui se passe entre la formation et la libération d'une mêlée/touche/maul ;
- une présentation **inspirée des conventions visuelles** de Retro Rugby, sans reproduire ses sprites ni ses assets.

## Feu vert / feu rouge

| Validation | Vert | Rouge |
| --- | --- | --- |
| API | `getState()` historique toujours valide | consommation UI cassée |
| Déterminisme | même graine + mêmes entrées => mêmes événements/positions | `Math.random` caché, temps réel dans le moteur |
| Mouvement | positions continues, pas de téléportation | joueur projeté à sa cible |
| Règles | décision avec loi, version, bénéficiaire, sanction | événement arbitral ad hoc |
| Régression | tests existants verts + tests ciblés V4 verts | test abaissé pour masquer l'écart |
| Calibration | 30 graines en développement, 100 avant fusion risquée, 500 en validation longue | modification de cadence sans comparaison |
| UX | lisible à vitesse réelle ET accélérée, mobile vérifié | sprite spectaculaire mais action incompréhensible |

Un **test de fixture** valide uniquement la forme des données. Un **test moteur** valide une action. Un **test navigateur** valide ce qui est rendu. Un **test statistique** contrôle les effets sur une population de matchs. Les quatre sont complémentaires.

## Structure des livrables

- `PLAN_CLAUDE_CODE.md` : liste ordonnée, dépendances et DoD tâche par tâche.
- `07_AGENT_INDIVIDUEL_PLACEMENT.md` : architecture prioritaire sans IA collective, buts de placement et mouvement individuel.
- `04_IA_AGENTS_BUTS.md` : boucle perception → objectifs → planification → exécution → replanification, entièrement individuelle.
- `05_CATALOGUE_GOALS_ACTIONS.md` : buts, actions, préconditions, coûts, effets et gardes réglementaires.
- `06_TESTS_AGENTS.md` : preuve d'une IA réelle et tests différentiels, pas uniquement des snapshots.
- `01_CONTRATS_ET_SCENARIOS.md` : coordonnées, état, événements, 30 postes, scénarios et assertions à implémenter.
- `02_ARBITRAGE_ET_TEMPOS.md` : machines à états, règles applicables, chronologies et erreurs à sanctionner.
- `03_RENDU_RETRO.md` : pipeline Canvas, animations et tests visuels.
- `fixtures/scenarios.json` : jeux de données déterministes et attentes déclaratives (le futur injecteur doit les exploiter).
- `PROMPT_CLAUDE_CODE.md` : consigne à copier à Claude Code.
- `server/test-spec-simulation-v4.js` : validations structurelles déjà exécutables sur le dépôt.

## Références officielles, versionnées

- Règles World Rugby par numéro : https://passport.world.rugby/laws-of-the-game/laws-by-number/
- Évolutions entrées en vigueur sur les compétitions nouvelles à partir du 1er juillet 2026 : https://passport.world.rugby/laws-of-the-game/whats-new/2026-07-law-updates
- Clarification n° 2-2026 sur le 9 au ruck : https://passport.world.rugby/laws-of-the-game/law-clarifications/2026/clarification-2-2026/
- Directive maul de juin 2026 : https://passport.world.rugby/laws-of-the-game/law-application-guidelines/maul-june-2026/
- Processus de contact à la tête du 1er novembre 2026 : https://passport.world.rugby/laws-of-the-game/law-application-guidelines/head-contact-process-1-november-2026/
- Arbitres assistants : https://passport.world.rugby/officiating/introduction-to-assistant-refereeing/in-touch/
- Référence visuelle : https://store.steampowered.com/app/3600800/Retro_Rugby/

**Vérifier la date de début de compétition avant d'activer une règle nouvelle**. Le contenu du dépôt `rules/world-rugby-laws-2025.pdf` ne suffit pas comme source normative 2026.
