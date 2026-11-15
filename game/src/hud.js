// The DOM HUD: crosshair, health, ammo, money, timer, score, kill feed, banners,
// the buy menu and the start/pause overlays. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorFill = el('armor-fill');
  const moneyValue = el('money-value');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const timerValue = el('timer-value');
  const scoreEmber = el('score-ember');
  const scoreFrost = el('score-frost');
  const aliveEmber = el('alive-ember');
  const aliveFrost = el('alive-frost');
  const phaseLabel = el('phase-label');
  const feed = el('feed');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const objective = el('objective');
  const plantWrap = el('plant-wrap');
  const plantLabel = el('plant-label');
  const plantFill = el('plant-fill');
  const bombTimer = el('bomb-timer');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { hp: -1, armor: -1, money: -1, mag: -1, reserve: -1, weapon: '', nades: -1, timer: '', score: '', alive: '' };

  const COPY = {
    start: {
      title: 'EMBERLINE',
      copy: 'Foundry Protocol — a round-based tactical shooter. Plant the Surge Core at Site A or B, or wipe the Frost squad. First to 5 rounds takes the match.',
      action: 'Click to play',
    },
    paused: {
      title: 'EMBERLINE',
      copy: 'Paused. Click to resume.',
      action: 'Click to resume',
    },
    match: {
      title: 'Match over',
      copy: '',
      action: 'Play again',
    },
  };

  function showOverlay(mode, extra) {
    const text = COPY[mode];
    title.textContent = text.title;
    copy.textContent = mode === 'match' ? extra : text.copy;
    play.textContent = text.action;
    overlay.hidden = false;
    play.focus();
  }

  return {
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
      healthFill.style.background = hp <= 30 ? '#ff4d4d' : hp <= 60 ? '#f0a830' : '#7dd87d';
    },
    setMoney(value) {
      if (value === last.money) return;
      last.money = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.weapon) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(count) {
      if (count === last.nades) return;
      last.nades = count;
      grenadeCount.textContent = `Frag x${count}`;
    },
    setTimer(seconds, label) {
      const text = `${Math.max(0, Math.ceil(seconds))}`;
      if (text === last.timer) return;
      last.timer = text;
      timerValue.textContent = text;
      phaseLabel.textContent = label;
      timerValue.style.color = seconds <= 10 ? '#ff4d4d' : '';
    },
    setScore(emberRounds, frostRounds) {
      const text = `${emberRounds}-${frostRounds}`;
      if (text === last.score) return;
      last.score = text;
      scoreEmber.textContent = String(emberRounds);
      scoreFrost.textContent = String(frostRounds);
    },
    setAlive(emberAlive, frostAlive) {
      const text = `${emberAlive}-${frostAlive}`;
      if (text === last.alive) return;
      last.alive = text;
      aliveEmber.textContent = `Ember ${emberAlive} alive`;
      aliveFrost.textContent = `Frost ${frostAlive} alive`;
    },
    setObjective(text) {
      objective.textContent = text;
    },
    setCrosshair(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    killFeed(html) {
      const item = document.createElement('div');
      item.className = 'feed-item';
      item.innerHTML = html;
      feed.prepend(item);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => item.classList.add('fade'), 4200);
      setTimeout(() => item.remove(), 5000);
    },
    banner(titleText, subText, color, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.style.borderColor = color;
      bannerTitle.style.color = color;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuy(show) {
      buyMenu.hidden = !show;
    },
    plant(show, label, fraction) {
      plantWrap.hidden = !show;
      if (!show) return;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    bomb(show, seconds) {
      bombTimer.hidden = !show;
      if (show) bombTimer.textContent = `SURGE CORE ${Math.max(0, Math.ceil(seconds))}s`;
    },
    showOverlay,
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyMenu.querySelectorAll('[data-buy]').forEach((button) => {
        button.addEventListener('click', () => handler(button.getAttribute('data-buy')));
      });
    },
  };
}
