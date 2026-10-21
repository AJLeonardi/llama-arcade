// The HTML parts over the 3D view: HUD, title, pause, finish, the shop, and little pop-up messages.
// Only touches the DOM when something changes (per-frame DOM writes are slow on the iPad).
import { BUILD } from '../../../../shared/pwa';
import { ITEMS, owns, type Item, type Save, type Slot } from '../sim/shop';
import { sfx } from './sfx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function button(cls: string, text: string, onTap: () => void) {
  const b = el('button', cls, text);
  b.addEventListener('click', () => {
    sfx.click();
    onTap();
  });
  return b;
}

type ShopTab = 'me' | 'hat' | 'glasses' | 'cape';

export class UI {
  readonly root = document.getElementById('ui')!;
  readonly hud = el('div', 'hud hidden');
  readonly jumpBtn = el('button', 'jump-btn', 'JUMP');
  private coins = el('div', 'pill coins');
  private levelName = el('div', 'pill level-name');
  private shopBtn = el('button', 'shop-btn', '👕');
  private hint = el('div', 'hint');
  private actionsEl = el('div', 'actions');
  private actionKey = '';
  private actionList: { label: string; run: () => void; color?: string }[] = [];
  private screen = el('div', 'screen hidden');
  private shopEl = el('div', 'shop hidden');
  private toastEl = el('div', 'toast');
  private cardEl = el('div', 'level-card');
  private fadeEl = el('div', 'fade');
  private updateBtn = el('button', 'update-btn hidden', '✨ New version! Tap to get it');
  private toastTimer = 0;
  private cardTimer = 0;
  private shopTab: ShopTab = 'me';
  private touch = false;

