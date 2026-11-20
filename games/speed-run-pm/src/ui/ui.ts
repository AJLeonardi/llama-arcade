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
  private readonly speedNum = el('span', 'speed-num', '1');
  private readonly screen = el('div', 'screen hidden');
  private readonly toastEl = el('div', 'toast');
  private readonly cardEl = el('div', 'level-card');
  private readonly fadeEl = el('div', 'fade');
  private readonly updateBtn = el('button', 'update-btn hidden', '✨ New version! Tap to get it');
  private toastTimer = 0;
  private cardTimer = 0;
  private lastSpeed = '';

  constructor(on: { pause(): void; update(): void }) {
    const pauseBtn = el('button', 'pause-btn', '⏸');
    pauseBtn.addEventListener('click', () => (sfx.click(), on.pause()));
    this.jumpBtn = el('button', 'jump-btn', 'JUMP');
    this.speed.append(el('span', '', '⚡'), this.speedNum);
    this.hud.append(this.levelName, this.speed, pauseBtn, this.jumpBtn);
    this.updateBtn.addEventListener('click', () => on.update());
    this.root.append(this.hud, this.screen, this.toastEl, this.cardEl, this.fadeEl, this.updateBtn, el('div', 'build', `build ${BUILD}`));
  }

  showHud(on: boolean, name = '') {
    this.hud.classList.toggle('hidden', !on);
    if (this.levelName.textContent !== name) this.levelName.textContent = name;
  }

  /** The speed number, already made short ("1.2K", "∞"). */
  setSpeed(text: string) {
    if (text === this.lastSpeed) return;
    this.lastSpeed = text;
    this.speedNum.textContent = text;
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
    this.cardTimer = window.setTimeout(() => (this.cardEl.style.opacity = '0'), 3000);
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

  title(level: number, speed: string, on: { play(): void; arcade(): void }) {
    const logo = el('div', 'logo');
    [...'SPEED RUN PM'].forEach((ch, i, all) => {
      if (ch === ' ') return logo.append(el('span', 'gap'));
      const k = all.slice(0, i).filter((c) => c !== ' ').length;
      logo.append(el('span', k % 2 ? 'cyan' : 'purple', ch));
    });
    const sub = el('div', 'sub', level > 1 ? `Level ${level} · ⚡ Speed ${speed}` : 'Run on the treadmills. Your speed never stops going up!');
    this.show(logo, sub, this.button('▶ Play', 'purple', on.play), this.button('🏠 Arcade', 'grey', on.arcade));
  }

  pause(on: { resume(): void; title(): void }) {
    const card = el('div', 'card');
    card.append(el('h1', '', 'Paused'));
    this.show(card, this.button('▶ Keep going', 'purple', on.resume), this.button('Title screen', 'grey', on.title));
  }
}
