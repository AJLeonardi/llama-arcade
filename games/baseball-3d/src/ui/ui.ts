// Screens and the HUD, as plain DOM over the canvas. The HUD is a TV-style scorebug like MLB The Show:
// teams and score, the inning, balls/strikes/outs and who's on base, plus the pitch speed and type after
// each pitch and the batter's name when he comes up.
import { BUILD } from '../../../../shared/pwa';
import { PITCHES, PITCH_TYPES, type PitchType } from '../sim/pitch';
import type { Team } from '../sim/teams';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface Bug {
  away: Team;
  home: Team;
  score: [number, number];
  inning: number;
  top: boolean;
  balls: number;
  strikes: number;
  outs: number;
  bases: [boolean, boolean, boolean];
}

export interface Btn { label: string; sub?: string; color?: string; big?: boolean; act: () => void }

export class UI {
  readonly root = document.getElementById('ui')!;
  readonly hud = el('div', 'hud hidden');
  private readonly bug = el('div', 'bug');
  private readonly pitchInfo = el('div', 'pitch-info hidden');
  private readonly lower = el('div', 'lower-third hidden');
  private readonly bigText = el('div', 'big-text hidden');
  private readonly toastEl = el('div', 'toast hidden');
  private readonly screen = el('div', 'screen hidden');
  private readonly updateBtn = el('button', 'update-btn hidden', '✨ New version! Tap to get it');
  readonly pauseBtn = el('button', 'pause-btn', '⏸');
  // Batting.
  readonly batPanel = el('div', 'panel hidden');
  readonly swingBtn = el('button', 'round-btn swing-btn', 'SWING');
  readonly hint = el('div', 'hint');
  // Pitching.
  readonly pitchPanel = el('div', 'panel hidden');
  readonly throwBtn = el('button', 'round-btn throw-btn', 'PITCH');
  private readonly typeBtns = new Map<PitchType, HTMLButtonElement>();
  private toastTimer = 0;
  private bigTimer = 0;

