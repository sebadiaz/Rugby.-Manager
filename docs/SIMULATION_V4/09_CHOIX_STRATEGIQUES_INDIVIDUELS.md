# V4 — Choix de stratégie en mêlée, en touche et en plein jeu : **décisions individuelles**

**Décision produit :** chaque joueur connaît le plan de jeu (intentions, principes, combinaisons et zones de référence). Il **choisit individuellement** l'action, le moment de départ et le déplacement selon son observation, son but prioritaire, les règles et l'évolution de la situation. **Aucune IA collective** ne décide la stratégie à sa place.

**Statut** : cahier de spécification et d'acceptation, **pas une fonctionnalité déjà livrée**. **Précision propriétaire : le 9 initie la demande de touche en discutant avec le 10, prend les informations des avants avant une mêlée et prévient les trois-quarts avant un up-and-under.** Ces dialogues sont détaillés et prioritaires dans `10_DIALOGUES_TACTIQUES_DU_9.md`. Le transport des appels courts existe dans `engine/ai/local-communication.js`, mais n'est pas encore relié aux agents de match. Les scénarios de ce fichier deviendront des tests après intégration GOAP. Lire `07_AGENT_INDIVIDUEL_PLACEMENT.md` et `08_COMMUNICATION_LOCALE.md`.

## 1. Ce qui est « stratégie » et ce qui ne l'est pas

- **Plan de jeu connu** : préférences de l'entraîneur (jeu au large, conservation, occupation, lancements sur touche, sortie de mêlée par 8, montée défensive, arrière de couverture). C'est une **référence constante**, pas un script automatique.
- **But individuel** : la situation que l'agent veut atteindre (`WIN_BALL`, `ESCAPE_PRESSURE`, `BE_PASS_OPTION`, `BREAK_GAINLINE`, `CONTAIN_CARRIER`, `COVER_BACKFIELD`, etc.).
- **Option stratégique** : façon plausible d'atteindre ce but (ex. passe au 10, départ du 8, conservation du ballon à la base de mêlée, passe intérieur, petit côté).
- **Plan GOAP/HTN local** : séquence d'actions avec préconditions et effets attendus, adaptée à sa fonction.
- **Déplacement individuel** : trajectoire, vitesse, angle, évitement et orientation décidés par **ce joueur** et exécutés par la physique, jamais imposés en masse.
- **Résultat** : déterminé par le moteur de rugby, l'arbitre, les duels et les autres joueurs. Une option choisie ne garantit ni victoire de mêlée, ni réception de touche, ni essai.

**À interdire :** `teamAI.chooseScrumExit()`, `lineoutBrain.chooseJumper()` ou `director.chooseCarrierAction()`. Les décisions appartiennent aux joueurs directement concernés, sur un plan de jeu commun. Des désaccords ou mauvais timings sont possibles.

## 2. Contrat d'un choix stratégique individuel

```ts
interface TacticalOption {
  id: string;
  ownerId: string;                 // seul joueur autorisé à choisir cette option
  phase: 'SCRUM'|'LINEOUT'|'OPEN_PLAY'|'RUCK'|'MAUL';
  goalId: string;                  // condition du monde visée
  preconditions: FactConditions;   // tous les faits symboliques requis
  legalGuard: string;              // règle obligatoire contrôlée par l'exécuteur
  expectedEffects: FactDelta;      // PRÉDICTION, jamais écriture moteur
  candidateActions: string[];      // séquence possible à valider par GOAP
  utility: {
    expectedTerritory: number;
    retentionProbability: number;  // estimation de l'agent, pas réussite garantie
    expectedFatigue: number;
    penaltyRisk: number;
    expectedTime: number;
    tacticalFit: number;           // compatibilité avec son plan de jeu connu
  };
  reconsiderOn: string[];          // événements/perceptions réactivant le choix
}
```

La décision individuelle compare les alternatives **légales et réalisables** compte tenu des croyances de l'agent, pas en consultant secrètement le plan ou l'état interne des 29 autres. L'évaluation peut être déterministe sous une même graine tout en admettant des erreurs de perception : elle n'a pas besoin d'un LLM.

