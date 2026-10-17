import { BUILD, startPwa, reloadForUpdate } from '../shared/pwa';

/** What a game says about itself in games/<id>/game.json. */
interface GameInfo {
  title: string;
  blurb: string;
  color: string;
  order: number;
}

// Every games/<id>/game.json becomes a tile, so a new game shows up here by itself.
const infos = import.meta.glob<GameInfo>('../games/*/game.json', { eager: true, import: 'default' });
const games = Object.entries(infos)
  .map(([path, info]) => ({ id: path.split('/')[2], ...info }))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const list = document.getElementById('games')!;
for (const g of games) {
  const a = document.createElement('a');
  a.className = 'game';
  a.href = `./games/${g.id}/`;
  a.style.setProperty('--tile', g.color);
  a.innerHTML = `<img alt="" src="./games/${g.id}/icon-512.png"><div class="title"></div><div class="blurb"></div>`;
  a.querySelector('.title')!.textContent = g.title;
  a.querySelector('.blurb')!.textContent = g.blurb;
  list.appendChild(a);
}

document.getElementById('build')!.textContent = `build ${BUILD}`;

// Nothing to lose on the menu, so just reload into a newer build.
startPwa({ onUpdate: reloadForUpdate });
