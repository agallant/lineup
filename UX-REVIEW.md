# UX review

An end-to-end look at every main screen as a **first-time** player and as a **returning** one, at tablet
size (820 px wide), from screenshots (`node scripts/e2e.mjs ux --shots <dir>`). What was found, what was
changed, and what is left.

## First-time player

| Finding                                                                                                                                                | What changed                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every game opened on whatever song sorted first: a demo scale ("Scale + Twinkle Twinkle (demo)", "Island Strum (demo)", "C major scale (quick test)"). | A new player now starts on the first step of that game's Learn path (Hot Cross Buns, Five fingers on C, Open strings...). Returning players keep the song they last chose. |
| The set-up sections were numbered by hand and skipped a number when a section was hidden (Strumline went 1, 2, 4).                                     | Numbers come from a counter, so they follow what is shown.                                                                                                                 |
| The mic section of the hit games carried debug tools (hit monitor, click-leak test, copy log) in a beginner's face.                                    | Folded into "Hit monitor and checks (for troubleshooting)".                                                                                                                |
| The Learn page was one long scroll of every path, fully expanded.                                                                                      | Each path is a card with its progress and a **Start** / **Continue** button; its steps open only for paths already begun.                                                  |
| The first screen of a game explained little before asking for the microphone.                                                                          | Kept: the first-time tip (three lines) and the headphones notice stay at the top, and the song menu now has a sensible starting song so Play works at once.                |

## Returning player

| Finding                                                                                    | What changed                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Getting back to the last song took: home, game, scroll the song list.                      | The home screen has a **Play again: song** card, above the suggested next step, when anything has been played.                                                                                                                                                                                          |
| Song lists only grew: one long menu, easiest first, random songs mixed in under a heading. | A **song picker** above every song menu: _Songs_ or _Random song_ (apart), search by title, sort (easiest first, hardest first, A to Z, best stars first), a difficulty band (easy 1-3, medium 4-6, hard 7-10) and "hide songs I have cleared". The sort, band and hide-cleared choices are remembered. |
| Nothing marked which songs were new to the player.                                         | Best stars show in the menu already; "hide cleared" now makes the unplayed and unfinished ones easy to find.                                                                                                                                                                                            |

## Checked and left as they are

- The home screen is long but ordered by what a player needs: level, this week, **play again**, up next, the
  daily challenges, the games, progress, tools, set-up. Sections have headings.
- Options groups settings by what they do (sound, scoring, goals, display, data) and explains each.
- The scoreboard, collection and packs pages are for returning players; their empty states say what to do.

## Still open

- The Packs page lists every song of a pack on one page; a pack with many songs wants folding or paging as
  the library grows.
- Song titles in the menu carry the difficulty and best stars, so on a phone they are cut off. A two-line
  option label is not possible in a native menu; a custom list would fix it.
- A search across _all_ games (find a song by name without knowing the game) would help once there are
  hundreds of songs.