### Priorités avant tout choix

1. Règle du rugby, intégrité physique, statut au sol, hors-jeu et liaison en cours : **interdictions**.
2. Menace immédiate et **défense** si possession adverse (sous-buts `BECOME_ONSIDE`, `CLOSE_GAP`, `HOLD_LINE`, `TACKLE`, `COVER_BACKFIELD`).
3. Conserver/contester une possession à portée et légalement accessible.
4. Exploiter une opportunité : surnombre, espace, défense fixée, vitesse de soutien.
5. Rejoindre progressivement sa référence de placement et le plan de jeu.

**Attention :** défendre n'implique pas quinze plaquages simultanés. Le dernier arrière peut rester profond, un ailier tient son vis-à-vis, un avant hors-jeu recule avant de monter.

### Quand reconsidérer un plan

`POSSESSION_CHANGE`, `BALL_AVAILABLE`, `SCRUM_BALL_WON`, `SCRUM_BALL_LOST`, `LINEOUT_THROW`, `LINEOUT_CATCH`, `MAUL_FORMED`, `DEFENDER_COMMITTED`, `RECEIVER_CLOSED`, `TEAMMATE_FALLEN`, `KICK_FLIGHT`, `REFEREE_WARNING`, `HEARD_TEAMMATE_CALL`.

Une alerte de partenaire n'est pas un ordre : elle peut provoquer une nouvelle évaluation, jamais forcer le choix.

## 3. Mêlée : stratégies possibles **par participant**

> Pour les contraintes, se référer à la **loi 19 actuelle**. Une mêlée est une conquête réglementée, pas un événement « choisir une formation = ballon automatiquement gagné ». Les poussées commencent légalement **après introduction** ; le 9 adverse a des restrictions de placement ; la sortie par 8 ou 9 dépend de la possession réelle du ballon. https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/

| Agent | But possible | Options réellement en concurrence | Faits qui orientent le choix |
|---|---|---|---|
| 1/3 piliers | maintenir la stabilité, protéger/gagner la conquête | conserver liaison et axe / pousser légalement / corriger appuis | engagement, stabilité, poussée adverse, fatigue |
| 2 talonneur | gagner le ballon et stabiliser le pack | positionner pied de frein / talonner à l'instant légal / conserver appuis | commande de l'arbitre, ballon au tunnel, équilibre |
| 4/5 | transmettre la poussée, rester liés | maintenir liaison / ajuster appuis / engager force progressivement | mouvement des piliers, poussée, fatigue |
| 6/7 | soutenir et préparer défense/sortie | pousser / suivre le ballon / se préparer à défendre après sortie | ballon réel et état des liaisons |
| **8** | sécuriser la sortie ou attaquer | contrôler au pied / sortie courte ballon en main / laisser sortir au 9 si meilleure option | ballon aux pieds, pression B6/B7/B9, espace près de la base, urgence |
| **9 introducteur** | gagner et exploiter la possession | introduction légale / récupérer à la base / passer 10 ou 12 / départ court si légal | ballon disponible, disponibilité du 8, réception 10/12, hors-jeu du rival |
| **9 adverse** | défendre sans faute | rester onside suivant option permise / presser le receveur après fin de mêlée / protéger petit côté | règle de placement, sortie effective, vitesse du 9 adverse |
| **10** | être une solution et fixer défense | s'offrir en profondeur / préparer passe ou pied / conserver recul | position du ballon, pression de ligne, couverture arrière |
| **11–15** | ouvrir espace ou défendre | suivre la stratégie connue de sortie / modifier leurs courses après signal réel de sortie | défense observée, ballon disponible, réception possible |

### Scène SCR-STR-01 — Le huit peut partir

- État : mêlée gagnée par A, ballon contrôlé à l'arrière ; A8 peut physiquement prendre le ballon ; petit côté défendu par un seul joueur ; A9 prépare l'option au 10.
- A8 perçoit l'espace et peut choisir `PICK_AND_GO_8` si cela vaut mieux que `HOLD_BALL_FOR_9`.
- A9 n'est **pas informé par télépathie** du plan d'A8 : il peut entendre `MINE` ou observer la prise de balle, puis **replanifier**.
- Assertion : `carrierId` reste unique, aucune sortie tant que le ballon n'est pas légalement jouable, déplacement réel de A8, A9 ne peut passer un ballon qu'il n'a pas.

