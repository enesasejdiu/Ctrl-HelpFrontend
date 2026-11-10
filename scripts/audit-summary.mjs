// audit-summary.mjs – turns `npm audit --json` output into Markdown for the GitHub job summary (security.yml).
// Usage: node scripts/audit-summary.mjs <package name> <audit --omit=dev json> <full audit json>
// Lists each vulnerable package with its severity, whether it reaches production, the advisories and whether npm
// knows a fix. Never fails: the blocking check is the separate `npm audit --omit=dev --audit-level=high` step.
import fs from 'node:fs'

const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info']

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null // npm couldn't reach the registry, or the file is missing
  }
}

// Markdown table cells can't hold "|" or line breaks
const cell = (text) => String(text).replaceAll('|', '\\|').replace(/\s+/g, ' ')

function fixText(fix) {
  if (fix === true) return '`npm audit fix`'
  if (fix && typeof fix === 'object') return `${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major)' : ''}`
  return 'none yet'
}

function advisories(vulnerability) {
  const direct = vulnerability.via.filter((via) => typeof via === 'object')
  if (direct.length) return direct.map((via) => `[${cell(via.title)}](${via.url})`).join('<br>')
  return `via ${vulnerability.via.map(cell).join(', ')}` // inherited from another vulnerable package
}

function summarize(name, prod, all) {
  const lines = [`### npm audit: ${name}`, '']
  if (!prod || !all) {
    lines.push('The audit report could not be read (see the step log).')
    return lines.join('\n')
  }

  const count = (report, severity) => report.metadata?.vulnerabilities?.[severity] ?? 0
  lines.push(
    '| | ' + SEVERITIES.join(' | ') + ' |',
    '| --- |' + ' ---: |'.repeat(SEVERITIES.length),
    '| Production | ' + SEVERITIES.map((s) => count(prod, s)).join(' | ') + ' |',
    '| All (incl. dev) | ' + SEVERITIES.map((s) => count(all, s)).join(' | ') + ' |',
    '',
  )

  const vulnerable = Object.values(all.vulnerabilities ?? {})
  if (!vulnerable.length) {
    lines.push('No known vulnerabilities.')
    return lines.join('\n')
  }

  const inProduction = new Set(Object.keys(prod.vulnerabilities ?? {}))
  vulnerable.sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.name.localeCompare(b.name),
  )
  lines.push('| Package | Severity | Used in | Advisories | Fix |', '| --- | --- | --- | --- | --- |')
  for (const v of vulnerable) {
    const usedIn = inProduction.has(v.name) ? '**production**' : 'dev only'
    lines.push(`| ${cell(v.name)} | ${v.severity} | ${usedIn} | ${advisories(v)} | ${fixText(v.fixAvailable)} |`)
  }
  lines.push('', 'Only high or critical vulnerabilities in **production** dependencies fail the check.')
  return lines.join('\n')
}

const [name = 'package', prodFile, allFile] = process.argv.slice(2)
console.log(summarize(name, read(prodFile), read(allFile)))
