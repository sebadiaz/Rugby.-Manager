# V4 — Architecture d'IA fondée sur les buts et la planification (Russell–Norvig / GOAP)

**Statut : spécification de référence pour Claude Code — non implémentée dans le moteur actuel.**
**Lire avant** le plan de tâches : ce fichier remplace la vision simplifiée « un rôle = une cible » par une IA délibérative autonome.

## 0. Exigence non négociable

**Chaque joueur doit être un agent capable de choisir un but, construire un plan de plusieurs actions, exécuter les actions à travers le moteur physique, vérifier les effets obtenus et replanifier lorsque le monde change.**

Il ne suffit **pas** de :
- remplacer `if (numero === 9)` par une table de comportements ;
- attribuer 30 coordonnées cibles prédéfinies ;
- appeler `choisirActionPorteur()` puis suivre toujours la même chaîne ;
- choisir une action isolée par un score probabiliste sans représentation d'un état but et des effets futurs ;
- ajouter un LLM : ni nécessaire, ni adapté à 30 décisions en temps réel.

Le modèle s'appuie sur les agents à buts, recherche/planning et décision multiagent de Russell & Norvig, et sur les architectures temps réel GOAP de Jeff Orkin (F.E.A.R.). GOAP est une **proposition d'implémentation pratique**, non une obligation du manuel.

Références :
- https://aima.eecs.berkeley.edu/~russell/aima/global-index.html (chapitres 2, 3, 11, 17 selon édition)
- https://ojs.aaai.org/index.php/AIIDE/article/view/18724
- https://www.gdcvault.com/play/1013459/contactUs

## 1. Boucle autonome de chaque agent

```text
                      ┌───────────────────────┐
   événements moteur → │ SENSE / PERCEPTION    │
                      │ observations partielles│
                      └───────────┬───────────┘
                                  ▼
                      ┌───────────────────────┐
                      │ UPDATE WORLD MODEL    │
                      │ croyances, mémoire,   │
                      │ fatigue, position,    │
                      │ règles, opportunités  │
                      └───────────┬───────────┘
                                  ▼
                      ┌───────────────────────┐
     consigne manager →│ GOAL SELECTION        │
     plan du collectif │ buts atteignables et  │
                      │ priorités contextuelles│
                      └───────────┬───────────┘
                                  ▼
                      ┌───────────────────────┐
                      │ PLAN SEARCH            │
                      │ actions avec préconds, │
                      │ effets, coût et durée  │
                      │ (A* / Dijkstra borné)  │
                      └───────────┬───────────┘
                                  ▼
                      ┌───────────────────────┐
                      │ EXECUTE FIRST ACTION   │
                      │ mouvement/physique/    │
                      │ balle = moteur actuel  │
                      └───────────┬───────────┘
                                  ▼
                      ┌───────────────────────┐
                      │ MONITOR + REPLAN       │
                      │ vérifier vrai résultat,│
                      │ obstacle, invalidation │
                      └───────────────────────┘
```

Chaque agent possède un `AgentContext` propre : **but actif, plan, index d'étape, état d'exécution, croyances, mémoire de l'adversaire, réservations coopératives, fatigue**.

Le **moteur** demeure la seule source de vérité pour les positions, contacts, ballon, lois, score et chronomètre. L'agent n'a pas le droit de s'attribuer un ballon ou un plaquage simplement parce que l'action symbolique du plan le prédit.

## 2. Représentation de l'environnement

### 2.1 État physique autoritatif

```ts
interface EngineWorldSnapshot {
  time: number; phase: string; possession: 'A'|'B';
  ball: { x:number; y:number; state:string; carrierId:string|null; speed:number };
  players: AgentPhysicalState[]; officials: OfficialState[];
  laws: {profileId:string; phaseOffsideLines:Record<string,number>; useItDeadline:number|null};
  events: MatchEvent[]; score: {A:number;B:number};
}
```

**Ne pas exposer nécessairement l'état physique exact à tous** : la réalité du moteur est connue par simulation, mais la *perception* de chaque agent peut avoir latence, cône de vision, informations masquées et bruit, déterministes selon la graine.

### 2.2 Croyances locales (world model)

```ts
interface AgentBeliefs {
  self: {id:string;position:Vec2;velocity:Vec2;stamina:number;
         onside:boolean;bound:boolean;grounded:boolean;available:boolean};
  ball: {lastSeen:Vec2|null;ageMs:number;owner:string|null;state:string;confidence:number};
  teammates: Record<string, {lastSeen:Vec2;ageMs:number;role:string|null}>;
  opponents: Record<string, {lastSeen:Vec2;ageMs:number;threat:number}>;
  opportunities: {openSide:'LEFT'|'RIGHT'|null;overlap:boolean;gapIds:string[];
                  ruckWon:boolean;receiverOpen:boolean;podAvailable:boolean};
  roleAssignments: RoleReservation[];
  phase:string; lawProfile:string; perceivedEvents:string[];
}
```

