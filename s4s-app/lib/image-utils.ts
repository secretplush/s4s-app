// Compress base64 image to fit within maxBytes (default 3MB to stay under Vercel 4.5MB limit with base64 overhead)
export async function compressImage(base64: string, maxBytes = 3 * 1024 * 1024): Promise<string> {
  if (typeof window === 'undefined') return base64
  
  const match = base64.match(/^data:(.+);base64,(.+)$/)
  if (!match) return base64
  const currentSize = Math.ceil(match[2].length * 3 / 4)
  if (currentSize <= maxBytes) return base64

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, Math.sqrt(maxBytes / currentSize))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      let quality = 0.8
      let result = canvas.toDataURL('image/jpeg', quality)
      while (result.length * 3 / 4 > maxBytes && quality > 0.3) {
        quality -= 0.1
        result = canvas.toDataURL('image/jpeg', quality)
      }
      console.log(`Compressed ${(currentSize/1024).toFixed(0)}KB → ${(result.length*3/4/1024).toFixed(0)}KB (${canvas.width}x${canvas.height}, q=${quality.toFixed(1)})`)
      resolve(result)
    }
    img.onerror = () => resolve(base64)
    img.src = base64
  })
}
