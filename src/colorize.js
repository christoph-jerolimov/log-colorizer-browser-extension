/**
 * Log Colorizer - content script.
 *
 * Injected into the active tab when the toolbar button is clicked.
 * Reads the plain text of the current page (a .txt/.log file that the
 * browser rendered into a <pre> tag), parses ANSI SGR escape sequences
 * and replaces the page content with a colorized DOM.
 *
 * Clicking the toolbar button again restores the original page.
 */
(() => {
  'use strict';

  const STATE_KEY = '__logColorizerState__';

  // ---------------------------------------------------------------------------
  // Toggle: if we already colorized this page, restore the original content.
  // ---------------------------------------------------------------------------
  const previous = globalThis[STATE_KEY];
  if (previous && previous.colorizedPre && previous.colorizedPre.isConnected) {
    previous.colorizedPre.replaceWith(previous.originalPre);
    document.documentElement.style.background = previous.originalRootBg;
    document.body.style.background = previous.originalBodyBg;
    document.body.style.margin = previous.originalBodyMargin;
    delete globalThis[STATE_KEY];
    return;
  }

  // ---------------------------------------------------------------------------
  // Locate the source text.
  //
  // For text/plain documents (.txt / .log) the browser wraps the file content
  // in a single <pre> inside <body>. Fall back to any dominant <pre> so the
  // extension also works on server directory listings of raw log output.
  // ---------------------------------------------------------------------------
  const sourcePre =
    document.querySelector('body > pre') || document.querySelector('pre');

  let rawText;
  if (sourcePre) {
    rawText = sourcePre.textContent;
  } else if (document.contentType && document.contentType.startsWith('text/')) {
    rawText = document.body ? document.body.innerText : '';
  } else {
    console.warn('[Log Colorizer] No plain text / <pre> content found on this page.');
    return;
  }

  if (!rawText) {
    console.warn('[Log Colorizer] Page contains no text to colorize.');
    return;
  }

  // ---------------------------------------------------------------------------
  // ANSI SGR parsing.
  // ---------------------------------------------------------------------------

  // Default terminal look (dark background, light foreground).
  const DEFAULT_FG = '#e5e5e5';
  const DEFAULT_BG = '#1e1e1e';

  // Standard + bright palette (xterm / VS Code flavored for readability).
  const PALETTE_16 = [
    '#000000', '#cd3131', '#0dbc79', '#e5e510',
    '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
    '#666666', '#f14c4c', '#23d18b', '#f5f543',
    '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
  ];

  /** Convert an xterm 256-color index to a CSS color. */
  function color256(index) {
    if (index < 0 || index > 255 || Number.isNaN(index)) return null;
    if (index < 16) return PALETTE_16[index];
    if (index < 232) {
      const steps = [0, 95, 135, 175, 215, 255];
      const i = index - 16;
      const r = steps[Math.floor(i / 36) % 6];
      const g = steps[Math.floor(i / 6) % 6];
      const b = steps[i % 6];
      return `rgb(${r},${g},${b})`;
    }
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray},${gray},${gray})`;
  }

  /** Fresh, all-defaults text style state. */
  function defaultStyle() {
    return {
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      blink: false,
      inverse: false,
      hidden: false,
      strike: false,
      fg: null, // CSS color or null = default
      bg: null, // CSS color or null = default
    };
  }

  /**
   * Apply one SGR parameter list (the "1;31" part of ESC[1;31m) to a style
   * state, mutating it in place.
   */
  function applySgr(params, style) {
    // An empty parameter list means reset: ESC[m === ESC[0m
    const codes = params.length === 0 ? [0] : params;

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      switch (code) {
        case 0: Object.assign(style, defaultStyle()); break;
        case 1: style.bold = true; break;
        case 2: style.dim = true; break;
        case 3: style.italic = true; break;
        case 4: style.underline = true; break;
        case 5: case 6: style.blink = true; break;
        case 7: style.inverse = true; break;
        case 8: style.hidden = true; break;
        case 9: style.strike = true; break;
        case 21: case 22: style.bold = false; style.dim = false; break;
        case 23: style.italic = false; break;
        case 24: style.underline = false; break;
        case 25: style.blink = false; break;
        case 27: style.inverse = false; break;
        case 28: style.hidden = false; break;
        case 29: style.strike = false; break;
        case 39: style.fg = null; break;
        case 49: style.bg = null; break;
        case 38:
        case 48: {
          // Extended color: 38;5;<n> (256 color) or 38;2;<r>;<g>;<b> (truecolor)
          const target = code === 38 ? 'fg' : 'bg';
          const mode = codes[i + 1];
          if (mode === 5) {
            style[target] = color256(codes[i + 2]);
            i += 2;
          } else if (mode === 2) {
            const [r, g, b] = [codes[i + 2], codes[i + 3], codes[i + 4]];
            if ([r, g, b].every((v) => v >= 0 && v <= 255)) {
              style[target] = `rgb(${r},${g},${b})`;
            }
            i += 4;
          }
          break;
        }
        default:
          if (code >= 30 && code <= 37) style.fg = PALETTE_16[code - 30];
          else if (code >= 40 && code <= 47) style.bg = PALETTE_16[code - 40];
          else if (code >= 90 && code <= 97) style.fg = PALETTE_16[code - 90 + 8];
          else if (code >= 100 && code <= 107) style.bg = PALETTE_16[code - 100 + 8];
          // Everything else (fonts, framing, ...) is ignored.
          break;
      }
    }
  }

  /** Create a styled <span> (or plain text node) for a chunk of text. */
  function renderChunk(text, style) {
    const isDefault =
      !style.bold && !style.dim && !style.italic && !style.underline &&
      !style.blink && !style.inverse && !style.hidden && !style.strike &&
      style.fg === null && style.bg === null;

    if (isDefault) return document.createTextNode(text);

    const span = document.createElement('span');
    span.textContent = text;

    let fg = style.fg;
    let bg = style.bg;
    if (style.inverse) {
      [fg, bg] = [bg ?? DEFAULT_BG, fg ?? DEFAULT_FG];
    }
    if (style.hidden) fg = bg ?? DEFAULT_BG;

    if (fg) span.style.color = fg;
    if (bg) span.style.backgroundColor = bg;
    if (style.bold) span.style.fontWeight = 'bold';
    if (style.dim) span.style.opacity = '0.6';
    if (style.italic) span.style.fontStyle = 'italic';

    const lines = [];
    if (style.underline) lines.push('underline');
    if (style.strike) lines.push('line-through');
    if (lines.length) span.style.textDecoration = lines.join(' ');

    if (style.blink) span.style.animation = 'log-colorizer-blink 1s step-start infinite';

    return span;
  }

  /**
   * Parse text containing ANSI escape sequences into a DocumentFragment.
   * SGR sequences (ESC[...m) control the styling; all other escape
   * sequences (cursor movement, OSC titles, ...) are stripped.
   */
  function ansiToFragment(text) {
    const fragment = document.createDocumentFragment();
    const style = defaultStyle();

    // Matches, in order: SGR sequences, other CSI sequences, OSC sequences,
    // and any remaining lone ESC + one character.
    const ANSI_RE = /\x1b\[([0-9;]*)m|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]/g;

    let lastIndex = 0;
    let match;
    while ((match = ANSI_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(renderChunk(text.slice(lastIndex, match.index), style));
      }
      lastIndex = ANSI_RE.lastIndex;

      if (match[1] !== undefined) {
        const params = match[1] === ''
          ? []
          : match[1].split(';').map((p) => (p === '' ? 0 : parseInt(p, 10)));
        applySgr(params, style);
      }
      // Non-SGR sequences are silently dropped.
    }
    if (lastIndex < text.length) {
      fragment.appendChild(renderChunk(text.slice(lastIndex), style));
    }
    return fragment;
  }

  // ---------------------------------------------------------------------------
  // Replace the page content with the colorized DOM.
  // ---------------------------------------------------------------------------
  const colorizedPre = document.createElement('pre');
  colorizedPre.style.cssText = [
    'margin: 0',
    'padding: 12px 16px',
    `background: ${DEFAULT_BG}`,
    `color: ${DEFAULT_FG}`,
    'font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    'font-size: 12px',
    'line-height: 1.45',
    'white-space: pre-wrap',
    'word-break: break-all',
    'min-height: 100vh',
    'box-sizing: border-box',
  ].join(';');

  const blinkStyle = document.createElement('style');
  blinkStyle.textContent =
    '@keyframes log-colorizer-blink { 50% { visibility: hidden; } }';
  colorizedPre.appendChild(blinkStyle);

  colorizedPre.appendChild(ansiToFragment(rawText));

  const state = {
    originalRootBg: document.documentElement.style.background,
    originalBodyBg: document.body.style.background,
    originalBodyMargin: document.body.style.margin,
    colorizedPre,
  };

  if (sourcePre) {
    state.originalPre = sourcePre;
    sourcePre.replaceWith(colorizedPre);
  } else {
    // Text page without a <pre>: swap out the whole body content.
    const wrapper = document.createElement('div');
    while (document.body.firstChild) wrapper.appendChild(document.body.firstChild);
    state.originalPre = wrapper;
    document.body.appendChild(colorizedPre);
    // restore path uses replaceWith(), which works for the wrapper too
  }

  document.documentElement.style.background = DEFAULT_BG;
  document.body.style.background = DEFAULT_BG;
  document.body.style.margin = '0';

  globalThis[STATE_KEY] = state;
})();