Les **faits symboliques**, produits par un adaptateur pur `abstractWorldModel(beliefs)`, peuvent être :
`BALL_AT_RUCK`, `SELF_ONSIDE`, `SELF_AT_RUCK`, `RUCK_SECURED`, `BALL_AVAILABLE`, `HAS_BALL`, `PASS_LANE_OPEN`, `TEAMMATE_10_FREE`, `OPPONENT_PRESSURE_HIGH`, `SELF_RECOVERED`, `WIDTH_COVERED`.

Les faits doivent être cohérents, par exemple `SELF_HAS_BALL` et `BALL_IN_AIR` ne peuvent être vrais simultanément pour le même agent. Encoder les nombres continus dans une granularité appropriée pour **la recherche**, mais conserver les mètres réels pour l'exécution.

## 3. Objectifs (goals) : des CONDITIONS à atteindre

Un but n'est pas `position cible x=52`. Il est une **propriété du monde** désirée :
- `PROTECT_POSSESSION` : ruck gagné, ballon conservé ;
- `DISTRIBUTE_BALL` : ballon transmis légalement au joueur utile ;
- `CREATE_OVERLAP` : surnombre créé à l'extérieur ;
- `SUPPORT_CARRIER` : couloir de passe légal ou présence d'un soutien lors du contact ;
- `CLOSE_DEFENSIVE_GAP` : faille dangereuse couverte sans créer une faille équivalente ;
- `PREVENT_TRY` : intercepter légalement une trajectoire d'essai ;
- `SECURE_KICK_RECEIPT` : réception/contrôle de ballon en fond de terrain ;
- `WIN_CONTEST` : conquérir légalement un ballon contestable ;
- `RECOVER_AND_REJOIN` : sortir du sol, revenir onside, rejoindre un rôle valide.

Un but comporte `isSatisfied(world)`, `isApplicable(world)`, `priority(context)`, `deadline` facultative et un **critère d'abandon**. Une priorité découle des tactiques du manager, du rôle, du score, du danger, de la fatigue et de l'état légal, pas du seul numéro de maillot.

### Sélection de but

```ts
type Goal = {
  id:string; scope:'PLAYER'|'TEAM'; desiredFacts:FactConditions;
  isApplicable:(beliefs:AgentBeliefs)=>boolean;
  priority:(beliefs:AgentBeliefs,orders:TeamOrders)=>number;
  interruptPolicy:'SAFETY'|'OPPORTUNITY'|'COMMIT';
};
```

**Anti-oscillation :** garder un engagement temporaire, sauf si nouveau but vital (sauver un essai), action devenue illégale ou plan impossible. Ne pas changer de but chaque tick car deux coûts fluctuent de 0,01.

## 4. Actions de planification ≠ gestes d'animation

```ts
type PlannerAction = {
  id:string;
  preconditions:FactConditions;
  effects:FactDelta; // effet PRÉDIT, non autoritatif
  estimatedCost:(abstractWorld:WorldFacts,agent:AgentProfile)=>number;
  expectedDurationRange:[number,number]; // HYPOTHESE à calibrer
  startGuard:(world:EngineWorldSnapshot)=>boolean; // sécurité réelle
  executor:string; // liaison vers l'actuateur moteur
  successGuard:(world:EngineWorldSnapshot)=>boolean;
  abortGuard:(world:EngineWorldSnapshot)=>boolean;
  lawRequirement:string|null;
};
```

Actions type : `RUN_TO_SUPPORT_LANE`, `GET_ONSIDE`, `JOIN_RUCK_LEGALLY`, `SECURE_RUCK`, `PICK_BALL`, `PASS_TO_10`, `PASS_TO_POD`, `CARRY_INTO_GAP`, `FIX_DEFENDER`, `TACKLE_CARRIER`, `FOLD_TO_NEAREST_GAP`, `HOLD_WIDE`, `COVER_DEEP_KICK`, `SCRUM_BIND`, `LINEOUT_JUMP`, `MAUL_BIND_LEGALLY`.

Chaque action a des préconditions et effets. **Interdit** : planifier `TACKLE_CARRIER` si `SELF_ONSIDE=false` et le moteur n'a pas encore constaté la remise en jeu. Le planner peut choisir le plan `GET_ONSIDE → APPROACH_CARRIER → TACKLE_CARRIER`.

