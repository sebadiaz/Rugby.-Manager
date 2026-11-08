# V4 — Lois 2026, temporalité des phases, arbitrage et cas testables

**Attention** : ce document est un cahier des charges de simulation et non une réécriture des Règles World Rugby. Les textes officiels de `passport.world.rugby` et les règlements particuliers des compétitions prévalent.

## 1. Profils de règles, dates et qualifications

Ajouter un registre **versionné par compétition**, pas un simple booléen global `lois2026`.

```ts
type LawProfile = {
  id:string;
  competitionStartDate:string; // YYYY-MM-DD
  union:string; level:'elite'|'community'|'junior';
  amendments: {
    july2026:boolean; maulGuidelineJune2026:boolean;
    headContactNov2026:boolean; kneeDropOct2026:boolean;
    hipDropNov2026:boolean; communityTackleHeight:boolean;
    replacementRed20min:boolean; tmoAvailable:boolean;
  };
  disciplinaryPolicy:string; // barème paramétré, pas de sanctions universelles inventées
}
```

- Les modifications de juillet 2026 visent les compétitions nouvelles à compter du 1er juillet (ou selon les modalités applicables localement). **Le début de la compétition prime sur la date du match.**
- La directive maul de juin 2026 est une **directive d'application** : elle n'invente pas une loi supplémentaire.
- Clarification 2-2026 (1er juin) : quand le contest d'un ruck est **manifestement terminé**, les actions d'un 9 qui manipule le ballon pour assurer la continuité peuvent être gérées sans matérialiser une infraction technique artificielle ; cela n'autorise pas la manipulation lors d'un contest actif.
- Le processus de contact avec la tête du 1er novembre 2026 remplace celui de 2023 ; la hauteur de plaquage communautaire dépend de la catégorie de compétition.
- Les cartons rouges remplaçables après 20 minutes et les exclusions définitives doivent rester deux cas distincts si le règlement de compétition les autorise.
- La présence d'un TMO n'est **pas automatique** en rugby amateur.

Sources : https://passport.world.rugby/laws-of-the-game/whats-new/2026-07-law-updates
https://passport.world.rugby/laws-of-the-game/law-clarifications/2026/clarification-2-2026/
https://passport.world.rugby/laws-of-the-game/law-application-guidelines/maul-june-2026/
https://passport.world.rugby/laws-of-the-game/law-application-guidelines/head-contact-process-1-november-2026/

## 2. Modèle temporel : trois horloges indépendantes

1. `matchClock` : temps écoulé et ballon en jeu/mort. Doit conserver la compatibilité avec `tempsMatch` et `tempsJeuEffectif`.
2. `phaseClock` : progression d'une machine d'états, réinitialisée uniquement quand l'état change.
3. `lawClock` : délai réglementaire **déclenché par un événement précis** (par exemple annonce "use it") ; jamais implicitement par la naissance d'un ruck.

**Exemple** : une phase peut avoir `phaseClock = 3.8 s` et `lawClock = 1.1 s` si l'arbitre n'a annoncé "jouez-le" qu'à t=2,7. Programmer une limite de 5 s depuis le premier contact de plaquage est faux.

Contrat d'horloge :
```ts
{
  name:'RUCK_USE_IT'|'SCRUM_READY'|'LINEOUT_READY'|'GOAL_ATTEMPT'|'TMO'|'ADVANTAGE';
  startEventId:string; startsAtMs:number; deadlineMs:number|null;
  legallyEnforced:boolean; paused:boolean; cancellationReason:string|null;
}
```

Le délai d'avantage n'est **pas** une règle universelle de cinq secondes ; l'arbitre évalue un avantage territorial/tactique. La durée d'animation d'un coup de sifflet ne change pas la légalité d'un en-avant.

## 3. Ruck : transitions, actions légales et sorties

```text
BALL_CARRIER_CONTACT
  -> TACKLE_COMPLETE (joueur au sol, libération de balle)
  -> RUCK_FORMING (participants entrent légalement / soutiens arrivent)
  -> RUCK_CONTESTED (si opposants liés, contest réel)
  -> RUCK_WON_AVAILABLE (ballon clairement gagné et disponible)
  -> USE_IT_CALLED (si applicable : départ lawClock 5 s)
  -> BALL_PLAYED (ruck terminé : le ballon sort ou est levé dans les conditions légales)
  -> OPEN_PLAY
  -> [PENALTY / SCRUM / TURNOVER selon le cas]
```

