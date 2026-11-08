# V4 — IA **individuelle** fondée sur les buts : le placement émerge des circonstances

> **Décision du propriétaire — 8 novembre 2026.** Il n'existe **aucune IA collective, aucun TeamBlackboard décisionnel, aucun TeamCoordinator**, aucune enchère/assignation centrale des rôles. Chacun des 30 joueurs est un agent indépendant. Chaque joueur **connaît le plan de jeu commun et ses références de placement**, mais choisit lui-même ses buts, son plan et **chaque déplacement** selon le monde qu'il perçoit. Ce document **prévaut** sur toute mention de coordination centralisée dans les autres spécifications V4.

## 1. Trois notions qu'il ne faut pas confondre

**Plan de jeu partagé (donnée statique)** : consignes du manager, structure 1-3-3-1 ou 2-4-2, largeur, remontée défensive, rythme, couverture au pied, combinaisons et règles du rugby. Les 30 agents en ont une représentation compatible. Ce n'est **pas un cerveau** qui les commande au cours du match.

**Buts propres à un joueur (dynamiques)** : défendre, rester en jeu, protéger son couloir, plaquer, fermer un intervalle, aider le porteur, gagner/contester un ruck légalement, être disponible pour une passe, couvrir le fond, récupérer après un plaquage, etc. Un but est une condition à atteindre ; plusieurs buts peuvent être simultanément pertinents et concurrents.

**Position et déplacement résultants (individuels)** : chaque agent calcule sa propre intention et choisit son déplacement par une recherche locale et un contrôleur physique ; la formation observée est la conséquence des décisions des joueurs, **pas** de 30 positions imposées par un coordinateur.

**Exemple :** un 6 connaît son emplacement de référence en 1-3-3-1. Si l'équipe perd le ballon, **défendre devient prioritaire**. Selon sa distance à la menace, la ligne de hors-jeu, l'espace laissé par son partenaire et sa fatigue, il peut fermer un intervalle, revenir onside ou poursuivre un porteur. Il choisit son trajet, vitesse et angle, puis revoit sa décision à mesure que la situation évolue.

## 2. Vue d'ensemble : pas d'acteur collectif décidant à la place des joueurs

```text
    Plan de jeu du club (lecture seule)       Monde réel (moteur/lois)
             /       |       \                       |
            v        v        v                      v
         Agent A1  Agent A2  ... Agent B15   <--- Observations
            |        |             |
     Perception + état mental propre à chacun
            |        |             |
       Buts / priorité / plan GOAP / replanification
            |        |             |
     Action locomotrice INDIVIDUELLE (steering/physique)
            |        |             |
            +----> moteur autoritatif <----+
              événements observables au tick suivant
```

**Architecture interdite :** `TeamCoordinator.assign(A7,'CONTEST')`, `TeamBlackboard.reserve('CLEANER',A6)`, `computeAllTargets(players)` puis injection de positions dans les agents. Le manager **n'intervient pas pendant chaque action**. Le moteur **ne doit jamais utiliser une IA « d'équipe »** pour décider d'une course individuelle.

**Architecture permise :** le moteur diffuse des faits de match et les consignes du club en lecture seule. Les agents peuvent voir ou entendre certains signaux de partenaires. Le moteur résout des contacts et règles réglementaires, mais il **ne décide pas du but du joueur**.

## 3. Modèle individuel : les buts génèrent les intentions de placement

```ts
type RugbyAgent = {
  id: string;             // A1..A15 / B1..B15
  playbook: Readonly<TeamPlaybook>; // même texte de tactique, interprété individuellement
  profile: PlayerAttributes;        // poste, décision, vision, fatigue, vitesse, etc.
  beliefs: IndividualBeliefs;       // ce qu'IL sait, pas omniscience de groupe
  goals: GoalCandidate[];           // ses buts actifs/éligibles
  chosenGoalId: string | null;
  plan: IndividualPlan | null;
  actionIndex: number;
  steering: MovementController;    // vitesse, accélération, angle, évitement propres
  memory: IndividualMemory;        // dernière position du ballon, menaces, décisions
};
```

