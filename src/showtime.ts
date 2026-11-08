import OBR from '@owlbear-rodeo/sdk';
import './showtime.css';

const CHANNEL = 'com.arton.engine/showtime/v2';
const MODAL_ID = 'com.arton.engine/showtime/overlay';
const IMAGE_STORAGE_KEY = 'arton-engine.showtime.appearance-image';
const IMAGE_TRANSFER_PREFIX = 'arton-engine.showtime.transfer.';

type EffectKind = 'appearance' | 'omen';
type EffectSettings = {
  durationMs: number;
  opacity: number;
  scale: number;
  intensity: number;
  wordCount: number;
  speed: number;
};
type EffectPayload = {
  version: 2;
  id: string;
  kind: EffectKind;
  title: string;
  message: string;
  imageUrl: string;
  settings: EffectSettings;
  createdAt: number;
};

let closeTimer: number | undefined;
let selectedImageUrl = loadSelectedImage();

function loadSelectedImage(): string {
  try {
    return localStorage.getItem(IMAGE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function validPayload(value: unknown): value is EffectPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<EffectPayload>;
  const settings = data.settings as Partial<EffectSettings> | undefined;
  return data.version === 2
    && typeof data.id === 'string'
    && (data.kind === 'appearance' || data.kind === 'omen')
    && typeof data.title === 'string'
    && typeof data.message === 'string'
    && typeof data.imageUrl === 'string'
    && typeof data.createdAt === 'number'
    && !!settings
    && typeof settings.durationMs === 'number'
    && typeof settings.opacity === 'number'
    && typeof settings.scale === 'number'
    && typeof settings.intensity === 'number'
    && typeof settings.wordCount === 'number'
    && typeof settings.speed === 'number'
    && Date.now() - data.createdAt < 60_000
    && data.createdAt <= Date.now() + 5_000;
}

async function openEffect(payload: EffectPayload): Promise<void> {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('showtime', '1');
  url.searchParams.set('kind', payload.kind);
  url.searchParams.set('title', payload.title.slice(0, 100));
  url.searchParams.set('message', payload.message.slice(0, 700));
  if (payload.imageUrl.startsWith('data:image/')) {
    try {
      localStorage.setItem(IMAGE_TRANSFER_PREFIX + payload.id, payload.imageUrl);
      url.searchParams.set('imageKey', payload.id);
    } catch (error) {
      console.error('Não foi possível preparar a imagem do SHOWTIME:', error);
      OBR.notification.show('Não foi possível preparar a imagem para os jogadores.');
    }
  } else if (payload.imageUrl) {
    url.searchParams.set('image', payload.imageUrl);
  }
  url.searchParams.set('duration', String(payload.settings.durationMs));
  url.searchParams.set('opacity', String(payload.settings.opacity));
  url.searchParams.set('scale', String(payload.settings.scale));
  url.searchParams.set('intensity', String(payload.settings.intensity));
  url.searchParams.set('count', String(payload.settings.wordCount));
  url.searchParams.set('speed', String(payload.settings.speed));

  if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  try {
    await OBR.modal.close(MODAL_ID);
  } catch {
    // Nenhum efeito anterior para fechar.
  }

  await OBR.modal.open({
    id: MODAL_ID,
    url: url.toString(),
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true,
  });

  const duration = Math.min(30_000, Math.max(5_000, payload.settings.durationMs));
  closeTimer = window.setTimeout(() => {
    void OBR.modal.close(MODAL_ID).catch((error) => {
      console.warn('Falha ao fechar SHOWTIME:', error);
    });
    closeTimer = undefined;
  }, duration);
}

function readRange(root: HTMLElement, id: string, fallback: number): number {
  const input = root.querySelector<HTMLInputElement>('#' + id);
  return input ? Number(input.value) : fallback;
}

async function fireEffect(
  kind: EffectKind,
  title: string,
  message: string,
  settings: EffectSettings,
  connected: boolean,
  isGM: boolean,
): Promise<void> {
  if (!connected || !isGM) {
    OBR.notification.show('Somente o mestre conectado à sala pode disparar o SHOWTIME.');
    return;
  }
  if (kind === 'omen' && !message.trim()) {
    OBR.notification.show('Escreva algumas frases para formar o presságio.');
    return;
  }

  const payload: EffectPayload = {
    version: 2,
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
    kind,
    title: title.trim().slice(0, 100) || (kind === 'omen' ? 'Presságio' : 'Uma presença se revela'),
    message: message.trim().slice(0, 700),
    imageUrl: kind === 'appearance' ? selectedImageUrl : '',
    settings,
    createdAt: Date.now(),
  };

  try {
    await OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
    await openEffect(payload);
  } catch (error) {
    console.error('Erro ao disparar SHOWTIME:', error);
    OBR.notification.show('Não foi possível disparar o efeito. Verifique a conexão da sala.');
  }
}

async function uploadAppearancePng(file: File, root: HTMLElement): Promise<void> {
  if (file.type !== 'image/png') {
    OBR.notification.show('O arquivo precisa estar no formato PNG.');
    return;
  }
  if (file.size > 1_000_000) {
    OBR.notification.show('Para transmitir a imagem a todos, use um PNG de até 1 MB.');
    return;
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Formato de imagem inválido.'));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
    selectedImageUrl = dataUrl;
    try {
      localStorage.setItem(IMAGE_STORAGE_KEY, selectedImageUrl);
    } catch {
      OBR.notification.show('Imagem carregada nesta sessão, mas não foi possível salvá-la para próximas sessões.');
    }
    const urlField = root.querySelector<HTMLInputElement>('#appearance-image-url');
    if (urlField) urlField.value = '';
    updateImagePreview(root);
    OBR.notification.show('PNG carregado. Ele será enviado junto com a aparição para todos os jogadores.');
  } catch (error) {
    console.error('Erro ao carregar PNG:', error);
    OBR.notification.show('Não foi possível ler esse PNG.');
  }
}

function updateImagePreview(root: HTMLElement): void {
  const preview = root.querySelector<HTMLElement>('#appearance-image-preview');
  const remove = root.querySelector<HTMLButtonElement>('#appearance-image-remove');
  if (!preview) return;

  preview.innerHTML = selectedImageUrl
    ? '<img src="' + escapeHtml(selectedImageUrl) + '" alt="Prévia da imagem escolhida">'
    : '<span>SEM IMAGEM PERSONALIZADA</span>';
  if (remove) remove.hidden = !selectedImageUrl;
}

function updateRangeLabels(root: HTMLElement): void {
  const pairs: Array<[string, string, (value: number) => string]> = [
    ['appearance-opacity', 'appearance-opacity-value', (v) => Math.round(v * 100) + '%'],
    ['appearance-scale', 'appearance-scale-value', (v) => v.toFixed(1) + '×'],
    ['appearance-duration', 'appearance-duration-value', (v) => v + ' s'],
    ['omen-count', 'omen-count-value', (v) => String(v)],
    ['omen-speed', 'omen-speed-value', (v) => v.toFixed(1) + '×'],
    ['omen-intensity', 'omen-intensity-value', (v) => Math.round(v * 100) + '%'],
    ['omen-duration', 'omen-duration-value', (v) => v + ' s'],
  ];

  for (const [inputId, outputId, format] of pairs) {
    const input = root.querySelector<HTMLInputElement>('#' + inputId);
    const output = root.querySelector<HTMLElement>('#' + outputId);
    if (input && output) output.textContent = format(Number(input.value));
  }
}

export function initializeShowtimeBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    void openEffect(event.data).catch((error) => {
      console.error('Falha ao exibir SHOWTIME:', error);
    });
  });
  console.log('ARTON ENGINE: receptor SHOWTIME ativo.');
}

