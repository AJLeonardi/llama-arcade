// The menus (title, board picker, skater maker, pause) and the HUD with the trick buttons.
import { BUILD } from '../../../../shared/pwa';
import { BOARDS, deckCanvas } from '../view/textures';
import { HAIR, HELMET, PANTS, SHIRT, SHOES, SKIN, type Look } from '../view/skaterModel';

export type Screen = 'title' | 'boards' | 'skater' | 'play' | 'pause' | 'map';

export interface UIHandlers {
  start(): void;
  resume(): void;
  restart(): void;
  menu(): void;
  arcade(): void;
  update(): void;
  board(i: number): void;
  look(l: Look): void;
  screen(s: Screen): void;
  /** Trick button pressed (touch). */
  trick(t: 'ollie' | 'kickflip' | 'backflip'): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export class UI {
  readonly root = document.getElementById('ui')!;
  readonly surface: HTMLElement;
  private screens = new Map<Screen, HTMLElement>();
  private scoreEl: HTMLElement;
  private milesEl: HTMLElement;
  private bestEl: HTMLElement;
  private popupEl: HTMLElement;
  private popupTimer = 0;
  private updateBtns: HTMLElement[] = [];
  private boardCards: HTMLElement[] = [];
  private swatchRows = new Map<keyof Look, HTMLElement[]>();
  readonly ollieBtn: HTMLElement;
  private shown: Screen = 'title';
  private last = { score: -1, miles: '' };

  constructor(private on: UIHandlers, private look: Look, private boardIdx: number, best: number) {
    // ---- play HUD
    const hud = h('div', 'hud');
    this.surface = hud;
    this.scoreEl = h('div', 'pill score', '0');
    this.milesEl = h('div', 'pill miles', '0.00 mi');
    const pause = h('button', 'icon-btn pause-btn', '⏸');
    pause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      on.screen('pause');
    });
    const restart = h('button', 'icon-btn restart-btn', '↺');
    restart.title = 'Back to the roof';
    restart.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      on.restart();
    });
    this.popupEl = h('div', 'popup');
    const tricks = h('div', 'tricks');
    const tb = (cls: string, label: string, t: 'ollie' | 'kickflip' | 'backflip') => {
      const b = h('button', `trick-btn ${cls}`, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        on.trick(t);
      });
      return b;
    };
    this.ollieBtn = tb('ollie', 'OLLIE', 'ollie');
    tricks.append(tb('kickflip', 'KICK\nFLIP', 'kickflip'), tb('backflip', 'BACK\nFLIP', 'backflip'), this.ollieBtn);
    const hint = h('div', 'hint', 'Left thumb: push ↑ · steer ←→ · brake ↓ · M: map');
    hud.append(this.scoreEl, this.milesEl, pause, restart, this.popupEl, tricks, hint, this.updateButton());
    this.add('play', hud);

    // ---- title
    const title = h('div', 'screen title');
    const logo = h('div', 'logo');
    logo.append(h('span', 'logo-3d', '3D'), h('span', 'logo-skate', 'SKATE'));
    this.bestEl = h('div', 'best', best ? `Best: ${best.toLocaleString()}` : '');
    const menu = h('div', 'menu');
    menu.append(
      this.button('▶  SKATE', 'primary', () => on.start()),
      this.button('🛹  Board', '', () => on.screen('boards')),
      this.button('🧍  Skater', '', () => on.screen('skater')),
      this.button('🏠  Arcade', 'small', () => on.arcade()),
    );
    title.append(logo, h('div', 'tag', 'Drop in from the roof. 10 miles of city.'), menu, this.bestEl, this.updateButton(), h('div', 'build', `build ${BUILD}`));
    this.add('title', title);

    // ---- board picker
    const boards = h('div', 'screen side');
    const bp = h('div', 'panel');
    bp.append(h('h2', '', 'Pick your board'));
    const grid = h('div', 'boards');
    const maxPush = Math.max(...BOARDS.map((b) => b.push)), minPush = Math.min(...BOARDS.map((b) => b.push));
    const maxPop = Math.max(...BOARDS.map((b) => b.pop)), minPop = Math.min(...BOARDS.map((b) => b.pop));
    const rate = (v: number, lo: number, hi: number) => 2 + Math.round(((v - lo) / (hi - lo)) * 3);
    BOARDS.forEach((b, i) => {
      const card = h('button', 'board-card');
      const img = deckCanvas(i);
      img.className = 'deck';
      const info = h('div', 'board-info');
      info.append(h('b', '', b.name), h('small', '', b.blurb), h('small', 'stat', `Speed ${stars(rate(b.push, minPush, maxPush))}`), h('small', 'stat', `Jump  ${stars(rate(b.pop, minPop, maxPop))}`));
      card.append(img, info);
      card.addEventListener('click', () => {
        this.boardIdx = i;
        this.markBoard();
        on.board(i);
      });
      grid.append(card);
      this.boardCards.push(card);
    });
    bp.append(grid, this.button('Done', 'primary', () => on.screen('title')));
    boards.append(bp);
    this.add('boards', boards);
    this.markBoard();

    // ---- skater maker
    const sk = h('div', 'screen side');
    const sp = h('div', 'panel');
    sp.append(h('h2', '', 'Make your skater'));
    const row = (label: string, key: keyof Look, colors: string[]) => {
      const r = h('div', 'swatch-row');
      r.append(h('span', 'swatch-label', label));
      const list: HTMLElement[] = [];
      colors.forEach((c, i) => {
        const s = h('button', 'swatch');
        if (c) s.style.background = c;
        else s.textContent = '✕';
        s.addEventListener('click', () => {
          this.look = { ...this.look, [key]: i };
          this.markSwatches();
          on.look(this.look);
        });
        r.append(s);
        list.push(s);
      });
      this.swatchRows.set(key, list);
      sp.append(r);
    };
    row('Skin', 'skin', SKIN);
    row('Hair', 'hair', HAIR);
    row('Shirt', 'shirt', SHIRT);
    row('Pants', 'pants', PANTS);
    row('Shoes', 'shoes', SHOES);
    row('Helmet', 'helmet', HELMET);
    sp.append(this.button('Done', 'primary', () => on.screen('title')));
    sk.append(sp);
    this.add('skater', sk);
    this.markSwatches();

    // ---- pause
    const pz = h('div', 'screen');
    const pm = h('div', 'menu');
    pm.append(
      this.button('▶  Keep skating', 'primary', () => on.resume()),
      this.button('↺  Back to the roof', '', () => on.restart()),
      this.button('🛹  Menu', '', () => on.menu()),
      this.button('🏠  Arcade', 'small', () => on.arcade()),
    );
    pz.append(h('h2', '', 'Paused'), pm, this.updateButton());
    this.add('pause', pz);
    this.show('title');
  }

  add(s: Screen, el: HTMLElement) {
    this.screens.set(s, el);
    this.root.append(el);
  }

  private button(label: string, cls: string, fn: () => void) {
    const b = h('button', `btn ${cls}`, label);
    b.addEventListener('click', fn);
    return b;
  }

  private updateButton() {
    const b = h('button', 'update hidden', '✨ New version! Tap to get it');
    b.addEventListener('click', () => this.on.update());
    this.updateBtns.push(b);
    return b;
  }

  private markBoard() {
    this.boardCards.forEach((c, i) => c.classList.toggle('on', i === this.boardIdx));
  }

  private markSwatches() {
    for (const [k, list] of this.swatchRows) list.forEach((s, i) => s.classList.toggle('on', i === this.look[k]));
  }

  show(s: Screen) {
    this.shown = s;
    for (const [k, el] of this.screens) el.classList.toggle('hidden', k !== s);
  }

  get current() {
    return this.shown;
  }

  offerUpdate() {
    for (const b of this.updateBtns) b.classList.remove('hidden');
  }

  setBest(best: number) {
    this.bestEl.textContent = best ? `Best: ${best.toLocaleString()}` : '';
  }

  /** HUD numbers (only touches the DOM when they change). */
  hud(score: number, miles: number) {
    if (score !== this.last.score) {
      this.last.score = score;
      this.scoreEl.textContent = score.toLocaleString();
    }
    const m = `${miles.toFixed(2)} mi`;
    if (m !== this.last.miles) {
      this.last.miles = m;
      this.milesEl.textContent = m;
    }
  }

  popup(text: string, sub = '', bad = false) {
    this.popupEl.innerHTML = '';
    this.popupEl.append(h('div', 'popup-main', text));
    if (sub) this.popupEl.append(h('div', 'popup-sub', sub));
    this.popupEl.classList.toggle('bad', bad);
    this.popupEl.classList.remove('go');
    void this.popupEl.offsetWidth; // restart the animation
    this.popupEl.classList.add('go');
    clearTimeout(this.popupTimer);
    this.popupTimer = window.setTimeout(() => this.popupEl.classList.remove('go'), 1600);
  }
}
