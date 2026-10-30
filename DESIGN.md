---
name: VKSpot
description: A local desktop music collection workspace with visible provenance.
colors:
  canvas: '#f4f6f5'
  surface: '#fff'
  shell: '#162d3b'
  ink: '#172e3a'
  muted: '#536570'
  line: '#d8e1e3'
  accent: '#087f73'
  accent-hover: '#06665e'
  selected: '#e6f3ef'
  control: '#fff'
  hover: '#f0f5f3'
  warning-bg: '#fff2d8'
  warning-ink: '#8b570c'
  error-bg: '#fff0f1'
  error-ink: '#a72d3a'
  local-bg: '#e8eff9'
  local-ink: '#315984'
  nav-text: '#c6d7df'
  collection-nav-text: '#bdcfd8'
  nav-hover: '#264655'
  nav-active: '#315467'
  nav-focus: '#8be0cd'
  nav-label: '#b5cbd5'
  nav-border: '#29424f'
  text-selection-bg: '#b9e7db'
  text-selection-ink: '#12392e'
  dark-canvas: '#14232a'
  dark-surface: '#1c2e37'
  dark-ink: '#edf5f5'
  dark-muted: '#b0c2ca'
  dark-line: '#3a505a'
  dark-accent: '#54cbb2'
  dark-accent-hover: '#84dec9'
  dark-selected: '#244b45'
  dark-control: '#233842'
  dark-hover: '#293e46'
  dark-warning-bg: '#47381e'
  dark-warning-ink: '#ffdc99'
  dark-error-bg: '#472d35'
  dark-error-ink: '#ffb8c0'
  dark-local-bg: '#293e59'
  dark-local-ink: '#bad3fa'
  dark-primary-text: '#102b28'
typography:
  display:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '32px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  headline-compact:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '23px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  brand:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '25px'
    fontWeight: 700
    letterSpacing: '-0.035em'
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1.4
  panel-title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 650
    lineHeight: 1.4
  supporting-title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '16px'
    lineHeight: 1.4
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '14px'
  record:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '13px'
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '12px'
  helper:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '11px'
    lineHeight: 1.6
  code:
    fontFamily: 'Consolas, monospace'
    fontSize: '12px'
rounded:
  tag: '4px'
  control: '6px'
  navigation: '8px'
  panel: '12px'
  dialog: '12px'
  guide: '10px'
  guide-note: '7px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  field:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '36px'
  navigation-active:
    backgroundColor: '{colors.nav-active}'
    textColor: '{colors.surface}'
    rounded: '{rounded.navigation}'
    padding: '0 12px'
    height: '44px'
  destination-spotify:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.tag}'
    padding: '5px 7px'
  collection-panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
  collection-row:
    typography: '{typography.record}'
    height: '60px'
  collection-facet-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '34px'
  provenance-inspector:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    width: '580px'
  success-notice:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.navigation}'
    padding: '12px 16px'
  welcome-guide-step:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    padding: '24px 0 0'
  welcome-route-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '42px'
---

# Design system: VKSpot

## Overview

Сдержанное рабочее пространство большой музыкальной библиотеки: глубокая синяя навигация, светлые поверхности, читаемые табличные данные и бирюзовые действия. Сохранить утверждённую палитру, Segoe UI и существующие знаки VKSpot/VK/Spotify. Основная визуальная сигнатура — **оригинал → рабочая копия → назначение**; результат поиска не изображать как принятое решение.

## Colors

Семантические пары светлой/тёмной темы заданы в YAML; основной источник реализации — `styles/foundations.css`. Цвет сопровождается текстом.

## Typography

Segoe UI и табличные цифры; роли и размеры заданы в YAML. Технические значения — Consolas.

## Layout

Windows 10/11, macOS и Linux desktop, минимальное окно 940 × 640, мобильная версия отсутствует. Постоянная боковая навигация; виртуализированная коллекция с независимыми фильтрами и массовыми действиями; полноразмерный инспектор с оригиналом, кандидатами и рабочей копией. На узкой ширине инспектор становится доступным оверлеем. Сохранять текущие responsive breakpoints, размеры таблицы, режимы инспектора и токены YAML выше.

## Elevation & Depth

Тональные поверхности и границы; тени только для временных слоёв. Без декоративного движения; учитывать `prefers-reduced-motion`.

## Shapes

Радиусы панелей, полей и меток заданы в YAML; не вводить новые шкалы без необходимости.

## Components

Кнопки и поля следуют YAML-токенам. Оригинал — только для чтения; сохранённая рабочая копия и текущий черновик различимы. Выбранное Spotify-назначение выделяется, сохранённая альтернатива остаётся нейтральной и подписанной. Коллекции и провайдеры — плоские панели с тонкой границей. Статусы сопровождаются текстом, не одним цветом.

Навигация: «Обзор», «Коллекции», «Подключения», «Задания», «Настройки». В настройках общий черновик сохраняется при переключении разделов и применяется после явного сохранения. Экспорт и архив доступны из параметров коллекции.

Обзор открывает выбранную очередь текущей коллекции. Инспектор сохраняет черновики при переходах; компактный оверлей делает список inert. Руководство загружается по запросу: реальные снимки на синтетических данных в двух темах, подписи, измеренные маркеры и увеличение сохраняются.

Источники брендовых знаков и синтетических снимков указаны в [docs/maintenance.md](docs/maintenance.md).

## Do's and Don'ts

- Сохранять видимый фокус, корректные названия/ARIA, Escape и возврат фокуса.
- Не скрывать повторы, позиции, исключённые записи, ошибки и несохранённые правки.
- Семь массовых действий используют несжимаемые Lucide-иконки 14px с `aria-hidden`; текстовые подписи остаются.
