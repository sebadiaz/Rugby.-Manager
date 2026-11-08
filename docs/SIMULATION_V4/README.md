# Rugby Manager — simulation V4 : dossier exécutable pour Claude Code

**Date de référence :** 8 novembre 2026 · **État :** spécification cible, non entièrement implémentée · **Responsable :** Claude Code, avec validation humaine.

## Comment utiliser ce dossier

1. Lire `CLAUDE.md`, `AGENTS.md`, `docs/REGLES_RUGBY.md` et `docs/SPEC_PLACEMENT_TACTIQUE.md`.
2. Commencer par **`07_AGENT_INDIVIDUEL_PLACEMENT.md`**, **`08_COMMUNICATION_LOCALE.md`**, **`09_CHOIX_STRATEGIQUES_INDIVIDUELS.md`**, **`10_DIALOGUES_TACTIQUES_DU_9.md`**, **`11_MATCHS_REELS_ET_PRISES_DE_DECISION.md`**, **`12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md`**, **`13_MATCHS_TOP14_DECISIONS.md`** et **`14_ANALYSE_MICRO_ACTIONS_TOP14.md`**, puis **`04_IA_AGENTS_BUTS.md`** (architecture Russell–Norvig/GOAP), **`05_CATALOGUE_GOALS_ACTIONS.md`** (51 buts et 66 actions candidates, non toutes implémentées) puis **`06_TESTS_AGENTS.md`** (tests falsifiables). Les `01_...`–`03_...` complètent ensuite les contrats, lois et le rendu.
3. Exécuter `node server/test-v4-top14-data.js` et `node server/test-v4-top14-micro-actions.js` (corpus Top 14 uniquement), `node server/test-v4-styles-match-data.js` (corpus internationaux uniquement) et `node server/test-v4-observations-matchs.js` (**seulement la validité du corpus documentaire**) et `node server/test-v4-goals-actions-doc.js` (**51 buts et 66 actions spécifiés, non intégrés**), puis `node server/test-v4-local-communication.js` et `node server/test-v4-tactical-dialogue.js` (transport de messages symboliques, **pas encore utilisés dans un vrai match**), puis `node server/test-v4-goap-planner.js` (preuve d'une **recherche de plan symbolique seulement**) et `node server/test-spec-simulation-v4.js` (cohérence des fixtures). **Ces tests documentaires et symboliques ne démontrent pas que les 30 joueurs exécutent déjà leurs plans en match.**
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

## Dialogues tactiques à l'initiative du 9

Le n°9 **initie les demandes**, sans IA collective :
- **Touche** : demande l'avis du 10, qui répond selon sa perception ; le 9 demande ensuite une option (devant/milieu/fond/maul/large) et le lanceur/les sauteurs décident comment la réaliser.
- **Mêlée** : le 9 consulte **le 10** sur le jeu au près, au large ou l'avancée ; il discute **avec le 8** du départ depuis l'arrière de mêlée, puis **décide lui-même** de l'option et la demande. Il peut aussi consulter les avants pour connaître la stabilité et demander une poussée forte. La rotation résulte des forces ; pousser délibérément de travers et écrouler volontairement sont des infractions, pas des stratégies légales.
- **Plein jeu** : si l'attaque stagne, le 9 peut envisager un **up-and-under / chandelle**, mais prévient les trois-quarts **avant** de botter. Chacun réévalue individuellement chasse, couverture, soutien ou maintien de la ligne.

Dossier détaillé : `10_DIALOGUES_TACTIQUES_DU_9.md`. Transport de **35 messages** `engine/ai/local-communication.js`, **39 tests unitaires et 18 scénarios** de dialogue symbolique ; la véritable intégration au match est à coder dans G31–G33, en s'appuyant sur G04–G20.

## Références à des matchs réellement joués

La spécification est désormais confrontée à **16 actions documentées** dans quatre matchs : Angleterre–Galles (10 février 2024, départ du 8 Ben Earl), Angleterre–France (8 février 2025, pied haut/pénaltouche/petit côté), Irlande–France (8 mars 2025, touche→maul→9→aile, turnover, interception), France–Fidji (7 novembre 2026, maul→sortie du 9, contres et soutien). Chaque action possède un lien source dans `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md`.

**Ne pas confondre** : les comptes rendus donnent des événements et issues observables, **pas les dialogues 9/10/8 ni les coordonnées des 30 joueurs**. Les fixtures reconstruites et appels vocaux sont des **hypothèses de jeu** à tester. Le corpus JSON + `node server/test-v4-observations-matchs.js` vérifient cette séparation ; la reproduction physique par GOAP reste le chantier `G35`.

World Rugby a mesuré dans le Six Nations **2023** environ 314 passes, 185 rucks, 55 coups de pied, 26 touches et 11 mêlées **par match**. Ce sont des repères historiques explicitement datés, **pas des seuils obligatoires pour une rencontre en 2026**. La tâche `G36` imposera une baseline récente du jeu et les écarts de distribution, pas seulement le score final.

## Sortie de mêlée : le 8 annonce sa prise au 9

**Nouvelle règle prioritaire** : le 9 peut choisir tactiquement le départ du 8 après consultation du 10 et du 8, mais **le 8 doit prévenir personnellement le 9 juste AVANT de prendre le ballon**, par `SCRUM_8_GOING` (« Neuf, j'y vais ! »). L'information `SCRUM_8_READY` (« Je peux partir ») ne suffit pas. Le 9 qui entend ce signal abandonne son intention de ramasser le même ballon s'il peut encore le faire, puis choisit seul soutien, réception ou couverture ; aucune prise de balle créée par un message. En cas d'appel perdu, le moteur conserve un **porteur unique**.

Les différences de style anglais, sud-africain et néo-zélandais sont étudiées sur **cinq matchs supplémentaires** (2023–2026), dont le duel RSA–NZ du 29/08/2026 et les deux rencontres de septembre 2026. Les préférences appartiennent à un `playbook` interchangeable, **pas à une IA par nationalité**. Sources, chiffres datés et cas testables dans `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md` ; tâches G37/G38 (non intégrées au moteur).

## Benchmark prioritaire : matchs de Top 14

**Neuf rencontres supplémentaires** et **19 observations sourcées** sont désormais étudiées : Racing–Bayonne (départ de mêlée du 8 Nathan Hughes), Toulouse–Bayonne (touche→Brennan→Ntamack), finales Toulouse–UBB 2025 et Toulouse–Montpellier 2026 (Dupont–Mauvaka), Toulon–Bordeaux, Toulon–Toulouse, Racing–La Rochelle (Jegou→Le Garrec et drop manqué), Toulon–La Rochelle et Pau–Toulouse 2026. Corpus, descriptions, URLs, chiffres LNR et cas conditionnels dans `13_MATCHS_TOP14_DECISIONS.md`.

La LNR montre, par exemple, dans **un match spécifique** Toulon–UBB du 31 mai 2026 **212 passes contre 112 et 18 coups de pied contre 37**. Cela ne signifie pas que l'UBB doit toujours botter : les agents réagissent aux défenses, au terrain, au score et aux partenaires réellement disponibles.

**Attention** : la page statistique de la **finale 2026** Toulouse–Montpellier affiche des **zéros manifestement manquants** pour passes, touches et mêlées. Le benchmark les rejette explicitement ; le compte rendu officiel du match reste fiable pour les événements. Les tâches **G39–G41** prescrivent validation, 19 tests moteur et calibration Top 14 (non exécutés à ce stade).

## Analyse fine : les décisions au cours d'une seule action

L'analyse des matchs précédents était **trop agrégée** pour prouver l'intelligence individuelle. Le document `14_ANALYSE_MICRO_ACTIONS_TOP14.md` détaille maintenant **47 décisions** (7 études) et **22 variantes contrefactuelles**. Par exemple, l'essai de Jelonch en finale Toulouse–UBB 2025 est découpé entre **Graou (9)**, **Flament (passeur)**, **Willis et Cros (options/leurres)**, **Jelonch (course rentrante)**, **Moefana, Samu et Gazzotti (choix défensifs distincts)**. Une défense qui marque correctement le soutien doit pouvoir **faire échouer** cette combinaison ; aucun joueur ne reçoit une cible de placement d'une IA centrale.

Les données distinguent **faits rapportés** et **hypothèses** de perception, but et déplacement. Les divergences de sources sur la remise en jeu (pénalité ou coup franc sur l'action de Jelonch) sont signalées au lieu d'être résolues par supposition. La seule validation déjà livrée vérifie l'intégrité des données : **les 22 branches ne sont pas encore exécutées dans le moteur**. Tâches de mise en œuvre **G42–G44**.

## Exigence centrale : agents à base de buts

**Chaque joueur doit avoir une vraie IA délibérative** : observer l'état local du match, sélectionner un but, construire un plan composé d'actions légales avec préconditions/effets/coûts, exécuter ces actions avec le moteur physique, en constater les résultats et **replanifier** si le monde change.

**Ne pas confondre** : les rôles 1-3-3-1 / 2-4-2 déjà livrés sont des objectifs de placement **partiels**, pas un système GOAP. `engine/ai/goal-planner.js` est un **prototype de planificateur symbolique testable**, sans AgentController relié au match.

**Premier jalon de preuve** : A9, avec but `DISTRIBUTE_BALL`, planifie `MOVE_TO_RUCK → SECURE_BALL → PASS_TO_10`, puis change légalement vers `PASS_TO_POD` si le couloir du 10 se ferme. Aucun effet ne peut être simulé « par magie » dans le moteur.

Lire `PLAN_CLAUDE_CODE.md` : 45 tâches **G00–G44**, et `PROMPT_CLAUDE_CODE.md` pour le démarrage de Claude Code.

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
- `08_COMMUNICATION_LOCALE.md` : communication simple et locale, portée, délais, questions adressées et réponses.
- `09_CHOIX_STRATEGIQUES_INDIVIDUELS.md` : choix en mêlée, touche et plein jeu par les joueurs.
- `10_DIALOGUES_TACTIQUES_DU_9.md` : le 9 demande l'avis du 10 en touche et mêlée, discute **du départ du 8 avec le 8** puis choisit, et annonce sa chandelle.
- `11_MATCHS_REELS_ET_PRISES_DE_DECISION.md` : analyse de **quatre matchs réels**, 16 actions sourcées, lois, adaptations et 16 scénarios moteurs à créer.
- `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md` : 5 autres matchs détaillés ENG/RSA/NZ, signal du 8 au 9, 3 presets interchangeables et 16 tests à intégrer.
- `13_MATCHS_TOP14_DECISIONS.md` : **9 matchs de Top 14**, 19 situations avec variantes et statistiques LNR vérifiées, gestion de données manquantes.
- `14_ANALYSE_MICRO_ACTIONS_TOP14.md` : **7 décompositions tactiques action par action**, **47 micro-décisions**, 22 variations défensives ; analyse poussée de Graou–Flament–Jelonch avec Willis, Cros, Moefana, Samu et Gazzotti.
- `04_IA_AGENTS_BUTS.md` : boucle perception → objectifs → planification → exécution → replanification, entièrement individuelle.
- `05_CATALOGUE_GOALS_ACTIONS.md` : buts, actions, préconditions, coûts, effets et gardes réglementaires.
- `06_TESTS_AGENTS.md` : preuve d'une IA réelle et tests différentiels, pas uniquement des snapshots.
- `01_CONTRATS_ET_SCENARIOS.md` : coordonnées, état, événements, 30 postes, scénarios et assertions à implémenter.
- `02_ARBITRAGE_ET_TEMPOS.md` : machines à états, règles applicables, chronologies et erreurs à sanctionner.
- `03_RENDU_RETRO.md` : pipeline Canvas, animations et tests visuels.
- `fixtures/scenarios.json` : jeux de données déterministes et attentes déclaratives (le futur injecteur doit les exploiter).
- `PROMPT_CLAUDE_CODE.md` : consigne à copier à Claude Code.
- `engine/ai/local-communication.js` : transport de 35 codes vocaux (prototype non connecté au match).
- `server/test-v4-local-communication.js` et `server/test-v4-tactical-dialogue.js` : 39 tests + 18 scènes de dialogue symbolique.
- `fixtures/observations_matchs_reels.json` : corpus de 16 actions documentées (2024, 2025, 2026) ; **aucun tracking ni paroles réelles inventés**.
- `server/test-v4-observations-matchs.js` : validation de 16 événements et de leur provenance (pas preuve que le moteur reproduit les actions).
- `server/test-v4-goals-actions-doc.js` : validation des 51 buts et 66 actions GOAP candidats sans doublon.
- `fixtures/observations_styles_2023_2026.json` et `server/test-v4-styles-match-data.js` : **12 observations sourcées de cinq autres matchs** et comparaison d'équipes datée du 04/09/2026.
- `fixtures/observations_top14_2025_2026.json` et `server/test-v4-top14-data.js` : **19 événements documentés dans neuf rencontres de Top 14**, six profils chiffrés de la LNR ; faux zéros de la finale 2026 exclus.
- `fixtures/micro_actions_top14.json` et `server/test-v4-top14-micro-actions.js` : **47 micro-étapes individuelles et 22 contre-factuels** avec sources explicites, perceptions hypothétiques, buts, 2+ options et gardes ; validation documentaire, pas moteur.
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
