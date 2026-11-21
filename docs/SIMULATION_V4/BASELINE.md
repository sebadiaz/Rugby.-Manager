# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `ae41a87459dbfa03a27ebda3998e4ce71e3ca83c` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `2c110568049efb28f28b83a238a42d0ec43b9271`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.8 | 1.62 | 4 | 11 |
| points | 57.07 | 11.2 | 33 | 79 |
| passes | 407.43 | 41.3 | 321 | 499 |
| passesTentees | 410.93 | 41.27 | 323 | 503 |
| courses | 270.13 | 24.23 | 238 | 333 |
| metresGagnes | 1064.69 | 101.53 | 911.364 | 1312.173 |
| coupsDePied | 59.9 | 7.42 | 49 | 78 |
| plaquagesTentes | 354.7 | 33.32 | 310 | 423 |
| plaquagesReussis | 306.47 | 27.92 | 268 | 369 |
| rucks | 215.13 | 20.09 | 186 | 268 |
| melees | 17.27 | 3.19 | 12 | 25 |
| touches | 27.3 | 4.83 | 18 | 39 |
| mauls | 8.37 | 2.96 | 4 | 14 |
| penalitesConcedees | 23.53 | 3.55 | 16 | 30 |
| turnovers | 20.03 | 3.97 | 11 | 28 |
| enAvants | 13.37 | 2.7 | 9 | 19 |
| cartonsJaunes | 1 | 1.26 | 0 | 4 |
| tempsJeuEffectifMin | 35.02 | 2.18 | 31.517 | 40.03 |
| possessionA | 49.67 | 4.33 | 42 | 59 |
| essaisDuN15 | 0.4 | 0.66 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