### Scène SCR-STR-02 — Sortie par le neuf

- Même mêlée, mais défense solide autour du 8, 10 libre et couloir de passe sûr.
- A8 peut conserver le contrôle sans partir ; A9 choisit `COLLECT→PASS_TO_10` selon ce qu'il voit.
- Assertion : à conditions légalement identiques, les options **peuvent différer** quand seul le danger perçu change ; 8 et 9 n'acquièrent pas simultanément le ballon.

### Scène SCR-STR-03 — Mêlée subie, défense prioritaire

- B pousse légalement, A perd la conquête, A6/A7/8 sont encore liés.
- Chaque avant doit d'abord finir son engagement légalement ; puis il réévalue `BECOME_ONSIDE` / `DEFEND` / `HOLD_LINE`.
- Aucun sprint d'un joueur toujours lié à 8 m derrière son propre pack.
- Test : objectif défensif activé individuellement à la perte de possession, sans position cible attribuée par « équipe IA ».

### Scène SCR-STR-04 — 9 adverse et choix légal

- Le 9 adverse observe la sortie probable du ballon.
- Son plan `PRESS_9` est rejeté si sa position serait hors-jeu ; il choisit un replacement conforme ou attend la sortie.
- Vérification de loi exacte dans le profil choisi avant test, pas de règle « demi de mêlée libre de courir partout ».

## 4. Touche : choisir la zone, la conquête et la suite

> Pour les contraintes, consulter la **loi 18** : ligne d'alignement, nombre légal de participants, lancer, saut, soutien et fin de l'alignement. Il existe aussi une remise rapide avec conditions distinctes. https://passport.world.rugby/laws-of-the-game/laws-by-number/18-touch-quick-throw-and-lineout/

| Agent | But possible | Choix stratégique local | Observations nécessaires |
|---|---|---|---|
| **2 lanceur** | gagner la touche | exécuter légalement le lancer demandé par le **9 après dialogue avec le 10**, l'adapter si impossible | disposition défensive visible, timing sauteurs, pression, appel du 9 |
| **4/5 sauteurs** | recevoir ou contester | appel au premier/second plan / saut légal / leurre / soutien si non sauteur | trajectoire du ballon, marque, porteurs, adversaires |
| **1/3/6/7 soutiens** | aider la réception légale | se placer en soutien / lever et ramener en sécurité / préparer liaison | timing et position du sauteur, légalité du geste |
| **8 receveur/porteur** | conserver et progresser | maul légal / libération rapide vers 9 / percussion si ballon reçu | contest, espace, entrée des adversaires |
| **9** | exploiter la possession | se préparer à la base / passe rapide au 10 / attaque petit côté / soutien du maul | ballon gagné, pression immédiate, couverture |
| **10–15** | fixer, attaquer ou couvrir | course de lancement / appel de passe / pied / protection fond | où la touche va tomber, défense en place |
| défenseurs | contester ou contenir | sauter légalement / préparer défense du maul / montée sur 9-10 si possible | annonce de lancer, sauteur réel, réception |

### Scène LINE-STR-01 — Le lanceur change d'option

- Plan de jeu connu : toucher le sauteur du fond pour lancement rapide.
- Le **9 interroge d'abord le 10** (`LINEOUT_ASK`), qui peut lui signaler que le fond est marqué et le premier sauteur libre.
- Le **9 demande** un lancer court (`LINEOUT_FRONT`) ; le talonneur n'est pas télécommandé et doit toujours exécuter son lancer légalement selon la réception de cet appel et la disponibilité réelle des sauteurs.
- Les sauteurs et soutiens voient le geste/la trajectoire et réagissent avec délai : aucune connaissance immédiate du nouveau choix de lancer.

### Scène LINE-STR-02 — Maul ou jeu au large

