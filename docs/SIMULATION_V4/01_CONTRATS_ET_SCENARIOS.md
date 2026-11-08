# V4 — Contrats de simulation, placement des 30 joueurs et scénarios mesurables

## 1. Statut, vocabulaire et géométrie

- **Existant** : `MatchEngine.tick(dt)`, `getState()`, `avancer()` avec accélération, `Referee`, `organiserAvantsRuck()`, animations Canvas, statistiques par équipe.
- **Cible V4** : un plan tactique explicable par joueur, une machine de décision collective et une API d'injection de scénarios pour tester les mêmes situations.
- **Référence spatiale** : `x = 0..100` m, `y = 0..70` m, A attaque vers x positif, B vers x négatif. Les profondeurs d'en-but sont gérées séparément par le rendu.
- **Temps** : les durées de parcours et d'animation ci-dessous sont des **hypothèses d'ingénierie**. Seules les limites explicites du document sur les lois sont réglementaires.
- **Fixtures** : `fixtures/scenarios.json`, dix cas S01 à S10, exactement 30 joueurs numérotés de A1 à A15 et B1 à B15.

Ne pas créer un second modèle de match divergent. Élargir le moteur avec un adaptateur `ScenarioHarness` de test ou une fonction pure et sans effet de bord.

## 2. Contrat de joueur — cible minimale

```ts
type AgentMatch = {
  team: 'A'|'B'; numero: number; x: number; y: number;
  orientation: number; // radians, axe x
  vitesseCourante: number; // m/s
  auSol: number; ruckRecovery: number; sinBin: number;
  etat: 'AVAILABLE'|'CARRIER'|'TACKLED'|'BOUND'|'RECOVERY'|'SIN_BIN';
  groupeTactique: 'POD_G'|'POD_C'|'POD_D'|'LARGE_G'|'LARGE_D'|'GUARD'|'PILLAR'|'LINE'|'SWEEPER'|null;
  roleInstantane: string;
  positionCible: {x:number;y:number}|null;
  raisonCible: 'COVER_GAP'|'SUPPORT'|'HOLD_WIDTH'|'POD'|'CHASE_KICK'|'FOLD'|'SET_PIECE'|null;
  decisionTactiqueAuTemps: number; // dernier changement
  contexteLegal: {onside:boolean;canCompete:boolean;canTackle:boolean};
}
```

**Compatibilité** : champs supplémentaires optionnels dans `getState()`. Ne pas modifier le format des statistiques ni casser `normalizeMatchState()`.

## 3. Contrat de décision

Une mise à jour tactique est recalculée lorsque **l'état du jeu change**, pas à chaque dessin du navigateur. Les déclencheurs sont `PHASE_CHANGE`, `BALL_RELEASE`, `POSSESSION_CHANGE`, `TACKLE`, `RUCK_WON`, `KICK`, `LINE_BREAK`, `SUBSTITUTION`.

Ordre de priorité, sans exception tacite :

1. Validité réglementaire (hors-jeu, au sol, carton, liaison), interdictions de mouvement.
2. Survie de l'action : protéger le ballon/plaquer un porteur légalement accessible.
3. Continuité de la ligne défensive la plus proche ; combler le plus grand trou menaçant.
4. Tâche tactique collective `1-3-3-1`, `2-4-2`, défense rush/drift.
5. Couloir nominal et identité du poste.
6. Préférence individuelle `tendance`, vitesse, endurance et décision.

Modèle d'API à tester (ne pas exposer par défaut à l'UI) :

```ts
computeTacticalPlan(snapshot, teamId, context, options): TacticalPlan
// fonction PURE, aucun RNG implicite, aucun déplacement
// plan = [{playerId, role, target:{x,y}, reason, priority, timestamp}]
applyTacticalPlan(engine, plan, dt): void
// utilise exclusivement avancer(), bornes légales et inertie
createScenarioEngine(fixture): MatchEngine
// injecteur réservé aux tests, sans téléportation en cours de match
```

