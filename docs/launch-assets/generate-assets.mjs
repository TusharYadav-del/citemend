import sharp from "sharp";

const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="42" fill="#102b20"/>
  <circle cx="120" cy="93" r="62" fill="#c6f28f"/>
  <text x="120" y="119" text-anchor="middle" font-family="Arial,sans-serif" font-size="79" font-weight="700" fill="#173126">C</text>
  <text x="120" y="202" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="#ffffff">Citemend</text>
</svg>`;

const workflow = `<svg xmlns="http://www.w3.org/2000/svg" width="1270" height="760" viewBox="0 0 1270 760">
  <defs>
    <linearGradient id="background" x2="1" y2="1"><stop stop-color="#0d291e"/><stop offset="1" stop-color="#1a4733"/></linearGradient>
  </defs>
  <rect width="1270" height="760" fill="url(#background)"/>
  <rect x="64" y="54" width="49" height="49" rx="14" fill="#c6f28f"/>
  <text x="88" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="#173126">C</text>
  <text x="130" y="87" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#ffffff">Citemend</text>
  <text x="64" y="205" font-family="Arial,sans-serif" font-size="53" font-weight="700" fill="#ffffff">From broken citation to useful page.</text>
  <text x="64" y="255" font-family="Arial,sans-serif" font-size="23" fill="#c7d8ca">A reviewable fix for AI-linked URLs that return HTTP 404.</text>
  <g font-family="Arial,sans-serif">
    <rect x="64" y="321" width="352" height="274" rx="25" fill="#f7fbf3"/>
    <circle cx="112" cy="372" r="23" fill="#c6f28f"/><text x="112" y="381" text-anchor="middle" font-size="25" font-weight="700" fill="#173126">1</text>
    <text x="92" y="441" font-size="30" font-weight="700" fill="#173126">Find a cited URL</text>
    <text x="92" y="485" font-size="19" fill="#53695a">Use a buyer question to surface</text>
    <text x="92" y="515" font-size="19" fill="#53695a">links pointing to your domain.</text>
    <rect x="459" y="321" width="352" height="274" rx="25" fill="#f7fbf3"/>
    <circle cx="507" cy="372" r="23" fill="#c6f28f"/><text x="507" y="381" text-anchor="middle" font-size="25" font-weight="700" fill="#173126">2</text>
    <text x="487" y="441" font-size="30" font-weight="700" fill="#173126">Confirm the 404</text>
    <text x="487" y="485" font-size="19" fill="#53695a">Check the actual URL over HTTP.</text>
    <text x="487" y="515" font-size="19" fill="#53695a">Unknown results stay unknown.</text>
    <rect x="854" y="321" width="352" height="274" rx="25" fill="#f7fbf3"/>
    <circle cx="902" cy="372" r="23" fill="#c6f28f"/><text x="902" y="381" text-anchor="middle" font-size="25" font-weight="700" fill="#173126">3</text>
    <text x="882" y="441" font-size="30" font-weight="700" fill="#173126">Review the fix</text>
    <text x="882" y="485" font-size="19" fill="#53695a">Choose a verified live page.</text>
    <text x="882" y="515" font-size="19" fill="#53695a">Copy or publish a 301 rule.</text>
  </g>
  <text x="64" y="668" font-family="Arial,sans-serif" font-size="19" fill="#b9d3bd">Publishing to traffic requires a connected Cloudflare route. Suggestions are never applied without approval.</text>
</svg>`;

await sharp(Buffer.from(thumbnail)).png().toFile("docs/launch-assets/thumbnail-240.png");
await sharp(Buffer.from(workflow)).png().toFile("docs/launch-assets/workflow-1270x760.png");