export function renderShowtimePanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const status = !connected
    ? 'Conecte a extensão a uma sala do Owlbear Rodeo para disparar efeitos.'
    : !isGM
      ? 'Somente o mestre pode disparar os efeitos do SHOWTIME.'
      : 'A camada visual é transparente e não bloqueia os cliques no mapa.';
  const imagePreview = selectedImageUrl
    ? '<img src="' + escapeHtml(selectedImageUrl) + '" alt="Prévia da imagem escolhida">'
    : '<span>SEM IMAGEM PERSONALIZADA</span>';

  return [
    '<section class="showtime-intro"><div class="showtime-intro-copy"><span class="showtime-eyebrow">◆ MOMENTOS CINEMATOGRÁFICOS</span>',
    '<h3>A narração é sua.<br><em>A realidade se transforma.</em></h3>',
    '<p>Efeitos translúcidos sobre o mapa. Imagens próprias, movimentos e sussurros visuais para dar corpo aos seus momentos narrativos.</p>',
    '<div class="showtime-audience"><span></span> CAMADA TRANSPARENTE · MAPA SEMPRE VISÍVEL</div></div><div class="showtime-intro-emblem" aria-hidden="true">✧</div></section>',
    '<div class="showtime-section-heading"><div><span>01 / MANIFESTAÇÃO</span><h3>Aparição personalizada</h3></div><small>IMAGEM PNG COM TRANSPARÊNCIA</small></div>',
    '<section class="showtime-editor appearance-editor">',
    '<div class="appearance-image-column"><div class="appearance-image-preview" id="appearance-image-preview">' + imagePreview + '</div>',
    '<div class="appearance-image-actions"><button type="button" class="showtime-secondary-button upload-png-button" id="appearance-image-upload-button">CARREGAR PNG</button><input type="file" id="appearance-image-upload" accept="image/png,.png" hidden><button type="button" class="showtime-text-button" id="appearance-image-remove" ' + (selectedImageUrl ? '' : 'hidden') + '>Remover imagem</button></div>',
    '<p class="showtime-hint">Carregue um PNG de até 1 MB. Ele será transmitido diretamente aos jogadores, sem passar pela biblioteca.</p><label for="appearance-image-url">OU COLE UM LINK DIRETO DE IMAGEM</label><input id="appearance-image-url" type="url" placeholder="https://.../imagem.png" value="' + escapeHtml(selectedImageUrl) + '"><button type="button" class="showtime-text-button" id="appearance-image-url-apply">Usar link</button></div>',
    '<div class="showtime-settings-column"><label for="appearance-title">TÍTULO</label><input id="appearance-title" maxlength="100" value="Uma presença se revela" placeholder="Ex.: O Devorador de Almas">',
    '<label for="appearance-message">FRASE OPCIONAL</label><input id="appearance-message" maxlength="180" value="Algo antigo despertou..." placeholder="Uma frase curta para acompanhar a entrada">',
    '<div class="showtime-range"><label for="appearance-opacity">OPACIDADE <output id="appearance-opacity-value">88%</output></label><input id="appearance-opacity" type="range" min="0.25" max="1" step="0.01" value="0.88"></div>',
    '<div class="showtime-range"><label for="appearance-scale">TAMANHO <output id="appearance-scale-value">1.0×</output></label><input id="appearance-scale" type="range" min="0.5" max="1.6" step="0.1" value="1"></div>',
    '<div class="showtime-range"><label for="appearance-duration">DURAÇÃO <output id="appearance-duration-value">10 s</output></label><input id="appearance-duration" type="range" min="5" max="30" step="1" value="10"></div>',
    '<button class="showtime-fire-button" data-showtime="appearance" ' + disabled + '><span>✦</span> DISPARAR APARIÇÃO <span class="button-arrow">→</span></button></div></section>',
    '<div class="showtime-section-heading omen-heading"><div><span>02 / ALTERAÇÃO DA PERCEPÇÃO</span><h3>Presságio alucinado</h3></div><small>FRASES QUE SUSSURRAM PELA TELA</small></div>',
    '<section class="showtime-editor omen-editor"><div class="omen-editor-description"><div class="omen-preview-art" aria-hidden="true"><span>Você já esteve aqui...</span><span>ele está olhando</span><span>não confie na luz</span><span>Você já esteve aqui...</span></div>',
    '<p>Escreva uma frase por linha. O SHOWTIME espalha as frases pelo espaço, repete algumas e faz cada uma flutuar, sumir e reaparecer em seu próprio ritmo.</p></div>',
    '<div class="omen-editor-controls"><label for="omen-title">IDENTIFICAÇÃO DO EFEITO (OPCIONAL)</label><input id="omen-title" maxlength="100" value="Sussurros do além" placeholder="Nome interno do presságio">',
    '<label for="omen-message">FRASES / SUSSURROS — UMA POR LINHA</label><textarea id="omen-message" maxlength="700" rows="7" placeholder="Você não deveria estar aqui.&#10;Ele está olhando.&#10;Não confie na luz.">Você não deveria estar aqui.\nA porta já estava aberta.\nEle está olhando.\nVocê não deveria estar aqui.\nNão confie na luz.\nA morte não é o fim.\nEle está olhando.</textarea>',
    '<div class="showtime-range"><label for="omen-count">FRASES SIMULTÂNEAS <output id="omen-count-value">12</output></label><input id="omen-count" type="range" min="4" max="24" step="1" value="12"></div>',
    '<div class="showtime-range"><label for="omen-speed">VELOCIDADE <output id="omen-speed-value">1.0×</output></label><input id="omen-speed" type="range" min="0.5" max="2" step="0.1" value="1"></div>',
    '<div class="showtime-range"><label for="omen-intensity">INTENSIDADE <output id="omen-intensity-value">65%</output></label><input id="omen-intensity" type="range" min="0.2" max="1" step="0.05" value="0.65"></div>',
    '<div class="showtime-range"><label for="omen-duration">DURAÇÃO <output id="omen-duration-value">12 s</output></label><input id="omen-duration" type="range" min="5" max="30" step="1" value="12"></div>',
    '<button class="showtime-fire-button omen-fire-button" data-showtime="omen" ' + disabled + '><span>✧</span> LIBERAR PRESSÁGIO <span class="button-arrow">→</span></button></div></section>',
    '<p class="showtime-footnote">' + status + '</p>',
  ].join('');
}

