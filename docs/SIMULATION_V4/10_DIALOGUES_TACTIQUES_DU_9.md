# V4 — Dialogues tactiques à l'initiative du n°9, et choix en mêlée, touche et jeu courant

**Décision produit du 8 novembre 2026.** Dans les situations tactiques considérées ici, le **demi de mêlée (n°9) prend l'initiative de la demande** : il échange avec l'ouvreur (n°10) sur la touche ; il recueille des informations auprès des avants sur la mêlée, puis exprime sa demande ; en plein jeu, il prévient les trois-quarts avant de tenter une chandelle (*up-and-under*). Ce sont **des discussions entre agents autonomes**, jamais des commandes émanant d'une IA d'équipe.

**Statut :** scénario de conception, protocole d'appels étendu et tests de transport. L'IA de match ne dialogue **pas encore réellement**. Le transport connaît les appels et sait gérer un `toId` et un `replyTo` ; l'IA GOAP de chaque participant doit encore être raccordée.

## 1. Principe de communication : celui qui parle ne possède pas le cerveau de celui qui écoute

- Le n°9 **demande, consulte, propose et annonce**.
- Le n°10 donne son avis suivant ce qu'il voit : défense, largeur, nombre de joueurs, espace, emplacement du terrain.
- Les avants répondent suivant les faits physiques qu'ils perçoivent : stabilité, fatigue, pression, possession, sauteurs disponibles.
- Le n°9 choisit sa **propre** option tactique : passe, lancement, demande de poussée, jeu au pied.
- Le lanceur, le sauteur, le pilier et chaque arrière peuvent **accepter, interpréter, retarder ou abandonner** la demande selon leur but, l'état du ballon, la loi et la faisabilité.
- Le moteur du match est l'autorité sur le résultat, jamais les messages.
- L'absence d'un appel, une réponse tardive ou un appel non compris ne fige pas le jeu : chaque agent possède un plan de secours.

La communication n'est **pas** une IA collective : pas de `TeamCoordinator`, pas de `TeamBlackboard`, pas de distribution centralisée de postes, pas de modification des `goalId` ou des `targets` des partenaires.

## 2. Protocole de conversation minimal

```text
OBSERVE (n°9 perçoit)
  -> REQUEST (n°9 pose une question à un ou plusieurs joueurs précis)
  -> REPLY [optionnelle] (le destinataire fournit son observation/proposition)
  -> EVALUATE (n°9 choisit lui-même parmi les options légales connues)
  -> ANNOUNCE (n°9 émet une demande courte audible)
  -> INTERPRET (chaque coéquipier qui entend décide individuellement)
  -> EXECUTE / CANCEL / REPLAN (résultats physiques et observations)
```

Le protocole est **asynchrone, limité dans le temps** et tolère les messages perdus :
- aucune attente illimitée d'un n°10 non disponible ou d'un 8 plaqué ;
- n°9 peut continuer avec son observation seule ;
- appels spécifiques à la phase ; un appel de touche reçu après la remise en jeu est obsolète ;
- une nouvelle instruction remplace l'intention ancienne uniquement pour le joueur qui la reçoit **et qui décide de la suivre** ;
- une demande `KICK_HIGH` ne compte pas comme un coup de pied : seule l'action physique du botteur donne lieu à `KICK`.

Les signaux courts utilisent `LocalCommunication.emit({speakerId,team,kind,x,y,time,toId?,replyTo?})`. `toId` est un identifiant de **destinataire audible choisi**, pas un joueur commandé. `replyTo` fait référence à un appel antérieur ; il relie une réponse à une question sans créer une action collective.

## 3. Touche : discussion n°9 ↔ n°10, **demande initiée par le 9**

Scène : touche A près de la médiane, A en possession du lancer, défense B renforcée au fond.

| Temps logique | Locuteur → destinataire | Message | Décision réelle |
|---|---|---|---|
| t0 | A9 → A10 | `LINEOUT_ASK` : « Touche, on joue quoi ? » | le 9 prend l'initiative et demande l'avis du 10 |
| t0+latence | A10 → A9 | `LINEOUT_FRONT`, `LINEOUT_MIDDLE`, `LINEOUT_BACK` ou `LINEOUT_WIDE` | 10 propose selon le fond défensif qu'il perçoit |
| t1 | A9 → proches | `LINEOUT_FRONT` ou `LINEOUT_MAUL` / `LINEOUT_WIDE` | le 9 fait **sa demande** après évaluation de l'avis du 10 |
| t2 | A2 lanceur, A4/A5 sauteurs, soutiens | perception d'appel + observation du placement réel | chacun adapte son plan individuel, sans ordre magique |
| t3 | l'arbitre, le ballon, les participants | lancer, duel, réception éventuelle | issue autoritative, puis nouveaux buts pour les 30 joueurs |

