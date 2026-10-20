import { useState } from 'react'

export function PlaylistRecovery({
  busy,
  recover,
}: {
  busy: boolean
  recover: (playlistId: string) => void
}) {
  const [value, setValue] = useState('')
  const id = value.match(/(?:playlist\/)?([A-Za-z0-9]{22})(?:\?|$)/)?.[1] ?? ''
  return (
    <form
      className="recovery-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (id) recover(id)
      }}
    >
      <label className="field">
        Ссылка или ID созданного плейлиста
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://open.spotify.com/playlist/…"
        />
      </label>
      <button disabled={busy || !id}>Связать и проверить</button>
    </form>
  )
}
