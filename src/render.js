// Pure HTML builders. Shared by the build step (prerender) and by the gates (mutation harness).
// Every branch reads the register view; nothing here knows what state a record is currently in.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

import { icon } from './icons.js';
export { icon };

// Official marks: X (24 grid) and GitHub Octicon mark-github (16 grid).
const X_MARK = '<svg class="ic ic--mark" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_MARK = '<svg class="ic ic--mark" width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

const logoPic = (size, cls = '', eager = false) =>
  `<picture><source type="image/webp" srcset="./brand/logo-256.webp 1x, ./brand/logo-512.webp 2x"><img class="${cls}" src="./brand/logo-256.png" srcset="./brand/logo-256.png 1x, ./brand/logo-512.png 2x" width="${size}" height="${size}" alt="" decoding="async"${eager ? '' : ' loading="lazy"'}></picture>`;

// ---------- social: always present, inert until stated ----------
function social(rec, mark, name) {
  if (rec.live) {
    return `<a class="social" data-social="${rec.id}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)} @${esc(rec.handle)}">${mark}</a>`;
  }
  return `<span class="social is-inert" data-social="${rec.id}" role="img" aria-label="${esc(name)} pending">${mark}</span>`;
}

// ---------- contract address slot ----------
export function renderCA(v) {
  const ca = v.ca;
  if (ca.live) {
    return `<div class="ca is-live" id="ca" data-ca-state="live"${v.chain.live && v.chain.rpc ? ` data-rpc="${esc(v.chain.rpc)}"` : ''}>
  <span class="ca__label">Token mint address</span>
  <button type="button" class="ca__btn" data-copy data-copy-value="${esc(ca.value)}" aria-label="Copy token mint address">
    <code class="ca__value" data-ca-value>${esc(ca.value)}</code>
    <span class="ca__action" aria-hidden="true">${icon('copy', 20, 'ic-copy')}${icon('check', 20, 'ic-done')}<span class="ca__word" data-feedback>Copy</span></span>
  </button>
  <span class="sr" role="status" aria-live="polite" data-live-region></span>
</div>`;
  }
  return `<div class="ca is-inert" id="ca" data-ca-state="inert">
  <span class="ca__label">Token mint address</span>
  <span class="ca__pending"><i class="ca__dash" aria-hidden="true"></i>pending</span>
</div>`;
}

function renderBar(v) {
  return `<header class="bar">
  <a class="bar__brand" href="#top" aria-label="Reelis, jump to intro">${logoPic(36, 'bar__logo', true)}<span class="bar__word">Reelis</span></a>
  ${renderCA(v)}
  <nav class="socials" aria-label="Social handles">${social(v.x, X_MARK, 'X')}${social(v.github, GH_MARK, 'GitHub')}</nav>
</header>`;
}

const NAV = [
  ['top', 'Intro', '#top'],
  ['flow', 'Flow', '#flow'],
  ['settle', 'Settle', '#settle'],
  ['pulse', 'Pulse', '#pulse'],
  ['phases', 'Phases', '#phases'],
  ['facts', 'Facts', '#facts'],
];
const renderSide = () => `<aside class="side" aria-label="Sections"><nav class="side__nav">${NAV.map(([i, l, h]) => `<a class="side__link" href="${h}" data-nav="${i}"><span class="side__ic">${icon(i)}</span><span class="side__txt">${l}</span></a>`).join('')}</nav></aside>`;
const renderTabbar = () => `<nav class="tabbar" aria-label="Sections">${[NAV[0], NAV[1], NAV[3], NAV[4], NAV[5]].map(([i, l, h]) => `<a class="tabbar__link" href="${h}" data-nav="${i}" aria-label="${l}">${icon(i, 24)}</a>`).join('')}</nav>`;

function chip(label, rec, hrefOverride) {
  const url = hrefOverride ?? (rec && rec.live ? rec.url : null);
  if (url) return `<a class="chip is-live" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="chip__k">${esc(label)}</span><span class="chip__v">open</span>${icon('chevron', 14)}</a>`;
  return `<span class="chip is-inert"><span class="chip__k">${esc(label)}</span><span class="chip__v">pending</span></span>`;
}