**Choix à comparer par le 9** :
1. lancer devant : accessible, rapide, peut déboucher sur conservation ;
2. lancer au milieu : options de maul ou distribution ;
3. lancer au fond : permet une sortie rapide ou un espace, mais la contestation peut être forte ;
4. lancement de maul **si réception et liaisons légales réellement obtenues** ;
5. jeu au large : préparer un receveur et une passe après réception ;
6. choix de réduire les risques près de sa ligne d'en-but ;
7. alternative remise rapide **uniquement si les préconditions légales existent**, pas après formation normale par défaut.

**Ce qui appartient à qui :**
- A9 : prend l'avis du 10, choisit sa propre demande, se place pour récupérer ou défendre, prépare une alternative.
- A10 : répond, choisit son replacement et le plan de jeu au large selon menace.
- A2 : décide s'il peut exécuter le lancer demandé (timing, présence du sauteur, loi) ; le lanceur demeure l'auteur physique du lancer.
- A4/A5 : choisissent leur course, leur saut et leur synchronisation avec les soutiens selon un plan de jeu connu.
- A8 : après réception, peut choisir maul ou sortie selon les adversaires et les soutiens disponibles.

**Tests STR-DIA-L01 à L05** :
- L01 le premier message stratégique est une demande d'A9 à A10 ;
- L02 A10 répond par un message adressé à A9 et lié à la demande ;
- L03 le 9 peut retenir une autre option que celle suggérée par 10 si ses informations divergent ;
- L04 un joueur trop loin n'entend pas, donc ne reçoit pas de changement instantané de plan ;
- L05 les événements `BALL_RELEASE`, `LINEOUT_THROW` et `CATCH` restent déclenchés par les participants/moteur, et non par le message.

## 4. Mêlée : le 9 recueille des informations puis **demande** une approche

Le 9 peut observer la défense et écouter les avants, spécialement son 8 et les joueurs de première ligne. Il pose par exemple `SCRUM_ASK` (« Mêlée, comment ça tient ? »), puis reçoit des informations (stabilité, poussée adverse, rotation ou risque de déséquilibre).

| Option envisagée | Nature | Conditions / conséquences attendues |
|---|---|---|
| **Mêlée normale/stable** | légale | maintenir les liaisons, talonner, conserver et sortir ballon |
| **Poussée forte, gagner du terrain** | légale SI rectiligne, parallèle au sol et après introduction | gain physique possible, fatigue plus forte, risque d'instabilité |
| **Mêlée qui tourne** | événement physique possible, pas un résultat commandé | poussées déséquilibrées et frottements ; si rotation au-delà de 90°, arrêt/remise en place selon loi ; pousser volontairement de travers expose à une pénalité |
| **Mêlée qui tombe** | événement dangereux, parfois accident ou faute | sifflet immédiat ; si l'effondrement est volontaire, infraction sanctionnée ; **jamais une stratégie légale à réussir** |
| **Sortie par 8 / 9** | légale lorsque ballon disponible dans les conditions de la loi | 8 peut partir avec ballon, 9 peut distribuer, selon qui peut réellement jouer le ballon |
| **Attaque petit côté / large** | dépend de la sortie réelle | après sortie, 9 évalue défense, 10 et soutien disponibles |

