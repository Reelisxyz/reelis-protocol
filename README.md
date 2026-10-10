# Reelis

**Attention, minted into ownership.**

[![Live site](https://img.shields.io/badge/live%20site-reelis.xyz-b326cf?style=flat-square)](https://reelis.xyz)
![Chain](https://img.shields.io/badge/chain-Solana-9528ed?style=flat-square)

| | |
|---|---|
| Chain | Solana |
| CA | _pending, published here and on the site once confirmed_ |

## Overview

Reelis pairs makers with tokens of their own. Backers hold a stake in the story, and makers keep a slice of the momentum around it, settled in forms they already trust. The site carries a live board of the busiest boosted Solana tokens so visitors can watch the market while the project's own mint is still pending.

## Features

- Pinned contract-address slot with click-to-copy. It stays inert until an address is stated.
- Live market board: top ten boosted Solana tokens by 24h volume, with logo, price, 24h change, volume, liquidity and a copy-address button.
- Ticker, spotlight rail, sortable tabs and a list or grid layout, all fed by the same data.
- Polling every minute, paused while the tab is hidden, retried with exponential backoff, last good data kept on a failed refresh.
- A fact register: every external fact is one record that is stated, absent or unconfirmed. Unstated records render inert, with no value and no link.
- Full `prefers-reduced-motion` support.

## Links

- Site: [reelis.xyz](https://reelis.xyz)
- X: _pending_
- GitHub: _pending_
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm install
npm run build    # writes the deployable site to dist/
npm run gates    # static, branch and browser gates
```

Deploy the contents of `dist/`. To state a fact, edit `src/register/register.json` and rebuild.

## License

MIT, see [LICENSE](LICENSE).