- Ballon légalement capté puis ramené au sol. Le receveur peut considérer `FORM_MAUL` si partenaires réellement à portée et liaisons possibles, ou `RELEASE_TO_9` si le 9 est disponible et la défense serrée.
- **Aucune garantie de maul** : la constitution et la légalité sont décidées par les participants et l'arbitre/moteur.
- Le 9 n'anticipe pas un ballon magique : attend une vraie libération.

### Scène LINE-STR-03 — Contest défensif réussi

- B conteste et gagne le lancer. Les A initialement engagés doivent réévaluer localement `DEFEND`, `CLOSE_GAP` ou `RECOVER` selon leur disponibilité.
- Les A qui soutiennent encore un sauteur ne se téléportent pas dans leur rideau défensif.

### Scène LINE-STR-04 — Signal mal compris

- Un sauteur crie `MINE` ou `BALL`. Le lanceur est trop loin (ou la voix expire) : il garde son observation courante.
- Assertion : un message non entendu ne peut pas modifier le choix du lanceur ni déclencher une fausse réception.

## 5. Plein jeu : l'agent choisit tactique **et déplacement**

### Porteur

| Option | But recherché | Quand elle a du sens | Règles et vérifications |
|---|---|---|---|
| `CARRY` | gagner du terrain | espace et soutien disponible | vitesse, collision, conservation |
| `FIX_AND_PASS` | fixer défenseur, libérer espace | défenseur engage le porteur, partenaire libre | libération avant contact, trajectoire arrière |
| `SHORT_PASS` | maintenir continuité | soutien intérieur en retrait | receveur réellement arrivé |
| `WIDE_PASS` | exploiter surnombre | ligne de passe ouverte, largeur préservée | pas de passe en avant |
| `OFFLOAD` | conserver malgré contact | bras libres et destinataire légal | contact et probabilité conditionnelle |
| `GRUBBER` | menacer derrière rideau | espace libre derrière ligne, talent de pied | ballon au sol et course légale |
| `HIGH_KICK` | disputer la réception par **chandelle / up-and-under**, après annonce du 9 aux trois-quarts s'il botte | réception contestable, chasseurs onside, appel entendu | trajectoire, ballon en vol, hors-jeu |
| `TOUCH_KICK` | gagner territoire | zone de terrain et gain autorisé | limites 22/50:22, bénéficiaire du lancer |
| `PROTECT_BALL` | éviter turnover | aucune sortie sûre, contact proche | présentation/ruck légal |
| `DROP_GOAL` | marquer | position et contexte favorables | loi 8, tir réel, probabilité issue du joueur |

### Sans ballon en attaque

Le joueur choisit **sa** façon d'aider : `BE_PASS_OPTION`, `HOLD_WIDTH`, `RUN_SUPPORT_INSIDE`, `RUN_SUPPORT_OUTSIDE`, `FIX_AS_DECOY`, `CLEAN_RUCK`, `COVER_TURNOVER`, `PREPARE_NEXT_PHASE`. Sa trajectoire ne doit pas suivre le ballon aveuglément.

### Défense

La priorité `DEFEND` se décompose au minimum en : `GET_ONSIDE`, `HOLD_LINE`, `MARK_RECEIVER`, `CLOSE_GAP`, `SLOW_CARRIER`, `TACKLE_LEGALLY`, `COVER_INSIDE`, `COVER_BACKFIELD`, `INTERCEPT_PASS`, `DEFEND_KICK`.

**Mêmes faits globaux, décisions individuelles différentes** : le 13 peut monter sur son adversaire, le 15 rester profond, le 7 revenir onside. Aucun agent ne reçoit une cible d'un coordinateur.

### Scène OPEN-STR-01 — Fixer ou passer directement

- A12 voit B13 à 4 m, A13 ouvert à l'extérieur.
- Si B13 ferme directement le couloir : A12 peut fixer davantage, A13 choisit sa propre course de soutien ; une passe directe peut être devenue mauvaise.
- Si B13 monte sur A12, A12 peut `FIX_AND_PASS`, mais le résultat ne peut être écrit par le planner.
- Test différentiel : même graine, changer uniquement l'angle de B13 → changement plausible d'option et de trajectoire.

### Scène OPEN-STR-02 — Turnover et renversement des buts

