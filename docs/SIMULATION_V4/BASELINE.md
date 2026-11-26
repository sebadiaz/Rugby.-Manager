# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `abc5fce6880f835cd36722ed02da95709482249c` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `67ef686e3429bccd6e1ec293152a6a7c204b4d6c`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 6.9 | 2.27 | 2 | 12 |
| points | 57.93 | 15.17 | 22 | 87 |
| passes | 418.87 | 42.61 | 309 | 514 |
| passesTentees | 422.97 | 42.5 | 316 | 520 |
| courses | 273 | 27.05 | 226 | 338 |
| metresGagnes | 1081.57 | 150.32 | 731.095 | 1396.736 |
| coupsDePied | 63.03 | 6.94 | 48 | 74 |
| plaquagesTentes | 354.13 | 36.62 | 292 | 436 |
| plaquagesReussis | 305.97 | 30.78 | 253 | 377 |
| rucks | 216.6 | 22.74 | 178 | 263 |
| melees | 18.1 | 3.52 | 10 | 24 |
| touches | 26.1 | 4.82 | 17 | 41 |
| mauls | 7.07 | 3.01 | 2 | 15 |
| penalitesConcedees | 22.47 | 4.21 | 17 | 32 |
| turnovers | 17.77 | 4.45 | 10 | 27 |
| enAvants | 14.37 | 3.15 | 9 | 20 |
| cartonsJaunes | 0.63 | 0.75 | 0 | 2 |
| tempsJeuEffectifMin | 34.67 | 2.57 | 29.083 | 38.888 |
| possessionA | 51.33 | 4.5 | 42 | 65 |
| essaisDuN15 | 0.33 | 0.54 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