function renderHero(v) {
  const chartUrl = v.ca.live ? `https://dexscreener.com/solana/${encodeURIComponent(v.ca.value)}` : null;
  return `<section class="hero" id="top">
  <div class="hero__mesh" aria-hidden="true">
    <i class="blob blob--a" data-parallax="0.35"></i><i class="blob blob--b" data-parallax="0.6"></i><i class="blob blob--c" data-parallax="0.2"></i>
    <i class="hero__grid" data-parallax="0.12"></i>
    <span class="float float--a" data-parallax="0.9"><i class="dot"></i>Solana</span>
    <span class="float float--b" data-parallax="1.2">Keyless for makers</span>
  </div>
  <div class="hero__inner">
    <div class="hero__avatar" data-reveal data-i="0"><span class="ring"><span class="ring__in">${logoPic(112, 'hero__logo', true)}</span></span></div>
    <div class="hero__main">
      <div class="hero__row" data-reveal data-i="1">
        <h2 class="hero__name">reelis</h2>
        <span class="pill" data-pill="hero"><i class="pulse-dot" aria-hidden="true"></i><span data-pill-text>Syncing</span></span>
      </div>
      <div class="hero__cta" data-reveal data-i="2"><a class="btn btn--cta" href="#pulse">Jump to the pulse</a><a class="btn btn--grey" href="#flow">How it flows</a></div>
      <ul class="stats" data-reveal data-i="3">
        <li class="stat is-inert"><span class="stat__v">pending</span><span class="stat__k">maker portion</span></li>
        <li class="stat is-inert"><span class="stat__v">pending</span><span class="stat__k">settled out</span></li>
        <li class="stat"><span class="stat__v" data-stat="tracked">&mdash;</span><span class="stat__k">tokens on board</span></li>
      </ul>
      <div class="hero__copy" data-reveal data-i="4">
        <div class="eyebrow">Maker economy, Solana edition</div>
        <h1 class="hero__title">Attention, minted into ownership.</h1>
        <p class="hero__text">Reelis pairs makers with tokens of their own, so backers hold a stake in the story while makers keep a slice of the momentum in everyday spending power.</p>
      </div>
    </div>
  </div>
  <div class="strip" data-reveal data-i="5">
    <span class="strip__label">Fast facts</span>
    ${chip('Acquire', v.buy)}${chip('Graph', null, chartUrl)}
    <span class="chip is-live"><span class="chip__k">Chain</span><span class="chip__v">${esc(v.chain.live ? v.chain.value : 'pending')}</span></span>
  </div>
</section>`;
}

const circles = [
  ['spot', 'Spotlight', true], ['flow', 'Flow', false], ['settle', 'Settle', true],
  ['pulse', 'Pulse', false], ['phases', 'Phases', false], ['facts', 'Facts', false],
];
const hrefOf = { pulse: '#pulse', spot: '#spotlight', flow: '#flow', settle: '#settle', phases: '#phases', facts: '#facts' };
const renderCircles = () => `<nav class="circles no-scrollbar" aria-label="Jump to" data-reveal data-i="0">${circles.map(([i, l, lit]) =>
  `<a class="circle" href="${hrefOf[i]}"><span class="circle__ring${lit ? ' is-lit' : ''}"><span class="circle__in">${icon(i, 26)}</span></span><span class="circle__txt">${l}</span></a>`).join('')}</nav>`;

function renderMint(v) {
  return `<section class="mint spot" data-spot data-reveal data-i="0" aria-labelledby="mint-h">
  <div class="mint__top">
    <span class="ring ring--sq"><span class="ring__in ring__in--sq">${logoPic(56, 'mint__logo')}</span></span>
    <div class="mint__body">
      <div class="mint__head"><h3 id="mint-h" class="mint__title">Reelis</h3><span class="mint__sub">Maker token, native to ${esc(v.chain.live ? v.chain.value : 'its chain')}</span></div>
      <p class="mint__text">Mint details arrive here once confirmed. Until then, each entry remains closed rather than guessed.</p>
    </div>
  </div>
  <div class="strip strip--flush">
    <span class="pill" data-pill="mint"><i class="pulse-dot" aria-hidden="true"></i><span data-pill-text>Syncing</span></span>
    <span class="strip__txt">Board numbers are sourced from ${esc(v.market.live ? v.market.value : 'the source')} and refresh by themselves.</span>
  </div>
</section>`;
}