- B gagne le ballon pendant qu'A attaque au large.
- A11 couvre une aile, A7 est au sol, A15 en arrière.
- A11 évalue `HOLD_LINE` ou `CHASE_CARRIER`, A7 `RECOVER`, A15 `COVER_BACKFIELD` ou `PREVENT_TRY`. Ils n'ont pas le même plan bien qu'ils soient tous « en défense ».
- Test : aucune commande d'équipe qui repositionne brutalement les 15 joueurs.

### Scène OPEN-STR-03 — Refus d'un appel

- A10 reçoit `BALL` de A14, mais la passe serait en avant ou le couloir interceptable.
- A10 ne passe pas malgré l'appel. Il choisit l'espace intérieur, protège le ballon ou change d'objectif.
- Le message est une observation, **jamais** une instruction imposée.

### Scène OPEN-STR-04 — Pression sur le botteur

- B15 voit A10 préparer le pied ; B15 privilégie la couverture du fond et ne monte pas sur le porteur si cela ouvre tout l'en-but.
- Un B13 onside et proche peut choisir d'exercer une pression légale sur A10.
- Test : pas de « charge commune » commandée à tous.

### Scène OPEN-STR-05 — Fin de match et stratégie

- A mène de 3 points à la 78e ; une action risquée de passe large est moins attractive qu'un portage avec soutien pour un joueur prudent.
- A est mené de 4 points à la 78e ; le même joueur peut privilégier la recherche d'essai si l'espace existe.
- Les poids changent via **le plan de jeu connu**, la perception du score et le profil du joueur ; le choix reste individuel et peut être imparfait.
- Les règles et la durée du match restent autoritatives.

## 6. Intelligence individuelle : évaluer les conséquences, pas scripts par poste

Proposition de sélection en deux étapes :

1. **Filtre réglementaire / physique strict** : le 8 lié ne peut pas courir, le sauteur encore en l'air ne peut pas porter, un plaquage hors-jeu est interdit, une passe en avant ne peut pas être considérée valide.
2. **Estimation comparative par l'agent**, qui peut se tromper : probabilité de conservation, avantage territorial, soutien réellement visible, risque de turnover, temps d'arrivée, fatigue, niveau technique, compatibilité avec plan de jeu, danger défensif si le joueur quitte sa zone.

```text
utility_i(option) =
  gainTerrain_i * weight_terrain
+ conservationProb_i * weight_possession
+ planDeJeuFit_i * weight_playbook
+ pressionSurAdversaire_i * weight_pressure
- temps_i * weight_time
- fatigue_i * weight_fatigue
- risqueTurnover_i * weight_turnover
- dangerDefensifCree_i * weight_gap

// Les poids dépendent de l'agent, du score, du temps et du plan de jeu.
// Le moteur n'utilise pas ces estimations pour déclarer une action réussie.
```

Le choix peut déclencher une séquence GOAP de plusieurs actions : `REGAIN_ONSIDE→CLOSE_GAP→TACKLE`, `GET_IN_POSITION→CATCH_LINEOUT→RELEASE_TO_9`, `ARRIVE_AT_BASE→PICK_BALL→PASS_TO_10`. **Chaque étape est conditionnée à une conséquence physique réellement observée**, puis le plan est réévalué.

### Anti-oscillation et compromission

- Conserver un engagement bref tant que le plan reste raisonnable.
- Un danger vital, une faute probable ou une possession perdue peut interrompre sans délai.
- Le joueur ne peut pas changer 15 fois d'objectif pendant un lancer de touche uniquement parce qu'un coût fluctue légèrement.
- Les erreurs/latences individuelles doivent exister : un joueur expérimenté lit mieux mais n'est pas omniscient.
- Aucune recherche simultanée sur l'intégralité des 30 plans adverses (explosion combinatoire).

## 7. Communication et arbitrage

