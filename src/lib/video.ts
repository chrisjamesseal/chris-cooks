/**
 * Recognise TikTok/Instagram recipe sources. Detection is URL-based rather
 * than relying on the stored source.type, since editing a recipe re-saves the
 * source as a plain 'url'.
 */

export type VideoInfo = {
  platform: 'tiktok' | 'instagram'
  label: string
  url: string
}

export function videoInfoFromUrl(url: string | undefined): VideoInfo | null {
  if (!url) return null
  if (/tiktok\.com/i.test(url)) return { platform: 'tiktok', label: 'TikTok', url }
  if (/instagram\.com|instagr\.am/i.test(url)) return { platform: 'instagram', label: 'Instagram', url }
  return null
}