Le plan de jeu fournit par exemple :
```ts
type TeamPlaybook = {
  attackStructure: '1331'|'242';
  attackWidth: number;
  defenseStyle: 'DRIFT'|'PRESS'|'CONSERVATIVE';
  defensiveLineDepth: number;
  backfieldCoverage: 'ONE'|'TWO'|'THREE';
  kickPolicy: string;
  setPieces: Record<string,SetPieceInstruction>;
};
```

Ce sont des **consignes partagées et passives**, non un `TeamAgent`. Chaque joueur en tire **son** point de référence `nominalAnchor(phase, ball, myPost, myTeam, playbook)`. Le point de référence n'est qu'un **but potentiel** ou une contrainte, jamais une position imposée.

### Buts d'un joueur (exemples)

| But individuel | Quand il devient important | Condition de réussite observable | Influence sur placement |
|---|---|---|---|
| `BECOME_ONSIDE` | hors-jeu | revenu légalement dans le jeu | repasser derrière la ligne autorisée |
| `DEFEND` | adversaire en possession/menace | menace contenue par action légale | se placer entre menace et zone à défendre |
| `CLOSE_GAP` | intervalle dangereux proche | écart réduit sans laisser trou pire | déplacement diagonal, orientation appropriée |
| `MARK_OPPONENT` | adversaire direct susceptible de recevoir | ligne de passe ou accès fermé | adapter profondeur/latéral |
| `TACKLE` | adversaire porteur à portée légale | plaquage moteur effectif | intercept plutôt que courir derrière |
| `HOLD_LINE` | défense stable | ligne cohérente avec voisins observés | retenir sa montée plutôt que chasser |
| `PROTECT_INSIDE` | menace petit côté / ruck proche | canal intérieur couvert | maintien d'un espace protecteur |
| `COVER_BACKFIELD` | jeu au pied possible | zone de réception accessible | conserver profondeur |
| `SUPPORT_CARRIER` | possession de son équipe | disponible au bon moment et angle | soutien réel, non simple course vers ballon |
| `JOIN_RUCK_LEGALLY` | partenaire au sol, entrée autorisée | rejoint l'action légalement | itinéraire via porte, pas trajectoire directe illégale |
| `BE_PASS_OPTION` | possesseur regarde vers moi | couloir de passe valide | ajuster profondeur et orientation |
| `PRESERVE_WIDTH` | canal faible en attaque | largeur et accès au ballon conservés | tenir sa zone même si ballon loin |
| `RECOVER` | joueur plaqué/au sol | de nouveau disponible | rester au sol jusqu'à récupération, puis se relever |
| `RETURN_TO_PLAYBOOK` | menace immédiate passée | distance au placement nominal abaissée | retour progressif vers son poste |

**Défendre est généralement la priorité de jeu lorsque l'adversaire possède le ballon**, sans remplacer les contraintes de légalité : un joueur hors-jeu doit d'abord se remettre en jeu, un joueur au sol doit récupérer, un arrière dernier rideau doit parfois **tenir** sa couverture plutôt que chasser le ballon. Le mot « défense » n'est pas un ordre unique « tous sur le porteur » : il est décomposé en plusieurs buts défensifs contextuels.

## 4. Comment le joueur choisit concrètement où aller

Le joueur ne reçoit pas une cible par le groupe. Il fabrique des **candidats** à partir des buts qu'il connaît :
- une zone de repli légale selon la ligne de hors-jeu ;
- une position d'interception calculée d'après les déplacements **observés** ;
- un emplacement de protection intérieur près du ruck ;
- un point de soutien donnant un angle de passe arrière ;
- une zone de couverture du fond ;
- son placement nominal dérivé de la tactique et de la balle.

Il compare ces alternatives **selon les préconditions des buts**, la capacité à atteindre la cible à temps et les conséquences anticipées. Une candidate n'est jamais évaluée seulement à sa distance métrique du ballon.

Exemple de coût de déplacement **proposé** (coefficients à calibrer, pas calcul réglementaire) :

```text
cost(trajectory) =
    estimatedTravelTime
  + fatiguePenalty
  + collisionRisk
  + offsideRisk                       // hors-jeu avéré => action INVALIDE, pas juste "chère"
  + defensivelyExposedGapPenalty
  + distanceFromPlaybookAnchorPenalty // faiblement pondérée en présence de danger
  + conflictWithObservedTeammatePathPenalty
```