export function bindShowtimeActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  updateImagePreview(root);
  updateRangeLabels(root);

  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => updateRangeLabels(root));
  });

  root.querySelector<HTMLButtonElement>('#appearance-image-upload-button')?.addEventListener('click', () => {
    root.querySelector<HTMLInputElement>('#appearance-image-upload')?.click();
  });
  root.querySelector<HTMLInputElement>('#appearance-image-upload')?.addEventListener('change', (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void uploadAppearancePng(file, root);
    (event.currentTarget as HTMLInputElement).value = '';
  });

  root.querySelector<HTMLButtonElement>('#appearance-image-url-apply')?.addEventListener('click', () => {
    const field = root.querySelector<HTMLInputElement>('#appearance-image-url');
    const value = field?.value.trim() || '';
    if (value && !/^https?:\\/\\//i.test(value)) {
      OBR.notification.show('Use um link de imagem iniciado por http:// ou https://.');
      return;
    }
    selectedImageUrl = value;
    try { localStorage.setItem(IMAGE_STORAGE_KEY, selectedImageUrl); } catch { /* armazenamento opcional */ }
    updateImagePreview(root);
    OBR.notification.show(value ? 'Link de imagem aplicado.' : 'Imagem removida.');
  });

  root.querySelector<HTMLButtonElement>('#appearance-image-remove')?.addEventListener('click', () => {
    selectedImageUrl = '';
    try {
      localStorage.removeItem(IMAGE_STORAGE_KEY);
    } catch {
      // A remoção continua valendo para esta instância.
    }
    updateImagePreview(root);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-showtime]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.showtime as EffectKind;
      if (kind === 'appearance') {
        const settings: EffectSettings = {
          durationMs: readRange(root, 'appearance-duration', 10) * 1000,
          opacity: readRange(root, 'appearance-opacity', 0.88),
          scale: readRange(root, 'appearance-scale', 1),
          intensity: 0.55,
          wordCount: 0,
          speed: 1,
        };
        const title = root.querySelector<HTMLInputElement>('#appearance-title')?.value || '';
        const message = root.querySelector<HTMLInputElement>('#appearance-message')?.value || '';
        void fireEffect('appearance', title, message, settings, connected, isGM);
      } else if (kind === 'omen') {
        const settings: EffectSettings = {
          durationMs: readRange(root, 'omen-duration', 12) * 1000,
          opacity: 1,
          scale: 1,
          intensity: readRange(root, 'omen-intensity', 0.65),
          wordCount: readRange(root, 'omen-count', 12),
          speed: readRange(root, 'omen-speed', 1),
        };
        const title = root.querySelector<HTMLInputElement>('#omen-title')?.value || 'Presságio';
        const message = root.querySelector<HTMLTextAreaElement>('#omen-message')?.value || '';
        void fireEffect('omen', title, message, settings, connected, isGM);
      }
    });
  });
}

