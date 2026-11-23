import { describe, expect, it } from 'vitest'
import {
  formatCollectionsCount,
  formatRecordsCount,
  formatRecordsGenitive,
  formatTracksCount,
  humanizeError,
  humanizeNetworkError,
  humanizeZodError,
  pluralize,
} from '../../src/shared/ru'

describe('Russian pluralization and error localization', () => {
  it('declines Russian counts across 1, 2-4, 5-20, 21 and teens', () => {
    expect(formatRecordsCount(0)).toBe('0 записей')
    expect(formatRecordsCount(1)).toBe('1 запись')
    expect(formatRecordsCount(2)).toBe('2 записи')
    expect(formatRecordsCount(4)).toBe('4 записи')
    expect(formatRecordsCount(5)).toBe('5 записей')
    expect(formatRecordsCount(11)).toBe('11 записей')
    expect(formatRecordsCount(12)).toBe('12 записей')
    expect(formatRecordsCount(21)).toBe('21 запись')
    expect(formatRecordsCount(22)).toBe('22 записи')
    expect(formatRecordsCount(114)).toBe('114 записей')
    expect(formatRecordsCount(101)).toBe('101 запись')

    expect(formatRecordsGenitive(1)).toBe('1 записи')
    expect(formatRecordsGenitive(2)).toBe('2 записей')
    expect(formatRecordsGenitive(11)).toBe('11 записей')
    expect(formatRecordsGenitive(21)).toBe('21 записи')

    expect(formatTracksCount(1)).toBe('1 трек')
    expect(formatTracksCount(3)).toBe('3 трека')
    expect(formatTracksCount(12)).toBe('12 треков')

    expect(formatCollectionsCount(1)).toBe('1 коллекция')
    expect(formatCollectionsCount(2)).toBe('2 коллекции')
    expect(formatCollectionsCount(5)).toBe('5 коллекций')
    expect(pluralize(-23, ['запись', 'записи', 'записей'])).toBe('записи')
  })

  it('translates Chromium/Node network errors and strips Electron IPC wrappers', () => {
    expect(humanizeNetworkError(new Error('net::ERR_PROXY_CONNECTION_FAILED'))).toContain('прокси')
    expect(humanizeNetworkError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toContain('интернет')
    expect(humanizeNetworkError(new Error('The operation was aborted due to timeout'))).toContain(
      'вовремя',
    )
    expect(
      humanizeError(
        new Error("Error invoking remote method 'vkspot:saveSettings': Error: Проверь прокси."),
      ),
    ).toBe('Проверь прокси.')
    expect(humanizeError(new Error('Raw English failure'))).toBe('Не удалось выполнить действие.')
  })

  it('translates English Zod issues into Russian while preserving custom Russian messages', () => {
    expect(
      humanizeZodError({
        issues: [{ path: ['playlistName'], message: 'Too small: expected string to have >=1' }],
      }),
    ).toBe('Некорректные данные: название плейлиста: значение слишком маленькое или пустое.')
    expect(
      humanizeZodError({
        issues: [{ path: ['spotifyProxy'], message: 'Укажи HTTP или SOCKS5 адрес прокси.' }],
      }),
    ).toBe('Некорректные данные: Укажи HTTP или SOCKS5 адрес прокси.')
  })
})
