# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `4781d945051eec6cdd8917638151053717f4a1e3` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `b61ade69f1eeb4b7ad4d5746f9a221c796bca15c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.07 | 2.29 | 1 | 12 |
| points | 59.13 | 12.81 | 28 | 85 |
| passes | 409.47 | 45.12 | 312 | 491 |
| passesTentees | 413.17 | 45.77 | 316 | 500 |
| courses | 261.97 | 25.62 | 208 | 318 |
| metresGagnes | 1045.68 | 99.78 | 760.56 | 1233.366 |
| coupsDePied | 59.57 | 8.7 | 44 | 83 |
| plaquagesTentes | 336.73 | 35.38 | 259 | 421 |
| plaquagesReussis | 291.1 | 30.83 | 221 | 361 |
| rucks | 208.73 | 23.5 | 169 | 258 |
| melees | 16.8 | 2.41 | 11 | 22 |
| touches | 26.77 | 4.86 | 19 | 43 |
| mauls | 7.57 | 2.35 | 2 | 12 |
| penalitesConcedees | 21.7 | 4.69 | 13 | 34 |
| turnovers | 17.53 | 4.08 | 11 | 27 |
| enAvants | 12.97 | 2.29 | 8 | 17 |
| cartonsJaunes | 0.63 | 0.71 | 0 | 2 |
| tempsJeuEffectifMin | 34.66 | 2.54 | 30.17 | 39.778 |
| possessionA | 50.97 | 4.69 | 39 | 60 |
| essaisDuN15 | 0.5 | 0.56 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