- `BALL`, `MINE`, `INSIDE`, `OUTSIDE`, `SUPPORT`, `COVER`, `UP`, `SLIDE`, `KICK` fournissent des indices à portée limitée : voir `08_COMMUNICATION_LOCALE.md`.
- Ces messages modifient au plus la **perception et l'estimation** d'un joueur ; ils ne forcent ni but, ni trajectoire, ni passe.
- Les phases de conquête respectent l'arbitre : une stabilité de mêlée, une formation de touche ou un ballon gagnable n'est pas décidé par les plans des agents.
- Les **lois de World Rugby** sont des conditions obligatoires ; les coûts stratégiques et « % de succès » sont des **hypothèses de gameplay à calibrer**, pas des probabilités ou timings officiels.

## 8. Scénarios de réception à écrire dans les tests (non exécutables avant intégration)

| ID | Perturbation contrôlée | Décision attendue de l'agent |
|---|---|---|
| STR-01 | mêlée A gagnée, 8 voit petit côté vide | A8 peut choisir départ légal au lieu d'attendre le 9 |
| STR-02 | même mêlée, petit côté fermé, 10 libre | A8 retient ballon, A9 peut servir 10 ; deux plans individuels |
| STR-03 | A perd mêlée, 6 encore lié | A6 ne se téléporte pas ; prépare `DEFEND` après libération |
| STR-04 | B9 veut presser avant sortie légale | son plan est bloqué par ligne hors-jeu |
| STR-05 | fond de touche marqué, proche libre | 9 demande l'avis du 10 puis peut annoncer une touche devant ; lanceur applique légalement selon son observation |
| STR-06 | réception touche, possibilité maul ou passe | porteur compare options et attend contact/ballon réels |
| STR-07 | B gagne touche, soutiens A indisponibles | A replanifie individuellement vers défense après actions légales |
| STR-08 | cri de sauteur non entendu | aucune télépathie ni changement automatique de lancer |
| STR-09 | ligne adverse ferme la passe A12→A13 | A12 fixe, porte ou choisit option légale autre que passe extérieure |
| STR-10 | turnover en plein jeu | A11/A7/A15 prennent 3 décisions différentes |
| STR-11 | A14 appelle, mais passe avant/interceptable | A10 peut ignorer l'appel |
| STR-12 | botteur adverse menacé, couverture arrière libre | B15 garde profondeur, B13 peut monter |
| STR-13 | score +3 vs -4 à deux minutes de la fin | choix tactiques différents selon enjeu, à conditions physiques équivalentes |
| STR-14 | action au départ valide, puis 9/10 indisponible | replan vers autre solution, aucune réussite virtuelle |
| STR-15 | mêmes observations + même graine | mêmes options et intentions, indépendamment de FPS/replay |
| STR-16 | changer seul le plan de jeu lu par un joueur dans un test isolé | **seul** son choix change directement ; aucune décision globale écrite sur ses partenaires |

Les tests STR n'existent encore **que comme spécifications**. Créer `server/test-v4-individual-strategy.js` et l'injecteur `RM4-G02` avant de les qualifier de réussis.

## 9. Tâches à ajouter au plan Claude Code

- **RM4-G05** : la sélection de but comporte la défense et des objectifs stratégiques (marquer, conserver, presser, gagner terrain) selon possession/score/temps.
- **RM4-G06** : stratégies candidates en phases SCRUM/LINEOUT/OPEN_PLAY, gardes légales et estimation individuelle, pas de contrôle global.
- **RM4-G08** : replanification si une option choisie devient impossible ; appels de partenaires traités comme observations.
- **RM4-G12/13/14/15/16** : choix individuels des agents impliqués dans le jeu courant.
- **RM4-G19** : décisions 8/9 après la mêlée, sans « plan d'équipe » émettant l'issue.
- **RM4-G20** : choix du lanceur, du sauteur, du receveur et du 9 après touche, sans script de résultat.
- **RM4-G17** : défense prioritaire par joueur, sans assignation collective.
- **RM4-G28/29** : rapport sur fréquences de stratégies par joueur et échecs/alternatives en 30/100/500 graines.

**Critère de fin :** dans trois scènes (une mêlée, une touche, un plein jeu), un même joueur est capable de choisir **au moins deux plans tactiques distincts** quand on ne modifie qu'une seule observation pertinente ; les actions sont exécutées légalement dans le moteur et la décision appartient au joueur.
