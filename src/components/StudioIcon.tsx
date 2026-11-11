const paths = {
  panel: 'M3.5 5h17v14h-17zM9 5v14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.4-3.5A7.5 7.5 0 1 1 20 11.5Z',
  image: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 16l5-5 5 5 3-3 5 5M16 8h.01',
  stack: 'M7 7h13v13H7zM4 16V4h12',
  spark: 'M12 2.5c.8 5.1 2.4 6.7 7.5 7.5-5.1.8-6.7 2.4-7.5 7.5-.8-5.1-2.4-6.7-7.5-7.5 5.1-.8 6.7-2.4 7.5-7.5ZM19 16v5m-2.5-2.5h5M4 15v4m-2-2h4',
  settings: 'M4 6h9m4 0h3M4 12h3m4 0h9M4 18h9m4 0h3M13 4v4M7 10v4m6 2v4',
  plug: 'M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0V8Zm5 8v5',
  send: 'M12 20V5m-6 6 6-6 6 6',
  arrowDown: 'M12 4v15m-6-6 6 6 6-6',
  arrowRight: 'M4 12h15m-6-6 6 6-6 6',
  arrowUpRight: 'M6 18 18 6M8 6h10v10',
  chevron: 'm7 10 5 5 5-5',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  tools: 'm4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4',
  close: 'm6 6 12 12M6 18 18 6',
  attach: 'm8 13 6-6a2.6 2.6 0 0 1 3.7 3.7l-7.8 7.8a4.4 4.4 0 0 1-6.2-6.2l8.4-8.4',
  stop: 'M7 7h10v10H7z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19',
  moon: 'M20.7 15.1A8.7 8.7 0 0 1 8.9 3.3 8.8 8.8 0 1 0 20.7 15.1Z',
  search: 'M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0ZM15 15l5 5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sort: 'M4 6h16M4 12h12M4 18h8',
  pin: 'm9 3 12 12-4 1-3 3-4-4-6 6m6-6-5-5 3-3 1-4Z',
  copy: 'M8 8h12v12H8zM16 5V4H4v12h1',
  check: 'm5 12 4 4L19 6',
  edit: 'm13.5 5.5 5 5M4 20l4.8-1 10.5-10.5a2.1 2.1 0 0 0 0-3l-.8-.8a2.1 2.1 0 0 0-3 0L5 15.2 4 20Z',
  download: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  upload: 'M12 15V3m-4 4 4-4 4 4M5 16v4h14v-4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7',
  database: 'M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6c0 1.7-3.6 3-8 3s-8-1.3-8-3',
  retry: 'M5 11a7 7 0 1 1 1.6 5.5M5 5v6h6',
} as const

export type StudioIconName = keyof typeof paths

export function StudioIcon({ name, size = 18 }: { name: StudioIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 2.8 : 1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} fill={name === 'stop' ? 'currentColor' : 'none'}/></svg>
}