La priorité d'un but se calcule **pour l'individu** :
```text
P_i(goal,t) = urgency(goal, perceivedThreats)
            + relevance(goal, ball, possession, phase)
            + aptitude(goal, playerSkills)
            + playbookWeight(goal, playerPost, gamePlan)
            - riskOfLeavingCriticalZone
            - switchingCost(previousGoal)
```

Ce n'est pas forcément une somme à coefficients fixes : les interdictions légales sont des **garde-fous**, le danger immédiat peut interrompre un but nominal. L'agent vérifie les conditions de succès avec le monde réel après chaque action physique.

### Déplacement individuel : une boucle propre

```ts
function updateIndividualAgent(agent, observedWorld, dt) {
  agent.beliefs = perceiveAndUpdateMemory(agent, observedWorld);
  const goals = deriveGoals(agent.playbook, agent.profile, agent.beliefs);
  const chosen = chooseOwnGoal(goals, agent.beliefs, agent.plan);
  agent.plan = mustReplan(chosen, agent.plan, agent.beliefs)
    ? planOwnActions(chosen, agent.beliefs) : agent.plan;
  const intent = executeOnePlannedAction(agent.plan, agent.beliefs);
  return steerOwnBody(intent, agent.profile, observedWorld, dt);
}
```

Le résultat est une **intention de mouvement** bornée par les contrôles physiques du moteur existant (`avancer()`, accélération, fatigue, collisions, temps de contact). L'intention n'est **jamais** une instruction `j.x = cible.x`. Le moteur résout tous les déplacements et duels, puis chaque agent constate le résultat et adapte son plan au tick de décision suivant.

## 5. Éviter les 30 joueurs sur le ballon SANS coordinateur

Cette exigence se résout par des décisions **individuelles** :
- un joueur engagé ou au sol a des possibilités strictement limitées ;
- chacun compare son temps d'arrivée et son angle à ceux des partenaires **visibles** ;
- un joueur voit qu'un partenaire couvre déjà un intervalle et attribue plus de valeur à un autre intervalle ;
- les ailiers favorisent l'occupation d'une largeur délaissée ;
- le 15 conserve sa couverture si une menace de pied existe ;
- le joueur le mieux placé pour le ruck peut y entrer, les autres peuvent préparer le soutien suivant ;
- des conflits résiduels sont acceptables et testés : une vraie équipe peut mal se coordonner, surtout si les joueurs sont fatigués ou lisent mal le jeu.

**Pas de réservation de rôle** et pas d'enchères. Les comportements coopératifs **émergent** des mêmes consignes de rugby, de la perception des autres et des capacités des joueurs. Les partenaires **peuvent communiquer** un appel oral observable, mais cette information ne devient pas une autorité centrale ni une action garantie.

Pour une **mêlée, touche ou coup d'envoi**, chaque agent connaît son rôle de formation issu du plan de jeu, de son poste effectif et de l'effectif disponible. Le déclencheur et les lois restent dans le moteur/arbitre, mais aucun autre agent ne lui ordonne chaque pas. En cas d'absence d'un titulaire, chacun peut constater le manque et tenter une solution permise par ses compétences et les règles ; les conflits sont vérifiés par le moteur.

## 6. Déroulé d'un ruck, agent par agent

Scène : A attaque vers x croissant, ruck A à (52,25), 15 joueurs par équipe.

- **A9** : `DISTRIBUTE` ; souhaite être à la base, vérifie disponibilité du ballon puis cherche un receveur.
- **A7** : `SECURE_RUCK` si légal et arrive à temps ; sinon `SUPPORT_NEXT_PHASE` ou protection de canal.
- **A6** : constate que A7 est déjà près du ruck ; peut préférer fermer le canal intérieur et préparer un soutien.
- **A10** : `BE_PASS_OPTION` ; offre une profondeur et un angle recevables, sans s'aligner automatiquement sur la balle.
- **A11/A14** : `PRESERVE_WIDTH` et `PREPARE_RUN`, si une menace oblige à défendre, leurs buts changent.
- **A15** : `COVER_BACKFIELD`, évite de quitter toute profondeur pour le regroupement.
- **B6** : `DEFEND` → `BECOME_ONSIDE` si nécessaire → `HOLD_LINE` ou `PRESS_RECEIVER` selon menace locale.
- **B13** : `MARK_OPPONENT` contre A13 ou `CLOSE_GAP`, pas une position reçue du "coordinateur B".
- **B15** : `PREVENT_TRY` si A perce ; sinon maintien du dernier rideau.

