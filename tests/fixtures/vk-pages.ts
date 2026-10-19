// Synthetic DOM contracts, never copied from a personal VK account.
export function modernVKPage(
  options: {
    total?: number
    virtual?: boolean
    delayed?: boolean
    blank?: boolean
    aria?: boolean
    gap?: boolean
  } = {},
): string {
  const config = {
    total: 8307,
    virtual: true,
    delayed: false,
    blank: false,
    aria: true,
    ...options,
  }
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0 } #viewport { height: 780px; overflow-y: auto; position: relative }
    #au_search_items { position: relative } .track { position: absolute; height: 20px; width: 100% }
  </style><div id="viewport"><div id="au_search_items"></div></div><aside><div data-audio-id="recommendation">Other playlist</div></aside>
  <script>
    const config = ${JSON.stringify(config)};
    const viewport = document.querySelector('#viewport');
    const list = document.querySelector('#au_search_items');
    let loaded = config.delayed ? 398 : config.total;
    let pending = false;
    function render() {
      list.style.height = loaded * 20 + 'px';
      let start = config.virtual ? Math.max(0, Math.floor(viewport.scrollTop / 20) - 5) : 0;
      if (config.gap && viewport.scrollTop > 100) start += 100;
      const end = config.virtual ? Math.min(loaded, start + 55) : loaded;
      list.replaceChildren();
      for (let index = start; index < end; index++) {
        const row = document.createElement('div');
        row.className = 'track' + (index % 13 === 0 ? ' audio_item_disabled' : '');
        row.style.top = index * 20 + 'px';
        row.setAttribute('data-audio-id', 'same-id');
        if (config.aria) { row.setAttribute('aria-posinset', index + 1); row.setAttribute('aria-setsize', config.total); }
        if (!config.blank) row.innerHTML = '<span data-testid="MusicTrackRow_Title">Демо (Cover / Remix)</span><span><a data-testid="MusicTrackRow_Authors">Автор</a> &amp; <a data-testid="MusicTrackRow_Authors">Гость</a></span><span data-testid="MusicTrackRow_Duration">3:01</span>';
        list.append(row);
      }
      if (config.delayed && loaded < config.total && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2 && !pending) {
        pending = true;
        setTimeout(() => { loaded = config.total; pending = false; render(); }, 350);
      }
    }
    viewport.addEventListener('scroll', render);
    render();
    viewport.scrollTop = Math.min(loaded * 10, 4000);
    render();
  </script>`
}

export function classicVKPage(): string {
  return `<!doctype html><meta charset="utf-8"><style>.audio_item,.audio_row { height: 40px }</style><div id="au_search_items">
    <div class="audio_item audio_item_disabled" data-audio='[11,-7,"https://secret.invalid/audio","Song &amp; Remix","Artist &amp; Guest",183]'></div>
    <div class="audio_item" data-audio='{"id":12,"owner_id":-7,"title":"Own (Mashup)","main_artists":[{"name":"Own Artist"}],"duration":200,"url":"https://secret.invalid/audio","actionHash":"SECRET_HASH"}'></div>
    <div class="audio_row" data-full-id="-7_13"><span data-audio-id="-7_13"></span><span class="audio_row__title"><span class="audio_row__title_inner">Visible</span><span class="audio_row__subtitle"> (Live Cover)</span></span><span class="audio_row__performer">Performer</span><span class="audio_row__duration">1:02:03</span></div>
  </div>`
}
