# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `26522ffbb321b2602f4658f58ab9ab568cd571ac` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.6 | 1.8 | 3 | 11 |
| points | 55.77 | 11.3 | 33 | 77 |
| passes | 412.3 | 45.56 | 344 | 513 |
| passesTentees | 415.5 | 44.95 | 347 | 514 |
| courses | 267.43 | 24.93 | 226 | 318 |
| metresGagnes | 1034.24 | 93.03 | 811.296 | 1247.562 |
| coupsDePied | 60.67 | 7.29 | 41 | 75 |
| plaquagesTentes | 349 | 32.92 | 295 | 411 |
| plaquagesReussis | 301.4 | 31.02 | 246 | 353 |
| rucks | 213.33 | 22.7 | 176 | 256 |
| melees | 18.57 | 3.18 | 13 | 26 |
| touches | 26.1 | 4.42 | 16 | 35 |
| mauls | 7.17 | 2.53 | 3 | 14 |
| penalitesConcedees | 22.53 | 4.67 | 11 | 30 |
| turnovers | 18.47 | 4.54 | 10 | 26 |
| enAvants | 14.67 | 2.94 | 9 | 20 |
| cartonsJaunes | 0.87 | 1.06 | 0 | 4 |
| tempsJeuEffectifMin | 35.09 | 2.38 | 30.997 | 39.263 |
| possessionA | 49.97 | 5.84 | 37 | 60 |
| essaisDuN15 | 0.5 | 0.67 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
