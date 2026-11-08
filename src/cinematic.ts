import OBR, { buildEffect } from '@owlbear-rodeo/sdk';
import type { ViewportTransform } from '@owlbear-rodeo/sdk';
import './cinematic.css';

const CHANNEL = 'com.arton.engine/cinematic/v1';
const MODAL_ID = 'com.arton.engine/cinematic/scene';
type CinematicStyle = 'melancholic' | 'heroic' | 'hopeful' | 'tragic';
type FocusMode = 'center' | 'selected' | 'custom';

type CinematicPayload = {
  version: 2;
  id: string;
  kind: 'farewell';
  character: string;
  epitaph: string;
  style: CinematicStyle;
  intensity: number;
  durationMs: number;
  focus: { x: number; y: number };
  createdAt: number;
};

let closeTimer: number | undefined;
let activeRun = 0;
let activeEffectId: string | undefined;
let previousTransform: ViewportTransform | undefined;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function isStyle(value: unknown): value is CinematicStyle {
  return value === 'melancholic' || value === 'heroic' || value === 'hopeful' || value === 'tragic';
}

function validPayload(value: unknown): value is CinematicPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<CinematicPayload>;
  return data.version === 2 && data.kind === 'farewell'
    && typeof data.id === 'string'
    && typeof data.character === 'string'
    && typeof data.epitaph === 'string'
    && isStyle(data.style)
    && typeof data.intensity === 'number' && Number.isFinite(data.intensity)
    && typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
    && !!data.focus && Number.isFinite(data.focus.x) && Number.isFinite(data.focus.y)
    && typeof data.createdAt === 'number'
    && Date.now() - data.createdAt < 60_000 && data.createdAt <= Date.now() + 5_000;
}

function shaderForStyle(style: CinematicStyle, intensity: number) {
  const tints: Record<CinematicStyle, { x: number; y: number; z: number }> = {
    melancholic: { x: 0.24, y: 0.29, z: 0.38 },
    heroic: { x: 0.46, y: 0.31, z: 0.12 },
    hopeful: { x: 0.43, y: 0.39, z: 0.22 },
    tragic: { x: 0.30, y: 0.08, z: 0.09 },
  };
  const effect = buildEffect()
    .name('ARTON ENGINE · CINEMÁTICO')
    .effectType('VIEWPORT')
    .sksl(`
      uniform vec2 size;
      uniform mat3 view;
      uniform vec3 tint;
      uniform float strength;
      half4 main(float2 coord) {
        vec2 viewCoord = (vec3(coord, 1) * view).xy;
        vec2 p = viewCoord / size;
        p = p * 2.0 - 1.0;
        float edge = smoothstep(0.18, 1.25, length(p));
        float veil = smoothstep(0.95, 0.18, length(p)) * 0.10;
        float alpha = clamp(edge * strength * 0.36 + veil * strength, 0.0, 0.42);
        return half4(tint, alpha);
      }
    `)
    .uniforms([
      { name: 'tint', value: tints[style] },
      { name: 'strength', value: intensity },
    ])
    .locked(true)
    .disableHit(true)
    .build();
  return effect;
}

async function applySceneEffect(payload: CinematicPayload, runId: number): Promise<void> {
  try {
    const effect = shaderForStyle(payload.style, payload.intensity);
    activeEffectId = effect.id;
    await OBR.scene.local.addItems([effect]);
    if (runId !== activeRun) {
      await OBR.scene.local.deleteItems([effect.id]).catch(() => undefined);
    }
  } catch (error) {
    activeEffectId = undefined;
    console.warn('Shader CINEMÁTICO indisponível nesta sessão; mantendo a direção de câmera e a composição:', error);
  }
}