**Règle 15.17 :** quand le ballon a été clairement gagné et est disponible, l'arbitre annonce « use it » ; le ballon doit être joué dans les **5 secondes suivant cet appel**, sanction mêlée. La clarification 2-2026 nuance la manipulation du ballon par le demi de mêlée **après** la fin effective du contest. La ligne de hors-jeu passe par le point le plus reculé d'un joueur engagé de chaque équipe, et non simplement par la coordonnée de balle.

### Préconditions

- Le porteur plaqué est au sol ; personne ne le transporte en courant comme un porteur valide.
- Un joueur du ruck ne doit pas se détacher pour intercepter une passe sans avoir satisfait aux contraintes de participation et de hors-jeu.
- Un soutien à 12 m doit parcourir réellement 12 m avant d'être comptabilisé comme présent.
- Le n°9 arrive en courant au point de sortie ; si indisponible, un autre joueur légal peut jouer le rôle de distributeur.

### Tests

- `S01` : création d'un ruck, ballon visible au sol, soutien réel, 9 à la base, puis sortie et passe légale.
- `S02` : ruck à y=66 ; central ne quitte pas le terrain ; les défenseurs ne franchissent pas leur ligne avant la fin du ruck.
- `RUCK-05` : inventer `USE_IT_CALLED` à t=4.0, sortir à t=8.9 => valide ; sortir à t=9.1 => sanction si aucune autre règle ne s'applique.
- `RUCK-06` : ballon gagné, mais 9 absent : l'obligation de jeu ne doit pas faire téléporter le 9.
- `RUCK-07` : contest toujours actif => interdiction de la "clarification du 9" pour ramasser prématurément.

Les t=4.0 et t=8.9 sont **scénarios numériques de test** : leur différence de 4,9 s est ce qui compte pour le délai légal.

## 4. Mêlée : machine à états, joueurs et 9 adverse

```text
AWARDED -> FORMATION
 -> CROUCH("Flexion") -> BIND("Liez") -> SET("Jeu")
 -> STABLE -> INTRODUCTION -> BALL_IN_TUNNEL -> HOOK -> CONTEST
 -> BALL_AVAILABLE -> [USE_IT] -> EXIT_8_OR_9 -> OPEN_PLAY
                     \-> COLLAPSE / WHEEL / POP_UP / RESET / PENALTY / FREE_KICK
```

**Référence en place** : la machine du moteur `ETATS_MELEE` et les tests `server/test-melee.js`. Claude doit **étendre** les observables, pas remplacer tous les états par un `random()` sur les scores de mêlée.

Responsabilités :
- 1/3 : angles de poussée et tenue des liaisons, pieds au sol ; 2 : talonnage et pied de frein avant `SET`.
- 4/5 : liaison deuxième ligne, transmission de force ; 6/7 : liaison troisième ligne, stabilité et dégagement ; 8 : contrôle du ballon au pied, départ éventuel.
- 9 introducteur : attend l'état de stabilité, introduit, suit la trajectoire du ballon et prépare la sortie.
- 9 adverse : doit respecter une **option légale** de placement parmi celles de la loi 19 et de l'état de la mêlée ; ce n'est pas la même position géométrique que le 9 introducteur.
- Les autres joueurs : hors-jeu à 5 m du dernier pied de leur équipe jusqu'au moment légal (vérifier exceptions près de l'en-but).

**Ne pas inventer de durée fixe de liaison** : les commandes déclenchent des transitions conditionnelles à la stabilité physique. La poussée n'est pas autorisée avant l'introduction. Vérifier dans World Rugby loi 19 la nuance entre `scrum half` adverses, le pied de frein et l'appel "use it" lorsque le ballon est disponible.

### Tests

- `S03` scénario complet : ordre des six états, ballon visible dans le tunnel, 9 distribue ou 8 part.
- `SCR-01` avant `INTRODUCTION` : aucune avancée de pack attribuée à une poussée.
- `SCR-02` position illégale du 9 adverse : sanction attendue selon loi 19, pas "plaquage miraculeux".
- `SCR-03` mêlée effondrée : sifflet immédiat, ballon mort, équipes ne continuent pas à pousser.
- `SCR-04` sortie possible par 8 **ou** 9, dépendante du contrôle réel du ballon.
- `SCR-05` garde-fou anti-blocage existant ; sa sortie doit être légale et visible, pas un silence.

Source : https://passport.world.rugby/laws-of-the-game/laws-by-number/19-scrum/

## 5. Touche : géométrie stricte puis mouvement

