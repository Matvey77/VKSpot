import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { GuideCapture } from './GuideAssets'

type GuideLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sceneName: string
  capture: GuideCapture
}

export function GuideLightbox({ open, onOpenChange, sceneName, capture }: GuideLightboxProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog guide-lightbox">
          <Dialog.Title>{sceneName} — настоящий экран VKSpot</Dialog.Title>
          <Dialog.Description>
            Демонстрационная коллекция. Это изображение, а не подключение к аккаунту.
          </Dialog.Description>
          <img
            src={capture.src}
            width={capture.width}
            height={capture.height}
            alt={'Увеличенный снимок: ' + sceneName}
          />
          <Dialog.Close className="dialog-close" aria-label="Закрыть снимок">
            <X size={20} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
