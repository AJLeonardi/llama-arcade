// The menus and the match HUD, as plain HTML in #ui. Buttons use data-act="name" and call handlers[name].
import { BUILD } from '../../../shared/pwa';
import { COUNTRIES, MAX_SQUAD, SLOTS, country, lineupPlayers, priceOf, rankOf, US, type Player, type Result, type Save } from './sim/teams';

const root = document.getElementById('ui')!;
type Handlers = Record<string, (arg?: string) => void>;

function render(html: string, handlers: Handlers) {
  root.innerHTML = html;
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers[el.dataset.act!]?.(el.dataset.arg);
    });
  });
}

const flagName = (id: string) => `${country(id).flag} ${country(id).name}`;
const coins = (s: Save) => `<div class="coins">🪙 ${s.coins}</div>`;
const build = `<div class="build">build ${BUILD}</div>`;

export function showTitle(s: Save, h: Handlers, updateReady: boolean) {
  const r = rankOf(s);
  const line = s.champion
    ? `🏆 World Cup champions! USA is #${r}`
    : r === 1
      ? `USA is #1! Win the Final to be World Champions!`
      : `🇺🇸 USA is #${r} of ${COUNTRIES.length} in the World Cup`;
  render(
    `<div class="screen title">
      ${coins(s)}
      <h1>Llama Soccer <span>3D</span></h1>
      <div class="sub">${line}</div>
      <button class="play" data-act="play">▶ PLAY</button>
      <div class="row">
        <button data-act="team">👕 My Team</button>
        <button data-act="table">🏆 Table</button>
        <button data-act="arcade">🏠 Arcade</button>
      </div>
      ${updateReady ? '<button class="update" data-act="update">✨ New version! Tap to get it</button>' : ''}
      ${build}
    </div>`,
    h,
  );
}

export function showIntro(h: Handlers) {
  render(
    `<div class="screen dim"><div class="card intro">
      <div class="big">🦙⚽</div>
      <h2>Meet Mr. Random!</h2>
      <p>Mr. Random plays soccer for the <b>Revolution</b>.</p>
      <p>Today he got picked for <b>Team USA</b> at the World Cup!</p>
      <p>But USA is in <b>last place</b>… 😬</p>
      <p>Can you get USA all the way to <b>#1</b>?</p>
      <p class="how">🕹️ Left thumb: run &nbsp; ✏️ Right finger: <b>draw a line</b> to shoot!</p>
      <button class="play small" data-act="ok">Let's go!</button>
    </div></div>`,
    h,
  );
}

function stats(p: Player) {
  return `<span class="stats">⚡${p.speed} 🦶${p.kick} 🧤${p.save}</span>`;
}

function card(p: Player, sel: boolean, act: string, arg: string, slotName = '') {
  return `<button class="pcard ${sel ? 'sel' : ''} ${p.star ? 'star' : ''}" data-act="${act}" data-arg="${arg}">
    ${slotName ? `<span class="slot">${slotName}</span>` : ''}
    <span class="face" style="background:${p.fur}">🦙</span>
    <span class="pname">${p.star ? '⭐ ' : ''}${p.name}</span>
    ${stats(p)}
  </button>`;
}

/** My Team: tap one player, then another, to swap them. Bench players can come on; new ones can be bought. */
export function showTeam(s: Save, selected: string | null, h: Handlers) {
  const lineup = lineupPlayers(s);
  const bench = s.squad.filter((p) => !s.lineup.includes(p.id));
  const slotPos = ['gk', 'lb', 'rb', 'mid', 'st'];
  const pitch = SLOTS.map(
    (slot, i) => `<div class="spot ${slotPos[i]}">${card(lineup[i], selected === `slot:${i}`, 'pick', `slot:${i}`, slot.name)}</div>`,
  ).join('');
  const benchHtml = bench.length
    ? bench
        .map(
          (p) => `<div class="benchrow">${card(p, selected === `bench:${p.id}`, 'pick', `bench:${p.id}`)}
            <button class="mini" data-act="release" data-arg="${p.id}" title="Let go">👋</button></div>`,
        )
        .join('')
    : '<p class="note">Nobody on the bench.</p>';
  const full = s.squad.length >= MAX_SQUAD;
  const shop = s.shop.length
    ? s.shop
        .map(
          (p, i) => `<div class="shoprow">${card(p, false, 'noop', '')}
            <button class="buy" data-act="buy" data-arg="${i}" ${s.coins < priceOf(p) || full ? 'disabled' : ''}>🪙 ${priceOf(p)}</button></div>`,
        )
        .join('')
    : '<p class="note">New llamas come after your next match.</p>';
  render(
    `<div class="screen team">
      <div class="top"><button data-act="back">⬅ Back</button><h2>👕 My Team</h2>${coins(s)}</div>
      <div class="cols">
        <div class="pitch">${pitch}</div>
        <div class="side">
          <p class="note">${selected ? 'Now tap who to swap with!' : 'Tap a llama, then tap another to swap places.'}</p>
          <h3>Bench</h3>${benchHtml}
          <h3>New players ${full ? '<small>(squad full)</small>' : ''}</h3>${shop}
        </div>
      </div>
    </div>`,
    h,
  );
}

