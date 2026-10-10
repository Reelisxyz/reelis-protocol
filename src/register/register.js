// Register layer. Every external fact is one record with a state: stated | absent | unconfirmed.
// Inert records (absent, unconfirmed) must not carry a value or a url of any kind.

export const STATES = ['stated', 'absent', 'unconfirmed'];
export const META_KEYS = ['state', 'label', 'source', 'scope', 'recordedAt', 'note'];
export const DATE_KEYS = ['recordedAt'];

export const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const isAddressShaped = (s) => BASE58_ADDRESS.test(s) || EVM_ADDRESS.test(s);

const HOSTS = { x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'], github: ['github.com', 'www.github.com'] };

export function deriveHandle(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? seg.replace(/^@/, '') : '';
  } catch { return ''; }
}

export function validateRegister(reg) {
  const errors = [];
  for (const [id, r] of Object.entries(reg.records)) {
    if (!STATES.includes(r.state)) errors.push(`${id}: unknown state ${r.state}`);
    if (r.state !== 'stated') {
      for (const k of Object.keys(r)) if (!META_KEYS.includes(k)) errors.push(`${id}: inert record carries "${k}"`);
      continue;
    }
    if (r.value == null && r.url == null) errors.push(`${id}: stated record has neither value nor url`);
    if (id === 'ca' && !isAddressShaped(r.value || '')) errors.push('ca: stated value is not address-shaped');
    if (HOSTS[id]) {
      let host = '';
      try { host = new URL(r.url).hostname; } catch { /* handled below */ }
      if (!HOSTS[id].includes(host)) errors.push(`${id}: url host not accepted`);
      if (!deriveHandle(r.url)) errors.push(`${id}: no handle derivable from url`);
    }
  }
  return errors;
}

export function stripDates(reg) {
  const out = JSON.parse(JSON.stringify(reg));
  for (const r of Object.values(out.records)) for (const k of DATE_KEYS) delete r[k];
  return out;
}

// View model for rendering. `live` is the only flag the renderer branches on.
export function view(reg) {
  const v = {};
  for (const [id, r] of Object.entries(reg.records)) {
    const live = r.state === 'stated';
    v[id] = { id, label: r.label, state: r.state, live };
    if (live) {
      if (r.value != null) v[id].value = r.value;
      if (r.url != null) { v[id].url = r.url; v[id].handle = deriveHandle(r.url); }
      for (const k of Object.keys(r)) if (!META_KEYS.includes(k) && !(k in v[id])) v[id][k] = r[k];
    }
  }
  return v;
}

// Runtime-state-independent mutation: flips whatever the record currently is.
export function mutate(reg, id, makeStated) {
  const out = JSON.parse(JSON.stringify(reg));
  const r = out.records[id];
  if (r.state === 'stated') {
    for (const k of Object.keys(r)) if (!META_KEYS.includes(k)) delete r[k];
    r.state = 'absent';
  } else {
    Object.assign(r, makeStated(r));
    r.state = 'stated';
  }
  return out;
}