**À coder sans trucage :**
- n°9 peut demander `SCRUM_STEADY` ou `SCRUM_DRIVE`, mais ses paroles n'ajoutent pas directement une force au paquet : les avants **décident individuellement** de leur effort, de leurs appuis et de la stabilité.
- n°9 écoute `SCRUM_PRESSURE` (« Ça tourne ! ») et `SCRUM_UNSTABLE` (« Ça lâche ! »). Ce sont **des observations/alertes**, pas des ordres de faire tourner ou tomber la mêlée.
- la poussée ne démarre qu'**après l'introduction**. L'effort doit être orienté droit et parallèlement au sol ; la loi 19.19 prévoit une pénalité dans les cas contraires.
- la rotation excessive (au-delà de 90°) entraîne une remise en place si aucune faute n'est relevée (loi 19.34.c). Les infractions d'angle/collapsing volontaire peuvent entraîner des pénalités.
- tout effondrement interrompt **immédiatement** la mêlée (19.25). L'effondrement volontaire est une faute dangereuse (19.37.d).
- le n°9 n'a pas la capacité d'imposer à un pilier la position, l'appui et le déplacement de son corps.

**Tests STR-DIA-S01 à S07** :
- S01 A9 consulte A8, A8 répond stabilité/pression, A9 choisit sa demande ;
- S02 à effort identique, changer uniquement la stabilité et la fatigue d'un pilier peut changer sa réponse et son effort ;
- S03 demander poussée forte **avant** l'introduction n'autorise aucune poussée ;
- S04 demande de poussée après introduction, effort légal : résultat de poussée déterminé par moteur, pas une victoire garantie ;
- S05 rotation au-delà de 90° : remise en place si absence de faute, pas « gain de mêlée » automatique ;
- S06 poussé intentionnellement hors de l'axe : contrôle arbitral et sanction si infraction ;
- S07 effondrement, volontaire ou non : arrêt immédiat, qualification et pénalité si faute.

**Source réglementaire faisant autorité :** <https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/> (19.17, 19.19, 19.25, 19.34, 19.37).

## 5. Plein jeu : quand l'attaque stagne, le 9 annonce la **chandelle / up-and-under**

Le ballon ne progresse pas à travers plusieurs phases, la défense tient sa ligne et le 9 perçoit une opportunité de contest aérien. Il peut privilégier une **chandelle** (coup de pied haut et relativement court) au lieu d'une passe supplémentaire ou d'un portage sans gain.

**Ce choix n'est pas automatique** à chaque séquence stérile :
- nombre de phases stagnantes et mètres gagnés effectivement mesurés ;
- position du terrain et risque de perte ;
- temps de vol et zone de retombée ;
- partenaires capables de chasser le ballon et légalement remis en jeu ;
- défenseurs en couverture, possibilité de réception adversaire, vent et compétence du botteur si modélisés ;
- score, temps restant, stratégie générale de conservation/pression.

**Protocole demandé par le propriétaire :** le 9 **prévient les trois-quarts avant de botter**, via un signal vocal court `KICK_HIGH` (« Chandelle ! ») éventuellement suivi de `KICK_CHASE` (« Chasse ! »).

```text
A9 observe : progression faible sur plusieurs phases
  → A9 évalue PRESS_BY_HIGH_KICK versus KEEP_POSSESSION / PASS / BOX_KICK
  → A9 choisit le but CONTEST_AERIAL_BALL
  → A9 émet "Chandelle !" (KICK_HIGH) à destination des coéquipiers proches
  → A11/A12/A13/A14/A15 qui entendent réévaluent INDIVIDUELLEMENT
        RECEIVER_COVER / CHASE_KICK_ONSIDE / HOLD_BACKFIELD / STAY_ONSIDE
  → délai réel d'écoute, choix et déplacement ; l'IA peut renoncer au pied
  → A9 frappe seulement s'il possède le ballon et l'action reste légale
  → le ballon vole selon la physique ; les joueurs poursuivent légalement
  → réception/contest par moteur, aucune récupération "assurée" par l'annonce
```

**Ne pas confondre :** `up-and-under` = chandelle / *Garryowen*, coup de pied haut pour contester le ballon. Le `box kick` depuis la base du ruck est une autre technique de sortie du 9 ; elles peuvent partager des caractéristiques physiques mais pas forcément le point de frappe et le but tactique.

### Exemple de déroulé (instants synthétiques, pas timing règlementaire)

| Temps | Événement | Test |
|---|---|---|
| 0,0 s | A9 voit 3 phases sans franchissement | évalue les options, peut préférer chandelle |
| 0,1 s | A9 annonce `KICK_HIGH` | événement vocal horodaté, pas encore de ballon en l'air |
| 0,2–0,6 s | trois-quarts proches entendent, se préparent | chacun crée son propre plan, personne ne se téléporte |
| 0,6 s | A9 peut lancer le coup de pied | ballon effectivement libéré seulement par l'action de botter |
| 1,0–4,0 s | trajectoire et course de chasse | vitesse, hors-jeu, réception adversaire et temps d'arrivée |
| 4,0 s et plus | réception/contestation et nouvelle possession | résultat moteur, changement individuel des buts |