function renderSpotlight() {
  const sk = Array.from({ length: 6 }, () => `<div class="vcard is-skel" aria-hidden="true"><i class="skel skel--fill"></i></div>`).join('');
  return `<section class="spotlight" id="spotlight" aria-labelledby="spot-h">
  <div class="sec-head" data-reveal data-i="0"><h3 id="spot-h" class="sec-head__t">In the spotlight</h3><a class="sec-head__a" href="#pulse">Full board</a></div>
  <div class="vrail no-scrollbar" data-rail data-reveal data-i="1">${sk}</div>
</section>`;
}

function renderFlow() {
  const rails = [
    ['Domestic remittance', 'Sent to the institution you trust', 'user'],
    ['Handset credit', 'Delivered to your handset', 'phone'],
    ['Pickup point', 'Handed over at a nearby counter', 'pin'],
    ['Self-held keys', 'Delivered to an address you control', 'key'],
  ];
  const prev = rails.map(([t], i) => `<li class="opt${i === 0 ? ' is-on' : ''}"><span class="opt__ic">${icon(rails[i][2], 15)}</span><span class="opt__t">${t}</span><span class="opt__r"></span></li>`).join('');
  const list = rails.map(([t, s, ic], i) => `<li class="rail spot" data-spot data-reveal data-i="${i}"><span class="rail__ic">${icon(ic, 20)}</span><span class="rail__txt"><b>${t}</b><small>${s}</small></span><span class="badge">Planned</span></li>`).join('');
  return `<section class="split" id="settle" aria-labelledby="settle-h">
  <article class="post" data-reveal data-i="0">
    <header class="post__head"><span class="ring ring--sm"><span class="ring__in ring__in--sm">${logoPic(26, 'post__logo')}</span></span><div class="post__who"><b>reelis</b><small>Preview of the settle screen</small></div></header>
    <div class="post__stage"><span class="post__shine" aria-hidden="true"></span>
      <div class="phone" data-parallax-tilt>
        <div class="phone__k">Awaiting settlement</div>
        <div class="phone__amt is-inert">pending</div>
        <div class="phone__k phone__k--mt">Settle into</div>
        <ul class="opts">${prev}</ul>
        <div class="phone__btn" aria-hidden="true">Settle</div>
      </div>
    </div>
    <a class="post__foot" href="#phases">Peek at the schedule${icon('chevron', 18)}</a>
    <p class="post__note">Sketch only. No figures exist, so none appear.</p>
  </article>
  <div class="split__txt">
    <h2 id="settle-h" class="h2" data-reveal data-i="0">Settled in forms makers trust.</h2>
    <p class="lead" data-reveal data-i="1">Plenty of makers hold no keys, no seed phrase and no exchange login, and should not have to. Reelis is shaped so token movement can finish as ordinary spending power, with self-custody for whoever wants it.</p>
    <ul class="rails">${list}</ul>
    <div class="split__cta" data-reveal data-i="2"><a class="btn btn--cta btn--wide" href="#phases">Scan the phases</a><a class="btn btn--grey btn--wide" href="#facts">Inspect the facts</a></div>
  </div>
</section>`;
}

function renderSteps() {
  const s = [['01', 'Support', 'Hold the token of a maker you admire.'], ['02', 'Momentum', 'Swaps around that token fill a common stream.'], ['03', 'Settle', 'The maker portion converts into a spendable form.']];
  return `<section class="steps" id="flow" aria-labelledby="flow-h">
  <div class="sec-head" data-reveal data-i="0"><h3 id="flow-h" class="sec-head__t">How it flows</h3></div>
  <ol class="steps__grid">${s.map(([n, t, d], i) => `<li class="step spot" data-spot data-reveal data-i="${i}"><span class="step__n">${n}</span><b class="step__t">${t}</b><p class="step__d">${d}</p></li>`).join('')}</ol>
</section>`;
}

