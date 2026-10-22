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