async function runCameraSequence(payload: CinematicPayload, runId: number): Promise<void> {
  let original: ViewportTransform | undefined;
  try {
    const [position, scale] = await Promise.all([OBR.viewport.getPosition(), OBR.viewport.getScale()]);
    original = { position, scale };
    if (runId !== activeRun) return;
    previousTransform = original;

    const styleZoom: Record<CinematicStyle, number> = {
      melancholic: 1.48, heroic: 1.62, hopeful: 1.42, tragic: 1.72,
    };
    const closeScale = Math.min(3.5, Math.max(0.15, scale * styleZoom[payload.style]));
    const openingScale = Math.min(3.0, Math.max(0.15, scale * 1.12));

    // A câmera primeiro abandona o enquadramento original e conduz o olhar ao foco.
    await OBR.viewport.animateTo({ position: payload.focus, scale: openingScale });
    if (runId !== activeRun) return;
    await wait(450);
    await OBR.viewport.animateTo({ position: payload.focus, scale: closeScale });
    if (runId !== activeRun) return;

    const holdMs = Math.max(2500, payload.durationMs - 8500);
    if (payload.style === 'tragic') {
      await wait(Math.min(1200, holdMs * 0.18));
      if (runId !== activeRun) return;
      await OBR.viewport.animateTo({
        position: { x: payload.focus.x + (original.position.x - payload.focus.x) * 0.08, y: payload.focus.y + (original.position.y - payload.focus.y) * 0.08 },
        scale: closeScale * 0.96,
      });
      await wait(Math.max(0, holdMs - 1200));
    } else {
      await wait(holdMs);
    }
    if (runId !== activeRun) return;

    // O retorno usa o transform individual salvo no início, sem resetar a visão do jogador.
    await OBR.viewport.animateTo(original);
  } catch (error) {
    console.error('Falha na coreografia da câmera CINEMÁTICA:', error);
    if (original && runId === activeRun) {
      try { await OBR.viewport.animateTo(original); } catch (restoreError) {
        console.error('Não foi possível restaurar a câmera:', restoreError);
      }
    }
  } finally {
    if (runId === activeRun) previousTransform = undefined;
  }
}

async function openScene(payload: CinematicPayload): Promise<void> {
  const runId = ++activeRun;
  if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  if (activeEffectId) {
    await OBR.scene.local.deleteItems([activeEffectId]).catch(() => undefined);
    activeEffectId = undefined;
  }

  const url = new URL('/', window.location.origin);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('sceneId', payload.id);
  url.searchParams.set('character', payload.character.slice(0, 80));
  url.searchParams.set('epitaph', payload.epitaph.slice(0, 240));
  url.searchParams.set('style', payload.style);
  url.searchParams.set('intensity', String(payload.intensity));
  url.searchParams.set('duration', String(payload.durationMs));

  try { await OBR.modal.close(MODAL_ID); } catch { /* Cena anterior inexistente. */ }
  await OBR.modal.open({
    id: MODAL_ID, url: url.toString(), fullScreen: true,
    hideBackdrop: true, hidePaper: true, disablePointerEvents: true,
  });

  void applySceneEffect(payload, runId);
  void runCameraSequence(payload, runId);

  closeTimer = window.setTimeout(async () => {
    if (runId !== activeRun) return;
    try { await OBR.modal.close(MODAL_ID); } catch (error) {
      console.warn('Falha ao fechar a cena CINEMÁTICA:', error);
    }
    if (activeEffectId) {
      await OBR.scene.local.deleteItems([activeEffectId]).catch((error) => {
        console.warn('Falha ao remover shader CINEMÁTICO:', error);
      });
      activeEffectId = undefined;
    }
    closeTimer = undefined;
  }, payload.durationMs + 500);
}

async function resolveFocus(root: HTMLElement, mode: FocusMode): Promise<{ x: number; y: number }> {
  if (mode === 'custom') {
    const x = Number(root.querySelector<HTMLInputElement>('#cinematic-focus-x')?.value);
    const y = Number(root.querySelector<HTMLInputElement>('#cinematic-focus-y')?.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Informe coordenadas X e Y válidas.');
    return { x, y };
  }
  if (mode === 'selected') {
    const selection = await OBR.player.getSelection();
    if (!selection?.length) throw new Error('Selecione ao menos um personagem ou objeto no mapa.');
    const items = await OBR.scene.items.getItems(selection);
    if (!items.length) throw new Error('Não encontrei os elementos selecionados na cena.');
    return {
      x: items.reduce((sum, item) => sum + item.position.x, 0) / items.length,
      y: items.reduce((sum, item) => sum + item.position.y, 0) / items.length,
    };
  }
  return OBR.viewport.getPosition();
}

export function initializeCinematicBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    void openScene(event.data).catch((error) => {
      console.error('Falha ao iniciar CINEMÁTICO:', error);
    });
  });
  console.log('ARTON ENGINE: direção de cena CINEMÁTICA ativa.');
}