La recherche sur l'état abstrait (et non les positions exactes des 30 agents) trouve une **séquence**. Les actions sont instanciées lors de l'exécution avec une cible physique ; si le joueur n'arrive pas dans le délai estimé, l'action échoue et le plan est révisé.

## 5. Recherche GOAP déterministe, bornée et observée

### Algorithme V1

- A* sur les états symboliques (`stateKey` canonique), heuristique admissible si disponible ; sinon **Dijkstra** à coût non négatif pour garantir une solution de coût minimal dans le budget.
- Ordre stable des actions, états et choix à coût égal ; aucune décision via `Math.random()` global.
- `maxDepth`, `maxExpandedNodes`, `maxPlanningMs` **logique** (budget de nœuds plutôt que `Date.now()` dans simulation déterministe).
- `NOT_APPLICABLE`, `NO_PLAN`, `BUDGET_EXCEEDED` sont des issues explicites, pas un succès silencieux.
- Replan si : précondition invalidée, menace grave, observation nouvelle changeant l'utilité du but, action échouée, possession changée, coéquipier indisponible, commande manager urgente.
- Cacher les plans pour mêmes signatures de contexte ; invalider le cache lorsque les faits pertinents changent.
- Ne pas replanifier les 30 joueurs **à chaque frame**. Découpler `tick(dt)` physique de `decisionTick` de l'IA et traiter les événements urgents.

### Budgets initiaux proposés **à mesurer**

| Élément | Paramètre pilote |
|---|---:|
| Pas physique | 0,05 s (20 Hz) ou valeur fixée par moteur |
| Évaluation des buts | 2 à 5 Hz / joueur, et sur événements urgents |
| Replanification lourde | à la demande, étalée entre agents |
| Plan maximum | 6 à 10 actions symboliques |
| Expansion de recherche | 128 nœuds par tentative, puis secours |
| Plans collectifs | 1 à 2 Hz / équipe hors événements majeurs |
| Objectif performances | sans régression significative sur 30 matchs en CI et navigateur mobile |

**Ce sont des budgets d'ingénierie, pas des seuils World Rugby ni des mesures déjà atteintes.** Le moteur a besoin d'un système de priorités et de secours lorsque le planner dépasse son budget.

## 6. Coordination multiagent et absence d'omniscience

30 planificateurs qui poursuivent `GET_BALL` produisent 30 joueurs sur le ballon. Il faut un modèle à **deux niveaux** :