Le plan est une *intention* et non une téléportation. Une cible de 30 m ne peut être atteinte en un tick de 0,05 s.

## 4. Responsabilités exactes des 15 postes

| N° | Attaque en jeu courant | Au ruck / mêlée / touche | Défense en jeu courant |
|---|---|---|---|
| 1 | percussion, soutien intérieur, libération de zone | protection proche, pilier gauche, soutien de saut si choisi | garde proche, premier plaquage légal |
| 2 | soutien et continuité, opportunité passe courte | talonneur en mêlée, lanceur de touche par défaut | garde proche, contre-ruck disponible |
| 3 | percussion et relais près du 9 | pilier droit, liaison, soutien si disponible | rideau axial, recharge |
| 4 | pod d'avants, course de fixation | deuxième ligne, sauteur possible | plaquage axial, couverture petit côté |
| 5 | pod et relais au contact | deuxième ligne, sauteur possible | plaquage axial, défense du maul |
| 6 | sortie forte petit côté, ruck suivant | troisième ligne, liaison, libération | protecteur de l'intérieur, montée |
| 7 | soutien porteur, course de continuité | contest **si légal**, récupération après engagement | grattage si onside/debout et ruck non constitué, repli sinon |
| 8 | relais au 9, pick-and-go, passe courte | contrôle ballon de mêlée et sortie | ligne proche, garde et couverture |
| 9 | suit le ballon, ramasse légalement, sert près ou large | attend la base et tient compte du statut du ruck | balayage près du ruck, défense autour de la mêlée selon loi |
| 10 | profondeur d'appel, fixe, passe, pied tactique | se prépare hors du ruck, prêt sur signal du 9 | dirige et ferme l'axe intérieur |
| 11 | tient largeur côté gauche, départ sur fixation | couverture sur jeu au pied et touche selon plan | premier/dernier rideau selon côté et zone |
| 12 | second distributeur, leurre, fixation | s'aligne en profondeur et offre second choix | contact intérieur et coulissement |
| 13 | course extérieure, intervalle, défense en lecture | prépare surnombre sans se coller au 12 | fermeture des intervalles extérieurs |
| 14 | tient largeur côté droit, appel cadencé | couverture opposée ou menace large | marqueur de l'aile, couverture si opposée |
| 15 | couverture et insertion offensive ciblée | profondeur et réception arrière | dernier rideau, choix de point d'interception |

**Règles négatives testables** : le n°7 ne conteste pas *systématiquement* ; le n°15 ne monte pas *systématiquement* ; le 9 ne se téléporte pas à la sortie ; deux ailiers ne convergent pas automatiquement vers la même aile ; un engagé au maul ne rejoint pas un pod tant qu'il y est lié.

## 5. Exemple intégral S01 — 30 coordonnées initiales

Ruck au `(52,25)`, ballon au sol, A en possession, attaque x+.
Les positions ci-dessous sont des **valeurs initiales synthétiques** exactes de la fixture, pas des coordonnées de joueurs réellement suivis. Le validateur garantit qu'elles restent dans le terrain.

| A (n°) | x | y | B (n°) | x | y |
|---|---:|---:|---|---:|---:|
| A1 | 48 | 23 | B1 | 55 | 20 |
| A2 | 47 | 28 | B2 | 55 | 25 |
| A3 | 47 | 32 | B3 | 56 | 30 |
| A4 | 44 | 21 | B4 | 58 | 19 |
| A5 | 44 | 39 | B5 | 58 | 36 |
| A6 | 42 | 15 | B6 | 60 | 15 |
| A7 | 42 | 49 | B7 | 60 | 48 |
| A8 | 44 | 35 | B8 | 58 | 32 |
| A9 | 51 | 29 | B9 | 60 | 29 |
| A10 | 44 | 38 | B10 | 61 | 38 |
| A11 | 36 | 5 | B11 | 62 | 5 |
| A12 | 40 | 45 | B12 | 63 | 45 |
| A13 | 38 | 54 | B13 | 64 | 54 |
| A14 | 36 | 65 | B14 | 65 | 65 |
| A15 | 30 | 35 | B15 | 74 | 35 |

