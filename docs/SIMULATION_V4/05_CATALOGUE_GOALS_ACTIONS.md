# V4 — Bibliothèque des buts et actions GOAP **individuels** des 30 joueurs

**Source logique :** `04_IA_AGENTS_BUTS.md` et **`07_AGENT_INDIVIDUEL_PLACEMENT.md` (fait autorité)**. Chaque joueur lit le plan de jeu partagé mais décide seul de ses buts et déplacements. **Aucune IA collective ni attribution centrale.** Ce catalogue n'affirme pas que ces actions sont déjà connectées à `MatchEngine`.

## 1. Ontologie canonique des faits

Les libellés suivants doivent être centralisés dans `engine/ai/facts.js` ; **interdit d'éparpiller les chaînes** dans le moteur.

| Fait | Type/valeurs | Propriété | Source de vérité |
|---|---|---|---|
| `SELF_ONSIDE` | bool | individuel | ligne hors-jeu moteur |
| `SELF_AVAILABLE` | bool | individuel | `auSol`, `sinBin`, liaison |
| `SELF_GROUNDED` | bool | individuel | physique |
| `SELF_BOUND` | bool | individuel | ruck / mêlée / maul |
| `SELF_AT_RUCK` | bool | individuel | distance réelle et accès légal |
| `SELF_AT_TARGET` | bool | individuel | position et tolérance métriques |
| `HAS_BALL` | bool | individuel | `ball.carrierId` |
| `BALL_IN_FLIGHT` | bool | partagé | `ball.state` |
| `BALL_AT_RUCK` | bool | partagé | `phase` + statut ballon |
| `RUCK_WON` | bool | équipe | moteur de contest |
| `BALL_AVAILABLE` | bool | partagé | sortie réellement possible |
| `PASS_LANE_10_OPEN` | bool | agent | prédiction géométrique et perception |
| `PASS_LANE_POD_OPEN` | bool | agent | prédiction géométrique et perception |
| `SAFE_SUPPORT_LANE` | bool | agent | passes réglementaires et obstacles |
| `GAP_NEARBY` | bool | agent | modèle menace |
| `DEFENSIVE_GAP_CLOSED` | bool | équipe | continuité mesurée |
| `TEAM_POSSESSION` | bool | équipe | moteur |
| `OPPONENT_POSSESSION` | bool | équipe | moteur |
| `BREAKDOWN_CONTEST_ACTIVE` | bool | phase | concurrents liés et situation réelle |
| `LINEOUT_READY` | bool | phase | positions légales atteintes |
| `SCRUM_SET` | bool | phase | état mêlée |
| `SCRUM_BALL_IN` | bool | phase | capteur ballon mêlée |
| `MAUL_BIND_LEGAL` | bool | phase | graphe de liaisons |
| `KICK_CHASE_ONSIDE` | bool | individuel | loi 10 et remise en jeu |
| `RECEIVER_OPEN` | bool | individuel | menace et couloir passe |
| `DISTRIBUTED` | bool | résultat | passe réellement reçue |
| `POSSESSION_SECURED` | bool | équipe | moteur de conservation |
| `TRY_PREVENTED` | bool | résultat | action observée, pas une intention |
| `TRY_SCORED` | bool | résultat | marque accordée par arbitre |

Créer un linter de noms de faits (`test-v4-facts.js`) pour refuser les chaînes inconnues et vérifier le type des valeurs.

Les faits dérivés de prévision (`RECEIVER_OPEN`, `GAP_NEARBY`) sont **croyances** ; ils peuvent se révéler faux. Les faits autoritatifs (`HAS_BALL`, `TRY_SCORED`) ne doivent être mis à vrai que par le moteur, jamais par un effet GOAP non vérifié.

## 2. Catalogue des buts **individuels** (même quand ils contribuent au collectif)

Un but est une condition du monde. Les poids ci-dessous sont **des exemples de priorités**, à définir et mesurer par Claude Code, non des probabilités ni un ordre obligatoire.

