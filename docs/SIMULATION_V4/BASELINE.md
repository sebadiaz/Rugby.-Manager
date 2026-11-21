# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `4438d73cf66967a4cf18f20f53d7affdb7e15de2` (branche `claude/sharp-faraday-2c0k9h`) ; `origin/main` au moment de la mesure : `98b2da8b4b0476264491a8675fa9ca4b3e981957`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.23.4.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 7.53 | 1.91 | 4 | 11 |
| points | 62.3 | 12.03 | 39 | 86 |
| passes | 409.7 | 32.32 | 343 | 476 |
| passesTentees | 413.83 | 32.4 | 347 | 482 |
| courses | 264.77 | 18.08 | 225 | 296 |
| metresGagnes | 1086.03 | 92.55 | 850.858 | 1259.824 |
| coupsDePied | 60.37 | 8.87 | 43 | 76 |
| plaquagesTentes | 345.03 | 24.24 | 301 | 379 |
| plaquagesReussis | 299.93 | 22.9 | 250 | 340 |
| rucks | 211.37 | 16.57 | 174 | 246 |
| melees | 18.13 | 3.33 | 10 | 26 |
| touches | 24.4 | 3.54 | 17 | 31 |
| mauls | 7.1 | 2.87 | 2 | 13 |
| penalitesConcedees | 23.6 | 3.73 | 17 | 32 |
| turnovers | 18.07 | 3.92 | 9 | 27 |
| enAvants | 13.67 | 3.08 | 6 | 20 |
| cartonsJaunes | 0.73 | 1.15 | 0 | 4 |
| tempsJeuEffectifMin | 34.64 | 1.97 | 30.573 | 38.36 |
| possessionA | 49.97 | 5.71 | 38 | 61 |
| essaisDuN15 | 0.3 | 0.53 | 0 | 2 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
