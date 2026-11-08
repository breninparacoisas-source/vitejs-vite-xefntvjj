import OBR from '@owlbear-rodeo/sdk';
import './cinematic.css';

const CHANNEL = 'com.arton.engine/cinematic/v1';
const MODAL_ID = 'com.arton.engine/cinematic/scene';

type FarewellPayload = {
  version: 1;
  id: string;
  kind: 'farewell';
  character: string;
  epitaph: string;
  intensity: number;
  durationMs: number;
  createdAt: number;
};

let closeTimer: number | undefined;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function validPayload(value: unknown): value is FarewellPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<FarewellPayload>;
  return data.version === 1
    && data.kind === 'farewell'
    && typeof data.id === 'string'
    && typeof data.character === 'string'
    && typeof data.epitaph === 'string'
    && typeof data.intensity === 'number'
    && Number.isFinite(data.intensity)
    && typeof data.durationMs === 'number'
    && Number.isFinite(data.durationMs)
    && typeof data.createdAt === 'number'
    && Date.now() - data.createdAt < 60_000
    && data.createdAt <= Date.now() + 5_000;
}

async function openScene(payload: FarewellPayload): Promise<void> {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('sceneId', payload.id);
  url.searchParams.set('character', payload.character.slice(0, 80));
  url.searchParams.set('epitaph', payload.epitaph.slice(0, 240));
  url.searchParams.set('intensity', String(payload.intensity));
  url.searchParams.set('duration', String(payload.durationMs));

  if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  try {
    await OBR.modal.close(MODAL_ID);
  } catch {
    // Não havia uma cena anterior aberta.
  }

  await OBR.modal.open({
    id: MODAL_ID,
    url: url.toString(),
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true,
  });

  const duration = Math.min(35_000, Math.max(12_000, payload.durationMs));
  closeTimer = window.setTimeout(() => {
    void OBR.modal.close(MODAL_ID).catch((error) => {
      console.warn('Falha ao encerrar CINEMÁTICO:', error);
    });
    closeTimer = undefined;
  }, duration);
}

export function initializeCinematicBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    void openScene(event.data).catch((error) => {
      console.error('Falha ao exibir cena CINEMÁTICA:', error);
    });
  });
  console.log('ARTON ENGINE: receptor CINEMÁTICO ativo.');
}

export function renderCinematicPanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const status = !connected
    ? 'Conecte a extensão a uma sala do Owlbear para testar a cena compartilhada.'
    : !isGM
      ? 'Somente o mestre pode conduzir uma cena cinematográfica.'
      : 'A cena será exibida para todos os participantes conectados à sala.';

  return `
    <section class="cinematic-welcome">
      <div class="cinematic-welcome-copy">
        <span class="cinematic-kicker">DIREÇÃO NARRATIVA · EXPERIÊNCIA 01</span>
        <h3>Algumas despedidas<br>merecem <em>um instante a mais.</em></h3>
        <p>Uma sequência dramática contínua. O mapa permanece visível sob a atmosfera, enquanto a cena conduz o olhar e desacelera o momento.</p>
      </div>
      <div class="cinematic-preview" aria-hidden="true">
        <div class="cinematic-preview-light"></div>
        <div class="cinematic-preview-horizon"></div>
        <div class="cinematic-preview-caption">O ÚLTIMO ADEUS</div>
      </div>
    </section>

    <div class="cinematic-editor-heading">
      <div><span>01 / LUTO E PERDA</span><h3>Uma despedida</h3></div>
      <small>SEQUÊNCIA DE 3 ATOS</small>
    </div>

    <section class="cinematic-editor">
      <div class="cinematic-editor-description">
        <div class="cinematic-act-list">
          <div><span>ATO I</span><strong>A queda do mundo</strong><p>A atmosfera escurece e o movimento desacelera.</p></div>
          <div><span>ATO II</span><strong>O silêncio que fica</strong><p>Uma pausa visual dá espaço para a última fala.</p></div>
          <div><span>ATO III</span><strong>A memória permanece</strong><p>O nome e a despedida surgem e desaparecem lentamente.</p></div>
        </div>
      </div>
      <div class="cinematic-controls">
        <label for="cinematic-character">NOME DO PERSONAGEM</label>
        <input id="cinematic-character" maxlength="80" value="A última luz" placeholder="Nome do personagem">

        <label for="cinematic-epitaph">ÚLTIMA MENSAGEM (OPCIONAL)</label>
        <textarea id="cinematic-epitaph" maxlength="240" rows="3" placeholder="Uma última frase, lembrança ou despedida...">Algumas histórias não terminam quando a luz se apaga.</textarea>

        <div class="cinematic-control-range">
          <label for="cinematic-intensity">PRESENÇA VISUAL <output id="cinematic-intensity-value">65%</output></label>
          <input id="cinematic-intensity" type="range" min="0.25" max="0.85" step="0.05" value="0.65">
          <small>Controla o peso da vinheta e da atmosfera, sem cobrir completamente o mapa.</small>
        </div>
        <div class="cinematic-control-range">
          <label for="cinematic-duration">DURAÇÃO <output id="cinematic-duration-value">22 s</output></label>
          <input id="cinematic-duration" type="range" min="12" max="35" step="1" value="22">
          <small>A sequência se encerra automaticamente ao final.</small>
        </div>
        <button class="cinematic-launch" data-cinematic-launch="farewell" ${disabled}>INICIAR DESPEDIDA</button>
        <p class="cinematic-status">${status}</p>
      </div>
    </section>
    <p class="cinematic-footnote">Esta é a primeira experiência de teste do CINEMÁTICO. Ela não altera o token, o mapa ou os dados da campanha.</p>
  `;
}

