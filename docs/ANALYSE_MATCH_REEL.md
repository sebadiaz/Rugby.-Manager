# Analyse d'un vrai match vs simulation — plan de correction

**Match de référence : France 36 – 14 Irlande, 5 février 2026, Stade de France**
(ouverture du Tournoi des Six Nations — données ESPN via rugbydata/rugbypy :
stats d'équipe du match + agrégation des 46 feuilles de stats individuelles).

**Simulation : moyenne de 20 matchs de 80 min** (graines déterministes, moteur
`engine/rugby-engine.js` au commit de cette analyse).

## Face à face (totaux des deux équipes sur le match)

| Statistique | RÉEL (Fr+Irl) | SIMULATION | Écart |
|---|---|---|---|
| Score total | 50 | 42,7 | ✅ −15 % |
| Essais | 7 | 5,1 | ✅ −27 % |
| Coups de pied dans le jeu | 78 | 75,3 | ✅✅ −3 % |
| Franchissements (line breaks) | 18 | 14,7 | ✅ −18 % |
| Taux de plaquage réussi | 84 % | 87 % | ✅ +3 pts |
| Pénalités concédées | 10 | 6,8 | 🟠 −32 % |
| Turnovers | 15 | 23,9 | 🟠 +59 % |
| Offloads | 25 | 48,7 | 🟠 ×1,9 |
| Mêlées | ~13 (typique 6N) | 23,6 | 🟠 ×1,8 |
| Touches | ~25 (typique 6N) | 14,2 | 🟠 ×0,6 |
| **Courses (carries)** | **255** | **1 056** | 🔴 **×4,1** |
| **Passes** | **347** | **1 556** | 🔴 **×4,5** |
| **Plaquages réussis** | **294** | **919** | 🔴 **×3,1** |
| **Rucks** | **181** | **853** | 🔴 **×4,7** |
| **Mètres ballon en main** | **976** | **6 859** | 🔴 **×7** |
| Défenseurs battus | 56 | 132 | 🔴 ×2,4 |
| Rucks recyclés < 3 s | 52-63 % | 91 % | 🔴 trop rapide |
| Rucks recyclés 3-6 s | 21-33 % | 9 % | 🔴 quasi absents |
| Entrées dans les 22 m | 21 (33 % → essai) | *non suivi* | ⚪ à instrumenter |

## Diagnostic

Les **taux unitaires sont désormais bien calibrés** (score, essais, coups de
pied, % plaquage, franchissements, passes par ruck : réel 1,9 vs sim 1,8) —
mais le **volume d'événements de jeu courant est ~4× le réel**, uniformément.

Deux causes multiplicatives :
1. **Ballon en jeu 64 %** du temps contre ~44 % en réel (×1,45) ;
2. **Cycle de phase ~3,6 s** (ruck 1,5 s + jeu ~2 s) contre **~11,5 s** en réel
   (ruck 3-4 s + circulation 3-4 s + course/contact 3-4 s), soit ×3,2.

Le match réel montre aussi que la sortie de ruck « éclair » systématique est
une sur-correction : même la France (équipe la plus rapide du monde à ce poste)
ne recycle que **52 % de ses rucks en moins de 3 s** — un tiers prend 3 à 6 s.

## Tâches de correction (par priorité)

### T1 — Tempo du cycle de phase (l'écart ×4) 🔴
- Redistribuer les durées de ruck sur le profil RÉEL mesuré : ~55 % en 1,5-3 s,
  ~33 % en 3-6 s, ~12 % en 6 s+ (aujourd'hui : 91 % < 3 s). Garder la latence
  de sortie du 9 (0,2 s) : c'est la durée du regroupement qui doit respirer,
  pas la transmission.
- Allonger la phase de course avant contact : montée défensive avec montée en
  charge progressive (~1 s de mise en route par temps de jeu) pour que le
  porteur lancé fasse 5-8 m avant le contact (réel : 3,8 m/course en moyenne,
  976 m sur 255 courses) au lieu d'être plaqué en ~2 s.
- Objectif chiffré : rucks 850 → ≤ 400/match, passes ≤ 700, plaquages ≤ 450.

### T2 — Équilibre mêlées/touches 🟠
- Réel : ~13 mêlées / ~25 touches. Sim : 23,6 / 14,2 — inversé.
- Réduire encore les sources de mêlée (en-avant au contact, ballon injouable).
- Augmenter les touches : plus de jeux au pied d'occupation qui sortent en
  touche, et surtout **pénalité jouée en touche** (choix quasi systématique en
  vrai hors zone de tir) au lieu de tir/jeu rapide.
- Objectif : mêlées 10-16, touches 20-30.

### T3 — Offloads ÷2 🟠
- 48,7 vs 25 réels. Baisser le taux d'offload de percée (0,30 → ~0,18) ;
  l'offload banal (0,03) est déjà bon. Objectif : 20-30/match.

### T4 — Turnovers −35 % 🟠
- 23,9 vs 15 réels. Une partie suivra mécaniquement T1 (moins de rucks = moins
  d'occasions) ; sinon abaisser légèrement la base de grattage. Objectif : 12-18.

### T5 — Pénalités +40 % 🟠
- 6,8 vs 10 réelles. Renforcer les fautes de ruck (hors-jeu, plongeon,
  ballon non lâché) qui sont la source n°1 en vrai. Se combine avec T2
  (pénalité → touche). Objectif : 9-14, avec conséquences visibles.

### T6 — Instrumenter les entrées dans les 22 m ⚪
- Nouvelle statistique `entrees22` (comptée quand la possession franchit la
  ligne des 22 adverses), affichée dans le panneau Stats.
- Référence réelle : 21 entrées, ~33 % converties en essai. C'est LA métrique
  qui pilotera le chantier « finition zone rouge » (dernier écart de score).

### T7 — Mètres ballon en main (suivra T1) ⚪
- 6 859 vs 976 réels : conséquence directe du volume de courses (×4) et de
  courses individuelles trop longues (6,5 m vs 3,8 m réels). À re-mesurer
  après T1 ; objectif final 800-1 500 m.

## Ce qui est déjà au niveau du réel (à ne pas casser)

- Score (42,7 vs 50) et essais (5,1 vs 7) ;
- Coups de pied dans le jeu (75 vs 78) — quasi parfait ;
- Taux de plaquage (87 % vs 84 %) et franchissements (14,7 vs 18) ;
- Passes par ruck (1,8 vs 1,9) — la structure de jeu est bonne, c'est le
  nombre de cycles qui est en trop ;
- Géométrie des passes (à plat/en retrait), formation 3-4-1 des mêlées,
  répartition défensive en créneaux, 0 téléportation.
