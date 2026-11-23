import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const source = 'assets/source/raffle/动图.gif'
const output = 'public/assets/raffle/muscle-tail.webp'
const still = 'public/assets/raffle/muscle-tail-still.webp'
mkdirSync('public/assets/raffle', { recursive: true })
await sharp(source, { animated: true })
  .resize({ width: 72, height: 68, fit: 'contain' })
  .webp({ quality: 78, effort: 6, loop: 0 })
  .toFile(output)
await sharp(source, { page: 0 }).resize({ width: 72, height: 68, fit: 'contain' }).webp({ quality: 78, effort: 6 }).toFile(still)
const info = await sharp(output, { animated: true }).metadata()
console.log(JSON.stringify({ output, width: info.width, height: info.pageHeight, pages: info.pages, bytes: info.size }))
