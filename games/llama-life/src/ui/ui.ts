// The screens and the HUD, as plain HTML over the 3D view: title, the "me" maker, pause, the bag, the clock,
// the action button (Get in, Sleep, Take…), the jump/honk button, pop-ups and the fade for sleeping and work.
import { BUILD } from '../../../../shared/pwa';
import { HAIR, HAIR_STYLES, PANTS, SHIRT, SHOES, SKIN, type Look } from '../sim/life';

export type Screen = 'title' | 'play' | 'pause' | 'look' | 'bag' | 'map' | 'busy';

export interface UiActions {
  play(): void;
  resume(): void;
  menu(): void;
  arcade(): void;
  update(): void;
  restart(): void;
  look(l: Look): void;
  lookDone(): void;
  screen(s: Screen): void;
  action(): void;
  eat(i: number): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class UI {
  readonly root = document.getElementById('ui')!;
  /** Where touches for the joystick and looking around land. */
  readonly surface = el('div', 'surface');
  readonly jumpBtn = el('button', 'round-btn jump', '⤒\nJump');
  private screens = new Map<Screen, HTMLElement>();
  private hud = el('div', 'hud');
  private clock = el('div', 'pill clock');
  private bagBtn = el('button', 'icon-btn bag-btn', '🛍️');
  private bagCount = el('span', 'count');
  private actionBtn = el('button', 'action-btn hidden');
  private popupEl = el('div', 'popup');
  private hint = el('div', 'hint');
  private gps = el('div', 'pill gps hidden');
  private fadeEl = el('div', 'fade');
  private fadeText = el('div', 'fade-text');
  private updateBtn = el('button', 'update hidden', '✨ New version! Tap to get it');
  private bagGrid = el('div', 'bag-grid');
  private lookState: Look;
  private lookRows: (() => void)[] = [];
  private lookFrom: Screen = 'title';

  constructor(
    private act: UiActions,
    look: Look,
  ) {
    this.lookState = { ...look };
    this.root.append(this.surface);
    // ---- HUD
    const pause = el('button', 'icon-btn pause-btn', '⏸');
    pause.onclick = () => act.screen('pause');
    this.bagBtn.append(this.bagCount);
    this.bagBtn.onclick = () => act.screen('bag');
    this.actionBtn.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      act.action();
    };
    this.jumpBtn.onpointerdown = (e) => e.stopPropagation();
    this.updateBtn.onclick = () => act.update();
    this.hud.append(this.clock, this.gps, pause, this.bagBtn, this.actionBtn, this.jumpBtn, this.hint, this.updateBtn);
    this.surface.append(this.hud);
    this.root.append(this.popupEl);
    this.fadeEl.append(this.fadeText);
    this.root.append(this.fadeEl);
    this.screens.set('play', this.hud);
    this.screens.set('busy', this.hud);

    // ---- title
    const title = el('div', 'screen title');
    const logo = el('h1', 'logo', 'Llama Life');
    const tag = el('p', 'tagline', 'Drive, get a coffee, go to school and work, and sleep in your mansion.');
    const play = el('button', 'big', '▶  Play');
    play.onclick = () => act.play();
    const me = el('button', 'mid', '🧍  Me');
    me.onclick = () => act.screen('look');
    const arcade = el('button', 'mid', '🏠  Arcade');
    arcade.onclick = () => act.arcade();
    const again = el('button', 'small-link', 'Start a new life');
    again.onclick = () => {
      if (confirm('Start a new life? Your cars and your bag will be gone.')) act.restart();
    };
    const build = el('div', 'build', `build ${BUILD}`);
    title.append(logo, tag, play, el('div', 'row', ''), again, build);
    title.querySelector('.row')!.append(me, arcade);
    this.add('title', title);

    // ---- pause
    const pauseScreen = el('div', 'screen panel');
    const pt = el('h2', '', 'Paused');
    const resume = el('button', 'big', '▶  Back to life');
    resume.onclick = () => act.resume();
    const mapBtn = el('button', 'mid', '🗺️  Map');
    mapBtn.onclick = () => act.screen('map');
    const menu = el('button', 'mid', '🏁  Title');
    menu.onclick = () => act.menu();
    const arcade2 = el('button', 'mid', '🏠  Arcade');
    arcade2.onclick = () => act.arcade();
    const prow = el('div', 'row');
    prow.append(mapBtn, menu, arcade2);
    pauseScreen.append(pt, resume, prow);
    this.add('pause', pauseScreen);

    // ---- the "me" maker
    const lookScreen = el('div', 'screen panel look');
    lookScreen.append(el('h2', '', 'How do you look?'));
    const swatches = (label: string, colors: string[], key: keyof Look) => {
      const row = el('div', 'look-row');
      row.append(el('div', 'look-label', label));
      const box = el('div', 'swatches');
      const btns = colors.map((c, i) => {
        const b = el('button', 'swatch');
        b.style.background = c;
        b.onclick = () => {
          this.lookState[key] = i;
          act.look({ ...this.lookState });
          refresh();
        };
        box.append(b);
        return b;
      });
      const refresh = () => btns.forEach((b, i) => b.classList.toggle('on', this.lookState[key] === i));
      this.lookRows.push(refresh);
      row.append(box);
      lookScreen.append(row);
    };
    swatches('Skin', SKIN, 'skin');
    swatches('Hair', HAIR, 'hair');
    {
      const row = el('div', 'look-row');
      row.append(el('div', 'look-label', 'Style'));
      const box = el('div', 'swatches');
      const btns = HAIR_STYLES.map((s, i) => {
        const b = el('button', 'chip', s);
        b.onclick = () => {
          this.lookState.hairStyle = i;
          act.look({ ...this.lookState });
          refresh();
        };
        box.append(b);
        return b;
      });
      const refresh = () => btns.forEach((b, i) => b.classList.toggle('on', this.lookState.hairStyle === i));
      this.lookRows.push(refresh);
      row.append(box);
      lookScreen.append(row);
    }
    swatches('Shirt', SHIRT, 'shirt');
    swatches('Pants', PANTS, 'pants');
    swatches('Shoes', SHOES, 'shoes');
    const done = el('button', 'big', '✓  Done');
    done.onclick = () => act.lookDone();
    lookScreen.append(done);
    this.add('look', lookScreen);

    // ---- the bag
    const bag = el('div', 'screen panel');
    bag.append(el('h2', '', '🛍️ Your bag'), el('p', 'tagline', 'Tap something to eat or drink it.'), this.bagGrid);
    const close = el('button', 'big', '✓  Close');
    close.onclick = () => act.resume();
    bag.append(close);
    this.add('bag', bag);
  }