export function renderCinematicPanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const status = !connected
    ? 'Conecte a extensão a uma sala do Owlbear para conduzir a cena.'
    : !isGM
      ? 'Somente o mestre pode conduzir uma cena cinematográfica.'
      : 'A câmera e o tratamento visual serão executados individualmente para cada participante.';

  return `
    <section class="cinematic-welcome">
      <div class="cinematic-welcome-copy">
        <span class="cinematic-kicker">DIREÇÃO DE CENA · SEQUÊNCIA 01</span>
        <h3>O mapa também conta<br><em>o último adeus.</em></h3>
        <p>Uma coreografia de câmera em quatro tempos: aproximação, foco, permanência e retorno. O enquadramento original de cada jogador é restaurado no encerramento.</p>
      </div>
      <div class="cinematic-preview" aria-hidden="true">
        <div class="cinematic-preview-light"></div>
        <div class="cinematic-preview-horizon"></div>
        <div class="cinematic-preview-caption">O ÚLTIMO ADEUS</div>
      </div>
    </section>

    <div class="cinematic-editor-heading">
      <div><span>01 / DESPEDIDA</span><h3>Dirigir a cena</h3></div>
      <small>CÂMERA · ATMOSFERA · RITMO</small>
    </div>

    <section class="cinematic-editor cinematic-editor-v2">
      <div class="cinematic-editor-description">
        <div class="cinematic-act-list">
          <div><span>ATO I · APROXIMAÇÃO</span><strong>O mundo se recolhe</strong><p>A câmera deixa o enquadramento atual e conduz o olhar ao ponto escolhido.</p></div>
          <div><span>ATO II · FOCO</span><strong>O instante permanece</strong><p>O enquadramento fecha no personagem; a atmosfera é aplicada diretamente à viewport.</p></div>
          <div><span>ATO III · DESPEDIDA</span><strong>O significado da perda</strong><p>O tratamento visual muda conforme o tom emocional da cena.</p></div>
          <div><span>ATO IV · RETORNO</span><strong>O mundo continua</strong><p>Câmera, shader e composição são retirados ao final.</p></div>
        </div>
      </div>
      <div class="cinematic-controls">
        <label for="cinematic-character">PERSONAGEM</label>
        <input id="cinematic-character" maxlength="80" value="A última luz" placeholder="Nome do personagem">

        <label for="cinematic-epitaph">ÚLTIMAS PALAVRAS</label>
        <textarea id="cinematic-epitaph" maxlength="240" rows="3" placeholder="Uma última frase, lembrança ou despedida...">Algumas histórias não terminam quando a luz se apaga.</textarea>

        <label for="cinematic-style">TOM DA DESPEDIDA</label>
        <select id="cinematic-style">
          <option value="melancholic">Melancólica — perda, silêncio e luz fria</option>
          <option value="heroic">Heroica — sacrifício e encerramento grandioso</option>
          <option value="hopeful">Esperançosa — partida e continuidade</option>
          <option value="tragic">Trágica — tensão e ruptura abrupta</option>
        </select>

        <label for="cinematic-focus">PONTO FOCAL DA CÂMERA</label>
        <select id="cinematic-focus">
          <option value="center">Centro da visão atual</option>
          <option value="selected">Personagem / objeto selecionado</option>
          <option value="custom">Coordenadas no mapa</option>
        </select>
        <div class="cinematic-coordinate-fields">
          <input id="cinematic-focus-x" type="number" step="1" value="0" aria-label="Coordenada X" placeholder="X">
          <input id="cinematic-focus-y" type="number" step="1" value="0" aria-label="Coordenada Y" placeholder="Y">
        </div>

        <div class="cinematic-control-range">
          <label for="cinematic-intensity">INTENSIDADE <output id="cinematic-intensity-value">65%</output></label>
          <input id="cinematic-intensity" type="range" min="0.25" max="0.85" step="0.05" value="0.65">
          <small>Controla a presença do tratamento gráfico na viewport.</small>
        </div>
        <div class="cinematic-control-range">
          <label for="cinematic-duration">DURAÇÃO <output id="cinematic-duration-value">24 s</output></label>
          <input id="cinematic-duration" type="range" min="16" max="40" step="1" value="24">
          <small>Inclui aproximação, permanência e retorno da câmera.</small>
        </div>
        <button class="cinematic-launch" data-cinematic-launch="farewell" ${disabled}>INICIAR DESPEDIDA</button>
        <p class="cinematic-status">${status}</p>
      </div>
    </section>
    <p class="cinematic-footnote">A câmera é controlada localmente em cada cliente. Nenhum token ou dado da campanha é alterado.</p>
  `;
}

