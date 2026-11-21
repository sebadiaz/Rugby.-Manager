# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `44688dc0f197f978da44695b1d959618b6ab17c4` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `b61ade69f1eeb4b7ad4d5746f9a221c796bca15c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.93 | 2.35 | 1 | 12 |
| points | 58.87 | 12.91 | 28 | 85 |
| passes | 407.03 | 45.11 | 312 | 491 |
| passesTentees | 410.7 | 45.82 | 316 | 500 |
| courses | 261 | 26 | 208 | 318 |
| metresGagnes | 1043.26 | 100.8 | 760.56 | 1233.366 |
| coupsDePied | 59.3 | 8.65 | 44 | 83 |
| plaquagesTentes | 334.8 | 35.85 | 259 | 421 |
| plaquagesReussis | 289.77 | 31.19 | 221 | 361 |
| rucks | 208.07 | 23.71 | 169 | 258 |
| melees | 16.93 | 2.37 | 11 | 22 |
| touches | 26.73 | 4.86 | 19 | 43 |
| mauls | 7.57 | 2.35 | 2 | 12 |
| penalitesConcedees | 21.9 | 4.66 | 13 | 34 |
| turnovers | 17.7 | 4.16 | 11 | 27 |
| enAvants | 13.07 | 2.39 | 8 | 17 |
| cartonsJaunes | 0.67 | 0.7 | 0 | 2 |
| tempsJeuEffectifMin | 34.49 | 2.66 | 30.17 | 39.778 |
| possessionA | 50.9 | 4.63 | 39 | 60 |
| essaisDuN15 | 0.47 | 0.56 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