  add(s: Screen, e: HTMLElement) {
    this.screens.set(s, e);
    this.root.append(e);
  }

  show(s: Screen) {
    for (const [k, e] of this.screens) e.classList.toggle('hidden', k !== s && !(e === this.hud && (s === 'play' || s === 'busy')));
    this.surface.classList.toggle('hidden', s !== 'play' && s !== 'busy');
    if (s === 'look') this.lookRows.forEach((r) => r());
  }

  /** Where the "me" maker goes back to when you're done. */
  openLookFrom(from: Screen) {
    this.lookFrom = from;
  }

  /** Something that sits on the HUD (the mini-map). */
  hudAppend(e: HTMLElement) {
    this.hud.append(e);
  }

  get lookReturn() {
    return this.lookFrom;
  }

  setLook(l: Look) {
    this.lookState = { ...l };
  }

  /** Where the GPS is taking you and how far (empty hides it). */
  setGps(text: string) {
    if (this.gps.textContent !== text) this.gps.textContent = text;
    this.gps.classList.toggle('hidden', !text);
  }

  setClock(text: string, night: boolean) {
    const t = `${night ? '🌙' : '☀️'} ${text}`;
    if (this.clock.textContent !== t) this.clock.textContent = t;
  }

  setBag(items: string[]) {
    this.bagCount.textContent = items.length ? String(items.length) : '';
    this.bagGrid.replaceChildren(
      ...(items.length
        ? items.map((it, i) => {
            const b = el('button', 'item', it);
            b.onclick = () => this.act.eat(i);
            return b;
          })
        : [el('p', 'empty', 'Nothing yet! Take things at FreshMart or Llama Latte.')]),
    );
  }

  /** The big button for what you can do here (or hide it). */
  setAction(label: string | null) {
    this.actionBtn.classList.toggle('hidden', !label);
    if (label && this.actionBtn.textContent !== label) this.actionBtn.textContent = label;
  }

  setJump(label: string) {
    if (this.jumpBtn.textContent !== label) this.jumpBtn.textContent = label;
  }

  setHint(text: string) {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  popup(main: string, sub = '', long = false) {
    this.popupEl.replaceChildren(el('div', 'popup-main', main), el('div', 'popup-sub', sub));
    this.popupEl.classList.remove('go', 'long');
    void this.popupEl.offsetWidth;
    this.popupEl.classList.add('go');
    this.popupEl.classList.toggle('long', long);
  }

  /** Fades to black with some words, runs `mid` while it's dark, then fades back. */
  fade(text: string, mid: () => void, holdMs = 1600) {
    this.fadeText.textContent = text;
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      mid();
      setTimeout(() => this.fadeEl.classList.remove('on'), holdMs);
    }, 700);
  }

  offerUpdate() {
    this.updateBtn.classList.remove('hidden');
  }
}