export function bindCinematicActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  const intensity = root.querySelector<HTMLInputElement>('#cinematic-intensity');
  const duration = root.querySelector<HTMLInputElement>('#cinematic-duration');
  const intensityOutput = root.querySelector<HTMLOutputElement>('#cinematic-intensity-value');
  const durationOutput = root.querySelector<HTMLOutputElement>('#cinematic-duration-value');
  const focusSelect = root.querySelector<HTMLSelectElement>('#cinematic-focus');
  const coordinateFields = root.querySelector<HTMLElement>('.cinematic-coordinate-fields');

  intensity?.addEventListener('input', () => {
    if (intensityOutput) intensityOutput.textContent = Math.round(Number(intensity.value) * 100) + '%';
  });
  duration?.addEventListener('input', () => {
    if (durationOutput) durationOutput.textContent = duration.value + ' s';
  });
  focusSelect?.addEventListener('change', () => {
    if (coordinateFields) coordinateFields.hidden = focusSelect.value !== 'custom';
  });
  if (coordinateFields) coordinateFields.hidden = focusSelect?.value !== 'custom';

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

    const button = root.querySelector<HTMLButtonElement>('[data-cinematic-launch="farewell"]');
    if (button) button.disabled = true;
    try {
      const focusMode = (focusSelect?.value || 'center') as FocusMode;
      const focus = await resolveFocus(root, focusMode);
      const payload: CinematicPayload = {
        version: 2,
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
        kind: 'farewell',
        character: character.slice(0, 80),
        epitaph: epitaph.slice(0, 240),
        style: (root.querySelector<HTMLSelectElement>('#cinematic-style')?.value || 'melancholic') as CinematicStyle,
        intensity: Math.max(0.25, Math.min(0.85, Number(intensity?.value) || 0.65)),
        durationMs: Math.max(16, Math.min(40, Number(duration?.value) || 24)) * 1000,
        focus,
        createdAt: Date.now(),
      };
      await openScene(payload);
      await OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
      OBR.notification.show('Direção CINEMÁTICA enviada à sala.');
    } catch (error) {
      console.error('Erro ao iniciar CINEMÁTICO:', error);
      OBR.notification.show(error instanceof Error ? error.message : 'Não foi possível iniciar a cena.');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

export function renderCinematicOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const character = escapeHtml((params.get('character') || 'Uma despedida').slice(0, 80));
  const epitaph = escapeHtml((params.get('epitaph') || '').slice(0, 240));
  const style = isStyle(params.get('style')) ? params.get('style') as CinematicStyle : 'melancholic';
  const intensity = Math.max(0.25, Math.min(0.85, Number(params.get('intensity')) || 0.65));
  const duration = Math.max(16, Math.min(40, Number(params.get('duration')) || 24)) / 1000;

  document.documentElement.style.cssText = 'margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  document.body.classList.add('cinematic-mode');
  document.body.style.cssText = 'margin:0!important;padding:0!important;min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  root.className = 'cinematic-overlay';
  root.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;pointer-events:none!important;';
  root.innerHTML = `
    <main class="farewell-scene farewell-${style}" style="--farewell-intensity:${intensity};--farewell-duration:${duration}s">
      <div class="farewell-camera">
        <div class="farewell-light-beam"></div><div class="farewell-haze"></div><div class="farewell-horizon"></div>
      </div>
      <div class="farewell-vignette"></div>
      <div class="farewell-caption">
        <span class="farewell-overline">UMA VIDA · UMA HISTÓRIA · UMA AUSÊNCIA</span>
        <h1>${character}</h1>
        ${epitaph ? '<p>' + epitaph + '</p>' : ''}
        <span class="farewell-rule"></span>
      </div>
      <div class="farewell-progress"></div>
    </main>
  `;
}
