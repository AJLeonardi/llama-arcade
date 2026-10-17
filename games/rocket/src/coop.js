import { Sfx, button, circle, ctx, game, panel, text, toast, wrapText } from './core.js';
import { Net } from './net.js';
/* Playing together: wait for each other before taking off, fly at the same speed, and decide planets together.
   Messages: ready / unready (waiting to fly), go (both ready: start now), answer (yes/no at a planet). */

function flightSpeed(a) { return 200 + a.tier * 40 + Math.min(2, a.speed) * 25; }

const Coop = {
  mine: null,           // what I'm waiting to fly: { from: 'earth' | 'planet', leg, speed }
  start: null,          // called as start(leg, speed, together) when it's time to go
  friendReady: null,
  together: false,      // flying together right now
  answers: {},          // planet answers: answers[leg] = { me, friend }

  // Ask to fly. Solo players go straight away; with a friend we wait until they're ready too.
  ready(req, start) {
    const f = Net.friend;
    if (!Net.connected) { this.together = false; return start(req.leg, req.speed, false); }
    if (f && (f.scene === 'space' || f.scene === 'launch')) {
      toast(`${Net.friendName()} is already flying. Go catch them! 🚀`, '#9fd3ff');
      this.together = false;
      return start(req.leg, req.speed, false);
    }
    this.mine = req;
    this.start = start;
    Net.send({ t: 'ready', ...req });
    game.modal = makeWaitModal();
    this.check();
  },
  check() {
    const m = this.mine, f = this.friendReady;
    if (!m || !f || f.from !== m.from || (m.from === 'planet' && f.leg !== m.leg)) return;
    // both ready: the closer start and the slower speed, so both rockets can do it and stay side by side
    const leg = Math.min(m.leg, f.leg), speed = Math.min(m.speed, f.speed);
    Net.send({ t: 'go', leg, speed });
    this.go(leg, speed);
  },
  go(leg, speed) {
    const start = this.start;
    this.mine = null;
    this.friendReady = null;
    if (game.modal && game.modal.isWait) game.modal = null;
    this.together = true;
    this.answers = {};
    Sfx.go();
    start(leg, speed, true);
  },
  cancel() {
    if (this.mine) Net.send({ t: 'unready' });
    this.mine = null;
    if (game.modal && game.modal.isWait) game.modal = null;
  },
  goSolo() {
    const m = this.mine, start = this.start;
    this.cancel();
    this.together = false;
    if (m) start(m.leg, m.speed, false);
  },
  onMessage(msg) {
    if (msg.t === 'ready') { this.friendReady = msg; this.check(); }
    else if (msg.t === 'unready') this.friendReady = null;
    else if (msg.t === 'go') { if (this.mine) this.go(msg.leg, msg.speed); }
    else if (msg.t === 'answer') { (this.answers[msg.leg] = this.answers[msg.leg] || {}).friend = msg.choice; }
  },
  dropped() {
    this.friendReady = null;
    this.together = false;
    if (this.mine) this.goSolo();
  },

  // ---------- Planet prompt: decide together ----------
  // Returns 'wait' while waiting for the friend, or the choice to act on now.
  answer(leg, choice) {
    const a = this.answers[leg] = this.answers[leg] || {};
    if (!a.me) { a.me = choice; a.t = performance.now(); Net.send({ t: 'answer', leg, choice }); }
    const f = Net.friend;
    const friendHere = this.together && Net.connected && f && f.scene === 'space' && f.leg === leg;
    if (!friendHere || choice === 'home') { this.together = this.together && choice !== 'home' && friendHere; return choice; }
    if (!a.friend) return performance.now() - a.t > 25000 ? (this.together = false, choice) : 'wait';
    if (a.friend !== choice) this.together = false;   // picked differently: each goes their own way
    return choice;
  },
  friendAnswer(leg) { return this.answers[leg] && this.answers[leg].friend; },
};

function makeWaitModal() {
  return {
    isWait: true,
    closable: false,
    draw() {
      const name = Net.friendName();
      panel(230, 170, 500, 260);
      text(`Waiting for ${name}... 🦙`, 480, 214, { size: 28, color: '#ffe066' });
      const m = Coop.mine || {};
      wrapText(m.from === 'planet' ? `Tell ${name} to press "Fly to the next planet" too!` : `Tell ${name} to press LAUNCH too, then you take off together!`, 480, 258, 440, 24, { size: 18 });
      text(Net.friendLabel(), 480, 316, { size: 15, color: '#9fd3ff' });
      // little bouncing dots so it's clear we're waiting
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffe066'; circle(456 + i * 24, 340 + Math.sin(game.t * 6 + i) * 5, 6); }
      if (button('🚀 Go without them', 260, 362, 230, 50, { size: 18, color: '#7bdc6b', hot: '#a4f294' })) Coop.goSolo();
      else if (button('Cancel', 510, 362, 190, 50, { size: 18, color: '#9aa3c0' })) Coop.cancel();
    },
  };
}

export { Coop, flightSpeed, makeWaitModal };
