# Règles officielles du rugby à XV

`world-rugby-laws-2025.pdf` est le règlement officiel World Rugby (Laws of
the Game, édition 2025), téléchargé depuis :

https://passport.world.rugby/media/k2ekxsmo/2501en-world-rugby-laws-2025-compressed.pdf

Référence à utiliser pour vérifier la conformité du moteur de simulation
(`engine/rugby-engine.js`) aux lois du jeu — mêlée (loi 19), maul (loi 16),
touche (loi 18), ruck (loi 15), marque (loi 17), hors-jeu (loi 10), avantage
(loi 7), en-avant/passe en avant (loi 11), essai et transformation (loi 8),
fautes et cartons (loi 9), pénalités et coups francs (loi 20), etc.
C'est le document de référence pour le rôle "Arbitre / vérificateur des
règles" décrit dans `CLAUDE.md`.

`world-rugby-laws-2025.txt` est une extraction texte brute (`pdftotext -layout`)
du PDF ci-dessus, dans l'ordre de lecture. Elle existe pour que l'agent
`arbitre-regles-rugby` (et tout futur agent) puisse consulter la loi exacte
avec uniquement les outils `Read`/`Grep`, sans dépendre d'un outil de rendu
PDF (`pdftoppm`/`poppler-utils`) qui n'est pas garanti disponible dans un
environnement d'exécution éphémère.
