/**
 * GET /api/rrg/platform/embed.js
 *
 * Returns a self-contained JavaScript file that partner sites can embed
 * to display RRG verification badges on their own pages.
 *
 * Usage:
 *   <script src="https://realrealgenuine.com/api/rrg/platform/embed.js"
 *           data-wallet="0x1234..."
 *           data-theme="dark"></script>
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EMBED_SCRIPT = `
(function() {
  var script = document.currentScript;
  if (!script) return;

  var wallet = script.getAttribute('data-wallet');
  var tokenId = script.getAttribute('data-token-id');
  var theme = script.getAttribute('data-theme') || 'dark';
  if (!wallet && !tokenId) return;

  var params = wallet ? 'wallet=' + encodeURIComponent(wallet) : 'token_id=' + encodeURIComponent(tokenId);
  var apiUrl = 'https://realrealgenuine.com/api/rrg/platform/badges?' + params;

  var container = document.createElement('div');
  container.style.cssText = 'display:inline-flex;gap:6px;flex-wrap:wrap;font-family:ui-monospace,monospace;';
  script.parentNode.insertBefore(container, script.nextSibling);

  fetch(apiUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.badges || data.badges.length === 0) return;
      data.badges.forEach(function(badge) {
        var pill = document.createElement('a');
        pill.href = badge.websiteUrl || 'https://realrealgenuine.com';
        pill.target = '_blank';
        pill.rel = 'noopener noreferrer';
        pill.title = badge.type === 'worldid' ? 'World ID Verified' : 'Made with ' + badge.name;

        var bg = theme === 'light' ? '#f3f4f6' : '#1a1a1a';
        var textColor = badge.accentColor || (theme === 'light' ? '#374151' : '#d1d5db');
        var border = badge.accentColor ? badge.accentColor + '66' : (theme === 'light' ? '#d1d5db' : '#404040');

        pill.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;' +
          'font-size:11px;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none;' +
          'border:1px solid ' + border + ';background:' + bg + ';color:' + textColor + ';';

        var dot = document.createElement('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + (badge.accentColor || textColor) + ';flex-shrink:0;';
        pill.appendChild(dot);

        var label = document.createTextNode(badge.name);
        pill.appendChild(label);

        container.appendChild(pill);
      });
    })
    .catch(function() {});
})();
`;

export async function GET() {
  return new NextResponse(EMBED_SCRIPT.trim(), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