function renderMarket(v) {
  const m = v.market;
  const attrs = m.live
    ? `data-state="live" data-boosts="${esc(m.boostsUrl)}" data-pairs="${esc(m.pairsUrl)}"`
    : 'data-state="inert"';
  const skRows = Array.from({ length: 10 }, (_, i) => `<li class="row is-skel" aria-hidden="true"><span class="row__rank">${i + 1}</span><i class="skel skel--logo"></i><span class="row__name"><i class="skel skel--t"></i><i class="skel skel--s"></i></span><i class="skel skel--n row__price"></i><i class="skel skel--n row__chg"></i><i class="skel skel--n row__vol"></i><i class="skel skel--n row__liq"></i></li>`).join('');
  return `<section class="market" id="pulse" aria-labelledby="pulse-h" data-market ${attrs}>
  <div class="sec-head sec-head--stack" data-reveal data-i="0">
    <div><h2 id="pulse-h" class="h2">The Solana pulse</h2><p class="lead lead--tight">Ten most active boosted tokens ranked by 24h volume, sourced from ${esc(m.live ? m.value : 'the source')}.</p></div>
    <span class="pill pill--lg" data-pill="market"><i class="pulse-dot" aria-hidden="true"></i><span data-pill-text>Syncing</span></span>
  </div>
  <ul class="tiles" data-reveal data-i="1">
    <li class="tile spot" data-spot><span class="tile__k">24h volume</span><span class="tile__v" data-stat="volume">&mdash;</span></li>
    <li class="tile spot" data-spot><span class="tile__k">Liquidity</span><span class="tile__v" data-stat="liquidity">&mdash;</span></li>
    <li class="tile spot" data-spot><span class="tile__k">Average move</span><span class="tile__v" data-stat="move">&mdash;</span></li>
  </ul>
  <div class="tabs" role="tablist" aria-label="Board order" data-reveal data-i="2">
    <button class="tab is-on" role="tab" aria-selected="true" data-sort="volume">${icon('pulse', 16)}Volume</button>
    <button class="tab" role="tab" aria-selected="false" data-sort="change">${icon('up', 16)}Movers</button>
    <button class="tab" role="tab" aria-selected="false" data-sort="liquidity">${icon('settle', 16)}Depth</button>
  </div>
  <div class="pills" data-reveal data-i="3">
    <div class="pills__set" role="group" aria-label="Filter"><button class="pillbtn is-on" data-filter="all" aria-pressed="true">All</button><button class="pillbtn" data-filter="up" aria-pressed="false">Gainers</button><button class="pillbtn" data-filter="down" aria-pressed="false">Decliners</button></div>
    <div class="pills__set" role="group" aria-label="Layout"><button class="pillbtn pillbtn--ic is-on" data-view="list" aria-pressed="true" aria-label="Rows layout">${icon('list', 18)}</button><button class="pillbtn pillbtn--ic" data-view="grid" aria-pressed="false" aria-label="Grid layout">${icon('grid', 18)}</button></div>
  </div>
  <div class="board" data-board data-view="list">
    <div class="board__head" aria-hidden="true"><span>#</span><span>Token</span><span>Price</span><span>24h</span><span>Volume</span><span>Liquidity</span><span></span></div>
    <ul class="rows" data-rows>${skRows}</ul>
    <p class="board__msg" data-msg role="status" hidden></p>
  </div>
  <p class="fine" data-reveal data-i="0">Boosted entries are promoted slots on the source. Consider each row unvetted; inclusion implies no endorsement.</p>
</section>`;
}

