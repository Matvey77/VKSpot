// Synthetic personal library, including virtual rows and a silent real media stream.
export function vkAudioPage(
  options: {
    total?: number
    target?: number
    ids?: boolean
    blocked?: boolean
    stalled?: boolean
    missing?: boolean
    noAria?: boolean
    webAudio?: boolean
  } = {},
): string {
  const config = {
    total: 160,
    target: 112,
    ids: false,
    blocked: false,
    stalled: false,
    missing: false,
    noAria: false,
    webAudio: false,
    ...options,
  }
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin:0 } #viewport { height:600px; overflow:auto } #au_search_items { position:relative }
    .track { position:absolute; height:54px; width:100% } aside { position:fixed; right:0; top:0 }
    button { min-height:30px }
  </style><h1>Моя музыка</h1><a data-testid="AudioCatalog_Tabs_Tab_all" aria-selected="true" href="https://vk.ru/audios42?section=all">Моя музыка</a>
  <audio src="https://vk.ru/vkspot-fixture.wav" preload="auto"></audio>
  <div id="viewport"><div id="au_search_items"></div></div>
  <aside><div data-testid="MusicTrackRow"><span data-testid="MusicTrackRow_Title">Original (Live)</span><span data-testid="MusicTrackRow_Authors">Synthetic Artist</span><span data-testid="MusicTrackRow_Duration">3:43</span><button data-testid="MusicTrackRow_Play" onclick="window.__wrong=true">Play recommendation</button></div></aside>
  <script>
    const config = ${JSON.stringify(config)};
    const viewport = document.querySelector('#viewport'), list = document.querySelector('#au_search_items'), audio = document.querySelector('audio');
    window.__clicked = []; window.__wrong = false;
    let active = null, context = null, clock = null, elapsed = 0;
    function render() {
      list.style.height = config.total * 54 + 'px';
      const start = Math.max(0, Math.floor(viewport.scrollTop / 54) - 2);
      list.replaceChildren();
      for (let index = start; index < Math.min(config.total, start + 18); index++) {
        const target = index === config.target && !config.missing;
        const row = document.createElement('div');
        row.className = 'track' + (target && config.blocked ? ' audio_item_disabled' : '');
        row.dataset.testid = 'MusicTrackRow'; row.style.top = index * 54 + 'px';
        if (config.ids) row.dataset.audioId = '42_' + (index + 1);
        if (!config.noAria) row.setAttribute('aria-posinset', index + 1);
        if (active === index) row.dataset.playing = '1';
        row.innerHTML = '<span data-testid="MusicTrackRow_Title">' + (target || index === 0 ? 'Original (Live)' : 'Song ' + index) + '</span><span data-testid="MusicTrackRow_Authors">' + (target ? 'Synthetic Artist' : index === 0 ? 'Another Artist' : 'Fixture Artist') + '</span><span data-testid="MusicTrackRow_Duration">' + (active === index && config.webAudio ? '0:' + String(elapsed).padStart(2, '0') : active === index && config.stalled ? '0:00' : '3:43') + '</span><button data-testid="MusicTrackRow_' + (active === index ? 'Pause' : 'Play') + '">' + (active === index ? 'Pause' : 'Play') + '</button>';
        row.querySelector('button').onclick = () => {
          if (active === index) { audio.pause(); if (context) context.suspend(); clearInterval(clock); active = null; render(); return; }
          active = index; window.__clicked.push(index); render();
          if (config.webAudio) {
            context = new AudioContext();
            const source = context.createBufferSource(); source.buffer = context.createBuffer(1, context.sampleRate * 15, context.sampleRate); source.connect(context.destination); source.start();
            elapsed = 0; clock = setInterval(() => { elapsed = Math.floor(context.currentTime); render(); }, 150);
          } else if (!config.stalled) { audio.currentTime = 0; audio.play().catch(() => {}); }
        };
        list.append(row);
      }
    }
    viewport.addEventListener('scroll', render); render();
  </script>`
}

export function silentWav(): Uint8Array {
  const samples = 8000 * 15
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  return bytes
}

// Public DOM contracts observed in current VK, reconstructed with synthetic
// metadata. PlaybackControls is decorative; only its tappable parent starts.
export function modernVKAudioPage(
  options: { adMs?: number; wrongPlayer?: boolean; dropRow?: boolean } = {},
): string {
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0} [data-testid="MusicTrackRow"]{height:80px} [role="button"],button{padding:8px}</style>
    <a data-testid="AudioCatalog_Tabs_Tab_all" href="https://vk.ru/audios42?section=all">Моя музыка</a>
    <div style="display:none"><button data-testid="TopAudioPlayer_TogglePlayAction">Воспроизвести</button><div data-testid="AudioPlayerBlock_AudioTitle">Stale responsive copy</div><div data-testid="audioplayeraudioinfo-extra">Wrong artist</div><div data-testid="AudioPlayerBlock_ProgressTimer">0:00</div></div>
    <div id="rows"></div><div id="player"></div><script>
    const config = ${JSON.stringify(options)};
    const rows = document.querySelector('#rows'), player = document.querySelector('#player');
    window.__tapClicks=0; window.__coverClicks=0;
    let phase='idle', resumed='track', context=null, interval=null, elapsed=0, phaseStart=0, selected=false;
    function pause(){ resumed=phase; phase='paused'; if(context)context.suspend(); clearInterval(interval); render(); }
    function run(){
      if(context)context.resume();
      phaseStart=performance.now()-elapsed*1000;
      clearInterval(interval);
      interval=setInterval(()=>{
        elapsed=Math.floor((performance.now()-phaseStart)/1000);
        if(phase==='advertisement' && performance.now()-phaseStart >= (config.adMs||0)){phase='track';elapsed=0;phaseStart=performance.now();}
        render();
      },100);
      render();
    }
    function start(){
      window.__tapClicks++;
      if(phase==='track'||phase==='advertisement'){pause();return;}
      if(phase==='paused'){phase=resumed;run();return;}
      selected=true;phase=config.adMs?'advertisement':'track';elapsed=0;
      context=new AudioContext();const source=context.createBufferSource();source.buffer=context.createBuffer(1,context.sampleRate*60,context.sampleRate);source.connect(context.destination);source.start();run();
    }
    function render(){
      rows.innerHTML='<div data-testid="MusicTrackRow" aria-posinset="1"><span data-testid="MusicTrackRow_Title">Original (Live)</span><span data-testid="MusicTrackRow_Authors">Other Artist</span><span data-testid="MusicTrackRow_Duration">3:43</span></div><div data-testid="MusicTrackRow" aria-posinset="2"><div data-testid="audiorow-tappable" role="button" aria-label="Начать прослушивание"><div data-testid="MusicTrackRow_PlaybackControls">'+(selected?'<div data-testid="MusicTrackCell_FrequencyBars"></div>':'')+'Cover</div><a data-testid="MusicTrackRow_Title">Original (Live)</a><a data-testid="MusicTrackRow_Authors">Synthetic Artist</a><span data-testid="MusicTrackRow_Duration">'+(selected?'0:'+String(elapsed).padStart(2,'0'):'3:43')+'</span>'+(selected?'<div data-testid="MusicTrackRow_PlayerProgressBar"></div>':'')+'</div></div>';
      if(selected&&config.dropRow)rows.lastElementChild.remove();
      const tap=rows.querySelector('[data-testid="audiorow-tappable"]'); if(tap)tap.onclick=start;
      const cover=rows.querySelector('[data-testid="MusicTrackRow_PlaybackControls"]'); if(cover)cover.onclick=(event)=>{event.stopPropagation();window.__coverClicks++;};
      const playing=phase==='track'||phase==='advertisement';
      player.innerHTML='<button data-testid="TopAudioPlayer_TogglePlayAction">'+(playing?'Приостановить':'Воспроизвести')+'</button><div data-testid="AudioPlayerBlock_LayoutGroups">'+(phase==='advertisement'?'<div data-testid="AudioPlayerBlock_Advertising_Title">Synthetic sponsor</div>':'')+'<div data-testid="AudioPlayerBlock_AudioTitle">'+(phase==='advertisement'?'Реклама':config.wrongPlayer?'Different Song':'Original (Live)')+'</div><div data-testid="audioplayeraudioinfo-extra">'+(phase==='advertisement'?'Отключить':config.wrongPlayer?'Wrong Artist':'Synthetic Artist')+'</div><div data-testid="AudioPlayerBlock_ProgressTimer">0:'+String(elapsed).padStart(2,'0')+'</div></div>';
      player.querySelector('button').onclick=()=>{if(playing)pause();else start();};
    }
    render();
    </script>`
}