**Le même ruck peut conduire à des positions différentes** selon fatigue, vitesse, perception, nombre de joueurs au sol, direction du ballon, résultat du duel et tactique. Ce n'est pas une chorégraphie écrite.

## 7. Tests que Claude Code doit rendre exécutables

| ID | Observation / perturbation | Preuve recherchée |
|---|---|---|
| IND-01 | 30 joueurs ont le même plan de jeu | 30 `AgentContext` distincts, chacun décide sans coordinateur |
| IND-02 | changer seulement A7 de perception « A6 déjà au ruck » | A7 choisit éventuellement un autre objectif et une autre course ; pas de changement direct d'un assignateur central |
| IND-03 | B prend la possession | les joueurs A **individuellement** réévaluent les buts défensifs, mais **pas** nécessairement avec la même action |
| IND-04 | A6 est hors-jeu et menace pressante | aucun plaquage illicite ; A6 choisit d'abord remise en jeu |
| IND-05 | B15 couvre un ballon profond | B15 garde la profondeur malgré le but « défendre » |
| IND-06 | A11 tient l'aile et A14 est déjà proche du ballon | A11 ne converge pas mécaniquement ; largeur préservée |
| IND-07 | A9 veut passer, 10 se ferme | replanification du 9 et déplacement sans téléportation |
| IND-08 | modifier les croyances d'A6 uniquement, à état moteur inchangé | le plan d'A6 peut changer, aucun autre plan n'est directement écrit ou modifié |
| IND-09 | deux soutiens choisissent le ruck simultanément | comportement légal sans synchronisation imposée ; les collisions/engagements sont résolus par le moteur |
| IND-10 | même graine et mêmes observations | mêmes plans, intentions et trajectoires ; 30 joueurs sans ordre aléatoire de tick |
| IND-11 | indisponibilité d'un joueur de mêlée | ses partenaires appliquent leurs consignes de formation locales, sans `TeamCoordinator` |
| IND-12 | tactique 1-3-3-1 → 2-4-2 | les ancres nominales et les buts des joueurs évoluent, sans commande individuelle externe |

**Test architectural obligatoire** : faire échouer le test si un module attribue les buts ou positions à l'ensemble des 30 joueurs (`TeamBlackboard`, `TeamCoordinator`, `assignRoles`, `reserveRole`). Un module de **lecture seule** des consignes communes ou un moteur physique qui réunit les intentions de chaque joueur n'est pas une IA collective.

**Mesures** : violations du hors-jeu, passages au sol, temps entre perception et course, profils de buts par joueur, temps d'arrivée, nombre d'agents convergeant vers un ruck, couverture du 15, distances entre défenseurs, échecs de coordination et variation de l'action selon les circonstances. Ne pas masquer ces échecs par une téléportation/assignation forcée.

## 8. Tâches à suivre en priorité

- `RM4-G03` ontologie des faits de perception ;
- `RM4-G04` perception et mémoire **individuelles** ;
- `RM4-G05` buts multi-critères, **DEFEND** et sous-buts prioritaires ;
- `RM4-G06` actions propres, coûts, lois et déplacement planifié ;
- `RM4-G07` exécution physique individuelle, sans effet magique ;
- `RM4-G08` `GoalBasedRugbyAgent` et replanification ;
- `RM4-G10` **supprimé dans son ancienne forme** : remplacer par test d'autonomie individuelle et placements émergents ;
- `RM4-G11` instancier 30 agents indépendants ;
- `RM4-G17` défense émergente depuis les buts des défenseurs, pas IA tactique centrale.

**Critère absolu :** aucun module décisionnel ne peut commander à un joueur son but ou son déplacement. Les références tactiques et les lois existent, mais **la décision est locale, joueur par joueur**.
