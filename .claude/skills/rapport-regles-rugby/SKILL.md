---
name: rapport-regles-rugby
description: Produit un rapport de conformité aux lois officielles du rugby à XV (World Rugby) à partir d'actions réellement simulées par le moteur de Rugby Manager (passes, en-avants, mêlées, touches, rucks, mauls, coup d'envoi, hors-jeu, avantage, essais, transformations, pénalités). À utiliser après toute modification du moteur ou de l'IA des joueurs, ou quand on demande « est-ce que c'est dans les règles ? », un audit des lois ou un rapport d'arbitrage.
---

# Rapport de conformité aux lois du rugby

Ce skill **ne modifie pas le code** : il observe des matchs simulés, confronte chaque action aux lois officielles
et rend un rapport. Les corrections sont une étape séparée, demandée par l'utilisateur.

## 1. Fixer la référence officielle
- **Texte de référence du dépôt : `rules/world-rugby-laws-2025.txt`** (World Rugby, Laws of the Game 2025). Citer les
  lois avec CETTE numérotation : 3 équipe et remplacements, 5 temps, 6 officiels, 7 avantage, **8 points (essai,
  transformation, pénalité, drop)**, **9 jeu déloyal**, **10 hors-jeu et en-jeu dans le jeu courant**, **11 en-avant et
  passe en avant**, 12 coup d'envoi et renvois, 13 joueurs au sol, 14 plaquage, 15 ruck, 16 maul, 17 marque, 18 touche,
  19 mêlée, 20 pénalité et coup franc, 21 en-but. Le résumé `docs/REGLES_RUGBY.md` peut utiliser d'anciens numéros :
  en cas d'écart, le texte 2025 prime.
- Pour toute règle **douteuse ou ambiguë**, ne jamais répondre de mémoire : lire l'article exact dans
  `rules/world-rugby-laws-2025.txt` (`grep -n`), et si besoin le site officiel (World Rugby, law.world.rugby) avec
  l'agent `web-fetch`. Citer le numéro d'article (par exemple 12.6, 17.4). Si la source est inaccessible, le dire
  (« non vérifié à la source officielle ») au lieu d'affirmer.
- Distinguer : **loi officielle**, **convention du jeu** (ex. dialogues 9/10/8, choix tactiques) et **hypothèse GOAP**.
  Une convention du jeu n'est jamais présentée comme une loi.

## 2. Observer des actions réelles (jamais des statistiques inventées)
Lancer l'audit existant, sur plusieurs graines et les deux modes :

```bash
for g in 1 2 3 4 5 6; do node server/audit-regles-simulation.js $g LEGACY; node server/audit-regles-simulation.js $g GOAP; done
```

`server/audit-regles-simulation.js` vérifie pendant la simulation : passes vers l'avant (L11), en-avant → mêlée (L11/12),
essai dans l'en-but (L8), transformation après essai (L8), avantage résolu (L7), coup d'envoi (adversaires à 10 m,
partenaires derrière le ballon, L12.5), mêlée (3/4 à 5 m, L19), ruck (hors-jeu, L15), joueurs sur le terrain (≥ 12), ballon valide.
Le mode GOAP est lent (environ 1 min par match) : lancer en parallèle ou en arrière-plan.

Lire la ligne JSON de chaque graine avant de conclure :
- `termine` doit être vrai ; sinon (code de sortie 2) le match n'a pas été joué jusqu'au bout et le rapport est incomplet.
- `scoreEgal` doit être vrai : le score recomposé (essai 5, transformation 2, pénalité 3, drop 3, **essai de pénalité 7 =
  5 + 2**, calcul dans `server/audit-score.js`) doit égaler le score du moteur ; sinon (code de sortie 1) c'est un défaut à
  expliquer avant toute autre conclusion.
- `nonCouvert` liste les règles que le script ne vérifie PAS : les reporter telles quelles dans la section « Non couvert ».

Pour une règle que l'audit ne couvre pas, écrire un petit script jetable dans le scratchpad (jamais dans le dépôt) :
`new MatchEngine(graine, 4800[, configGOAP()])`, envelopper `m.log` pour capter les événements (`PASSE`, `TOUCHE`,
`MELEE`, `PENALITE`, `ESSAI`, `PENALITE_ENVOI`…) et comparer à la loi. Lire l'état avec `m.getState()`.

## 3. Cas à passer en revue (au minimum)
| Loi | Contrôle |
| --- | --- |
| 11 | Une passe en avant et un en-avant sont sanctionnés (mêlée) |
| 12 | Coup d'envoi : receveurs à 10 m, botteur derrière le ballon. Ballon qui n'atteint pas les 10 m (12.6) : **au choix de l'équipe adverse, nouveau coup d'envoi ou mêlée**, sauf s'il est joué avant (12.7) ou retombe en arrière (soufflé) : on continue. Renvoi aux 22 m : la ligne des 22 m à franchir ; renvoi d'en-but : la ligne des 5 m (12.12-12.13) |
| 9 / 10 | Un chasseur arrivé avant le ballon n'est pas fautif ; la faute est un **geste** (charge, obstruction : loi 9 jeu déloyal) ; hors-jeu en jeu général (loi 10) |
| 14 | Plaqué : libère le ballon ; plaqueur se relève ; ruck après contact |
| 15 | Ruck : pas de ballon à la main, hors-jeu derrière le pied arrière, joueurs liés qui attendent la sortie du ballon |
| 16 | Maul : avance, s'arrête, ballon utilisé ou mêlée |
| 17 | Marque : réception directe dans ses 22 m, coup franc |
| 18 | Touche : sortie → touche pour l'adversaire, droit à la touche rapide, alignement, lanceur sur la ligne |
| 19 | Mêlée : formation, introduction, hors-jeu des 3/4 et du 9 adverse |
| 8 | Essai : ballon aplati dans l'en-but ; transformation après essai ; pénalité au but ; essai de pénalité 7 points ; points |
| 6 | Arbitre et assistants : assistant de touche dehors, drapeau levé et bras tendu vers l'équipe qui lance ; derrière les poteaux sur un tir au but |
| 7 / 20 | Avantage appliqué puis résolu ; pénalité et coup franc : conséquence claire (tape, touche, but, mêlée) |

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
