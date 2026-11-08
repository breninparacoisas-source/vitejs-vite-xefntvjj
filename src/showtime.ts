import OBR from '@owlbear-rodeo/sdk';
import './showtime.css';

const CHANNEL = 'com.arton.engine/showtime/v1';
const MODAL_ID = 'com.arton.engine/showtime/overlay';
type EffectKind = 'appearance' | 'omen';
type EffectPayload = { version: 1; id: string; kind: EffectKind; title: string; message: string; createdAt: number; durationMs: number };
let closeTimer: number | undefined;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

function validPayload(value: unknown): value is EffectPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<EffectPayload>;
  return data.version === 1 && typeof data.id === 'string'
    && (data.kind === 'appearance' || data.kind === 'omen')
    && typeof data.title === 'string' && typeof data.message === 'string'
    && typeof data.createdAt === 'number' && typeof data.durationMs === 'number'
    && Date.now() - data.createdAt < 60_000 && data.createdAt <= Date.now() + 5_000;
}

async function openEffect(payload: EffectPayload): Promise<void> {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('showtime', '1');
  url.searchParams.set('kind', payload.kind);
  url.searchParams.set('title', payload.title.slice(0, 100));
  url.searchParams.set('message', payload.message.slice(0, 500));
  if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  try { await OBR.modal.close(MODAL_ID); } catch { /* Primeiro efeito da sessão. */ }
  await OBR.modal.open({ id: MODAL_ID, url: url.toString(), fullScreen: true, hideBackdrop: true, hidePaper: true, disablePointerEvents: true });
  const duration = Math.min(15_000, Math.max(4_000, payload.durationMs));
  closeTimer = window.setTimeout(() => {
    void OBR.modal.close(MODAL_ID).catch((error) => console.warn('Falha ao fechar SHOWTIME:', error));
    closeTimer = undefined;
  }, duration);
}

async function fireEffect(kind: EffectKind, title: string, message: string, connected: boolean, isGM: boolean): Promise<void> {
  if (!connected || !isGM) {
    OBR.notification.show('Somente o mestre conectado à sala pode disparar o SHOWTIME.');
    return;
  }
  if (kind === 'omen' && !message.trim()) {
    OBR.notification.show('Escreva a mensagem do presságio antes de dispará-lo.');
    return;
  }
  const payload: EffectPayload = {
    version: 1, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
    kind, title: title.trim().slice(0, 100) || (kind === 'omen' ? 'O presságio' : 'Uma presença se revela'),
    message: message.trim().slice(0, 500), createdAt: Date.now(), durationMs: 10_000,
  };
  try {
    await OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
    await openEffect(payload);
  } catch (error) {
    console.error('Erro ao disparar SHOWTIME:', error);
    OBR.notification.show('Não foi possível disparar o efeito. Verifique a conexão da sala.');
  }
}

export function initializeShowtimeBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    void openEffect(event.data).catch((error) => console.error('Falha ao exibir SHOWTIME:', error));
  });
  console.log('ARTON ENGINE: receptor SHOWTIME ativo.');
}

export function renderShowtimePanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const status = !connected ? 'Conecte a extensão a uma sala do Owlbear Rodeo para disparar efeitos.' : !isGM ? 'Somente o mestre pode disparar os efeitos do SHOWTIME.' : 'Os efeitos são exibidos em todos os clientes conectados que estiverem com a extensão habilitada.';
  return [
    '<section class="showtime-intro"><div class="showtime-intro-copy"><span class="showtime-eyebrow">◆ MOMENTOS CINEMATOGRÁFICOS</span>',
    '<h3>A narração é sua.<br><em>O impacto também.</em></h3>',
    '<p>Dispare uma manifestação ou um presságio. O efeito aparece em tela cheia para os jogadores conectados à sala, sem que precisem clicar em nada.</p>',
    '<div class="showtime-audience"><span></span> EXIBIÇÃO SINCRONIZADA PARA A MESA</div></div><div class="showtime-intro-emblem" aria-hidden="true">✧</div></section>',
    '<div class="showtime-section-heading"><div><span>01 / EFEITOS DISPONÍVEIS</span><h3>Escolha o momento</h3></div><small>EFEITOS EM TELA CHEIA · 10 SEGUNDOS</small></div>',
    '<section class="showtime-grid">',
    '<article class="showtime-card appearance-card"><div class="showtime-card-art appearance-art" aria-hidden="true"><div class="art-ring"></div><div class="art-eye">✦</div><span class="art-rune">ᚦ ᛟ ᚱ</span></div>',
    '<div class="showtime-card-body"><span class="showtime-card-index">01 — MANIFESTAÇÃO</span><h3>Aparição</h3><p>Uma entidade emerge em meio a sombras, luz e símbolos. Ideal para entradas de inimigos, criaturas e seres sobrenaturais.</p>',
    '<label for="appearance-title">TÍTULO DA APARIÇÃO</label><input id="appearance-title" maxlength="100" value="Uma presença se revela" placeholder="Ex.: O Devorador de Almas">',
    '<label for="appearance-message">TEXTO OPCIONAL</label><input id="appearance-message" maxlength="180" value="Algo antigo despertou..." placeholder="Uma frase curta para acompanhar a entrada">',
    '<button class="showtime-fire-button" data-showtime="appearance" ' + disabled + '><span>✦</span> DISPARAR APARIÇÃO <span class="button-arrow">→</span></button></div></article>',
    '<article class="showtime-card omen-card"><div class="showtime-card-art omen-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="omen-art-symbol">ᛟ</div><span class="omen-art-stars">✧　·　✦　·　✧</span></div>',
    '<div class="showtime-card-body"><span class="showtime-card-index">02 — REVELAÇÃO</span><h3>Presságio</h3><p>Uma mensagem atravessa o véu: palavras surgem entre névoa, runas e distorções suaves, como uma visão sobrenatural.</p>',
    '<label for="omen-title">TÍTULO DO PRESSÁGIO</label><input id="omen-title" maxlength="100" value="O que está por vir" placeholder="Ex.: A profecia da Divergência">',
    '<label for="omen-message">MENSAGEM</label><textarea id="omen-message" maxlength="500" rows="3" placeholder="Escreva as palavras que os jogadores verão...">Quando a última chama se apagar, o antigo juramento despertará.</textarea>',
    '<button class="showtime-fire-button omen-fire-button" data-showtime="omen" ' + disabled + '><span>✧</span> REVELAR PRESSÁGIO <span class="button-arrow">→</span></button></div></article></section>',
    '<p class="showtime-footnote">' + status + '</p>',
  ].join('');
}

