'use strict';

const TARGET_GPT_URL = 'https://chatgpt.com/g/g-6a62e905ca608191be135254d6f2fbcc-muzicki-spot-studio-privatni';

document.getElementById('open-gpt').addEventListener('click', () => chrome.tabs.create({ url: TARGET_GPT_URL }));
document.getElementById('check').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Proveravam…';
  const response = await chrome.runtime.sendMessage({type:'MSS_GET_STATUS'});
  if (!response?.ok) {
    status.textContent = `PROGRAM: NIJE POVEZAN\n${response?.error || 'Nepoznata greška'}`;
    return;
  }
  const value = response.status || {};
  const active = value.job
    ? `${value.job.type === 'test' ? 'TEST' : (value.job.phase === 'prompt-to-spot' ? 'PROMPT → SPOT' : value.job.phase === 'round2-scenes' ? `STORYBOARD ${Number(value.job.batchIndex)+1}/${value.job.batchTotal}` : value.job.phase === 'round2-final' ? 'ZAVRŠNI PAKET' : `KRUG ${value.job.round}`)} — ${value.job.status}`
    : 'NEMA — klikni Korak 3 u programu';
  status.textContent = [
    `Program: POVEZAN (${value.version || ''})`,
    `Verzija dodatka: ${value.extensionVersion || 'nema'} / potrebna ${value.expectedExtensionVersion || '15.4.0'}`,
    `Kompatibilnost: ${value.extensionCompatible ? 'ISPRAVNA' : 'NEISPRAVNA'}`,
    `Dodatak u programu: ${value.localPageConnected ? 'POVEZAN' : 'ČEKA'}`,
    `ChatGPT tab: ${value.chatgptTabConnected ? 'POVEZAN' : 'ČEKA'}`,
    `Privatni GPT: VEĆ UPISAN`,
    `Aktivan zahtev: ${active}`
  ].join('\n');
});