export function showTable(s: Save, h: Handlers, title = '🏆 World Cup Table') {
  const rows = s.table
    .map((id, i) => `<li class="${id === US ? 'us' : ''}"><b>#${i + 1}</b> ${flagName(id)}</li>`)
    .join('');
  render(
    `<div class="screen dim"><div class="card tablecard">
      <h2>${title}</h2>
      <ol class="table">${rows}</ol>
      <button class="play small" data-act="back">OK</button>
    </div></div>`,
    h,
  );
}

// ---- during a match ----

let hud: { score: HTMLElement; clock: HTMLElement; banner: HTMLElement; hint: HTMLElement } | null = null;

export function showHud(oppId: string, h: Handlers) {
  const o = country(oppId);
  render(
    `<div class="hud">
      <button class="pause" data-act="pause">⏸</button>
      <div class="board">
        <span>🇺🇸 USA</span><b id="score">0 - 0</b><span>${o.name.slice(0, 3).toUpperCase()} ${o.flag}</span>
        <i id="clock">0'</i>
      </div>
      <div id="banner" class="banner"></div>
      <div id="hint" class="hint"></div>
    </div>`,
    h,
  );
  hud = {
    score: document.getElementById('score')!,
    clock: document.getElementById('clock')!,
    banner: document.getElementById('banner')!,
    hint: document.getElementById('hint')!,
  };
}

export function updateHud(score: [number, number], minute: number) {
  if (!hud) return;
  const s = `${score[0]} - ${score[1]}`;
  if (hud.score.textContent !== s) hud.score.textContent = s;
  const c = `${minute}'`;
  if (hud.clock.textContent !== c) hud.clock.textContent = c;
}

let bannerTimer = 0;
export function banner(text: string, kind = '', ms = 1800) {
  if (!hud) return;
  hud.banner.innerHTML = text;
  hud.banner.className = `banner show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => hud && (hud.banner.className = 'banner'), ms);
}

export function hint(text: string) {
  if (hud && hud.hint.textContent !== text) hud.hint.textContent = text;
}

export function showPause(h: Handlers) {
  const div = document.createElement('div');
  div.className = 'screen dim pausemenu';
  div.innerHTML = `<div class="card">
    <h2>Paused</h2>
    <button class="play small" data-act="resume">▶ Keep playing</button>
    <div class="row"><button data-act="quit">🏳️ Stop this match</button><button data-act="arcade">🏠 Arcade</button></div>
  </div>`;
  div.querySelectorAll<HTMLElement>('[data-act]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      div.remove();
      h[el.dataset.act!]?.();
    }),
  );
  root.append(div);
}

export function showResult(r: Result, oppId: string, h: Handlers) {
  const head = r.champion
    ? '🏆 WORLD CHAMPIONS! 🏆'
    : r.win
      ? '🎉 You win!'
      : r.draw
        ? '🤝 A draw'
        : '😅 They won this time';
  const move =
    r.newRank < r.oldRank
      ? `USA moves up to <b>#${r.newRank}</b>! ⬆️ (${r.oldRank - r.newRank} place${r.oldRank - r.newRank > 1 ? 's' : ''})`
      : r.newRank === 1
        ? 'USA stays <b>#1</b>! 👑'
        : `USA stays <b>#${r.newRank}</b>. Win to move up!`;
  const tip = r.win || r.newRank === 1 ? (r.us - r.them < 3 && r.newRank > 1 ? 'Win by more goals to jump more places!' : '') : 'Tip: draw a curvy line. It tricks the keeper!';
  render(
    `<div class="screen dim"><div class="card result ${r.champion ? 'champ' : ''}">
      <h2>${head}</h2>
      <div class="final">🇺🇸 USA <b>${r.us} - ${r.them}</b> ${flagName(oppId)}</div>
      <p>${move}</p>
      <p>🪙 +${r.coins} coins</p>
      ${tip ? `<p class="note">${tip}</p>` : ''}
      <button class="play small" data-act="next">▶ Next match</button>
      <div class="row"><button data-act="team">👕 My Team</button><button data-act="table">🏆 Table</button><button data-act="home">🏠 Home</button></div>
    </div></div>`,
    h,
  );
}

export function clear() {
  hud = null;
  root.innerHTML = '';
}