```text
TOUCH -> MARK -> QUICK_THROW_ELIGIBLE ?
  -> [QUICK_THROW] -> OPEN_PLAY
  -> FORMATION(5..15m) -> THROWER_READY -> THROW_FLIGHT
  -> JUMP -> CATCH/CONTEST -> [MAUL or PASS or KNOCK_ON]
```

- Les deux alignements sont parallèles à la marque de touche, à 0,5 m de part et d'autre ; les participants sont entre 5 et 15 m de la touche (loi 18).
- Minimum 2 joueurs par équipe dans l'alignement ; l'équipe qui lance fixe son nombre maximal.
- Limite de **30 secondes pour former l'alignement** dans le profil de règles où cette disposition est applicable ; ne pas confondre formation et fin de lancer.
- Lancer depuis la touche jusqu'à au moins la ligne 5 m, sauf dispositions particulières.
- En jeu normal, le bénéficiaire du lancer dépend de qui a mis le ballon en touche ; sur pénalité jouée en touche, l'équipe qui botte conserve en principe le lancer.
- Différencier vraie remise rapide (`QUICK_THROW`) et touche formée jouée rapidement, qui ont des contraintes différentes.
- Assistant sur la touche : drapeau levé, marque de touche au pied, indique le camp qui lance lorsque pertinent ; il ne se contente pas de suivre x du ballon.

Tests : `S04` ; `LINE-01` 2 participants légaux minimum ; `LINE-02` lancer non rectiligne et défense qui conteste selon procédure ; `LINE-03` équipe pénalisée ne reçoit pas le lancer sur sa propre pénalité ; `LINE-04` touche qui démarre avant les 30 s mais ne se termine pas immédiatement ; `LINE-05` alternative `QUICK_THROW` légale.

Source : https://passport.world.rugby/laws-of-the-game/laws-by-number/18-touch-quick-throw-and-lineout/

## 6. Maul : modèle de liaison **pas** somme de forces seule

```text
CARRIER_UPRIGHT -> LEGAL_BIND -> MAUL_FORMED -> DRIVE / STOP / TURN
 -> BALL_TRANSFER / USE_IT / COLLAPSE / UNPLAYABLE / EXIT
```

Représenter une petite structure de graphe :
```ts
type MaulParticipant={id:string;team:string;feetOnGround:boolean;upright:boolean;
  boundTo:string|null;wholeArmBinding:boolean;
  mode:'DRIVE'|'CONTEST'|'PULL_ILLEGAL'|'DISENGAGE';}
```
Un entrant doit se lier légalement, notamment au dernier joueur selon la directive de juin 2026. Un joueur de l'autre côté, qui ne dispute plus le ballon mais tire le maul, doit quitter le contest ou être géré/sanctionné. Les liaisons ne peuvent pas être factices : main seule sans bras entier n'est pas une vraie liaison.

Tests : `S05` ; `MAUL-01` joueur délié non comptabilisé dans la poussée ; `MAUL-02` joueur tire au-delà du ballon => faute caractérisée si conditions réunies ; `MAUL-03` ballon inaccessible => décision conforme ; `MAUL-04` maul légal continue à avancer malgré un joueur qui s'en détache.

Source : https://passport.world.rugby/laws-of-the-game/law-application-guidelines/maul-june-2026/

## 7. Jeu courant : temporalité et contacts

Il faut instrumenter **sept instants** :
`t_lecture`, `t_intention`, `t_depart`, `t_lacher_ballon`, `t_reception`, `t_contact`, `t_liberation`.
Ne jamais les confondre ; le 10 peut démarrer avant d'avoir reçu le ballon, et un ailier peut préparer un appel sans immédiatement sprint­er.

Exemple d'une attaque (hypothèse, à calibrer) :
- 0,0 s : le 9 voit le ballon libérable.
- 0,2 s : le 10 réduit sa profondeur et annonce une option.
- 0,4 s : le 9 ramasse et cherche le receveur légal.
- 0,6 s : passe en vol ; aucun destinataire n'est encore porteur côté rendu.
- 0,9 s : réception ; le 12 amorce le changement de ligne.
- 1,4 s : fixation par le 10 ; choix passe courte, au large, course ou pied.
- 2,6 s : contact possible ; si plaquage complet, nouveau cycle de regroupement.

Ces valeurs sont des **scénarios d'animation**, pas des durées obligatoires. À vitesse accélérée, conserver le même ordre causal sans « sauter » les événements du moteur.

