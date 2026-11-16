# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `4aa2abc6d0e91085ed17f2c52eedac4aa87d15e9` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `1c935bec168ab31f484bd2b2c7976095ec6318c8`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 8.03 | 1.94 | 4 | 12 |
| points | 64.67 | 13.01 | 42 | 87 |
| passes | 388.67 | 38.39 | 291 | 454 |
| passesTentees | 393.03 | 39.2 | 293 | 458 |
| courses | 257.1 | 23.46 | 201 | 312 |
| metresGagnes | 1077.66 | 109.44 | 889.728 | 1357.41 |
| coupsDePied | 53.7 | 8.11 | 38 | 70 |
| plaquagesTentes | 328.6 | 33.88 | 251 | 410 |
| plaquagesReussis | 289.53 | 29.97 | 220 | 361 |
| rucks | 207.83 | 21.04 | 157 | 256 |
| melees | 16.73 | 3.1 | 10 | 23 |
| touches | 24.47 | 4.2 | 17 | 34 |
| mauls | 5.57 | 2.96 | 1 | 13 |
| penalitesConcedees | 22.53 | 4.63 | 14 | 34 |
| turnovers | 17.1 | 4.94 | 6 | 28 |
| enAvants | 12.27 | 2.94 | 3 | 18 |
| cartonsJaunes | 0.63 | 0.8 | 0 | 3 |
| tempsJeuEffectifMin | 32.29 | 2.57 | 27.125 | 37.208 |
| possessionA | 49.13 | 5.92 | 39 | 64 |
| essaisDuN15 | 0.37 | 0.48 | 0 | 1 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
