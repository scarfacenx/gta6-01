# Coral Heat — open-world crime game in 3D

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/scarfacenx/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/scarfacenx/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Coral Heat** is an original third-person 3D open-world crime game for
the make.fun [gta6-01 bounty](https://make.fun/bounty/gta6-01). Danny
Cole is back in Coral Bay, and Vera Kline owns his debt. Explore a
sun-soaked modern city on foot and by car, steal cars, dodge the police
as your wanted level rises, run five story missions, pick up taxi fares,
and take back the city — all in the browser, no build step, no network.
The world is rendered with three.js (vendored under `game/vendor/`);
the simulation, HUD, and sound are all original code written for this
entry.

## What's in the game

- **A living 3D city**: 7×7 avenues, Downtown, Old Town, North Hills,
  Harbor Docks, and Coral Beach with palms, umbrellas, and the sea —
  traffic that follows the roads, pedestrians on the sidewalks, and a
  day/night cycle with car headlights after dark.
- **Third-person camera**: it follows behind you on foot and behind the
  car while driving. Move the mouse to look around (click to lock the
  pointer); the camera swings back behind you when the mouse rests.
- **Cars worth stealing**: low-poly coupes, sedans, trucks, and taxis,
  each with its own speed, handling, and toughness. Yank a driver out
  or take a parked one.
- **Wanted level + police**: crimes raise your stars; CBPD cars and foot
  cops chase, ram, and shoot, sirens flashing. Lose them to cool down —
  get caught on foot and you're busted.
- **Five story missions**: steal a clean ride, pick up Mia, settle the
  dockside debt, hit Coral Bay Savings, and survive the Heat Wave.
- **Side work**: green `$` markers are taxi fares — pick passengers up
  and drop them off for cash. Cash, health, and ammo pickups are
  scattered around the city.
- **Combat**: fists up close, a pistol once you earn it, muzzle flashes,
  car explosions, and a health system that regenerates out of danger.
- **HUD + minimap**: cash, health, weapon, wanted stars, mission banner
  with distance, speedometer, car condition, and a live top-down minimap
  with cop blips, mission markers, and fare markers.
- **Save**: progress (cash, mission, health, position) saves
  automatically to local storage; continue from the title screen.
- **Sound**: a fully synthesized WebAudio soundtrack — bassline groove,
  sirens, engine hum, gunshots, and explosions. No audio files.

## How to play

- **Move:** WASD / arrows to walk (Shift to sprint), mouse to look
  around — click to lock the pointer. The camera follows behind you.
- **Fight:** left click to punch or shoot through the centre crosshair.
  `1` fists, `2` pistol.
- **Drive:** `E` to steal / enter a car, `W/S` drive, `A/D` steer,
  `Space` handbrake, `E` to get out. The camera follows behind the car.
- **Missions:** follow the yellow marker. `Enter` starts the next mission.
- **Pause:** `P` or `Esc`. **Mute:** `M`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Screenshots

The four shots in `screenshots/` are real renders of the game itself
(taken with `?shot=chase|drive|mission|start&seed=7`): a police chase
with three wanted stars, driving Downtown, the dockside firefight, and
the title screen over the living city.

## Originality

Coral Heat is 100% original: its city, characters, vehicles, story, art,
and sound were made for this entry. Nothing from Rockstar Games' Grand
Theft Auto series or any other commercial game is used. The only
third-party code is the three.js library, vendored as minified files
under `game/vendor/`.