L'état d'entrée **n'implique pas** que ces 30 joueurs soient déjà placés légalement pour chaque ruck. L'injecteur doit préciser les participants liés et les joueurs hors-jeu ; sinon ces données servent uniquement de scène de départ.

### Micro-séquence construite et mesurable

| Temps relatif | Événement attendu (hypothèse) | États / assertions |
|---|---|---|
| t=0,0 | plaquage consommé, ruck constitué | porteur A au sol, ballon au point de ruck, aucun autre porteur |
| t=0,0–1,5 | entrée légale des soutiens proches | vitesse bornée, trajets observables, participants réels |
| t=1,5–3,5 | ballon gagné, n°9 s'oriente | les joueurs au sol ne ramassent pas |
| t≈3,5 | sortie du 9 | si "use it" a été appelé, vérifier la borne légale de 5 s |
| t=3,5–4,7 | passe 9 → 10 | ballon possède une trajectoire et une durée, 10 non plaquable avant réception |
| t=4,7–6,5 | 10 fixe, 12/13 accélèrent | aucune passe en avant ; les défenseurs réagissent à la fixation |
| t=6,5–10,0 | contact ou passe large / nouveau ruck | événement enregistré, nouveau plan collectif, pas de saut de joueurs |

Ces durées **ne sont ni obligatoires ni réglementaires** ; le moteur doit choisir parmi des distributions contrôlées, pas rejouer une chorégraphie imposée.

## 6. Couverture collective

### Défense après rupture de structure

**Étape 1 (continuité de ligne)** : sélectionner parmi les défenseurs disponibles celui qui peut fermer le trou dangereux le plus proche avant la réception. Mesurer le temps de parcours (distance / vitesse réellement atteignable) ; exclure les joueurs au sol, pénalisés, hors-jeu et engagés.

**Étape 2 (retour aux rôles)** : une fois la continuité rétablie, déplacer progressivement les joueurs vers leur créneau nominal sans recréer un trou plus important.

**Étape 3 (rideau arrière)** : le n°15 conserve de la profondeur si un coup de pied reste possible ; si une ligne est percée, il peut devenir l'intercepteur prioritaire en visant un point de rencontre.

Faux positifs à éviter : imposer à tous les défenseurs un alignement mathématique parfait ; créer une défense "en mur" sans espace ; faire monter les quinze joueurs en même temps ; considérer un joueur en récupération comme immédiatement opérationnel.

### Structure 1-3-3-1 et 2-4-2

- `1-3-3-1` : un avant extérieur de chaque côté et deux groupes de trois, **en fonction du point de phase**, pas à huit coordonnées absolues.
- `2-4-2` : deux avants extérieurs de chaque côté, groupe central de quatre.
- Les engagés dans le ruck restent indisponibles ; le nombre réel d'avants libres peut donc être inférieur à huit.
- Les joueurs doivent se replacer sur la **durée physique nécessaire**, et pas au même instant ; une cellule à 25 m de distance ne devient pas immédiatement une option.
- La sortie de ruck conserve brièvement les rôles *si le porteur dispose de soutien* ; une poursuite aveugle du 1-3-3-1 fait baisser le nombre d'essais (régression déjà observée le 8 novembre 2026).

## 7. API d'événement et invariants

Contrat cible à ajouter **sans retirer** les champs historiques :

```ts
type MatchDecisionEvent = {
  id:string; timeMs:number; phaseId:string; sequenceId:string;
  actorId:string|null; team:'A'|'B'|null;
  type:'TACTICAL_ASSIGNMENT'|'BALL_RELEASE'|'PASS'|'TACKLE'|
       'RUCK_WIN'|'OFFSIDE'|'ADVANTAGE'|'WHISTLE'|'REFEREE_SIGNAL'|
       'SCRUM_STEP'|'LINEOUT_THROW'|'MAUL_BIND'|'SUBSTITUTION';
  from?:{x:number;y:number};
  to?:{x:number;y:number};
  context?:{ballState:string;role:string;target:string;lawProfile:string};
  decision?:{reason:string;priority:number};
  outcome?:{result:string;awardedTo:'A'|'B'|null;law:string|null};
}
```

