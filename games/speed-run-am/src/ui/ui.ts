// The HUD, menus, toasts and fades: plain DOM over the canvas. Values are only written when they change.
import { BUILD } from '../../../../shared/pwa';
import { sfx } from './sfx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class UI {
  readonly jumpBtn: HTMLButtonElement;
  private readonly root = document.getElementById('ui')!;
  private readonly hud = el('div', 'hud hidden');
  private readonly levelName = el('div', 'pill level-name');
  private readonly speed = el('div', 'pill speed');
  private readonly speedFill = el('div', 'speed-fill');
  private readonly cape = el('div', 'pill cape-pill hidden', '🦸 Cape');
  private readonly screen = el('div', 'screen hidden');
  private readonly toastEl = el('div', 'toast');
  private readonly cardEl = el('div', 'level-card');
  private readonly fadeEl = el('div', 'fade');
  private readonly updateBtn = el('button', 'update-btn hidden', '✨ New version! Tap to get it');
  private toastTimer = 0;
  private cardTimer = 0;
  private lastSpeed = -1;

  constructor(on: { pause(): void; update(): void }) {
    const pauseBtn = el('button', 'pause-btn', '⏸');
    pauseBtn.addEventListener('click', () => (sfx.click(), on.pause()));
    this.jumpBtn = el('button', 'jump-btn', 'JUMP');
    const bar = el('div', 'speed-bar');
    bar.append(this.speedFill);
    this.speed.append(el('span', '', '💨'), bar);
    this.hud.append(this.levelName, this.speed, this.cape, pauseBtn, this.jumpBtn);
    this.updateBtn.addEventListener('click', () => on.update());
    this.root.append(this.hud, this.screen, this.toastEl, this.cardEl, this.fadeEl, this.updateBtn, el('div', 'build', `build ${BUILD}`));
  }

  showHud(on: boolean, name = '') {
    this.hud.classList.toggle('hidden', !on);
    if (this.levelName.textContent !== name) this.levelName.textContent = name;
  }

  /** boost 0..1 */
  setSpeed(boost: number) {
    const pct = Math.round(boost * 100);
    if (pct === this.lastSpeed) return;
    this.lastSpeed = pct;
    this.speedFill.style.width = `${pct}%`;
  }

  setCape(on: boolean) {
    this.cape.classList.toggle('hidden', !on);
  }

  showUpdate(on: boolean) {
    this.updateBtn.classList.toggle('hidden', !on);
  }

  toast(text: string, ms = 1400) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }

  levelCard(text: string) {
    this.cardEl.textContent = text;
    this.cardEl.style.opacity = '1';
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => (this.cardEl.style.opacity = '0'), 2000);
  }

  /** Fade to white, run `mid`, fade back. */
  fade(mid: () => void) {
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      mid();
      this.fadeEl.classList.remove('on');
    }, 380);
  }

  hideScreen() {
    this.screen.classList.add('hidden');
    this.screen.replaceChildren();
  }

  private show(...kids: HTMLElement[]) {
    this.screen.replaceChildren(...kids);
    this.screen.classList.remove('hidden');
  }

  private button(text: string, cls: string, on: () => void) {
    const b = el('button', `big ${cls}`, text);
    b.addEventListener('click', () => (sfx.click(), on()));
    return b;
  }

  title(best: number, on: { play(): void; arcade(): void }) {
    const logo = el('div', 'logo');
    [...'SPEED RUN AM'].forEach((ch, i, all) => {
      if (ch === ' ') return logo.append(el('span', 'gap'));
      const k = all.slice(0, i).filter((c) => c !== ' ').length;
      logo.append(el('span', k % 2 ? 'brown' : 'pink', ch));
    });
    const sub = el('div', 'sub', best > 0 ? `🏆 Levels done: ${best} of 10` : 'Run, jump, climb, and don’t get caught!');
    this.show(logo, sub, this.button('▶ Play', 'pink', on.play), this.button('🏠 Arcade', 'grey', on.arcade));
  }

  pause(inGym: boolean, on: { resume(): void; gym(): void; title(): void }) {
    const card = el('div', 'card');
    card.append(el('h1', '', 'Paused'));
    const btns = [this.button('▶ Keep going', 'pink', on.resume)];
    if (!inGym) btns.push(this.button('🏋️ Workout room', 'brown', on.gym));
    btns.push(this.button('Title screen', 'grey', on.title));
    this.show(card, ...btns);
  }

  finish(name: string, next: string | null, on: { next(): void; gym(): void }) {
    const card = el('div', 'card');
    card.append(el('h1', '', '🏆 You did it!'), el('p', '', `${name} done!`));
    const btns = [];
    if (next) btns.push(this.button(`Next: ${next} ▶`, 'pink', on.next));
    btns.push(this.button('🏋️ Workout room', 'brown', on.gym));
    this.show(card, ...btns);
  }
}