Un contact haut nécessite des observables (hauteur du point d'impact, tête / cou, posture, vitesse, danger, circonstances, atténuation) puis une décision versionnée. Un champ `highTackle=true` ne suffit pas pour simuler honnêtement une sanction disciplinaire.

## 8. Trois officiels comme agents + TMO optionnel

| Officiel | Positionnement | Ce qu'il observe | Ce qu'il émet |
|---|---|---|---|
| Central | angle derrière/latéral de l'action, distance variable, sans sortir | possession, contact, hors-jeu, intervention illégale, avantage, marque | `REFEREE_WARNING`, `ADVANTAGE`, `WHISTLE`, `SIGNAL` |
| Assistant 1 | le long de y=0 | touche, plan du ballon, geste dangereux, coups de pied au but | `TOUCH_MARK`, `FLAG`, `REPORT` |
| Assistant 2 | le long de y=70 | idem côté opposé | idem |
| TMO **si compétition équipée** | pas d'agent physique dans le terrain | aplatissement, touche de but, action conduisant à essai, jeu déloyal, tirs au but selon protocole | `REVIEW_REQUEST`, `EVIDENCE`, `RECOMMENDATION` |

**Comportement initial actuel** : le central se déplace vers des cibles, les assistants suivent la longueur et ont des fanions visibles. Cela **ne prouve pas** que chaque assistant a déjà une décision juridique autonome.

### Décision cohérente

```ts
type OfficialDecision={
  officialId:'REF'|'AR1'|'AR2'|'TMO';
  sourceEventIds:string[];
  lawProfileId:string; lawRef:string|null;
  decision:'PLAY_ON'|'ADVANTAGE'|'PENALTY'|'FREE_KICK'|'SCRUM'|'TRY'|'TOUCH'|'REVIEW';
  infringingTeam:'A'|'B'|null; awardedTo:'A'|'B'|null;
  mark:{x:number;y:number}|null; signal:string;
  explanation:string;
}
```

- Pas de sifflet ajouté au hasard simplement pour produire plus de pénalités.
- Une décision doit dériver des événements et conserver la même graine.
- L'avantage est jugé par résultat observable, non par un timeout universel.
- Le TMO ne rejuge pas 80 minutes : protocoles et compétences limités, pas de décision arbitraire.
- Les signaux d'arbitres (drapeau, avantage, essai, faute) doivent être cohérents avec **la décision réelle**.

Sources :
https://passport.world.rugby/laws-of-the-game/laws-by-number/6-match-officials/
https://passport.world.rugby/officiating/introduction-to-assistant-refereeing/in-touch/

## 9. Matrice d'acceptation des lois

| Test | Précondition | Résultat attendu |
|---|---|---|
| ARB-01 | B hors-jeu au ruck, joue le ballon | faute + bénéficiaire A (ou avantage légal) |
| ARB-02 | B onside et contest légal avant ruck | pas de faute artificielle |
| ARB-03 | ruck gagné, use it déclenché t=10, ballon encore au ruck t>15 | mêlée selon règle, jamais continue sans sanction |
| ARB-04 | 9 manipule ballon après contest clairement terminé | application clarification 2-2026 |
| ARB-05 | 9 manipule ballon alors que contest actif | interdit si pas autre exception légale |
| ARB-06 | passe franchement en avant | sanction visible, mêlée correspondante |
| ARB-07 | plaquage près de touche, ballon porté hors terrain | marque correcte, assistant et lancer attribué |
| ARB-08 | maul avec liaison défaite | joueur non comptabilisé comme participant |
| ARB-09 | mêlée avant introduction, paquet avance | interdit et sanction selon cause |
| ARB-10 | en-but, ballon non aplati | pas d'essai ; redémarrage approprié au profil 2026 |
| ARB-11 | avantage réel démontré | `AVANTAGE_JOUE` et pas de retour systématique |
| ARB-12 | avantage non obtenu, ballon rendu mort | retour à la marque si loi le prévoit |
| ARB-13 | compétition sans TMO | aucune revue vidéo simulée |
| ARB-14 | compétition avec TMO | seules situations éligibles font une revue |
| ARB-15 | faute grave nécessitant exclusion | jeu à effectif réduit, durée/remplacement suivant le profil |
| ARB-16 | n°14 remplacé pendant jeu vivant | remplacement reporté à arrêt admissible ; aucun doublon |

Ne pas oublier `server/test-melee.js`, `server/test-ruck.js`, `server/test-invariants.js`, `server/test-touche.js` et `server/test-scores-abstraits.js`. Les nouveaux tests n'autorisent pas la suppression d'anciens tests devenus gênants.