| ID | But | Condition de succès vérifiée | Profils éligibles |
|---|---|---|---|
| G01 | `BECOME_ONSIDE` | `SELF_ONSIDE` | tout joueur |
| G02 | `RECOVER_AND_REJOIN` | debout + disponible + en jeu | tout joueur |
| G03 | `SECURE_RUCK` | ballon gagné et sécurisé sans faute | 1–8, centres de soutien |
| G04 | `DISTRIBUTE_BALL` | passe légale reçue par partenaire | 9, puis remplaçant capable |
| G05 | `SUPPORT_CARRIER` | soutien dans couloir légal au moment utile | tout joueur disponible |
| G06 | `CREATE_OUTSIDE_OVERLAP` | surnombre réel ou défenseur fixé laissant libre | 10–15, avants extérieurs |
| G07 | `RETAIN_WIDTH` | canal assigné tenu légalement et disponible | 11,14, avants extérieurs |
| G08 | `BREAK_GAINLINE` | franchissement mesuré avec ballon conservé | porteur |
| G09 | `EXIT_DEFENSIVE_22` | gain territorial ou possession sécurisée hors danger | 9,10,15, botteur |
| G10 | `CLOSE_NEAREST_GAP` | intervalle critique couvert sans faute | défenseurs disponibles |
| G11 | `PRESS_RECEIVER` | réception défendue légalement | ligne défensive |
| G12 | `PROTECT_BLIND_SIDE` | menace petit côté couverte | gardes et aile fermée |
| G13 | `COVER_BACKFIELD` | dernier rideau préserve réception/interception | 15, ailier replié |
| G14 | `CONTEST_BREAKDOWN` | ballon contesté légalement ou adverse ralenti | 6,7,8 selon contexte |
| G15 | `TACKLE_LEGAL_CARRIER` | plaquage légal réalisé | défenseur disponible |
| G16 | `SECURE_KICK_RECEIPT` | réception contrôlée ou touche défensive utile | 15,11,14 |
| G17 | `CHASE_KICK_ONSIDE` | pression légale sur réception | chasseurs désignés |
| G18 | `FORM_SCRUM_LEGALLY` | pack placé, lié, stable | 1–8 |
| G19 | `WIN_SCRUM_BALL` | sortie ballon contrôlé | 1–9 |
| G20 | `FORM_LINEOUT_LEGALLY` | lanceur et alignement aux positions légales | sélectionné équipe |
| G21 | `WIN_LINEOUT_BALL` | réception/vol légal | lanceur, sauteurs, soutiens |
| G22 | `FORM_MAUL_LEGALLY` | trois participants ou plus dans les conditions légales | porteur + avants |
| G23 | `DRIVE_MAUL` | gain réel avec ballon jouable | participants liés |
| G24 | `AVOID_PENALTY` | rester légal sur action imminente | tous |
| G25 | `SCORE_TRY` | `TRY_SCORED` accordé (ne jamais attribuer localement) | porteur |
| G26 | `PREVENT_TRY` | danger d'essai traité légalement | couverture |
| G27 | `EXECUTE_TEAM_COMBINATION` | séquence collective effectivement réalisée | groupes désignés |
| G28 | `RESTORE_DEFENSIVE_SHAPE` | joueur observe les voisins, ferme un intervalle puis retrouve sa référence de placement | défenseurs libres |
| G29 | `DEFEND` | menace adverse localement contenue, priorité défensive cohérente avec poste et situation | tout joueur disponible |
| G30 | `MARK_OPPONENT` | adversaire pertinent couvert légalement, ligne de passe et angle maîtrisés | défenseurs disponibles |
| G31 | `HOLD_LINE` | défenseur reste connecté à ses voisins observés et ne crée pas de trou en montant | défenseurs disponibles |
| G32 | `BECOME_ONSIDE` | joueur de nouveau légalement en jeu avant d'intervenir | joueur hors-jeu |
| G33 | `BE_PASS_OPTION` | couloir de réception légal ouvert à l'instant utile | attaquants disponibles |
| G34 | `RETURN_TO_PLAYBOOK` | joueur retrouve progressivement sa zone nominale, sans quitter une menace urgente | joueurs libres |
| G35 | `PROTECT_INSIDE` | canal intérieur défensif localement protégé | gardes, avants, trois-quarts selon contexte |

