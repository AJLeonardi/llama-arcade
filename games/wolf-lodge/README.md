# Llama Wolf Lodge

A lodge with an indoor water park, in 3D, made to look and move as real as we can. Inspired by Great Wolf
Lodge. You arrive in the car park, walk in, and book a room at the front desk.

## What's in it

- **The front desk:** book a **Basic Room** (one bed), a **Nice Room** (the Wolf Den Suite, with a cave den
  of bunk beds) or a **Luxury Suite** (king bed, fireplace, your own hot tub, a KidCabin with bunk beds).
  You get a wristband. It opens your room's door and the water park gate.
- **Your room:** down the guest-room hall. Beds are bouncy. You can sleep in yours.
- **The water park** (through the gate at the back of the lobby, under a glass roof):
  - 🌪️ **Twister Tube:** in a tube, side to side to side, a big drop, then up and down in a giant funnel.
  - 🐺 **Wolf Drop:** stand in the capsule at the top. 3, 2, 1, the floor drops! Plummet down (airtime),
    then very fast side to side.
  - 🚽 **Flush Bowl:** side to side, round and round a giant toilet bowl, FLUSH, a drop, then straight down.
  - 🌊 **Big Dipper:** a giant open drop into a funnel, up and down, up and down, flushed out into a tube.
  - 🛟 **Lazy River:** float round and round. Paddle or steer, and get out when you like.
  - The kids' fort with the giant tipping bucket (its water comes out in blocks that smash when they land),
    lifeguards, lounge chairs.
  - Walk up the slide towers' stairs (railings all the way), or press the button at the bottom for a quick
    climb.
- **The adventure wing:**
  - 🪄 **Wand Quest:** get a magic wand at the shop, find the 8 glowing runes hidden around the lodge, then
    wake the dragon.
  - 🧗 **Howling Heights ropes course:** stairs up, a wobbly plank bridge, a balance beam, stepping logs, a
    climbing net to the high level, a high beam, and a zip line down. Fall off and the harness catches you.

The slides have real physics: gravity, friction, riding up the side of the tube in the turns, and in the
funnels and the bowl you swing up and down the walls until you slow down and drop out of the hole.

## How to play

| | iPad / iPhone | Mac |
|---|---|---|
| Walk / run | joystick (left thumb): push a little to walk, all the way to run | WASD or arrows (hold Shift to walk) |
| Look around | drag on the right | drag the mouse, Q/E, scroll to zoom |
| Jump | JUMP | Space |
| Do the thing (book, ride, wave the wand...) | the yellow button | F or Enter |
| On a slide: faster / slower | 🚀 / 🐢 (or push the joystick) | W / S |
| Ride camera: behind you or your own eyes | 🎥 | C |
| Pause (and quick trips to your room, the water park...) | ⏸ | Esc |

## For grown-ups

- Saves the booked room, the wand and the runes found (`gameStorage('wolf-lodge')`).
- Debug: `?at=park|lobby|adv|rooms|ropes`, `?tier=1..3` (pretend you booked), `?ride=twister|drop|bowl|dipper|river1|zip`.
  `window.__lodge` has the player, the rider, the scene and `tp(x, y, z, yaw)`.
