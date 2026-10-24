import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle0' })
const firstPaint = await page.evaluate(() => performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null)
const scroll = await page.evaluate(async () => {
  const host = document.querySelector('.virtual-scroll')
  host.scrollTop = 95000 * 24
  const marks = []
  await new Promise(resolve => { const sample = time => { marks.push(time); marks.length === 61 ? resolve() : requestAnimationFrame(sample) }; requestAnimationFrame(sample) })
  const frames = marks.slice(1).map((time, index) => time - marks[index])
  return { max: Math.max(...frames), average: frames.reduce((sum, value) => sum + value, 0) / frames.length }
})
await page.locator('.name-box').fill('J2:J50001')
await page.click('.name-box'); await page.keyboard.press('Enter')
await page.locator('.formula-bar-input').fill('1')
await page.click('.formula-bar-input'); await page.keyboard.press('Enter')
await page.keyboard.down('Control'); await page.keyboard.press('d'); await page.keyboard.up('Control')
await new Promise(resolve => setTimeout(resolve, 250))
await page.locator('.name-box').fill('J95000')
await page.click('.name-box'); await page.keyboard.press('Enter')
const latency = await page.evaluate(async () => {
  const input = document.querySelector('.formula-bar-input')
  const start = performance.now(); input.focus(); input.value = '42'; input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(requestAnimationFrame); return performance.now() - start
})
console.log(JSON.stringify({ firstContentfulPaintMs: firstPaint, scrollAverageFrameMs: scroll.average, scrollMaxFrameMs: scroll.max, keystrokeNextFrameMs: latency, reactCommitCountWhileTyping: 'not measured: React profiler instrumentation is not mounted in this production build' }))
await browser.close()
