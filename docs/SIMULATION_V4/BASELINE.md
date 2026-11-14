# BASELINE — moteur existant (RM4-G00)

Mesurée par `node server/v4/measure-baseline.js 30 --ecrire` (lecture seule, aucune modification du moteur).

## Paramètres

- SHA mesuré : `8ae1f44d112fd974fae9a65bfc7fb1c8a5af8137` (branche `claude/readme-details-6aj3jt`) ; `origin/main` au moment de la mesure : `7429544a8796369eb38f15aad0d6c918b49762aa`
- Graines 1..30, durée 4800 s, pas fixe dt = 0.1 s, `jouerJusquAuSifflet`, v22.22.0.
- Équipes par défaut du moteur, sans blessures configurées autrement que par défaut. Valeurs cumulées des deux équipes par match (possession : équipe A).

## Résultats

| Métrique | Moyenne | Écart-type | Min | Max |
|---|---:|---:|---:|---:|
| essais | 5.37 | 1.82 | 2 | 10 |
| points | 48.57 | 11.97 | 26 | 77 |
| passes | 420 | 43.17 | 333 | 507 |
| passesTentees | 423.93 | 42.86 | 340 | 511 |
| courses | 261.07 | 27.2 | 213 | 320 |
| metresGagnes | 1003.39 | 106.69 | 784.572 | 1261.093 |
| coupsDePied | 58.83 | 9.37 | 41 | 84 |
| plaquagesTentes | 342.13 | 36.57 | 280 | 426 |
| plaquagesReussis | 300 | 32.64 | 242 | 377 |
| rucks | 210.37 | 24.95 | 165 | 260 |
| melees | 18.9 | 3.13 | 12 | 25 |
| touches | 26.63 | 3.67 | 18 | 34 |
| mauls | 7.9 | 2.56 | 2 | 14 |
| penalitesConcedees | 23.47 | 5.35 | 12 | 35 |
| turnovers | 18.37 | 5.81 | 9 | 31 |
| enAvants | 14.5 | 3.35 | 6 | 21 |
| cartonsJaunes | 1.17 | 1.1 | 0 | 4 |
| tempsJeuEffectifMin | 34.94 | 3.12 | 27.872 | 42.575 |
| possessionA | 48.6 | 6.18 | 37 | 60 |
| essaisDuN15 | 0.27 | 0.44 | 0 | 1 |

## Données brutes

`docs/SIMULATION_V4/fixtures/baseline_30_graines.json` : une ligne par graine (`parGraine`) et 8 captures de positions des 30 joueurs (`captures`, phases RUCK, MELEE, TOUCHE, MAUL, COUP_ENVOI, PORTE, RUCK, MELEE).

## Limites

- Ce sont les statistiques du moteur tel qu'il est (placements par rôles, pas encore d'agents à buts) : elles servent de référence « avant » pour les tâches RM4-G01 et suivantes.
- Les fourchettes « réalistes » du dépôt (`server/simulate-batch.js`) restent des repères, pas des seuils : voir `docs/SIMULATION_V4/README.md`.
