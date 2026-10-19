import vk from './assets/brands/vk.svg'
import spotify from './assets/brands/spotify.svg'
import spotifyWhite from './assets/brands/spotify-white.svg'
import project from './assets/brands/vkspot.svg'

export function VKIcon({ size = 24 }: { size?: number }) {
  return (
    <img
      className="service-logo"
      data-brand="vk"
      src={vk}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  )
}

export function SpotifyIcon({ size = 24 }: { size?: number }) {
  return (
    <span className="spotify-icon-pair" style={{ width: size, height: size }} aria-hidden="true">
      <img
        className="service-logo spotify-green"
        data-brand="spotify"
        src={spotify}
        width={size}
        height={size}
        alt=""
      />
      <img
        className="service-logo spotify-white"
        data-brand="spotify"
        src={spotifyWhite}
        width={size}
        height={size}
        alt=""
      />
    </span>
  )
}

export function ProjectIcon({ size = 44 }: { size?: number }) {
  return (
    <img
      className="project-logo"
      data-brand="vkspot"
      src={project}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  )
}
