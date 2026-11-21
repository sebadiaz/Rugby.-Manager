# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `b61ade69f1eeb4b7ad4d5746f9a221c796bca15c` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `b61ade69f1eeb4b7ad4d5746f9a221c796bca15c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.2 | 2.75 | 2 | 14 |
| points | 59.63 | 16.01 | 25 | 96 |
| passes | 397.07 | 38.37 | 321 | 473 |
| passesTentees | 400.9 | 38.41 | 326 | 478 |
| courses | 257.73 | 24.65 | 193 | 308 |
| metresGagnes | 1035.27 | 116.41 | 700.864 | 1253.208 |
| coupsDePied | 59.93 | 9.08 | 44 | 82 |
| plaquagesTentes | 336.37 | 33.32 | 271 | 409 |
| plaquagesReussis | 289.53 | 29.69 | 234 | 354 |
| rucks | 203.47 | 23.04 | 151 | 244 |
| melees | 17.83 | 3.62 | 11 | 28 |
| touches | 25.6 | 5.49 | 13 | 37 |
| mauls | 8.07 | 2.59 | 3 | 14 |
| penalitesConcedees | 22.13 | 3.97 | 15 | 33 |
| turnovers | 18.43 | 4.81 | 8 | 25 |
| enAvants | 13.67 | 3.39 | 8 | 22 |
| cartonsJaunes | 0.73 | 0.73 | 0 | 2 |
| tempsJeuEffectifMin | 33.96 | 2.36 | 28.605 | 37.885 |
| possessionA | 51 | 4.66 | 38 | 62 |
| essaisDuN15 | 0.3 | 0.46 | 0 | 1 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