Invariants sur tout tick :
1. Score ne change qu'à la suite d'une action de marque valide.
2. Tous les joueurs actifs ont des x/y finis et dans les bornes.
3. Pour le même joueur, `distance(posBefore,posAfter) <= vmaxAtteignable * dt + epsilon` (epsilon documenté, sauf correction de séparation bornée).
4. Joueur `auSol > 0` reste à sa position de chute tant que la physique le fige.
5. Porteur unique et cohérent avec `ball.state`.
6. Hors-jeu incompatible avec un plaquage légal jusqu'à remise en jeu.
7. Même état initial + mêmes inputs + même graine = même suite d'événements **et même trajectoire**.
8. Les variantes `1-3-3-1` / `2-4-2` changent les positions et les choix sans altérer les lois.
9. Toutes les violations sont accompagnées d'une graine, d'un `tick`, d'un `playerId`, de l'état et de l'attendu (pas un simple `false`).

## 8. Catalogue de tests scénario (étape d'injection à construire)

| ID | Initialisation | Action déclenchée | Tests obligatoires |
|---|---|---|---|
| S01 | ruck A à (52,25) | sortie 9→10 | soutien réel, temps de libération, pas de téléportation, largeur |
| S02 | ruck A à (78,66) | sortie grand/petit côté | central dans le terrain, arbitrage hors-jeu, bord sécurisé |
| S03 | mêlée A à (44,35) | formation→introduction→sortie | ordre des étapes, 9 adverse légal, pas de poussée prématurée |
| S04 | touche B à (60,0) | lancer→saut→contest | 2 lignes, assistant signale, possibilité de vol |
| S05 | maul A à (81,10) | joueur B tire illégalement | liaisons, infraction motivée, sanction |
| S06 | turnover B à (51,39) | ballon porté par B12 | défense comble le trou, arrière couvre |
| S07 | pied A vers camp B | chasse puis réception | hors-jeu du botteur, chasseurs limités, couverture B |
| S08 | avantage pour A | progression vs échec | avantage joué ou retour pénalité selon résultat réel |
| S09 | remplacement A5 en jeu | arrêt de jeu admissible | aucun 16e joueur, arrêt requis, sauvegarde |
| S10 | A14 proche de ligne | plaquage vs essai | aplatissement, signal et TMO si autorisé |

**Tâches liées** : RM4-G01 (geler l'API) → RM4-G02 (injecteur) → RM4-G03 (assertions invariantes) → RM4-G04…RM4-G30 (comportements).

## 9. Stratégie de tests

- **Structurel, exécutable immédiatement** : `node server/test-spec-simulation-v4.js` (validité du corpus JSON).
- **Unitaire, à écrire** : `server/test-v4-tactics.js`, `test-v4-referee.js`, `test-v4-setpieces.js`, `test-v4-transitions.js`; scénarios injectés via `ScenarioHarness`.
- **End-to-end** : `node server/test-parcours-navigateur.js http://localhost:8099` après montage du serveur docs et installation Playwright.
- **Population** : évaluer 30 graines appariées par tâche, 100 graines sur PR à effet statistique, 500 en suite longue ; publier le diff, jamais uniquement la moyenne après.
- **Visuel** : captures à t=0, t=1, t=3 et t=6 secondes dans les scénarios S01, S03, S04 et S07. Joueurs identifiables et événements visibles.

Une tâche est **rejetée** si elle produit 30 coordonnées "idéales" mais n'assure pas les transitions physiques entre elles, ou si la présentation des événements n'est pas dérivée du même état que le moteur.
