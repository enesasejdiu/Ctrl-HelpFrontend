// browser.js – full page loads, behind an object so tests can replace them (jsdom can't navigate).
export const browser = {
  reload() {
    window.location.reload()
  },
  assign(url) {
    window.location.assign(url)
  },
}
