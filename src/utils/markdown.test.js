// markdown.test.js – the knowledge base's Markdown renderer (utils/markdown.js): what's allowed comes out as HTML,
// anything that could run code or load something never does.
import { headingId, renderMarkdown } from './markdown'

// The rendered HTML as a DOM, to look for elements and attributes rather than strings
function render(source) {
  const { html, headings } = renderMarkdown(source)
  const box = document.createElement('div')
  box.innerHTML = html
  return { box, html, headings }
}

// Nothing in it can run or load: no script-ish elements, no event attributes, no javascript:/data: addresses
function expectInert(box) {
  expect(box.querySelectorAll('script, iframe, img, object, embed, style, svg, form, input')).toHaveLength(0)
  for (const element of box.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(attribute.name).not.toMatch(/^on/i)
      expect(attribute.value).not.toMatch(/^\s*(javascript|data|vbscript):/i)
    }
  }
}

describe('renderMarkdown: what is removed', () => {
  test.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an image with onerror', '<img src=x onerror="alert(1)">'],
    ['an iframe', '<iframe src="https://evil.example"></iframe>'],
    ['an svg with onload', '<svg onload="alert(1)"></svg>'],
    ['a style tag', '<style>body{display:none}</style>'],
    ['an inline event in raw HTML', '<p onclick="alert(1)">click</p>'],
  ])('%s stays text, never an element', (_, source) => {
    const { box } = render(source)
    expectInert(box)
    // Shown as the characters that were typed
    expect(box.textContent).toContain(source.slice(0, 7))
  })

  test.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['JavaScript: in mixed case, with spaces', '[x]( JaVaScRiPt:alert(1) )'],
    ['data:', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript:', '[x](vbscript:msgbox(1))'],
    ['an encoded javascript:', '[x](&#106;avascript:alert(1))'],
    ['an autolink to javascript:', '<javascript:alert(1)>'],
  ])('a %s link is not a link', (_, source) => {
    const { box } = render(source)
    expectInert(box)
    expect(box.querySelectorAll('a')).toHaveLength(0)
  })

  test('images are not shown (not allowed yet): ![alt](src) leaves no <img>', () => {
    const { box } = render('![logo](https://example.com/logo.png)')
    expect(box.querySelectorAll('img')).toHaveLength(0)
  })
})

describe('renderMarkdown: what is allowed', () => {
  test('headings, paragraphs, bold/italic, lists, inline code, code blocks, quotes, tables and rules', () => {
    const { box } = render(
      [
        '# Title',
        '## Sub',
        'Some **bold** and *italic* and ~~gone~~ and `code`.',
        '',
        '- one',
        '- two',
        '',
        '3. three',
        '4. four',
        '',
        '```js',
        'const a = 1',
        '```',
        '',
        '> quoted',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '---',
      ].join('\n'),
    )
    expectInert(box)
    for (const selector of [
      'h1',
      'h2',
      'strong',
      'em',
      's',
      'ul > li',
      'ol[start="3"] > li',
      'pre > code',
      'blockquote',
      'table td',
      'hr',
    ]) {
      expect({ selector, found: box.querySelector(selector) !== null }).toEqual({ selector, found: true })
    }
    expect(box.querySelector('pre > code').className).toBe('language-js')
  })

  test('external links open in a new tab with rel="noopener noreferrer"; same-site ones do not', () => {
    const { box } = render(
      '[out](https://example.org/x) [mail](mailto:help@example.com) [here](/tickets/new) [top](#fix)',
    )
    const [out, mail, here, top] = box.querySelectorAll('a')
    expect(out.getAttribute('href')).toBe('https://example.org/x')
    expect(out.getAttribute('target')).toBe('_blank')
    expect(out.getAttribute('rel')).toBe('noopener noreferrer')
    for (const link of [mail, here, top]) {
      expect(link.hasAttribute('target')).toBe(false)
    }
    expect(here.getAttribute('href')).toBe('/tickets/new')
  })

  test('a bare web address becomes an external link too', () => {
    const { box } = render('See https://example.org for more')
    expect(box.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer')
  })

  test("the only class is a code block's language-…, so content can't borrow the app's own styles", () => {
    const { box } = render('```btn btn--danger\nx\n```\n\n[link](/x)')
    expect(box.querySelector('code').getAttribute('class')).toBe('language-btn')
    expect([...box.querySelectorAll('[class]')].map((el) => el.getAttribute('class'))).toEqual(['language-btn'])
  })
})

describe('headings', () => {
  test('each heading gets an id from its text (unique), and they are listed in order', () => {
    const { box, headings } = render('## Fix the VPN\n\n### Step `one`\n\n## Fix the VPN\n\n## Ç për çelës')
    expect(headings).toEqual([
      { level: 2, id: 'fix-the-vpn', text: 'Fix the VPN' },
      { level: 3, id: 'step-one', text: 'Step one' },
      { level: 2, id: 'fix-the-vpn-2', text: 'Fix the VPN' },
      { level: 2, id: 'c-per-celes', text: 'Ç për çelës' },
    ])
    expect([...box.querySelectorAll('h2, h3')].map((h) => h.id)).toEqual([
      'fix-the-vpn',
      'step-one',
      'fix-the-vpn-2',
      'c-per-celes',
    ])
  })

  test('headingId falls back to "section" when nothing is left', () => {
    expect(headingId('!!!')).toBe('section')
  })
})