export function renderShowtimeOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('kind') === 'omen' ? 'omen' : 'appearance';
  const title = escapeHtml((params.get('title') || '').slice(0, 100));
  const message = (params.get('message') || '').slice(0, 700);
  const imageKey = params.get('imageKey') || '';
  let imageUrl = params.get('image') || '';
  if (imageKey) {
    try { imageUrl = localStorage.getItem(IMAGE_TRANSFER_PREFIX + imageKey) || ''; } catch { imageUrl = ''; }
  }
  const opacity = Math.max(0.25, Math.min(1, Number(params.get('opacity')) || 0.88));
  const scale = Math.max(0.5, Math.min(1.6, Number(params.get('scale')) || 1));
  const intensity = Math.max(0.2, Math.min(1, Number(params.get('intensity')) || 0.65));
  const wordCount = Math.max(4, Math.min(24, Number(params.get('count')) || 12));
  const speed = Math.max(0.5, Math.min(2, Number(params.get('speed')) || 1));

  document.documentElement.style.background = 'transparent';
  document.body.classList.add('showtime-mode');

  if (kind === 'appearance') {
    const image = imageUrl
      ? '<img class="appearance-custom-image" src="' + escapeHtml(imageUrl) + '" alt="">'
      : '<div class="appearance-fallback" aria-hidden="true"></div>';
    root.innerHTML = [
      '<main class="showtime-overlay showtime-appearance" style="--effect-opacity:' + opacity + ';--effect-scale:' + scale + '" role="status" aria-live="polite">',
      '<div class="appearance-atmosphere"></div>',
      '<div class="appearance-image-stage">' + image + '</div>',
      '<div class="appearance-copy">' + (title ? '<h1>' + title + '</h1>' : '') + (message ? '<p>' + escapeHtml(message) + '</p>' : '') + '</div>',
      '</main>',
    ].join('');
    return;
  }

  const phrases = message.split(/\r?\n/).map((phrase) => phrase.trim()).filter(Boolean);
  const whisperElements: string[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    const phrase = phrases[Math.floor(Math.random() * phrases.length)] || 'Ele está olhando.';
    const x = 5 + Math.random() * 82;
    const y = 8 + Math.random() * 82;
    const dx = -45 + Math.random() * 90;
    const dy = -65 + Math.random() * 130;
    const rotation = -9 + Math.random() * 18;
    const delay = -Math.random() * 8;
    const duration = (5.5 + Math.random() * 7) / speed;
    const fontSize = 13 + Math.random() * 13;
    const alpha = intensity * (0.42 + Math.random() * 0.58);
    const style = '--x:' + x.toFixed(2) + '%;--y:' + y.toFixed(2) + '%;--dx:' + dx.toFixed(1) + 'px;--dy:' + dy.toFixed(1) + 'px;--rot:' + rotation.toFixed(1) + 'deg;--delay:' + delay.toFixed(2) + 's;--float-duration:' + duration.toFixed(2) + 's;--font-size:' + fontSize.toFixed(1) + 'px;--whisper-alpha:' + alpha.toFixed(2);
    whisperElements.push('<span class="omen-whisper" style="' + style + '">' + escapeHtml(phrase) + '</span>');
  }

  root.innerHTML = [
    '<main class="showtime-overlay showtime-omen" style="--omen-intensity:' + intensity + '" role="status" aria-live="off">',
    '<div class="omen-atmosphere"></div><div class="omen-haze"></div>',
    '<div class="omen-whisper-field" aria-hidden="true">' + whisperElements.join('') + '</div>',

    '<div class="omen-whisper-caption">' + (title ? escapeHtml(title) : 'SUSSURROS') + '</div>',
    '</main>',
  ].join('');
}