export function bindShowtimeActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  root.querySelectorAll<HTMLButtonElement>('[data-showtime]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.showtime as EffectKind;
      if (kind === 'appearance') {
        const title = root.querySelector<HTMLInputElement>('#appearance-title')?.value || '';
        const message = root.querySelector<HTMLInputElement>('#appearance-message')?.value || '';
        void fireEffect('appearance', title, message, connected, isGM);
      } else if (kind === 'omen') {
        const title = root.querySelector<HTMLInputElement>('#omen-title')?.value || '';
        const message = root.querySelector<HTMLTextAreaElement>('#omen-message')?.value || '';
        void fireEffect('omen', title, message, connected, isGM);
      }
    });
  });
}

export function renderShowtimeOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('kind') === 'omen' ? 'omen' : 'appearance';
  const title = escapeHtml((params.get('title') || (kind === 'omen' ? 'O presságio' : 'Uma presença se revela')).slice(0, 100));
  const message = escapeHtml((params.get('message') || '').slice(0, 500));
  document.body.classList.add('showtime-mode');
  if (kind === 'appearance') {
    root.innerHTML = [
      '<main class="showtime-overlay showtime-appearance" role="status" aria-live="polite"><div class="showtime-vignette"></div><div class="appearance-aura"></div>',
      '<div class="appearance-runes" aria-hidden="true">ᚦ　ᚱ　ᛟ　ᚨ　ᛉ　ᚷ　ᚦ</div><div class="appearance-sigil" aria-hidden="true">',
      '<svg viewBox="0 0 420 520" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="entityShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17131a"/><stop offset="1" stop-color="#030305"/></linearGradient><filter id="entityGlow"><feGaussianBlur stdDeviation="13"/></filter></defs>',
      '<path d="M210 76 C184 38 151 24 119 28 C145 62 150 94 151 126 C115 112 91 94 68 67 C76 124 103 159 143 179 C112 210 94 248 84 294 C67 356 82 414 118 454 L302 454 C338 414 353 356 336 294 C326 248 308 210 277 179 C317 159 344 124 352 67 C329 94 305 112 269 126 C270 94 275 62 301 28 C269 24 236 38 210 76Z" fill="#b54b4b" opacity=".45" filter="url(#entityGlow)"/>',
      '<path d="M210 76 C184 38 151 24 119 28 C145 62 150 94 151 126 C115 112 91 94 68 67 C76 124 103 159 143 179 C112 210 94 248 84 294 C67 356 82 414 118 454 L302 454 C338 414 353 356 336 294 C326 248 308 210 277 179 C317 159 344 124 352 67 C329 94 305 112 269 126 C270 94 275 62 301 28 C269 24 236 38 210 76Z" fill="url(#entityShade)" stroke="#59414a" stroke-width="2"/>',
      '<path d="M151 196 C169 166 190 151 210 151 C230 151 251 166 269 196 L252 262 L168 262Z" fill="#09080c"/><path d="M171 218 L197 225 L183 235Z M249 218 L223 225 L237 235Z" fill="#d9a17f"/>',
      '<path d="M210 261 C174 279 153 317 145 366 L127 454 L293 454 L275 366 C267 317 246 279 210 261Z" fill="#08070a"/><path d="M150 296 C119 312 100 345 91 389 M270 296 C301 312 320 345 329 389" fill="none" stroke="#17131b" stroke-width="30" stroke-linecap="round"/></svg></div>',
      '<div class="appearance-copy"><span class="showtime-kicker">UMA PRESENÇA SE REVELA</span><h1>' + title + '</h1>' + (message ? '<p>' + message + '</p>' : '') + '</div><div class="showtime-bottom-line"></div></main>',
    ].join('');
  } else {
    root.innerHTML = [
      '<main class="showtime-overlay showtime-omen" role="status" aria-live="polite"><div class="showtime-vignette"></div><div class="omen-haze"></div>',
      '<div class="omen-ring omen-ring-one" aria-hidden="true"></div><div class="omen-ring omen-ring-two" aria-hidden="true"></div>',
      '<div class="omen-content"><div class="omen-mark" aria-hidden="true">✧</div><span class="showtime-kicker">UMA VISÃO ATRAVESSA O VÉU</span><h1>' + title + '</h1>',
      '<div class="omen-divider"><span></span> ✦ <span></span></div><p class="omen-message">' + message + '</p></div><div class="showtime-bottom-line"></div></main>',
    ].join('');
  }
}
