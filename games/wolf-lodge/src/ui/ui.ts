// Screens and the HUD, as plain DOM over the canvas: the title, the front desk's booking card, the tower's
// slide menu, pause, and while playing: where you are, your wristband, the action button, the jump button,
// and on rides a speed meter with faster/slower buttons.
import { BUILD } from '../../../../shared/pwa';
import type { Tier } from '../sim/world';

export interface RoomOffer { tier: Tier; name: string; price: string; stars: string; lines: string[]; color: string }
export const OFFERS: RoomOffer[] = [
  { tier: 1, name: 'Basic Room', price: '🪙 99', stars: '⭐', color: '#7a8a96', lines: ['1 bed, a TV, a little desk', 'Water park wristband'] },
  { tier: 2, name: 'Nice Room', price: '🪙 199', stars: '⭐⭐', color: '#3e8e5a', lines: ['Wolf Den Suite: a queen bed', 'A cave den with bunk beds!', 'Sofa and a big TV'] },
  { tier: 3, name: 'Luxury Suite', price: '🪙 499', stars: '⭐⭐⭐', color: '#c9932e', lines: ['Top quality! A king bed', 'Fireplace, your own hot tub', 'KidCabin with bunk beds', 'Huge TV, chandelier, big windows'] },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface Choice { label: string; sub?: string; color?: string; act: () => void }

export class UI {
  readonly root = document.getElementById('ui')!;
  readonly hud = el('div', 'hud hidden');
  readonly jumpBtn = el('button', 'round-btn jump-btn', 'JUMP');
  readonly actionBtn = el('button', 'action-btn hidden');
  private readonly area = el('div', 'pill area');
  private readonly band = el('div', 'pill band hidden');
  private readonly quest = el('div', 'pill quest hidden');
  private readonly pauseBtn = el('button', 'pause-btn', '⏸');
  private readonly updateBtn = el('button', 'update-btn hidden', '✨ New version! Tap to get it');
  private readonly toastEl = el('div', 'toast hidden');
  private readonly big = el('div', 'big-text hidden');
  private readonly screen = el('div', 'screen hidden');
  // Ride controls.
  readonly ridePanel = el('div', 'ride hidden');
  private readonly speedFill = el('div', 'speed-fill');
  private readonly speedNum = el('div', 'speed-num');
  readonly fasterBtn = el('button', 'ride-btn faster', '🚀<small>faster</small>');
  readonly slowerBtn = el('button', 'ride-btn slower', '🐢<small>slower</small>');
  readonly getOutBtn = el('button', 'ride-btn getout hidden', '🛟<small>get out</small>');
  readonly camBtn = el('button', 'cam-btn', '🎥');
  private toastTimer = 0;

  constructor(h: { pause: () => void; update: () => void; camera: () => void }) {
    this.root.append(this.hud, this.screen, this.toastEl, this.big, this.updateBtn);
    const meter = el('div', 'speed');
    const bar = el('div', 'speed-bar');
    bar.append(this.speedFill);
    meter.append(this.speedNum, bar);
    this.ridePanel.append(meter, this.slowerBtn, this.fasterBtn, this.getOutBtn);
    this.hud.append(this.area, this.band, this.quest, this.pauseBtn, this.camBtn, this.actionBtn, this.jumpBtn, this.ridePanel);
    this.root.append(el('div', 'build', `build ${BUILD}`));
    this.pauseBtn.addEventListener('click', h.pause);
    this.updateBtn.addEventListener('click', h.update);
    this.camBtn.addEventListener('click', h.camera);
    for (const b of [this.actionBtn, this.fasterBtn, this.slowerBtn, this.getOutBtn, this.camBtn, this.pauseBtn])
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  setArea(text: string) {
    if (this.area.textContent !== text) this.area.textContent = text;
  }

  setBand(tier: Tier | 0) {
    this.band.classList.toggle('hidden', !tier);
    if (tier) {
      const o = OFFERS[tier - 1];
      this.band.innerHTML = `⌚ ${o.name}`;
      this.band.style.background = o.color;
    }
  }

  setQuest(found: number, total: number, wand: boolean) {
    this.quest.classList.toggle('hidden', !wand);
    this.quest.textContent = found >= total ? '🐉 Wake the dragon!' : `🪄 Runes ${found}/${total}`;
  }

  setAction(label: string | null) {
    this.actionBtn.classList.toggle('hidden', !label);
    if (label && this.actionBtn.textContent !== label) this.actionBtn.textContent = label;
  }

  riding(on: boolean, river = false) {
    this.ridePanel.classList.toggle('hidden', !on);
    this.jumpBtn.classList.toggle('hidden', on);
    this.getOutBtn.classList.toggle('hidden', !river);
    this.fasterBtn.innerHTML = river ? '🏊<small>paddle</small>' : '🚀<small>faster</small>';
    this.slowerBtn.innerHTML = river ? '🐢<small>slower</small>' : '🐢<small>slower</small>';
  }

  setSpeed(v: number, max: number) {
    this.speedFill.style.width = `${Math.min(100, (v / max) * 100)}%`;
    const mph = Math.round(v * 2.237);
    this.speedNum.textContent = `${mph} mph`;
  }

  showUpdate(on: boolean) {
    this.updateBtn.classList.toggle('hidden', !on);
  }

  toast(text: string, secs = 2.5) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), secs * 1000);
  }

  bigText(text: string | null) {
    this.big.classList.toggle('hidden', !text);
    if (text) {
      this.big.textContent = text;
      this.big.classList.remove('pop');
      void this.big.offsetWidth;
      this.big.classList.add('pop');
    }
  }

  hideScreen() {
    this.screen.classList.add('hidden');
    this.screen.innerHTML = '';
  }

  private open(cls = '') {
    this.screen.className = `screen ${cls}`;
    this.screen.innerHTML = '';
    return this.screen;
  }

  title(h: { play: () => void; arcade: () => void }, booked: Tier | 0) {
    const s = this.open('title');
    const logo = el('div', 'logo');
    logo.append(el('div', 'logo-small', '🦙 the'), el('div', 'logo-big', 'Llama Wolf Lodge'), el('div', 'logo-small', 'indoor water park resort'));
    const play = el('button', 'big-btn', booked ? '▶ Back to the lodge' : '▶ Check in');
    play.addEventListener('click', h.play);
    const arcade = el('button', 'small-btn', '🏠 Arcade');
    arcade.addEventListener('click', h.arcade);
    s.append(logo, play, arcade);
  }

  /** The front desk: pick a room. */
  booking(h: { pick: (t: Tier) => void; close: () => void }, current: Tier | 0) {
    const s = this.open('menu');
    s.append(el('h2', '', '🛎️ Welcome to Llama Wolf Lodge!'), el('p', 'sub', current ? 'Want a different room?' : 'Which room would you like?'));
    const row = el('div', 'cards');
    for (const o of OFFERS) {
      const c = el('button', 'card');
      c.style.borderColor = o.color;
      c.innerHTML = `<div class="card-head" style="background:${o.color}">${o.stars}<br>${o.name}</div><ul>${o.lines.map((l) => `<li>${l}</li>`).join('')}</ul><div class="price">${o.price} a night</div>${current === o.tier ? '<div class="yours">your room</div>' : ''}`;
      c.addEventListener('click', () => h.pick(o.tier));
      row.append(c);
    }
    const close = el('button', 'small-btn', 'Not now');
    close.addEventListener('click', h.close);
    s.append(row, close);
  }

  /** A list of choices (the tower's slides, pause). */
  choices(title: string, sub: string, list: Choice[], cls = 'menu') {
    const s = this.open(cls);
    s.append(el('h2', '', title));
    if (sub) s.append(el('p', 'sub', sub));
    const col = el('div', 'choices');
    for (const c of list) {
      const b = el('button', 'choice', `${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}`);
      if (c.color) b.style.background = c.color;
      b.addEventListener('click', c.act);
      col.append(b);
    }
    s.append(col);
  }

  /** A black fade (sleeping, climbing the tower). */
  fade(on: boolean, text = '') {
    const s = this.open(on ? 'fade' : '');
    if (!on) return this.hideScreen();
    s.append(el('h2', '', text));
  }
}