export function bindCinematicActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  const intensity = root.querySelector<HTMLInputElement>('#cinematic-intensity');
  const duration = root.querySelector<HTMLInputElement>('#cinematic-duration');
  const intensityOutput = root.querySelector<HTMLOutputElement>('#cinematic-intensity-value');
  const durationOutput = root.querySelector<HTMLOutputElement>('#cinematic-duration-value');

  intensity?.addEventListener('input', () => {
    if (intensityOutput) intensityOutput.textContent = Math.round(Number(intensity.value) * 100) + '%';
  });
  duration?.addEventListener('input', () => {
    if (durationOutput) durationOutput.textContent = duration.value + ' s';
  });

  root.querySelector<HTMLButtonElement>('[data-cinematic-launch="farewell"]')?.addEventListener('click', async () => {
    if (!connected || !isGM) {
      OBR.notification.show('Somente o mestre conectado pode iniciar uma cena CINEMÁTICA.');
      return;
    }

    const character = root.querySelector<HTMLInputElement>('#cinematic-character')?.value.trim() || '';
    const epitaph = root.querySelector<HTMLTextAreaElement>('#cinematic-epitaph')?.value.trim() || '';
    if (!character) {
      OBR.notification.show('Informe o nome do personagem para iniciar a despedida.');
      return;
    }

    const payload: FarewellPayload = {
      version: 1,
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
      kind: 'farewell',
      character: character.slice(0, 80),
      epitaph: epitaph.slice(0, 240),
      intensity: Math.max(0.25, Math.min(0.85, Number(intensity?.value) || 0.65)),
      durationMs: Math.max(12, Math.min(35, Number(duration?.value) || 22)) * 1000,
      createdAt: Date.now(),
    };

    const button = root.querySelector<HTMLButtonElement>('[data-cinematic-launch="farewell"]');
    if (button) button.disabled = true;
    try {
      await openScene(payload);
      await OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
      OBR.notification.show('Cena CINEMÁTICA iniciada para a sala.');
    } catch (error) {
      console.error('Erro ao iniciar cena CINEMÁTICA:', error);
      OBR.notification.show('Não foi possível iniciar a cena. Verifique a conexão da sala.');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

export function renderCinematicOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const character = escapeHtml((params.get('character') || 'Uma despedida').slice(0, 80));
  const epitaph = escapeHtml((params.get('epitaph') || '').slice(0, 240));
  const intensity = Math.max(0.25, Math.min(0.85, Number(params.get('intensity')) || 0.65));
  const duration = Math.max(12, Math.min(35, Number(params.get('duration')) || 22)) / 1000;

  document.documentElement.style.cssText = 'background:transparent!important;margin:0!important;padding:0!important;width:100%!important;height:100%!important;';
  document.body.style.cssText = 'margin:0!important;padding:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important;background:transparent!important;';
  root.className = 'cinematic-overlay';
  root.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;pointer-events:none!important;';

  root.innerHTML = `
    <main class="farewell-scene" style="--farewell-intensity:${intensity};--farewell-duration:${duration}s">
      <div class="farewell-dimming"></div>
      <div class="farewell-drift"></div>
      <div class="farewell-vignette"></div>
      <div class="farewell-haze"></div>
      <div class="farewell-caption">
        <span class="farewell-overline">UMA VIDA · UMA HISTÓRIA · UMA AUSÊNCIA</span>
        <h1>${character}</h1>
        ${epitaph ? '<p>' + epitaph + '</p>' : ''}
        <span class="farewell-rule"></span>
      </div>
      <div class="farewell-endfade"></div>
      <div class="farewell-progress"></div>
    </main>
  `;
}
