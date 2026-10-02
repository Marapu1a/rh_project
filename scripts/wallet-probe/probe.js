'use strict';
const providers = new Map();
const select = document.querySelector('#wallet');
const button = document.querySelector('#run');
const status = document.querySelector('#status');
function announce(event) {
  const { info, provider } = event.detail || {};
  if (!info || info.rdns !== 'io.metamask' || !provider?.request || providers.has(info.uuid)) return;
  providers.set(info.uuid, provider);
  const option = document.createElement('option');
  option.value = info.uuid;
  option.textContent = info.name;
  select.append(option);
  button.disabled = false;
  status.textContent = 'MetaMask найден. Нажми кнопку и разреши подключение нужного аккаунта.';
}
window.addEventListener('eip6963:announceProvider', announce);
window.dispatchEvent(new Event('eip6963:requestProvider'));
button.onclick = async () => {
  button.disabled = true;
  const provider = providers.get(select.value);
  const read = (method, params = []) => provider.request({ method, params });
  try {
    status.textContent = 'Ожидаем ответ MetaMask…';
    const accounts = await read('eth_requestAccounts');
    const account = accounts[0];
    if (!/^0x[0-9a-f]{40}$/i.test(account || '')) throw Error('Не выбран аккаунт');
    const chainBefore = await read('eth_chainId');
    let capabilities = null, capabilityError = null;
    try { capabilities = await read('wallet_getCapabilities', [account, ['0x1237']]); }
    catch (error) { capabilityError = { code: error.code ?? null, message: String(error.message).slice(0,1000) }; }
    const after = await read('eth_accounts');
    const chainAfter = await read('eth_chainId');
    const stable = after[0]?.toLowerCase() === account.toLowerCase() && chainBefore === chainAfter;
    const report = { schema: 'qianqi-wallet-capabilities-v1', observedAt: new Date().toISOString(), provider: 'io.metamask', versionUserReported: document.querySelector('#version').value, account, targetChain: '0x1237', chainBefore, chainAfter, stable, capabilities, capabilityError, admitted: false };
    document.querySelector('#result').textContent = JSON.stringify(report, null, 2);
    const response = await fetch('/report', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(report) });
    if (!response.ok) throw Error('Не удалось сохранить отчёт локально');
    status.textContent = stable ? 'Отчёт сохранён. Напиши в чат «готово» — разберём результат. Это ещё не подтверждение исполнения пакетной покупки.' : 'Аккаунт или сеть изменились во время проверки. Повтори проверку.';
  } catch (error) { status.textContent = String(error.message || error); }
  finally { button.disabled = false; }
};
