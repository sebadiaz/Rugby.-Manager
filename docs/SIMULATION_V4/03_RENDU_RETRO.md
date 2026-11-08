# V4 — Direction artistique 2D rétro, animations vérifiables et tests navigateur

## 1. Référence et limites

Référence visuelle : **Retro Rugby (Lombard Games, Steam)** — caméra 2D vue du dessus / isométrique, silhouettes lisibles, animations de contact, lecture instantanée du ballon. Ce chantier vise une **identité graphique originale pour Rugby Manager** : ne pas copier/reconstituer les sprites, textures, UI, logos ou la bande-son du jeu de référence.

**Moteur réel** : `docs/js/renderer.js` (Canvas 2D), `docs/js/main.js` (interpolation), `docs/js/matchState.js`. Éviter Three.js/WebGL obligatoire pour cette tranche. Mode Club et simulations headless doivent continuer à fonctionner sans Canvas.

## 2. Définir un style reproductible

- Silhouettes de rugby reconnaissables : position du buste, bras, jambes, emprise au sol, tête, ballon.
- Deux tenues contrastées avec numéros, couleur de possession, maillots et bandes distinctes.
- Ballon séparé **en toutes phases**, même s'il apparaît visuellement porté (pas de ballon collé au curseur du 9 pendant une passe).
- Mêlée : huit joueurs liés par équipe (si disponibles), pas une masse de seize disques superposés ; la rangée arrière reste identifiable.
- Touche : lanceur sur le bord, deux lignes, sauteurs et porteurs, trajectoire montante du ballon ; éviter "attrape instantanée" sans vol.
- Ruck : plaqué au sol, plaqueur, un ou plusieurs soutiens, sortie du ballon ; ne pas représenter comme une mêlée.
- Maul : joueurs **debout et liés** se déplaçant collectivement, ballon porté haut.
- Arbitre central et assistants à silhouette et couleur distinctes des 30 joueurs.

## 3. Pipeline d'affichage cible

```text
MatchEngine.tick(0.05)  -> MatchEngine.getState()
 -> normalizeMatchState()
 -> interpolation SNAPSHOT_N/SNAPSHOT_N+1
 -> sceneGraph (terrain, personnages, ballon, marqueurs, HUD)
 -> SpriteResolver(action/phase/facing/team)
 -> CanvasRenderer.draw()
```

Ne jamais modifier les positions logiques du moteur à partir des pixels affichés. Les impacts et déformations de sprites sont purement visuels jusqu'à ce que l'événement moteur les déclenche.

### Conversion de caméra

Conserver la caméra top-down existante comme `cameraMode='TOP_DOWN'` par défaut. Introduire une caméra `cameraMode='ISOMETRIC_2D'` **optionnelle** après avoir testé la lisibilité.

Projection candidate (paramètres **à ajuster visuellement**, pas dimensions réelles) :
```js
function project(x, y, camera) {
  const dx = x - camera.focusX, dy = y - camera.focusY;
  return {
    x: camera.centerX + (dx - dy) * camera.scaleX,
    y: camera.centerY + (dx + dy) * camera.scaleY,
  };
}
```

Exigences : les coordonnées de collision restent en mètres, les lignes de touche/en-but sont toujours dessinées, le zoom et l'ordre de profondeur ne changent jamais l'issue des actions.

### Ordre de dessin

1. Pelouse, marques et en-buts.
2. Ombres au sol (facultatif, uniquement pour la lisibilité).
3. Joueurs debout triés par profondeur **projetée** et joueurs au sol.
4. Ballon et particules pertinentes ; s'il est en vol, hauteur affichée mais le point au sol reste disponible pour l'arbitrage.
5. Officiels et signaux de touche.
6. Marqueurs sélection/possession, HUD, événements (hors canvas ou couche dédiée).

Éviter de faire passer le ballon derrière une masse de joueurs quand le porteur s'apprête à transmettre.

## 4. Machine d'animation déclarative

| Animation | Entrée moteur | Direction | Durée cible visuelle (non réglementaire) | Fin |
|---|---|---|---|---|
| `IDLE` | joueur disponible à l'arrêt | 8 directions | boucle 0,6–1,0 s | `RUN`, `RECEIVE` |
| `JOG` | vitesse modérée | 8 directions | 0,5–0,8 s / cycle | `RUN`, `IDLE` |
| `RUN` | vitesse élevée | 8 directions | 0,3–0,55 s / cycle | `PASS`, `KICK`, `TACKLE` |
| `CATCH` | réception effective | selon trajectoire | 0,15–0,35 s | `RUN` ou `CONTACT` |
| `PASS` | ballon libéré par passe | selon cible | 0,2–0,45 s | `RUN`/repli |
| `KICK` | coup de pied effectivement déclenché | selon cible | 0,3–0,6 s | `CHASE` |
| `TACKLE` | contact réussi | axe porteur/plaqueur | 0,3–0,65 s | `GROUNDED` |
| `GROUNDED` | `auSol>0` | posture couchée | durée décidée par moteur | `GET_UP` |
| `GET_UP` | fin récupération au sol | selon joueur | 0,35–0,8 s | `JOG` |
| `RUCK_BIND` | participation légale ruck | vers contact | pilotée par phase | `RECOVER` |
| `SCRUM_BIND` | stade mêlée | vers paquet | pilotée par phase | `SCRUM_EXIT` |
| `LINEOUT_JUMP` | joueur sauteur | verticale | pilotée par trajectoire | `LAND` |
| `MAUL_DRIVE` | lié et pousse | vers poussée | pilotée par phase | `UNBIND` |
| `REF_SIGNAL` | décision arbitrale | geste déterminé | 0,5–1,3 s | `REF_IDLE` |