**A. Coordinateur d'équipe (TeamBlackboard)** : lit la tactique du manager et alloue des **engagements** (9 DISTRIBUTE, 2 PROTECT_RUCK, 3 CONTEST, 2 HOLD_WIDTH, 1 SWEEPER, etc.) selon les joueurs **réellement disponibles**. Ce n'est pas un script du match mais une allocation de responsabilités. Il peut être piloté par des enchères déterministes (capacité, proximité, fatigue, coût d'abandon), avec règles d'exclusion mutuelle.

**B. Agent joueur** : poursuit son but en construisant lui-même un plan ; il peut signaler `UNREACHABLE`, demander réallocation, choisir une opportunité locale plus urgente ou prendre temporairement un rôle non nominal. Un n°8 peut remplacer un n°9 indisponible pour distribuer, s'il est légalement capable de le faire.

```ts
type TeamBlackboard = {
  objectives:TeamGoal[];
  reservations:{roleId:string;playerId:string;expiresAt:number;phaseId:string}[];
  assignments:Record<string,{goalId:string;priority:number;reason:string}>;
  sharedThreats:Threat[];
};
```

Contraintes :
1. un rôle **exclusif** (par ex. porteur unique, premier receveur sur une combinaison) ne peut être attribué à deux joueurs ;
2. les soutiens, gardes et lineout peuvent être attribués en nombre borné ;
3. pas de participation simultanée à un maul et à un pod ;
4. les objectifs d'équipe changent à la perte de possession, les agents réévaluent sans téléportation ;
5. la communication entre joueurs a une latence simulable ; en V1, conserver une latence déterministe faible et instrumentée.

## 7. Exemple complet n°9 : planification réelle

**Perception au ruck :** `RUCK_WON=true`, `BALL_AVAILABLE=true`, `SELF_AT_RUCK=false`, `TEAMMATE_10_FREE=true`, `SELF_ONSIDE=true`. But `DISTRIBUTE_BALL` (`BALL_DISTRIBUTED=true`).

Recherche :
```
MOVE_TO_RUCK -> SECURE_BALL -> PASS_TO_10
```

Si, juste avant l'exécution de `PASS_TO_10`, le 10 devient couvert :
- invalider la précondition `TEAMMATE_10_FREE` ;
- replanifier avec `PASS_TO_POD`, `RUN_BLIND_SIDE` ou `KICK_WHEN_LEGAL` selon la situation ;
- si aucun plan légal n'est faisable, conserver/protéger la balle dans les limites réglementaires et publier `NO_PLAN`, **jamais passe en avant inventée**.

Le 9 ne saute pas à la base du ruck quand `MOVE_TO_RUCK` est une action du plan. Il court ; le `successGuard` vérifie la distance et l'état du joueur, puis seulement le plan passe à l'action suivante.

## 8. Exemple n°7 : contest légal ou repli

Le n°7 voit un ballon au sol, mais son état de croyance dit `RUCK_FORMED=true` et `SELF_ONSIDE=false`.

- But : `STOP_OPPONENT_ATTACK`.
- Plan **interdit** : `JACKAL` directement.
- Plan plausible : `GET_ONSIDE → COVER_GUARD_CHANNEL → TACKLE_LEGAL_CARRIER`.
- Si le ruck n'est PAS formé, joueur sur ses appuis, bon angle et conditions légales, un autre plan `APPROACH_FROM_GATE → CONTEST_BALL` peut être évalué.
- L'arbitre détient la décision finale de pénalité ; l'IA ne s'auto-accorde jamais un turnover.

## 9. Hiérarchie des plans

Le jeu réel comporte des structures longues : mêlée, touche, maul, jeu placé. Utiliser une combinaison de :
- **HTN / tâches composées** pour décomposer des objectifs tactiques connus (`EXECUTE_LINEOUT` → positionner lanceur et sauteurs → lever → lancer → contest → relancer) ;
- **GOAP** pour choisir parmi les actions et chemins alternatifs, notamment quand le plan initial échoue ;
- **contrôleurs physiques réactifs** pour déplacement, évitement des obstacles, contact et équilibre.

Une FSM reste pertinente pour l'**exécution** des gestes (mêlée `CROUCH/BIND/SET`, animation `TACKLE`) ; elle ne doit pas être l'unique intelligence qui choisit les buts.

Ne pas simuler 30 agents anticipant récursivement toutes les actions adverses (explosion combinatoire). Les intentions adverses sont évaluées à partir d'un modèle local de menace, pas de leur plan interne caché.

## 10. Contrats de journaux explicables

Chaque changement de but et plan doit pouvoir être affiché dans l'outil de débogage :
```json
{
  "time": 1631.4,
  "playerId": "A9",
  "perceivedFacts": ["RUCK_WON", "BALL_AVAILABLE", "SELF_ONSIDE"],
  "teamAssignment": "DISTRIBUTE_BALL",
  "selectedGoal": "DISTRIBUTE_BALL",
  "candidatePlans": [
    {"actions":["MOVE_TO_RUCK","SECURE_BALL","PASS_TO_10"],"cost":3.2},
    {"actions":["MOVE_TO_RUCK","SECURE_BALL","PASS_TO_POD"],"cost":4.1}
  ],
  "chosenPlan": ["MOVE_TO_RUCK","SECURE_BALL","PASS_TO_10"],
  "activeStep": "MOVE_TO_RUCK",
  "replanReason": null
}
```

Les coûts sont des **exemples inventés de scénario**, non des modèles calibrés. Les journaux complets ne doivent pas grossir chaque sauvegarde : activer leur capture dans les tests, les replays et l'écran dev.

## 11. Critères de réception « vraie IA »

Une IA n'est pas validée parce que les joueurs courent intelligemment. Elle est validée si :
- le même but aboutit via **deux plans différents** quand l'environnement change ;
- un plan à **au moins 3 actions** peut être produit avec dépendances logiques (pas enchaînement codé en dur) ;
- l'action invalide est exclue par les préconditions légales ;
- une action échouée entraîne un plan de remplacement sans modifier l'état physique frauduleusement ;
- un agent affecté à `CLOSE_DEFENSIVE_GAP` sait replier puis revenir à son rôle nominal ;
- les agents coordonnent des réservations sans envoyer les 30 joueurs au ballon ;
- la même graine produit les mêmes choix **et** les mêmes trajectoires ;
- l'absence de plan est visible et aboutit à un comportement de secours légal ;
- l'IA est contrôlée par la tactique du manager, sans être une chorégraphie fixe.

**Les travaux sont ordonnés dans `PLAN_CLAUDE_CODE.md`.** Le module `engine/ai/goal-planner.js` constitue un **socle pédagogique de planification symbolique** : ne pas annoncer de simulation multiagent livrée avant son intégration au moteur.
