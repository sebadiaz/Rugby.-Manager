# V4 — Dialogues tactiques à l'initiative du n°9, et choix en mêlée, touche et jeu courant

**Décision produit du 8 novembre 2026.** Dans les situations tactiques considérées ici, le **demi de mêlée (n°9) prend l'initiative de la demande** : il échange avec l'ouvreur (n°10) **pour la touche et pour la mêlée**, et discute **expressément avec le n°8 d'un éventuel départ du 8 sur mêlée** ; le 9 choisit finalement l'option tactique et l'annonce ; en plein jeu, il prévient les trois-quarts avant de tenter une chandelle (*up-and-under*). Ce sont **des discussions entre agents autonomes**, jamais des commandes émanant d'une IA d'équipe.

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

## 4. Mêlée : le 9 consulte le 10 **et le 8**, puis choisit

La stratégie de mêlée appartient au **n°9**. Ce dernier collecte des informations pour décider **au près, au large, faire avancer la mêlée ou demander un départ du 8**. Le 10 participe à la lecture de la défense ; le 8 participe au choix de départ depuis l'arrière de la mêlée et à l'évaluation de la pression adverse. Les avants renseignent sur stabilité et poussée.

### Discussion complète

| Étape | Émetteur → destinataire | Appel | Décision ou observation |
|---|---|---|---|
| 1 | **A9 → A10** | `SCRUM_OPTIONS_ASK` : « Au près, au large ou on avance ? » | le 9 sollicite une lecture du déploiement adverse |
| 2 | A10 → A9 | `SCRUM_NEAR`, `SCRUM_WIDE` ou `SCRUM_ADVANCE` | **avis** du 10, dépendant des espaces observés |
| 3 | **A9 → A8** | `SCRUM_8_ASK` : « Huit, tu peux partir ? » | le 9 demande explicitement si un départ par le 8 est faisable |
| 4 | **A8 → A9** | `SCRUM_8_READY` ou `SCRUM_8_BLOCKED` | réponse fondée sur le ballon, la stabilité et la menace perçue ; pas de promesse de réussite |
| 5 | A9 → A8/avants si utile | `SCRUM_ASK` ; réponses `SCRUM_STEADY`, `SCRUM_PRESSURE`, `SCRUM_UNSTABLE` | renseignements supplémentaires sur la tenue du paquet |
| 6 | **A9 → partenaires à portée** | `SCRUM_NEAR`, `SCRUM_WIDE`, `SCRUM_ADVANCE` ou `SCRUM_8_BREAK` | **décision finale du 9**, potentiellement différente de la proposition du 10 |
| 7 | A8, A10, piliers et autres agents | chacun observe et décide de son propre geste et déplacement | le 8 ne part que s'il peut prendre réellement le ballon ; les autres agissent selon règles et perceptions |
| 8 | moteur + arbitre | ballon sorti / joué, poussée, faute éventuelle | issue physique et réglementaire, jamais attribuée par le message |

La question au 8 est **une discussion entre le 8 et le 9**, pas un « ordre » imposant au 8 d'abandonner le ballon. Si le 8 répond qu'il ne peut pas partir, le 9 peut décider de servir le 10 ou de faire avancer la mêlée, à condition que la situation le permette. Si le 8 se dit prêt mais que le ballon devient inaccessible, le plan s'annule ou change. Dans le modèle cible, le 9 coordonne **la décision tactique en parlant**, mais **aucune IA collective ne décide à sa place et il ne déplace pas physiquement les autres**.

### Options à évaluer

| Option | Nature | Conditions et conséquences |
|---|---|---|
| **Jouer au près** | légale | sortie courte, jeu avec le 8/9 ou avants, en fonction du ballon et de la couverture défensive |
| **Jouer au large** | légale | 9 peut servir le 10, puis les trois-quarts doivent être réellement disponibles |
| **Avancer / pousser fort** | légale si droite, parallèle au sol, après introduction | demande du 9 ; chaque avant choisit individuellement son effort ; le pack peut reculer l'adversaire ou échouer |
| **Départ du 8** | légale si sortie permise et ballon au fond | **négocié entre 9 et 8** ; le 8 contrôle le ballon, se détache et porte uniquement lorsqu'il le peut physiquement et légalement |
| **Mêlée stable** | légale | conserver la conquête, préparer une sortie contrôlée |
| **Mêlée qui tourne** | conséquence possible, mais pas victoire automatique | poussée déviée peut entraîner faute ; au-delà des critères réglementaires, arrêt/réinitialisation selon loi |
| **Mêlée écroulée** | incident dangereux / faute possible | arrêt immédiat ; effondrement volontaire interdit et sanctionnable, **pas une tactique légale** |

### Événements, limites et replanification