  constructor(handlers: { pause: () => void; shop: () => void; update: () => void }) {
    const pause = button('pause-btn', '⏸', handlers.pause);
    this.shopBtn.addEventListener('click', () => {
      sfx.click();
      handlers.shop();
    });
    this.updateBtn.addEventListener('click', handlers.update);
    this.hud.append(this.coins, this.levelName, this.shopBtn, pause, this.jumpBtn, this.hint, this.actionsEl);
    // Enter or F presses the first context button.
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Enter' || e.code === 'KeyF') && !e.repeat && this.actionList[0] && !this.hud.classList.contains('hidden')) {
        sfx.click();
        this.actionList[0].run();
      }
    });
    this.toastEl.style.opacity = '0';
    this.cardEl.style.opacity = '0';
    this.root.append(this.hud, this.cardEl, this.toastEl, this.screen, this.shopEl, this.fadeEl, this.updateBtn, el('div', 'build', `build ${BUILD}`));
    // Touch screens get the jump button; the Mac gets a keyboard hint instead.
    const touch = matchMedia('(pointer: coarse)').matches;
    this.jumpBtn.classList.toggle('hidden', !touch);
    this.touch = touch;
    this.hint.textContent = touch
      ? '👈 Left thumb to walk · drag on the right to look around 👉'
      : 'WASD / arrows to move · Space to jump · Q / E or drag to turn the camera';
  }

  /** On touch screens the hint goes once they've found out how to look around. */
  lookedAround() {
    if (this.touch) this.hint.classList.add('hidden');
  }

  /** The big context buttons ("🎢 Ride!"), redrawn only when they change. */
  setActions(list: { label: string; run: () => void; color?: string }[]) {
    this.actionList = list;
    const key = list.map((a) => a.label + (a.color ?? '')).join('|');
    if (key === this.actionKey) return;
    this.actionKey = key;
    this.actionsEl.replaceChildren(
      ...list.map((a, i) => {
        const b = button('action-btn', a.label, () => this.actionList[i]?.run());
        if (a.color) b.style.background = a.color;
        return b;
      }),
    );
  }

  /** While riding or building there's nothing to jump: hide the jump button and the hint. */
  setLocked(on: boolean) {
    this.hud.classList.toggle('locked', on);
  }

  /** A message card with buttons (for the worlds' own results). */
  card(title: string, lines: string[], buttons: [string, string, () => void][]) {
    const card = el('div', 'card');
    card.append(el('h1', '', title), ...lines.map((l) => el('p', '', l)));
    const row = el('div', 'card-buttons');
    for (const [label, cls, fn] of buttons) row.append(button(`big ${cls}`, label, fn));
    card.append(row);
    this.showScreen([card]);
  }

  setCoins(n: number) {
    this.coins.textContent = `🪙 ${n}`;
  }

  /** Show the in-game HUD (or hide it, for menus). */
  showHud(on: boolean, levelName = '', inHub = false) {
    this.hud.classList.toggle('hidden', !on);
    this.levelName.textContent = levelName;
    this.shopBtn.classList.toggle('hidden', !inHub);
  }

  showUpdate(on: boolean) {
    this.updateBtn.classList.toggle('hidden', !on);
  }

  /** A full-screen menu. Pass null to close it. */
  showScreen(content: HTMLElement[] | null, clear = false) {
    this.screen.replaceChildren(...(content ?? []));
    this.screen.classList.toggle('hidden', !content);
    this.screen.classList.toggle('clear', clear);
  }

  title(onPlay: () => void, onDress: () => void, onArcade: () => void) {
    const logo = el('div', 'logo');
    const colours = ['#e23d8f', '#ff922b', '#ffc83d', '#3bb273', '#2f7de1', '#7a5cff'];
    [...'Llama-blox'].forEach((ch, i) => {
      const s = el('span', '', ch);
      s.style.background = colours[i % colours.length];
      s.style.transform = `rotate(${(i % 2 ? 1 : -1) * 4}deg)`;
      logo.append(s);
    });
    this.showScreen(
      [logo, button('big', '▶️ Play', onPlay), button('big pink', '👕 Dress Up', onDress), button('big grey', '🏠 Arcade', onArcade)],
      true,
    );
  }

  pause(inHub: boolean, h: { resume: () => void; hub: () => void; dress: () => void; title: () => void }) {
    const card = el('div', 'card');
    card.append(el('h1', '', '⏸ Paused'));
    const col = el('div', 'screen-col');
    col.style.cssText = 'display:flex;flex-direction:column;gap:14px;align-items:center';
    col.append(button('big', '▶️ Keep playing', h.resume));
    if (inHub) col.append(button('big pink', '👕 Dress Up', h.dress));
    else col.append(button('big blue', '🏝️ Back to the island', h.hub));
    col.append(button('big grey', '🏁 Title screen', h.title));
    card.append(col);
    this.showScreen([card]);
  }

  finish(name: string, coins: number, reward: number, onHub: () => void) {
    const card = el('div', 'card');
    card.append(el('h1', '', '🎉 You did it! 🎉'), el('p', '', `You finished ${name}!`));
    card.append(el('p', '', `🪙 ${coins} coin${coins === 1 ? '' : 's'} collected  +  ${reward} bonus!`));
    card.append(button('big blue', '🏝️ Back to the island', onHub));
    this.showScreen([card]);
  }

  /** A big message that pops up and fades (e.g. "Checkpoint!"). */
  toast(text: string, ms = 1300) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }

  /** The level name, shown big when you arrive. */
  levelCard(text: string) {
    this.cardEl.textContent = text;
    this.cardEl.style.opacity = '1';
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => (this.cardEl.style.opacity = '0'), 2200);
  }

  /** Flash to white and back, calling `mid` while the screen is white. */
  fade(mid: () => void) {
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      mid();
      this.fadeEl.classList.remove('on');
    }, 380);
  }

  // ---------------------------------------------------------------- the shop

  /** Opens (or redraws) the dress-up shop. `onPick` wears/buys an item; `onBody` switches llama/person. */
  shop(save: Save, h: { pick: (item: Item) => void; body: (b: 'llama' | 'human') => void; done: () => void }) {
    const s = this.shopEl;
    s.classList.remove('hidden');
    const top = el('div', 'shop-top');
    top.append(el('h2', '', '👕 Dress Up'), el('div', 'shop-coins', `🪙 ${save.coins}`), button('done-btn', 'Done ✓', h.done));

    const tabs = el('div', 'tabs');
    const tab = (id: ShopTab, label: string) => {
      const b = button(`tab${this.shopTab === id ? ' on' : ''}`, label, () => {
        this.shopTab = id;
        this.shop(save, h);
      });
      tabs.append(b);
    };
    tab('me', save.outfit.body === 'llama' ? '🦙 Me' : '🧍 Me');
    tab('hat', '🎩 Hats');
    tab('glasses', '🕶️ Glasses');
    tab('cape', '🦸 Capes');

    const grid = el('div', 'items');
    const section = (title: string) => grid.append(el('div', 'sub', title));
    const items = (slot: Slot) => {
      for (const item of ITEMS.filter((i) => i.slot === slot)) grid.append(this.itemButton(save, item, h.pick));
    };
    if (this.shopTab === 'me') {
      section('Who are you?');
      for (const [b, icon, name] of [['llama', '🦙', 'Llama'], ['human', '🧍', 'Person']] as const) {
        const btn = button(`item${save.outfit.body === b ? ' on' : ''}`, '', () => h.body(b));
        btn.append(el('div', 'icon', icon), el('div', '', name));
        grid.append(btn);
      }
      section(save.outfit.body === 'llama' ? 'Fur colour' : 'Shirt colour');
      items('color');
      if (save.outfit.body === 'human') {
        section('Skin');
        items('skin');
        section('Trousers');
        items('pants');
      }
    } else {
      items(this.shopTab);
    }
    s.replaceChildren(top, tabs, grid);
  }

  closeShop() {
    this.shopEl.classList.add('hidden');
  }

  private itemButton(save: Save, item: Item, pick: (item: Item) => void) {
    const on = save.outfit[item.slot] === item.id;
    const have = owns(save, item);
    const b = button(`item${on ? ' on' : ''}${!have && save.coins < item.price ? ' locked' : ''}`, '', () => pick(item));
    if (item.color) {
      const sw = el('div', 'swatch');
      sw.style.background =
        item.color === 'rainbow' ? 'linear-gradient(#ff6b6b, #ffa94d, #ffd43b, #69db7c, #4dabf7, #9775fa)' : item.color;
      b.append(sw);
    } else {
      b.append(el('div', 'icon', item.emoji ?? ''));
    }
    b.append(el('div', '', item.name));
    if (item.price > 0) b.append(el('div', `price${have ? ' owned' : ''}`, have ? '✓ yours' : `🪙 ${item.price}`));
    return b;
  }
}
