/**
 * Recognise TikTok/Instagram recipe sources and derive an embeddable player
 * URL where the link format allows it. Detection is URL-based rather than
 * relying on the stored source.type, since editing a recipe re-saves the
 * source as a plain 'url'.
 */

export type VideoInfo = {
  platform: 'tiktok' | 'instagram'
  label: string
  url: string
  /** Iframe-able player URL; undefined when the link can't be embedded (e.g. vm.tiktok.com short links). */
  embedUrl?: string
}

export function videoInfoFromUrl(url: string | undefined): VideoInfo | null {
  if (!url) return null

  if (/tiktok\.com/i.test(url)) {
    const id = url.match(/\/video\/(\d+)/)?.[1]
    return {
      platform: 'tiktok',
      label: 'TikTok',
      url,
      embedUrl: id ? `https://www.tiktok.com/embed/v2/${id}` : undefined,
    }
  }

  if (/instagram\.com|instagr\.am/i.test(url)) {
    const m = url.match(/\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/)
    const kind = m?.[1]?.startsWith('reel') ? 'reel' : m?.[1]
    return {
      platform: 'instagram',
      label: 'Instagram',
      url,
      embedUrl: m ? `https://www.instagram.com/${kind}/${m[2]}/embed` : undefined,
    }
  }

  return null
}