**Éligibilité ≠ script de poste** : un centre peut effectuer une touche rapide s'il a légalement le ballon ; un pilier peut recevoir une passe ; un 8 peut temporairement distribuer au ruck si le 9 est absent et qu'il est en position légale.

## 3. Catalogue des actions, préconditions, effets et coûts

La colonne "effet prédit" n'est jamais une autorisation d'écrire directement le monde moteur. L'exécuteur valide un événement réel : distance, phase, ballon, règle, duel.

| ID | Action | Préconditions (résumé) | Effet prédit | Vérification physique |
|---|---|---|---|---|
| A01 | `GET_ONSIDE` | actif, hors-jeu | onside | coordonnées franchissent ligne légale |
| A02 | `GET_UP` | au sol, récupération autorisée | disponible | `auSol === 0` |
| A03 | `MOVE_TO_RUCK` | actif, non lié, onside | à la base | distance <= tolérance, chemin légal |
| A04 | `APPROACH_FROM_GATE` | ruck et entrée possible | entrée légale | trajectoire respecte porte d'entrée |
| A05 | `BIND_RUCK` | onside, à bonne distance, debout | lié | événement de liaison valide |
| A06 | `CLEAR_OUT_LEGALLY` | soutien lié, contact autorisé | ballon défendu | contest moteur résolu |
| A07 | `SECURE_BALL` | ballon gagné, accessible, joueur admissible | porteur / ballon contrôlé | `carrierId` exact |
| A08 | `PASS_TO_10` | ballon porté, 10 libre/onside, couloir légal | distribué | trajectoire et réception du 10 |
| A09 | `PASS_TO_POD` | porteur, pod réellement en place | distribué | réception par agent assigné |
| A10 | `PASS_TO_OUTSIDE` | porteur, couloir/surnombre extérieur | distribué | réception légale |
| A11 | `RUN_INTO_GAP` | porteur, gap plausible, chemin libre | ligne gagnée | métrique franchissement |
| A12 | `FIX_DEFENDER` | porteur ou leurre, défenseur proche | adversaire fixé | direction/engagement observés |
| A13 | `RUN_SUPPORT_INSIDE` | disponible, ligne soutien légale | soutien intérieur | position au temps de contact |
| A14 | `RUN_SUPPORT_OUTSIDE` | idem, côté ouvert accessible | soutien extérieur | position au temps de passe |
| A15 | `HOLD_WIDTH` | disponible, couloir libre, rôle | largeur préservée | bande latérale tenue |
| A16 | `FOLD_TO_GAP` | défense disponible, trou estimé | premier trou fermé | couverture mesurée |
| A17 | `SLIDE_TO_ROLE` | ligne défensive déjà rétablie | créneau retrouvé | aucune ouverture critique créée |
| A18 | `TRACK_RECEIVER` | receveur menace, onside | pression | distance / angle légal |
| A19 | `INTERCEPT_BALL` | trajectoire passe lisible, onside | ballon récupéré | événement interception moteur |
| A20 | `TACKLE_CARRIER` | porteur adverse, onside, au contact | porteur plaqué | résultat moteur légal |
| A21 | `COVER_DEEP_KICK` | ballon pied plausible, disponible | couverture | présence au point probable |
| A22 | `CHASE_KICK` | botteur vient de frapper, onside | pression réception | pas de plaquage hors-jeu |
| A23 | `KICK_FOR_TERRITORY` | porteur, pied autorisé | gain territorial possible | trajectoire, réception, touche |
| A24 | `SCRUM_BIND` | joueur de paquet, ordre et position légaux | lié/stable | machine `ETATS_MELEE` |
| A25 | `SCRUM_HOOK` | introduction effectuée, n°2 admissible | ballon gagné potentiel | ballon au pied et issue réelle |
| A26 | `SCRUM_EXIT_8` | ballon au fond, 8 disponible | ballon sorti | ballon et position du 8 |
| A27 | `SCRUM_PASS_9` | ballon disponible, 9 légal | ballon distribué | 9 réellement à la base |
| A28 | `LINEOUT_GET_IN_POSITION` | alignement attribué | en place | 5–15 m, espacement légal |
| A29 | `LINEOUT_THROW` | lanceur, alignement prêt | ballon en vol | lancer marqué, trajectoire |
| A30 | `LINEOUT_JUMP` | sauteur assigné, position légale | tentative réception | issue de duel réel |
| A31 | `LINEOUT_LIFT` | soutien assigné, position légale | sauteur aidé | liaison/tempo de saut |
| A32 | `MAUL_BIND` | porteur debout, côtés et liens légaux | lié | graphe de liaison mis à jour |
| A33 | `MAUL_DRIVE` | encore lié, groupe stable | gain possible | déplacement collectif réel |
| A34 | `PRESENT_BALL` | porteur plaqué, libération légale | ballon présenté | phase et ballon corrects |
| A35 | `REORGANIZE_POD` | avants disponibles, plan équipe | cellule prête | chaque membre arrivé physiquement |
| A36 | `WAIT_FOR_BALL` | légal, pas de meilleure option | position maintenue | état inchangé, pas de ballon magique |