// Synthetic 2026 VKUI DOM without data-testid attributes, matching current VK Music structure.
export function currentVKAudioPage(
  options: {
    total?: number
    targetIndex?: number
    missing?: boolean
    blocked?: boolean
    hideSearch?: boolean
  } = {},
): string {
  const config = {
    total: 800,
    targetIndex: 705,
    missing: false,
    blocked: false,
    hideSearch: false,
    ...options,
  }
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin:0; font-family: sans-serif }
    header { height: 48px; display: flex; align-items: center; gap: 12px }
    .toolbar { padding: 8px; display: flex; gap: 8px }
    .row { height: 48px; display: flex; align-items: center }
    .host { display: flex; width: 100%; align-items: center; gap: 12px }
    .bar { width: 820px; height: 72px; display: flex; align-items: center; gap: 12px }
  </style>
  <header>
    <input type="search" placeholder="Поиск" oninput="window.__headerSearchTouched=true">
    <ul><li>
      <div role="button" aria-label="Аудиоплеер" id="mini-info"></div>
      <button type="button" id="mini-toggle">Воспроизвести</button>
    </li></ul>
  </header>
  <nav>
    <a role="tab" aria-selected="true" href="https://vk.ru/audios42?section=all">Моя музыка</a>
  </nav>
  ${
    config.hideSearch
      ? ''
      : `<div class="toolbar">
    <input type="search" id="music-search" placeholder="Поиск музыки">
    <button type="button" id="music-search-btn">Найти</button>
    <button type="button" id="music-clear-btn">Очистить поиск</button>
  </div>`
  }
  <div id="player-bar" class="bar">
    <button type="button">Предыдущая аудиозапись</button>
    <button type="button" id="bar-toggle">Слушать</button>
    <button type="button">Следующая аудиозапись</button>
    <a id="bar-title" href="/audio-42_0"></a>
    <a id="bar-artist" href="/artist/0"></a>
    <span id="bar-timer"></span>
    <button type="button">Повторять</button>
  </div>
  <div id="search-results"></div>
  <div id="library-view">
    <section>
      <div role="heading">Недавно прослушанные</div>
      <div data-audio-id="99_1" data-testentitytag="audio" class="row">
        <div role="button" tabindex="0" aria-label="Начать прослушивание" id="recent-tap"></div>
        <div aria-disabled="false" class="host">
          <div><img alt="" width="40" height="40"></div>
          <div><div>
            <div><div><span><span><a href="/audio-99_1">Original <span>(Live)</span></a></span></span></div><div><svg aria-hidden="true"></svg></div></div>
            <div><span><a href="/artist/99">Synthetic Artist</a></span></div>
          </div></div>
          <div><div><div><span>3:43</span></div></div></div>
        </div>
      </div>
    </section>
    <div role="group"><div role="button" id="shuffle-btn"><span>Перемешать всё</span></div></div>
    <div role="list" id="my-list"></div>
  </div>
  <script>
    const config = ${JSON.stringify(config)};
    window.__personalClicked = [];
    window.__globalClicked = 0;
    window.__recentClicked = 0;
    window.__headerSearchTouched = false;
    let activeKey = null, playing = false, elapsed = 0, timer = null, context = null;
    let loadedLimit = 100, currentQuery = '';
    const recentTap = document.querySelector('#recent-tap');
    if (recentTap) recentTap.onclick = () => { window.__recentClicked++; };

    function makeTrack(index, isTarget) {
      return {
        key: (isTarget ? 'personal:' : 'song:') + index,
        id: '42_' + (index + 1),
        titleMain: isTarget ? 'Original' : 'Song ' + index,
        titleSub: isTarget ? '(Live)' : '',
        artist: isTarget ? 'Synthetic Artist' : 'Fixture Artist',
        duration: '3:43',
        blocked: isTarget && config.blocked,
      };
    }

    function stopAudio() {
      playing = false;
      clearInterval(timer);
      if (context) context.suspend();
      renderAll();
    }

    function toggleTrack(item, onGlobal) {
      if (onGlobal) { window.__globalClicked++; return; }
      if (activeKey === item.key && playing) { stopAudio(); return; }
      activeKey = item.key;
      playing = true;
      elapsed = 0;
      window.__personalClicked.push(item.id);
      if (!context) {
        context = new AudioContext();
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, context.sampleRate * 60, context.sampleRate);
        source.connect(context.destination);
        source.start();
      } else {
        context.resume();
      }
      clearInterval(timer);
      timer = setInterval(() => { elapsed++; renderAll(); }, 250);
      renderAll();
    }

    function buildRow(item, onGlobal) {
      const active = activeKey === item.key;
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('data-audio-id', item.id);
      row.setAttribute('data-testentitytag', 'audio');
      const tap = document.createElement('div');
      tap.setAttribute('role', 'button');
      tap.setAttribute('tabindex', '0');
      tap.setAttribute('aria-label', active && playing ? 'Поставить на\\u00a0паузу' : 'Начать прослушивание');
      tap.onclick = () => toggleTrack(item, onGlobal);
      const host = document.createElement('div');
      host.setAttribute('aria-disabled', item.blocked ? 'true' : 'false');
      host.className = 'host';
      host.innerHTML =
        '<div><img alt="" width="40" height="40"></div>' +
        '<div><div>' +
          '<div><div><span><span><a href="/audio-' + item.id + '">' + item.titleMain + ' <span>' + item.titleSub + '</span></a></span></span></div><div><svg aria-hidden="true"></svg></div></div>' +
          '<div><span><a href="/artist/1">' + item.artist + '</a></span></div>' +
        '</div></div>' +
        '<div><div><div><span>' + (active ? '0:' + String(elapsed).padStart(2, '0') : item.duration) + '</span></div></div>' +
        (active ? '<div role="slider"></div>' : '') + '</div>';
      row.append(tap, host);
      return row;
    }

    function renderPlayer() {
      const miniInfo = document.querySelector('#mini-info');
      const miniToggle = document.querySelector('#mini-toggle');
      const barToggle = document.querySelector('#bar-toggle');
      const barTitle = document.querySelector('#bar-title');
      const barArtist = document.querySelector('#bar-artist');
      const barTimer = document.querySelector('#bar-timer');
      if (activeKey) {
        miniInfo.textContent = 'Synthetic Artist — Original (Live)';
        barTitle.textContent = 'Original (Live)';
        barArtist.textContent = 'Synthetic Artist';
        barTimer.textContent = '0:' + String(elapsed).padStart(2, '0');
      }
      miniToggle.textContent = playing ? 'Приостановить' : 'Воспроизвести';
      barToggle.textContent = playing ? 'Пауза' : 'Слушать';
      miniToggle.onclick = () => { if (playing) stopAudio(); };
      barToggle.onclick = () => { if (playing) stopAudio(); };
    }

    function renderList() {
      const list = document.querySelector('#my-list');
      list.replaceChildren();
      const count = Math.min(config.total, loadedLimit);
      for (let i = 0; i < count; i++) {
        const isTarget = !config.missing && i === config.targetIndex;
        list.append(buildRow(makeTrack(i, isTarget), false));
      }
    }

    function renderSearch() {
      const searchBox = document.querySelector('#search-results');
      const lib = document.querySelector('#library-view');
      if (!currentQuery) {
        searchBox.replaceChildren();
        lib.style.display = '';
        renderList();
        return;
      }
      lib.style.display = 'none';
      searchBox.replaceChildren();
      const q = currentQuery.toLowerCase();
      const matchesTarget = !config.missing && ('synthetic artist original (live)'.includes(q) || q.includes('original'));
      if (matchesTarget) {
        const mySec = document.createElement('section');
        mySec.innerHTML = '<div role="heading">Мои треки</div>';
        mySec.append(buildRow(makeTrack(config.targetIndex, true), false));
        searchBox.append(mySec);
      }
      const allSec = document.createElement('section');
      allSec.innerHTML = '<div role="heading">Все треки <a href="https://vk.ru/audios42?section=all&block=all">Показать все</a></div>';
      allSec.append(buildRow({ key: 'global', id: '999_1', titleMain: 'Original', titleSub: '(Live)', artist: 'Synthetic Artist', duration: '3:43', blocked: false }, true));
      searchBox.append(allSec);
    }

    function renderAll() {
      renderPlayer();
      renderSearch();
      if (!currentQuery) renderList();
    }

    window.addEventListener('scroll', () => {
      if (!currentQuery && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 80 && loadedLimit < config.total) {
        loadedLimit = Math.min(config.total, loadedLimit + 200);
        renderList();
      }
    });

    const input = document.querySelector('#music-search');
    const searchBtn = document.querySelector('#music-search-btn');
    const clearBtn = document.querySelector('#music-clear-btn');
    if (searchBtn && input) {
      searchBtn.onclick = () => {
        currentQuery = input.value.trim();
        history.replaceState(null, '', 'https://vk.ru/audios42?q=' + encodeURIComponent(currentQuery) + '&section=all');
        renderAll();
      };
    }
    if (clearBtn && input) {
      clearBtn.onclick = () => {
        input.value = '';
        currentQuery = '';
        history.replaceState(null, '', 'https://vk.ru/audios42?section=all');
        renderAll();
      };
    }
    renderAll();
  </script>`
}
