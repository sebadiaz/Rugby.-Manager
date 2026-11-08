# Rugby Manager V4 — communication simple, locale et **sans chef d'orchestre**

**Décision produit :** les joueurs communiquent **entre eux**, sans créer d'IA collective. Chaque joueur garde son propre cerveau GOAP (perception → buts → plan → locomotion). Un appel est une **observation nouvelle**, non une consigne obligatoire. L'appelant décide individuellement de parler ; l'auditeur décide individuellement d'y réagir ou non.

**Statut au 8 novembre 2026** : le **transport de messages** est codé et testé dans `engine/ai/local-communication.js`, y compris les **questions du 9 adressées au 10/8 et leurs réponses**. Voir `10_DIALOGUES_TACTIQUES_DU_9.md` pour le protocole mêlée/touche/chandelle. **Les agents de match n'émettent ni ne consomment encore ces appels** ; l'intégration aux vrais 30 agents est prévue dans les tâches RM4-G04, G08, G10 et G11. Aucune voix ni aucun son n'est encore joué.

## 1. Parler est une action individuelle, entendre est une perception

Le joueur possède déjà un `AgentContext` : monde perçu, mémoire, but, plan, action courante et contrôleur de déplacement.

```text
                         PLAN DE JEU COMMUN (LECTURE SEULE)
                                      |
                          +-----------+-----------+
                          v                       v
                    AGENT A9                     AGENT A12
           Observe sa situation             Observe sa situation
           Choisit SES buts                 Choisit SES buts
           Choisit SON plan                 Choisit SON plan
           Décide de crier "Ballon !"       Écoute dans son rayon
                          |                       ^
                          v                       |
                    LocalCommunication ------------+
                      (simple transport
                       de paroles, aucun but,
                       aucune cible, aucun ordre)
                                                  |
                                     Met à jour SES croyances
                                     Décide lui-même d'agir
                                     et de se déplacer
```

Le 8 qui décide de prendre le ballon peut émettre le message urgent `SCRUM_8_GOING` à son 9, avec un `phaseId` spécifique à cette mêlée, **avant** la prise. `SCRUM_8_READY` exprime seulement sa disponibilité, et `SCRUM_8_ABORT` son abandon. Le 9 qui entend doit **replanifier dans son propre AgentController** pour ne pas tenter de prendre la balle au même instant ; **le transport ne modifie aucun plan**. Une alerte urgente ne peut pas être bloquée par le cooldown après « prêt » : une alerte de chaque sorte par mêlée est permise. Voir `12_STYLES_ANGLETERRE_AFRIQUE_DU_SUD_NOUVELLE_ZELANDE.md`.

Un appel ne peut pas modifier directement `player.x`, `player.y`, `goalId`, `plan`, `ball.carrier`, `possession` ou l'arbitrage. Il n'existe pas de `TeamCommunicationBrain`, `TeamCoordinator`, tableau noir décisionnel ni allocation de rôle.

## 2. Le vocabulaire V1 : onze appels courts + treize messages tactiques du 9

La parole est une intention **limitée**, pas un message structuré contenant les positions ou les plans cachés des autres.

| Code | Appel | Cas typique | Influence POSSIBLE sur le but de celui qui entend |
|---|---|---|---|
| `MINE` | « J'ai ! » | réception disputée | un voisin peut éviter de converger sur le même ballon |
| `BALL` | « Ballon ! » | demande de passe | le porteur peut reconsidérer un receveur libre |
| `INSIDE` | « Intérieur ! » | option de soutien intérieur | le porteur peut vérifier le couloir intérieur |
| `OUTSIDE` | « Extérieur ! » | aile disponible | un joueur peut conserver la largeur ou chercher l'extérieur |
| `SUPPORT` | « Soutien ! » | partenaire présent au contact | le porteur peut tenter de protéger ou transmettre le ballon |
| `HOLD` | « Tiens ! » | ligne défensive fragile | un défenseur peut privilégier `HOLD_LINE` |
| `UP` | « Monte ! » | pression défensive possible | un défenseur peut envisager `PRESS_RECEIVER`, **si légal** |
| `SLIDE` | « Glisse ! » | surnombre adverse au large | un défenseur peut réévaluer `CLOSE_GAP` |
| `COVER` | « Je couvre ! » | joueur en couverture | un partenaire peut couvrir un autre espace |
| `KICK` | « Pied ! » | botteur prêt, ballon aérien | un arrière peut réévaluer `COVER_BACKFIELD` |
| `LEAVE` | « Laisse ! » | réception à deux ou ballon dangereux | un voisin peut abandonner sa prise de balle |

