# Speed Run AM

A 3D running game designed by the kids. You start in a **big workout room** and run through doors into
**10 levels**. No ads.

## The workout room

- **7 treadmills**: they push you back, and the longer you run on one, the faster you get (the 💨 bar).
- **A giant keyboard**: each new key you step on makes you a tiny bit faster.
- **The cape** on the yellow stand: jump up to grab it. With it you jump farther and glide down slowly.
  You keep it forever.
- **10 doors**: door 1 is open. Finish a level to open the next door.

## The levels

Every level's floor is a gigantic keyboard: pink letters on level 1, brown on level 2, pink on 3, and so on.

Levels 1–9 (Baby, Youth, Adult, Elderly, Ghost, Robot, Space, Lava, Mega Maze) have the same rooms, harder each time:

1. **The chase room**: someone chases you to the far door. Use the pillars!
2. **The boulder**: it rolls down the corridor at you. Hide in the holes in the walls.
3. **Jumps** over green goo.
4. **Closing walls**: run through while they're open.
5. **The poop climb**: once you step in, poop rises from the floor. Climb before it gets you!
6. **The maze**: its letters go red, yellow, purple, pink. Dead ends are traps that send you all the way
   back to the start. The maze gets bigger every level.

Level 10 is **The Big Jump**: a jump too big to make, but the magic logs float across it.

If you make a mistake you break into pieces and start again at the last green checkpoint. Lose 5 times in a
row and you're sent back to the workout room.

## Controls

- **iPad/iPhone**: put your thumb down anywhere on the left side to get a joystick, drag on the right
  side to look around, tap **JUMP**.
- **Mac**: WASD or arrow keys to run, space to jump, Q/E or drag the mouse to look, scroll to zoom.

## For grown-ups

- Progress (levels done, cape) is saved on the device.
- The ⏸ button has "Workout room" and "Title screen". The 🏠 Arcade button is on the title screen.
- The kids called level 5 the "deaf" (death?) level. It's called "Ghost" for now, and its name is easy to change
  in `src/sim/levels.ts` (`LEVEL_INFO`). Levels 6–8 names were made up and can be changed the same way.