Le tableau spécifie des **objectifs d'animation** : des plages de travail, non des mesures de match. Le moteur reste l'unique source de vérité du moment où une action commence et se termine.

## 5. Portrait de joueur et animation sans assets propriétaires

Proposer trois niveaux d'implémentation réversibles :

- **V4.1** : silhouettes vectorielles Canvas originales, 8 orientations, animation de course par membres ; utile immédiatement sans générer d'images.
- **V4.2** : spritesheet original PNG/WebP préparé pour huit directions, atlas codé avec dimensions constantes ; tests de cadrage et pivot.
- **V4.3** : déclinaisons gabarits d'avants/arrières, expression de fatigue et blessures sans modifier les attributs physiques de jeu.

Contrat d'atlas :
```json
{
  "spriteId": "rugby-run-forward-original",
  "directions": 8,
  "framesPerDirection": 6,
  "frameWidth": 48,
  "frameHeight": 48,
  "pivot": [24, 40],
  "fps": 12,
  "loop": true
}
```

Les chiffres ci-dessus sont une **proposition de format** et peuvent être changés si une capture montre que 48x48 est insuffisant. Chaque atlas doit utiliser une licence et une provenance documentées.

## 6. Continuité : pas de sprites mensongers

Les erreurs à interdire :
- balle dessinée dans les mains du receveur **avant la réception effective** ;
- joueur couché qui se déplace comme s'il courait ;
- plaqueur animé en plaquage sans plaquage moteur ;
- mêlée "écroulée" visuellement pendant une machine d'états qui continue à pousser ;
- assistants qui annoncent la touche alors que le ballon n'est pas sorti ;
- coup de sifflet au moment où l'arbitre joue l'avantage ;
- joueur qui pivote de 180° en une image : interpolation angulaire adaptée à vitesse et animation (sans ralentir la logique).
- joueur hors-jeu du coup de pied qui apparaît comme chasseur légal.

Les animations doivent écouter les événements moteur, pas déclencher leurs propres décisions. Conserver un marqueur de débogage optionnel qui affiche `roleInstantane`, `positionCible` et `raisonCible`.

## 7. Tests visuels automatisés et métriques

### Captures obligatoires

| Scène | Instants à capturer | À vérifier |
|---|---|---|
| S01 ruck → sortie 9/10 | 0, 1, 3, 6 s | ballon, joueurs au sol, trajectoires, rôles et couloirs |
| S03 mêlée | chaque changement d'état `MELEE_*` | seize avants distincts, 9, ballon, commandes |
| S04 touche | formation, départ, saut, réception | double ligne, lanceur, ballon volant, assistant |
| S05 maul | formation, drive, sortie/faute | joueurs debout liés, pas de ruck déguisé |
| S07 jeu au pied | départ, vol, réception | séparation ballon/botteur, couverture arrière |
| S08 avantage | déclaration et issue | geste de l'arbitre cohérent avec moteur |

### Conditions chiffrées **à démontrer**, pas résultats déjà acquis

- 100 % des quinze numéros de chaque équipe restent distinguables dans un arrêt sur image zoomé (ou accessibles via survol/sélection à distance).
- 100 % des actions moteur majeures sélectionnées produisent l'animation attendue ; aucune animation d'essai sans essai réel.
- 0 joueur rendu hors du terrain (sauf remplacements et acteurs hors champ prévus).
- 0 saut de position supérieur au mouvement maximal autorisé d'un tick (voir contrat V4).
- Cible de fluidité **60 images/s desktop** sur scène standard, et **30 images/s minimum mobile** sur appareil Android de référence ; évaluer après captures de performances. Ne jamais déclarer 60 FPS sans mesure.
- À chaque instant, une seule position de ballon visible ; la trajectoire peut être dessinée en option debug uniquement.
- Interface lisible en largeur téléphone ; HUD compact et pas de boutons placés au-dessus du point de contact.
- Pause, vitesse x1/x2/x4 et replay montrent la même suite de décisions à graine identique.

### Commandes

```bash
cp engine/rugby-engine.js docs/rugby-engine.js
python3 -m http.server 8099 --directory docs
# Dans un autre terminal, avec Chromium Playwright installé :
node server/test-parcours-navigateur.js http://localhost:8099
```

Ajouter `server/test-v4-renderer.js` (Canvas mock) puis `server/test-v4-screenshots.js` (Playwright) lors des lots concernés, sans écraser les tests de parcours existants. Les screenshots utiles doivent être consignés dans `docs/screenshots/simulation-v4/` ou destination équivalente choisie par le dépôt.

## 8. Définition de terminé pour le "look Retro Rugby"

Pas uniquement des silhouettes plus jolies. Pour considérer le rendu V4 livré il faut **une comparaison sur les mêmes scénarios** :
- avant/après S01 ruck, S03 mêlée, S04 touche, S07 jeu au pied ;
- repères de placement identiques dans le moteur ;
- transformations visuelles documentées, actions clairement différenciées ;
- tests navigateur, capture mobile et aucun écart de statistiques lié à un changement de caméra ou de sprite.

Source stylistique : https://store.steampowered.com/app/3600800/Retro_Rugby/ .
