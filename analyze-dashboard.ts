#!/usr/bin/env bun
import { chromium } from 'playwright'

async function analyzeDashboard() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 }
  })
  const page = await context.newPage()

  console.log('Opening dashboard at http://localhost:3333...')
  await page.goto('http://localhost:3333')
  
  // Warte auf Inhalt
  await page.waitForSelector('.stats-bar', { timeout: 10000 })
  
  // Screenshot der Zusammenfassungen (Overall + Mode stats)
  console.log('Taking screenshot of summary stats...')
  await page.screenshot({ 
    path: 'dashboard-summary.png',
    clip: {
      x: 0,
      y: 80, // Nach dem Header
      width: 900,
      height: 300 // Genug für alle Zusammenfassungen
    }
  })
  
  // Warte, damit man das Dashboard sehen kann
  console.log('\nDashboard ist offen. Drücke Ctrl+C um zu beenden.\n')
  console.log('Aktuelle Zusammenfassungen:')
  
  // Extrahiere die Statistiken
  const stats = await page.evaluate(() => {
    const items: { label: string; value: string }[] = []
    const overallBar = document.querySelector('.stats-bar')
    if (overallBar) {
      const statsItems = overallBar.querySelectorAll('.stats-item')
      statsItems.forEach(item => {
        const label = item.querySelector('.stats-label')?.textContent?.trim()
        const value = item.querySelector('.stats-value')?.textContent?.trim()
        if (label && value) {
          items.push({ label, value })
        }
      })
    }
    
    const modeStats: { mode: string; items: { label: string; value: string }[] }[] = []
    const modeBars = document.querySelectorAll('.mode-stats-bar')
    modeBars.forEach(bar => {
      const modeName = bar.querySelector('.mode-badge')?.textContent?.trim()
      if (modeName) {
        const stats: { label: string; value: string }[] = []
        const items = bar.querySelectorAll('.stats-item')
        items.forEach(item => {
          const label = item.querySelector('.stats-label')?.textContent?.trim()
          const value = item.querySelector('.stats-value')?.textContent?.trim()
          if (label && value) {
            stats.push({ label, value })
          }
        })
        modeStats.push({ mode: modeName, items: stats })
      }
    })
    
    return { overall: items, modes: modeStats }
  })
  
  console.log('\n=== Overall Stats ===')
  stats.overall.forEach(({ label, value }) => {
    console.log(`  ${label} ${value}`)
  })
  
  console.log('\n=== Mode Stats ===')
  stats.modes.forEach(({ mode, items }) => {
    console.log(`\n  ${mode}:`)
    items.forEach(({ label, value }) => {
      console.log(`    ${label} ${value}`)
    })
  })
  
  console.log('\nScreenshot gespeichert als: dashboard-summary.png')
  console.log('\nBeobachtungen:')
  console.log('  - Die Stats-Bars sind sehr kompakt nebeneinander')
  console.log('  - Bei schmalen Viewports könnten die Werte überlappen')
  console.log('  - Die Mode-Stats nutzen die gleiche Layout-Struktur')
  console.log('  - Bessere visuelle Hierarchie wäre hilfreich')
  
  // Browser offen lassen für Inspektion
  await page.waitForTimeout(300000) // 5 Minuten
  
  await browser.close()
}

analyzeDashboard().catch(console.error)
