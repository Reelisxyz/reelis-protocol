// When a contract address is stated, ask the stated RPC whether that address is a token mint.
// Silent on any failure; the slot never depends on the answer.
export async function initChainCheck() {
  const ca = document.querySelector('.ca.is-live[data-rpc]');
  const value = ca && ca.querySelector('[data-ca-value]');
  if (!ca || !value) return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(ca.dataset.rpc, {
      method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [value.textContent.trim(), { encoding: 'jsonParsed' }] }),
    });
    const j = await res.json();
    const parsed = j && j.result && j.result.value && j.result.value.data && j.result.value.data.parsed;
    if (parsed && parsed.type === 'mint') {
      const tag = document.createElement('span');
      tag.className = 'ca__ok'; tag.textContent = 'Mint recognised by the network';
      ca.querySelector('.ca__label').after(tag);
    }
  } catch { /* leave the slot as is */ } finally { clearTimeout(timer); }
}
