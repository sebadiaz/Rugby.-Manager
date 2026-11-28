# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `7c4db1a7888b35c783e8fdf389a7c7529593f502` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `7c4db1a7888b35c783e8fdf389a7c7529593f502`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.5 | 2.29 | 3 | 12 |
| points | 60.37 | 16.08 | 25 | 92 |
| passes | 402.8 | 46.16 | 315 | 512 |
| passesTentees | 406.87 | 46.46 | 318 | 518 |
| courses | 264.97 | 23.64 | 214 | 314 |
| metresGagnes | 1081.95 | 88.59 | 898.011 | 1275.42 |
| coupsDePied | 63.67 | 9.63 | 45 | 82 |
| plaquagesTentes | 346.63 | 34.57 | 266 | 411 |
| plaquagesReussis | 298.83 | 28.7 | 241 | 359 |
| rucks | 209.43 | 21.65 | 161 | 250 |
| melees | 17.3 | 2.84 | 11 | 23 |
| touches | 29.07 | 4.87 | 17 | 40 |
| mauls | 8.6 | 2.62 | 4 | 14 |
| penalitesConcedees | 22.67 | 3.03 | 17 | 30 |
| turnovers | 19.37 | 4.23 | 8 | 29 |
| enAvants | 13.77 | 2.54 | 8 | 19 |
| cartonsJaunes | 0.83 | 0.86 | 0 | 3 |
| tempsJeuEffectifMin | 34.15 | 2.34 | 29.76 | 38.17 |
| possessionA | 49.4 | 5.94 | 35 | 62 |
| essaisDuN15 | 0.43 | 0.56 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