**IMPORTANT** : vingt-quatre messages tactiques sont disponibles : `LINEOUT_ASK/FRONT/MIDDLE/BACK/MAUL/WIDE`, `SCRUM_OPTIONS_ASK/NEAR/WIDE/ADVANCE`, `SCRUM_8_ASK/READY/BLOCKED/BREAK/GOING/ABORT` et `SCRUM_9_ACK`, `SCRUM_ASK/STEADY/DRIVE/PRESSURE/UNSTABLE`, `KICK_HIGH` et `KICK_CHASE`. `toId` permet une question ciblée et `replyTo` une réponse ; voir `10_DIALOGUES_TACTIQUES_DU_9.md`. Ces effets sont **des réactions candidates**, pas des affectations. L'auditeur recoupe toujours le signal avec ses autres perceptions. Un appel `UP` n'autorise pas à franchir une ligne de hors-jeu. Un appel `BALL` n'oblige pas le porteur à passer.

### Portées et durées par appel (hypothèses gameplay V1)

| Code | Portée maximale | Durée de validité |
|---|---:|---:|
| MINE | 14 m | 1,2 s |
| BALL | 17 m | 1,4 s |
| INSIDE / OUTSIDE | 18 m | 1,5 s |
| SUPPORT | 16 m | 1,4 s |
| HOLD | 16 m | 1,2 s |
| UP / SLIDE | 19 m | 1,3 s |
| COVER | 18 m | 1,5 s |
| KICK | 22 m | 1,5 s |
| LEAVE | 15 m | 1,0 s |

Ces chiffres ne sont **pas des lois du rugby** ni des performances mesurées. Les ajuster après tests de lisibilité et de décision. Le prototype ajoute un délai de traitement de 0,12 s, une propagation selon 343 m/s et un anti-spam de 0,7 s entre deux appels d'un même joueur. Le temps est **celui du match simulé**, jamais `Date.now()`.

## 3. Protocole technique V1 (déjà implémenté, transport seul)

```js
const { LocalCommunication } = require('./engine/ai/local-communication');
const comm = new LocalCommunication();

// A9 choisit INDIVIDUELLEMENT de demander le ballon :
comm.emit({ speakerId:'A9', team:'A', kind:'BALL',
            x:50, y:30, time:10.0 });

// A10 est proche : il peut ENTENDRE, mais son IA décide de la suite :
const calls = comm.hear({ listenerId:'A10', team:'A',
                         x:53, y:30, time:10.2 });
// calls[0] = {id, from:'A9', kind:'BALL', label:'Ballon !',
//             spokenAt:10, heardAt:10.2, confidence:...}
```