**Coût d'une action** (positif) = temps prédit + fatigue + risque de perte + risque de faute + pénalité d'abandon d'un engagement. Les unités et coefficients doivent être documentés et ajustés par scénarios. Une action « illégale mais rentable » n'a pas un coût élevé : elle est **interdite par les préconditions / l'exécuteur**. **Le déplacement, le choix d'un point d'interception, d'un couloir et de sa vitesse sont calculés par le joueur lui-même**, d'après son but actif, les circonstances et le plan de jeu qu'il connaît.

## 4. Exemple formel A9 — but distribuer

```js
const facts = {
  SELF_ONSIDE: true, SELF_AT_RUCK: false, BALL_AVAILABLE: true,
  HAS_BALL: false, RUCK_WON: true, PASS_LANE_10_OPEN: true,
  PASS_LANE_POD_OPEN: true, DISTRIBUTED: false,
};
const goal = { DISTRIBUTED: true };
const actions = [
  {id:'MOVE_TO_RUCK',
   preconditions:{SELF_ONSIDE:true,SELF_AT_RUCK:false},
   effects:{SELF_AT_RUCK:true},cost:1},
  {id:'SECURE_BALL',
   preconditions:{SELF_AT_RUCK:true,BALL_AVAILABLE:true,RUCK_WON:true},
   effects:{HAS_BALL:true},cost:1},
  {id:'PASS_TO_10',
   preconditions:{HAS_BALL:true,PASS_LANE_10_OPEN:true},
   effects:{DISTRIBUTED:true,HAS_BALL:false},cost:1},
  {id:'PASS_TO_POD',
   preconditions:{HAS_BALL:true,PASS_LANE_POD_OPEN:true},
   effects:{DISTRIBUTED:true,HAS_BALL:false},cost:2},
];
// plan = MOVE_TO_RUCK -> SECURE_BALL -> PASS_TO_10
// Si PASS_LANE_10_OPEN devient faux, nouveau plan vers le pod.
// Si les 2 couloirs sont fermés, la planification signale NO_PLAN.
```

C'est le **minimum** d'une IA à base de buts, mais cela ne produit **pas** encore un joueur intelligent tant que l'exécuteur n'a pas validé la vraie course, la prise de balle et la réception du partenaire.