  constructor(h: { pause: () => void; update: () => void; pitchType: (t: PitchType) => void }) {
    this.root.append(this.hud, this.screen, this.toastEl, this.bigText, this.updateBtn);
    this.batPanel.append(this.swingBtn, this.hint);
    const types = el('div', 'types');
    for (const t of PITCH_TYPES) {
      const b = el('button', 'type-btn', `<b>${PITCHES[t].short}</b><small>${PITCHES[t].name}</small>`);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        h.pitchType(t);
      });
      this.typeBtns.set(t, b);
      types.append(b);
    }
    this.pitchPanel.append(types, this.throwBtn);
    this.hud.append(this.bug, this.pitchInfo, this.lower, this.pauseBtn, this.batPanel, this.pitchPanel);
    this.root.append(el('div', 'build', `build ${BUILD}`));
    this.pauseBtn.addEventListener('click', h.pause);
    this.updateBtn.addEventListener('click', h.update);
    for (const b of [this.pauseBtn, this.swingBtn, this.throwBtn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  setMode(mode: 'bat' | 'pitch' | 'watch') {
    this.batPanel.classList.toggle('hidden', mode !== 'bat');
    this.pitchPanel.classList.toggle('hidden', mode !== 'pitch');
  }

  setPitchType(t: PitchType) {
    for (const [k, b] of this.typeBtns) b.classList.toggle('on', k === t);
  }

  setThrowLabel(text: string, hot: boolean) {
    this.throwBtn.textContent = text;
    this.throwBtn.classList.toggle('hot', hot);
  }

  setBug(b: Bug) {
    const dots = (n: number, of: number, cls: string) => Array.from({ length: of }, (_, i) => `<i class="${cls}${i < n ? ' on' : ''}"></i>`).join('');
    const row = (t: Team, s: number, bat: boolean) =>
      `<div class="row${bat ? ' bat' : ''}" style="--c:${t.colors[0]}"><span class="ab">${t.emoji} ${t.abbr}</span><span class="sc">${s}</span></div>`;
    this.bug.innerHTML = `
      <div class="teams">${row(b.away, b.score[0], b.top)}${row(b.home, b.score[1], !b.top)}</div>
      <div class="state">
        <div class="inn">${b.top ? '▲' : '▼'}${b.inning}</div>
        <div class="diamond">${[2, 3, 1].map((i) => `<i class="b${i}${b.bases[i - 1] ? ' on' : ''}"></i>`).join('')}</div>
        <div class="count">${b.balls}-${b.strikes}</div>
        <div class="outs">${dots(b.outs, 2, 'o')}</div>
      </div>`;
  }

  showPitch(mph: number, type: PitchType) {
    this.pitchInfo.innerHTML = `<b>${Math.round(mph)}</b> MPH <span>${PITCHES[type].name.toUpperCase()}</span>`;
    this.pitchInfo.classList.remove('hidden');
  }
  hidePitch() {
    this.pitchInfo.classList.add('hidden');
  }

  showBatter(num: number, name: string, team: Team, line: string, star: boolean) {
    this.lower.innerHTML = `<span class="num" style="background:${team.colors[0]}">#${num}</span><span class="nm">${star ? '⭐ ' : ''}${name}</span><span class="ln">${line}</span>`;
    this.lower.classList.remove('hidden');
  }
  hideBatter() {
    this.lower.classList.add('hidden');
  }

  big(text: string, cls = '', ms = 1600) {
    this.bigText.textContent = text;
    this.bigText.className = `big-text pop ${cls}`;
    void this.bigText.offsetWidth;
    clearTimeout(this.bigTimer);
    this.bigTimer = window.setTimeout(() => this.bigText.classList.add('hidden'), ms);
  }

  toast(text: string, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  showUpdate() {
    this.updateBtn.classList.remove('hidden');
  }

  /** A full-screen menu: a heading, some lines, and buttons (or team cards). */
  menu(o: { title: string; logo?: boolean; lines?: string[]; buttons?: Btn[]; cards?: { team: Team; tag?: string; act: () => void }[]; back?: () => void; cls?: string }) {
    this.screen.innerHTML = '';
    this.screen.className = `screen ${o.cls ?? 'menu'}`;
    if (o.logo) {
      this.screen.append(el('div', 'logo', `<div class="logo-small">🦙 LLAMA</div><div class="logo-big">BASEBALL 3D</div>`));
    } else {
      this.screen.append(el('h2', '', o.title));
    }
    for (const l of o.lines ?? []) this.screen.append(el('p', 'sub', l));
    if (o.cards) {
      const wrap = el('div', 'cards');
      for (const c of o.cards) {
        const b = el('button', 'card', `<div class="card-head" style="background:${c.team.colors[0]};color:${c.team.colors[1]}">${c.team.emoji}</div><div class="card-city">${c.team.city}</div><div class="card-name">${c.team.name}</div>${c.tag ? `<div class="tag">${c.tag}</div>` : ''}`);
        b.style.borderColor = c.team.colors[1];
        b.addEventListener('click', c.act);
        wrap.append(b);
      }
      this.screen.append(wrap);
    }
    const btns = el('div', 'choices');
    for (const b of o.buttons ?? []) {
      const e = el('button', b.big ? 'big-btn' : 'choice', b.sub ? `${b.label}<small>${b.sub}</small>` : b.label);
      if (b.color) e.style.background = b.color;
      e.addEventListener('click', b.act);
      btns.append(e);
    }
    if (o.back) {
      const e = el('button', 'small-btn', '← Back');
      e.addEventListener('click', o.back);
      btns.append(e);
    }
    this.screen.append(btns);
    this.screen.classList.remove('hidden');
  }

  closeMenu() {
    this.screen.classList.add('hidden');
  }
}