`LocalCommunication` accepte aussi `toId` (coéquipier destinataire) et `replyTo` (identifiant d'appel). Une question adressée n'est pas automatiquement audible par les autres coéquipiers ; une réponse ne leur donne pas de but ni de position. Le n°9 peut consulter le 10 sur la touche, son 8 sur la mêlée et prévenir les trois-quarts avant une chandelle.

`LocalCommunication` fournit :
- `emit(speaker)` : crée un événement temporaire **uniquement** si l'appel est autorisé et hors cooldown ;
- `hear(listener)` : livre **une seule fois** les messages de son équipe entendus dans la portée pendant leur validité ;
- `prune(matchTime)` : retire les événements périmés ;
- `pendingCount()` : instrumentation et budget mémoire ;
- `CALLS` : le catalogue fermé, aucune commande arbitraire transmise.

Les **coordonnées de l'émetteur restent internes au calcul de portée** ; le message livré ne révèle ni trajectoire cible, ni plan du locuteur, ni positions des adversaires. Le transport n'écrit pas sur les agents.

La V1 ne transmet les messages **qu'aux coéquipiers** : simplification de compréhension tactique, même si dans un vrai match un adversaire pourrait physiquement entendre la voix. Un futur modèle pourra distinguer le son entendu et sa compréhension, mais ne doit pas fournir aux adversaires un accès direct aux plans internes.

## 4. Comment générer un appel : **aucun automatisme central**

Le contrôleur de **chaque** joueur peut décider de parler s'il a un motif et si l'appel reste pertinent. Exemple de production possible, à intégrer et tester :

```ts
function maybeSpeak(agent: IndividualAgent, beliefs: IndividualBeliefs) {
  // Exemple de critères ; le joueur décide avec ses perceptions.
  if (agent.goalId === 'BE_PASS_OPTION' &&
      beliefs.receiverLaneClear && beliefs.ballCarrierVisible) {
    return { kind:'BALL', reason:'I_AM_OPEN' };
  }
  if (agent.goalId === 'COVER_BACKFIELD' &&
      beliefs.teammateNearby && beliefs.kickThreatHigh) {
    return { kind:'COVER', reason:'I_HOLD_DEEP' };
  }
  return null; // la majorité du temps : silence
}
```

Ce pseudo-code illustre les déclencheurs. **Il n'est pas une API implémentée**, et doit devenir un composant individuel réutilisable, pas un `if(numero===15)` codé en dur. Le nombre d'appels est limité par situation, l'anti-spam et l'intérêt tactique pour l'auditeur.

La parole est liée à un **but de communication** (`INFORM_NEARBY`, `REQUEST_BALL`, `WARN_DANGER`) si le futur GOAP l'exige, mais elle ne doit pas interrompre tous les gestes physiques. Un joueur peut crier pendant qu'il court ; le signal n'est pas un déplacement.

## 5. Comment l'auditeur réagit : **il choisit**

Ne jamais écrire `if (heard.kind === 'UP') player.target = forwardTenMeters`.

Pipeline correct :

1. `hear()` délivre une **observation datée** avec auteur, type et confiance.
2. `AgentBeliefs` conserve cette observation temporairement (pas de vérité éternelle).
3. L'agent réévalue ses buts **si** l'appel apporte une information importante.
4. Le planificateur peut retenir son ancien plan ou chercher une alternative.
5. Seul le contrôleur de ce joueur émet sa nouvelle intention de mouvement.

Exemple : B13 entend `UP` alors que son pied est derrière la ligne hors-jeu et que B15 est seul en couverture. Il peut décider de **tenir sa ligne** malgré l'appel. Un autre joueur, onside et mieux placé, peut monter. **C'est voulu.**

## 6. Trois scènes de validation

### COM-S01 — Sortie de ruck

A9 près du ballon, A10 à 8 m, A12 à 14 m, A14 à 30 m. A10 crie `BALL`.
- A9 reçoit après latence, A14 n'entend pas s'il est hors portée.
- A9 conserve son autonomie, évalue la ligne de passe, peut passer au 10 **ou pas**.
- Un défenseur ferme le couloir dans le même tick : la garde de passe et l'arbitre prévalent sur l'appel.

### COM-S02 — Défense et couverture

B15 voit un coup de pied probable et annonce `COVER`. B13 entend `COVER` et peut préférer rester dans son intervalle ou se déplacer vers une autre menace.
- B15 ne modifie pas directement la cible de B13.
- Modifier le but de B15 ou son appel n'écrit pas le `goalId` de B13.
- Si B13 est hors-jeu, il se remet en jeu avant toute pression.

### COM-S03 — Deux joueurs sous un ballon haut

A11 et A15 convergent vers une réception, A15 crie `MINE`.
- A11 entend à portée et peut renoncer à la réception si celle-ci devient risquée.
- A11 peut quand même contester si le ballon, l'espace et sa compétence le justifient.
- Le **moteur**, pas la communication, attribue la réception/erreur.

## 7. Tests livrés et tests à développer

### Tests déjà exécutables

`node server/test-v4-local-communication.js` : **37 tests** `COM-01` à `COM-16` du transport :
1. catalogue fermé ; 2. latence ; 3. livraison unique ; 4. isolement des équipes ;
5. portée ; 6. rapprochement avant expiration ; 7. expiration ; 8. pas d'écho au locuteur ;
9. indisponibilité ; 10. anti-spam ; 11. ordre déterministe ; 12. replay identique ;
13. mémoire bornée ; 14. entrées invalides ; 15. désactivation ; 16. absence de mutation de l'agent.

Vingt-et-un cas supplémentaires `COM-17`–`COM-37` testent les messages adressés, questions/réponses, la demande de mêlée et l'annonce de chandelle. En outre, `node server/test-v4-tactical-dialogue.js` exécute **18 scénarios de dialogue symbolique**.

Ces tests **ne prouvent pas** que les joueurs du match parlent déjà ni qu'ils sont réellement autonomes.

### Tests à créer au moment de l'intégration

| ID | Changement de circonstance | Assertion |
|---|---|---|
| COM-I01 | A10 crie `BALL`, A9 est proche et couloir ouvert | le signal arrive **dans les croyances d'A9**, puis A9 **peut** replanifier, sans passe garantie |
| COM-I02 | mêmes positions, A9 hors-jeu / ballon inaccessible | aucune action illégale provoquée par le signal |
| COM-I03 | appel `UP` entendu par deux défenseurs | **deux décisions individuelles distinctes** si situations/attributs différents |
| COM-I04 | retirer tous les appels du match | le jeu reste possible ; buts et déplacements calculés sans communication |
| COM-I05 | appel obsolète, ballon changé de phase | appel ignoré, aucun plan périmé imposé |
| COM-I06 | 30 agents, 80 minutes simulées | aucun spam non borné, pas de dérive mémoire, déterminisme sur graines identiques |
| COM-I07 | un joueur annonce `COVER` à tort | le partenaire peut confronter signal et état observé, pas de vérité imposée |
| COM-I08 | accélération x4 / replay | mêmes appels et décisions en temps simulé, pas dépendants du FPS |
| COM-I09 | joueur au sol, sin-bin ou hors du terrain | pas d'émission/réception en violation des disponibilités définies |
| COM-I10 | changer uniquement la perception d'un destinataire | **seul** son plan peut changer directement, jamais attribution globale |

À intégrer dans les tests de `RM4-G04` (perception), `G08` (AgentController), `G09` (horloge déterministe), `G10` (placement individuel) et `G11` (30 agents).

## 8. Limites et comportement en cas de défaut

- Pas de **son véritable** : le moteur transporte des messages symboliques ; leur rendu sonore ou sous-titre est une tâche ultérieure facultative (`RM4-G25/G26`).
- Pas de recherche de traduction linguistique ou de LLM par joueur.
- Pas d'information précise sur les intentions adverses transmise par « télépathie ».
- Si l'agent n'a pas d'information, il planifie **sur ses propres croyances**.
- Si 2 partenaires cherchent le même ballon, leur conflit doit rester possible et être résolu par la physique/l'arbitrage, pas par une assignation centralisée.
- Le transport des messages peut être un objet commun **sans être une intelligence collective** : il n'est qu'un réseau acoustique, comparable au moteur de collisions.
- Les paramètres doivent rester configurables et mesurés sur de vrais lots de matchs ; ne pas présenter les portées proposées comme des mesures authentiques.

## 9. Ordre d'intégration recommandé à Claude Code

1. Conserver `engine/ai/local-communication.js` comme transport **sans décisions**.
2. Dans `G04`, fournir à chaque agent une **boîte de réception propre**, limitée aux appels qu'il entend.
3. Dans `G08`, faire choisir au joueur quand émettre un appel, puis comment intégrer les appels entendus dans sa propre sélection de buts.
4. Dans `G09`, rattacher les émissions/réceptions au chronomètre de simulation et rendre les replays identiques.
5. Dans `G10`, faire émerger les lignes et les soutiens sans réservations ni assignations.
6. Dans `G11`, valider les 30 joueurs et le budget des appels.
7. Dans `G25/G26`, éventuellement afficher l'appel en petite bulle ou sous-titre lisible sans encombrer le terrain.

**Critère de rejet** : une PR dans laquelle un appel `UP`, `BALL` ou `COVER` donne directement un ordre de mouvement à un coéquipier. L'appel doit seulement fournir une information sur laquelle celui-ci raisonne.