## 5. Exemples d'objectifs contradictoires

### A7 doit-il contester ou couvrir ?

`CONTEND_BALL` peut être prioritaire si `BREAKDOWN_CONTEST_ACTIVE=false`, `SELF_ONSIDE=true`, `SELF_GROUNDED=false`, trajectoire d'entrée légale et temps d'arrivée acceptable. Sinon `CLOSE_NEAREST_GAP` devient le plan le plus sûr.

### A15 doit-il monter ou rester derrière ?

Si une ligne est intacte, `COVER_BACKFIELD` prime. Si B13 franchit et aucune autre couverture ne peut intercepter, `PREVENT_TRY` déclenche `READ_TRAJECTORY → INTERCEPT_CARRIER` sans que l'arrière connaisse la trajectoire future exacte.

### A14 doit-il tenir la touche ou suivre le 13 ?

Les événements `DEFENDER_FIXED`, `PASS_LANE_OPEN`, `OUTSIDE_OVERLAP` peuvent augmenter `CREATE_OUTSIDE_OVERLAP`. Il part en course quand le planner estime l'appel rentable, **pas automatiquement à t=7 s**.

### A3 contre A4 — deux décisions autonomes

A3 et A4 connaissent tous deux le plan de jeu et leur responsabilité potentielle de soutien. Chacun évalue **localement** son temps d'arrivée, le chemin légal vers le ruck et la position observée de l'autre. Si A3 voit A4 mieux placé, il peut décider de préparer la phase suivante ; A4 peut entrer dans le ruck s'il est légalement en mesure de le faire. Si leur perception est imparfaite, les deux peuvent choisir le ruck : le moteur résout alors les engagements physiques, **sans attribuer de rôle ni départager par un coordinateur**.

## 6. Catalogues de plans composés : HTN comme support, pas script figé

| Intention d'équipe | Sous-buts possibles | Liberté GOAP locale |
|---|---|---|
| `ATTACK_WIDE` | sécurisé → distribué → fixé → largeur exploitée | 9 choisit receveur, 10 fixe ou porte, 14 lance selon défense |
| `KEEP_BALL_CLOSE` | soutien → percussion → ballon présenté → ruck gagné | avants choisissent angle et soutien selon disponibilité |
| `DEFEND_RUCK` | gardes → ligne → couverture fond | joueurs se substituent si poste nominal indisponible |
| `EXIT_22` | réception → protection → pied ou relance | 9/10/15 choisissent option légale selon pression |
| `SCRUM_8_EXIT` | bind → set → introduction → contrôle → sortie | 8 part, 9 passe, ou sanction |
| `LINEOUT_MAUL` | placement → lancer → réception → liaison → drive | maul ou distribution selon contest et circonstances |

Les plans composés ne doivent pas garantir artificiellement leur propre succès : des adversaires peuvent contester, le ballon peut être perdu et un nouvel objectif peut s'imposer.

## 7. Exigences de test liées au catalogue

Les tests de chaque action doivent vérifier :
- précondition vraie → action planifiable ;
- précondition fausse → action impossible à lancer ;
- action physiquement impossible → pas d'effet appliqué au moteur ;
- action échouée → replanification et alternative si elle existe ;
- plusieurs agents visant une zone similaire → chacun tient compte des partenaires visibles ; éventuel conflit physique résolu par le moteur, **sans réservation ni arbitrage d'IA collective** ;
- coût non positif, fait inconnu ou résultat incohérent → rejet ;
- plan de trois étapes réellement différent sous deux observations opposées ;
- mêmes inputs → mêmes actions, mêmes événements, aucune dépendance à l'horloge système.

Ne pas ajouter d'une seule fois toutes les actions au moteur. Commencer par **9, 7, 15**, puis étendre aux 30 joueurs en conservant le modèle unique d'agent.
