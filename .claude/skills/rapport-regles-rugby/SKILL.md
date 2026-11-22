---
name: rapport-regles-rugby
description: Produit un rapport de conformité aux lois officielles du rugby à XV (World Rugby) à partir d'actions réellement simulées par le moteur de Rugby Manager (passes, en-avants, mêlées, touches, rucks, mauls, coup d'envoi, hors-jeu, avantage, essais, transformations, pénalités). À utiliser après toute modification du moteur ou de l'IA des joueurs, ou quand on demande « est-ce que c'est dans les règles ? », un audit des lois ou un rapport d'arbitrage.
---

# Rapport de conformité aux lois du rugby

Ce skill **ne modifie pas le code** : il observe des matchs simulés, confronte chaque action aux lois officielles
et rend un rapport. Les corrections sont une étape séparée, demandée par l'utilisateur.

## 1. Fixer la référence officielle
- Base de travail du projet : `docs/REGLES_RUGBY.md` (lois résumées avec leurs numéros : 6 arbitre, 8 essai/marque,
  9 points, 10 jeu déloyal et hors-jeu de coup de pied, 11 hors-jeu général, 12 coup d'envoi, 14 plaquage,
  15 ruck, 16 maul, 17 marque, 18 touche, 19 mêlée, 20 pénalités…).
- Pour toute règle **douteuse ou ambiguë**, ne jamais répondre de mémoire : consulter le texte officiel (World Rugby,
  « Laws of the Game », law.world.rugby) avec l'agent `web-fetch` et citer le numéro de loi. Si le site est inaccessible,
  le dire dans le rapport (« non vérifié à la source officielle ») au lieu d'affirmer.
- Distinguer : **loi officielle**, **convention du jeu** (ex. dialogues 9/10/8, choix tactiques) et **hypothèse GOAP**.
  Une convention du jeu n'est jamais présentée comme une loi.

## 2. Observer des actions réelles (jamais des statistiques inventées)
Lancer l'audit existant, sur plusieurs graines et les deux modes :

```bash
for g in 1 2 3 4 5 6; do node server/audit-regles-simulation.js $g LEGACY; node server/audit-regles-simulation.js $g GOAP; done
```

`server/audit-regles-simulation.js` vérifie pendant la simulation : passes vers l'avant (L11), en-avant → mêlée (L11/12),
essai dans l'en-but (L8), transformation après essai (L8), avantage résolu, coup d'envoi (adversaires à 10 m, partenaires
derrière le ballon, L10/12), mêlée (3/4 à 5 m, L19), ruck (hors-jeu, L15), joueurs sur le terrain (≥ 12), ballon valide.
Le mode GOAP est lent (environ 1 min par match) : lancer en parallèle ou en arrière-plan.

Pour une règle que l'audit ne couvre pas, écrire un petit script jetable dans le scratchpad (jamais dans le dépôt) :
`new MatchEngine(graine, 4800[, configGOAP()])`, envelopper `m.log` pour capter les événements (`PASSE`, `TOUCHE`,
`MELEE`, `PENALITE`, `ESSAI`, `PENALITE_ENVOI`…) et comparer à la loi. Lire l'état avec `m.getState()`.

## 3. Cas à passer en revue (au minimum)
| Loi | Contrôle |
| --- | --- |
| 11 | Une passe en avant est sanctionnée (mêlée), un en-avant aussi ; hors-jeu en jeu général |
| 12 | Coup d'envoi : receveurs à 10 m, botteur derrière le ballon, ballon qui ne franchit pas 10 m → mêlée ; renvoi aux 22 m |
| 10 | Un chasseur arrivé avant le ballon n'est pas fautif ; la faute est un **geste** (charge, obstruction) |
| 14 | Plaqué : libère le ballon ; plaqueur se relève ; ruck après contact |
| 15 | Ruck : pas de ballon à la main, hors-jeu derrière le pied arrière, joueurs liés qui attendent la sortie du ballon |
| 16 | Maul : avance, s'arrête, ballon utilisé ou mêlée |
| 17 | Marque : réception directe dans ses 22 m, coup franc |
| 18 | Touche : sortie → touche pour l'adversaire, droit à la touche rapide, alignement, lanceur sur la ligne |
| 19 | Mêlée : formation, introduction, hors-jeu des 3/4 et du 9 adverse |
| 8/9 | Essai : ballon aplati dans l'en-but ; transformation après essai ; pénalité au but ; points |
| 6 | Arbitre et assistants : assistant de touche dehors, drapeau levé et bras tendu vers l'équipe qui lance ; derrière les poteaux sur un tir au but |
| 20 | Pénalités : conséquence claire (tape, touche, but, mêlée) ; avantage appliqué puis résolu |

## 4. Rendre le rapport
Format fixe, en français, sans jargon inutile :

1. **Périmètre** : graines, modes (LEGACY / GOAP), version/commit, nombre d'actions observées par règle.
2. **Règles respectées** : loi, ce qui a été observé, nombre d'occurrences.
3. **Règles violées** : loi, description, exemple reproductible (graine, minute, joueurs), gravité (bloquante / à corriger / mineure), fichier probable (`engine/rugby-engine.js:ligne`).
4. **Écarts non tranchés** : cas où la loi officielle n'a pas pu être vérifiée à la source, ou où le comportement relève d'une convention du jeu.
5. **Non couvert** : lois sans échantillon suffisant (par exemple 0 occurrence sur les graines testées). Une absence d'événement n'est pas une conformité.
6. **Recommandation** : au plus trois corrections prioritaires, sans les appliquer.

Règles de prudence : un échantillon de quelques graines ne prouve pas l'absence de défaut ; compter des événements rares
sur peu de graines est du bruit. Si un résultat dépend d'un seuil statistique, le dire. Toujours séparer le **moteur**
(ce qui se passe) du **rendu** (ce que l'on voit à l'écran).

Pour un contrôle approfondi d'une zone précise du moteur, déléguer à l'agent `arbitre-regles-rugby` (rapport seul).