- A9 peut poser deux questions séparées et conserver les deux réponses : une du **10** sur la défense, une du **8** sur la faisabilité d'un départ. Chaque réponse peut manquer ou arriver trop tard.
- La réponse du 10 ne « vote » pas la tactique ; **le 9 tranche** et peut choisir une option différente.
- Le 8 n'est pas télécommandé : il choisit son départ et son trajet dans le cadre de la tactique demandée ; s'il n'a plus accès au ballon ou est toujours lié, il ne peut pas partir.
- Une annonce `SCRUM_8_BREAK` ne transfère pas le ballon. Seule l'action physique peut produire `SCRUM_EXIT_8` puis `CARRIED`.
- Le 9 ne peut pas passer tant que le ballon n'est pas réellement accessible à la base.
- Si la possession change, les agents réévaluent individuellement leurs buts de défense et les messages du plan précédent deviennent obsolètes.
- Les avants ne poussent qu'à l'instant légal ; pousser de travers et écrouler volontairement sont des infractions, pas des boutons de stratégie.

**Tests STR-DIA-S01 à S12 :**

- S01 le 9 **initie** la question tactique au 10 ; 10 répond près/large/avance.
- S02 le 9 **initie** la discussion de départ du 8 ; 8 répond disponible ou bloqué.
- S03 le 9 annonce sa décision en tenant compte des informations du 10 et du 8, **sans être obligé de suivre leurs conseils**.
- S04 le 8 accepte le départ mais ballon encore dans le tunnel ou inaccessible : aucune prise ni sortie magique.
- S05 le 8 n'est pas disponible : le 9 choisit une autre option sans blocage de l'IA.
- S06 changement de pression perçue : la réponse du 8 peut changer alors que le plan de jeu reste identique.
- S07 poussée forte **avant** l'introduction : aucune poussée légale engagée.
- S08 poussée forte **après** introduction : effort physique réel, résultat non garanti.
- S09 mêlée qui tourne au-delà de la tolérance légale : décision arbitrale correcte, pas une victoire donnée à l'avance.
- S10 poussée volontaire hors de l'axe : sanction si infraction.
- S11 effondrement volontaire ou non : arrêt immédiat, qualification et sanction si faute.
- S12 même graine, mêmes perceptions/réponses : mêmes demandes et décisions ; avis du 10 ou du 8 modifié → choix du 9 peut changer.

**Source réglementaire faisant autorité :** https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/ . Vérifier la version de loi et le règlement de la compétition ; ce document ne confère pas de légalité à une action simplement parce que le 9 la demande.

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

Le transport V4 (`engine/ai/local-communication.js`) connaît désormais **32 codes** : 11 appels simples et 21 messages de dialogue tactique.

```text
MINE, BALL, INSIDE, OUTSIDE, SUPPORT, HOLD, UP, SLIDE, COVER, KICK, LEAVE
LINEOUT_ASK, LINEOUT_FRONT, LINEOUT_MIDDLE, LINEOUT_BACK, LINEOUT_MAUL, LINEOUT_WIDE
SCRUM_OPTIONS_ASK, SCRUM_NEAR, SCRUM_WIDE, SCRUM_ADVANCE
SCRUM_8_ASK, SCRUM_8_READY, SCRUM_8_BLOCKED, SCRUM_8_BREAK
SCRUM_ASK, SCRUM_STEADY, SCRUM_DRIVE, SCRUM_PRESSURE, SCRUM_UNSTABLE
KICK_HIGH, KICK_CHASE
```

Une demande du n°9 au n°10 peut utiliser `toId:'A10'`. La réponse du 10 contient `toId:'A9'` et `replyTo:'CALL-…'`. Puis le 9 peut annoncer une option aux partenaires proches. Cette distribution de messages **n'attribue pas** de cible à leurs agents : chaque récepteur reste libre de sélectionner son but.

**Limites du prototype :** pas de son audio ; aucune garantie d'audibilité à 30 m, pas de mémoire durable, pas de moteur de stratégie du 9 déjà raccordé ; les réponses peuvent manquer ou arriver trop tard. Les paramètres de portée et de latence sont des hypothèses, à calibrer.

## 7. Tests et étapes Claude Code

Tests déjà exécutables :
- `node server/test-v4-local-communication.js` — tests de transport, dont huit nouveaux scénarios de messages adressés et réponse.
- `node server/test-v4-tactical-dialogue.js` — scénarios de conversations **symboliques** entre 9, 10 et avants, et annonces de pied ; il ne valide pas encore une stratégie sur 80 minutes.

Travail encore à réaliser :
- **G31** : la décision `ASK/REPLY/ANNOUNCE` par le 9, avis du 10 et des avants, réceptions individuelles, replanification, dialogues de touche/mêlée.
- **G32** : efforts de mêlée normaux/forts, rotation physique, risques de déséquilibre et fautes, règles appliquées par l'arbitre, aucune réussite automatique sur appel.
- **G33** : identification d'un jeu stagnant, préférence éventuelle `UP_AND_UNDER`, annonce préalable, attente de réception par partenaires proches, chasseurs onside, résultat physique.
- **G04/G08/G09** : intégrer la communication individuelle et l'horloge déterministe au moteur, sinon les conversations restent un outil sans gameplay.
- **G19/G20** : conserver les phases réglementaires existantes et y raccorder les nouveaux choix ; tout changement doit passer `test-melee.js`, `test-touche.js`, `test-invariants.js` et comparaison multi-graines.

**Critères finaux :** des plans de jeu connus de tous, un 9 qui **demande réellement** et tient compte d'informations, un 10 qui répond en touche, des avants qui décident de leur effort, des trois-quarts prévenus avant la chandelle, et **30 décisions individuelles**, sans IA collective.
