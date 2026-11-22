# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `5e57398a14e0aa8a6a380a0a25942c7f3df9cc42` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `bf53290a170351f1c8ab9001b6e2ed2873a1f9f8`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.73 | 2.24 | 2 | 12 |
| points | 57.47 | 15.06 | 28 | 94 |
| passes | 397.03 | 37.17 | 329 | 471 |
| passesTentees | 400.93 | 37.48 | 332 | 475 |
| courses | 260.33 | 22.75 | 226 | 313 |
| metresGagnes | 1012.91 | 115.8 | 790.739 | 1288.16 |
| coupsDePied | 57.9 | 7.04 | 43 | 72 |
| plaquagesTentes | 338.57 | 28.08 | 290 | 396 |
| plaquagesReussis | 292.93 | 26.22 | 253 | 350 |
| rucks | 205.47 | 21.54 | 167 | 257 |
| melees | 17.73 | 3.29 | 12 | 25 |
| touches | 25.7 | 5.36 | 16 | 37 |
| mauls | 7.33 | 2.76 | 3 | 16 |
| penalitesConcedees | 21.83 | 3.8 | 15 | 29 |
| turnovers | 18.67 | 5.88 | 5 | 30 |
| enAvants | 13.67 | 3.25 | 8 | 21 |
| cartonsJaunes | 0.57 | 0.67 | 0 | 2 |
| tempsJeuEffectifMin | 33.86 | 2.12 | 29.425 | 38.352 |
| possessionA | 51.23 | 4.59 | 40 | 61 |
| essaisDuN15 | 0.47 | 0.72 | 0 | 3 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