**Les durées ne constituent pas un script** : la décision de pied peut être retardée/annulée si défenseur proche ou ballon indisponible.

**Tests STR-DIA-K01 à K08** :
- K01 plusieurs phases bloquées augmentent l'intérêt possible du `KICK_HIGH`, mais la passe reste candidate ;
- K02 A9 émet l'appel **avant** de frapper, lors d'une préparation observable ;
- K03 A11/A14 n'entendent que si proches ; pas de transmission télépathique ;
- K04 un ailier hors-jeu ne peut pas chasser avant remise en jeu, malgré l'appel ;
- K05 réception aérienne et réussite de la chasse résultent de la physique, jamais de l'annonce ;
- K06 A9 renonce au pied après l'annonce si son plan est devenu mauvais ;
- K07 A15 peut **rester en couverture** tandis que A11 chasse, selon les situations individuelles ;
- K08 changer les perceptions d'un seul arrière ne modifie pas directement les plans des 29 autres.

## 6. Catalogue des messages déjà disponibles

Le transport V4 (`engine/ai/local-communication.js`) connaît désormais **24 codes** : 11 appels simples et 13 messages de dialogue tactique.

```text
MINE, BALL, INSIDE, OUTSIDE, SUPPORT, HOLD, UP, SLIDE, COVER, KICK, LEAVE
LINEOUT_ASK, LINEOUT_FRONT, LINEOUT_MIDDLE, LINEOUT_BACK, LINEOUT_MAUL, LINEOUT_WIDE
SCRUM_ASK, SCRUM_STEADY, SCRUM_DRIVE, SCRUM_PRESSURE, SCRUM_UNSTABLE
KICK_HIGH, KICK_CHASE
```

Une demande du n°9 au n°10 peut utiliser `toId:'A10'`. La réponse du 10 contient `toId:'A9'` et `replyTo:'CALL-…'`. Puis le 9 peut annoncer une option aux partenaires proches. Cette distribution de messages **n'attribue pas** de cible à leurs agents : chaque récepteur reste libre de sélectionner son but.

**Limites du prototype :** pas de son audio ; aucune garantie d'audibilité à 30 m, pas de mémoire durable, pas de moteur de stratégie du 9 déjà raccordé ; les réponses peuvent manquer ou arriver trop tard. Les paramètres de portée et de latence sont des hypothèses, à calibrer.

## 7. Tests et étapes Claude Code

Tests déjà exécutables :
- `node server/test-v4-local-communication.js` — 24 tests de transport, dont huit nouveaux scénarios de messages adressés et réponse.
- `node server/test-v4-tactical-dialogue.js` — scénarios de conversations **symboliques** entre 9, 10 et avants, et annonces de pied ; il ne valide pas encore une stratégie sur 80 minutes.

Travail encore à réaliser :
- **G31** : la décision `ASK/REPLY/ANNOUNCE` par le 9, avis du 10 et des avants, réceptions individuelles, replanification, dialogues de touche/mêlée.
- **G32** : efforts de mêlée normaux/forts, rotation physique, risques de déséquilibre et fautes, règles appliquées par l'arbitre, aucune réussite automatique sur appel.
- **G33** : identification d'un jeu stagnant, préférence éventuelle `UP_AND_UNDER`, annonce préalable, attente de réception par partenaires proches, chasseurs onside, résultat physique.
- **G04/G08/G09** : intégrer la communication individuelle et l'horloge déterministe au moteur, sinon les conversations restent un outil sans gameplay.
- **G19/G20** : conserver les phases réglementaires existantes et y raccorder les nouveaux choix ; tout changement doit passer `test-melee.js`, `test-touche.js`, `test-invariants.js` et comparaison multi-graines.

**Critères finaux :** des plans de jeu connus de tous, un 9 qui **demande réellement** et tient compte d'informations, un 10 qui répond en touche, des avants qui décident de leur effort, des trois-quarts prévenus avant la chandelle, et **30 décisions individuelles**, sans IA collective.