function renderPhases() {
  const ph = [['1', 'Foundation', 'Identity, domain and a public pulse board.', true], ['2', 'Mint', 'The token is minted and its address posted here for all to verify.', false], ['3', 'Rails', 'Settlement routes switch on gradually.', false], ['4', 'Network', 'Maker tooling and outside integrations.', false]];
  return `<section class="phases" id="phases" aria-labelledby="phases-h">
  <div class="sec-head" data-reveal data-i="0"><h3 id="phases-h" class="sec-head__t">Phases</h3></div>
  <ol class="phases__grid">${ph.map(([n, t, d, live], i) => `<li class="phase spot${live ? ' is-live' : ''}" data-spot data-reveal data-i="${i}"><span class="phase__n">${n}</span><div class="phase__b"><b>${t}</b><p>${d}</p></div><span class="badge${live ? ' badge--live' : ''}">${live ? 'Live' : 'Pending'}</span></li>`).join('')}</ol>
</section>`;
}

function fact(label, body, state) {
  return `<li class="fact ${state === 'stated' ? 'is-live' : 'is-inert'}"><span class="fact__k">${esc(label)}</span><span class="fact__v">${body}</span></li>`;
}
function renderFacts(v) {
  const pend = '<span class="fact__pend">pending</span>';
  const rows = [
    fact('Chain', v.chain.live ? esc(v.chain.value) : pend, v.chain.state),
    fact('Token mint address', v.ca.live ? `<code class="fact__code">${esc(v.ca.value)}</code>` : pend, v.ca.state),
    fact('Domain', v.site.live ? `<a href="${esc(v.site.url)}" rel="noopener noreferrer">${esc(v.site.value)}</a>` : pend, v.site.state),
    fact('Market source', v.market.live ? esc(v.market.value) : pend, v.market.state),
    fact('X', v.x.live ? `<a href="${esc(v.x.url)}" target="_blank" rel="noopener noreferrer">@${esc(v.x.handle)}</a>` : pend, v.x.state),
    fact('GitHub', v.github.live ? `<a href="${esc(v.github.url)}" target="_blank" rel="noopener noreferrer">${esc(v.github.handle)}</a>` : pend, v.github.state),
    fact('Acquire', v.buy.live ? `<a href="${esc(v.buy.url)}" target="_blank" rel="noopener noreferrer">open</a>` : pend, v.buy.state),
  ];
  return `<section class="facts" id="facts" aria-labelledby="facts-h">
  <div class="sec-head" data-reveal data-i="0"><h3 id="facts-h" class="sec-head__t">Facts on file</h3></div>
  <p class="lead lead--tight" data-reveal data-i="1">Each line is either stated or closed. No gap is filled with a guess.</p>
  <ul class="facts__list" data-reveal data-i="2">${rows.join('')}</ul>
</section>`;
}

function renderFooter(v) {
  return `<footer class="foot">
  <div class="foot__brand">${logoPic(28, 'foot__logo')}<b>Reelis</b>${v.site.live ? `<a class="foot__site" href="${esc(v.site.url)}" rel="noopener noreferrer">${esc(v.site.value)}</a>` : ''}</div>
  <p class="foot__fine">Numbers originate from an outside source and may trail or err. No sentence here is advice. Tokens swing hard, so stake only what you can afford to lose.</p>
</footer>`;
}

function renderTicker() {
  const sk = Array.from({ length: 10 }, () => '<span class="tick is-skel"><i class="skel skel--tick"></i></span>').join('');
  return `<div class="ticker" data-ticker role="region" aria-label="Live scroll of prices"><div class="ticker__track" data-ticker-track>${sk}</div></div>`;
}

export function renderApp(v) {
  return `<div class="progress" aria-hidden="true"><i data-progress></i></div>
${renderBar(v)}
${renderSide()}
<main class="main" id="main">
${renderTicker()}
<div class="wrap">
${renderHero(v)}
${renderCircles()}
${renderMint(v)}
${renderSpotlight()}
${renderSteps()}
${renderFlow()}
${renderMarket(v)}
${renderPhases()}
${renderFacts(v)}
${renderFooter(v)}
</div>
</main>
${renderTabbar()}`;
}
