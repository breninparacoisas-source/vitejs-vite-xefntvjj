import OBR, { buildEffect } from '@owlbear-rodeo/sdk';
import type { ViewportTransform } from '@owlbear-rodeo/sdk';
import './cinematic.css';

const CHANNEL = 'com.arton.engine/cinematic/v1';
const MODAL_ID = 'com.arton.engine/cinematic/scene';
type CinematicStyle = 'melancholic' | 'heroic' | 'hopeful' | 'tragic';
type FocusMode = 'center' | 'selected' | 'custom';
type Point = { x: number; y: number };
type Bounds = { min: Point; max: Point; width: number; height: number; center: Point };

type CinematicPayload = {
  version: 3;
  id: string;
  kind: 'farewell';
  character: string;
  epitaph: string;
  style: CinematicStyle;
  intensity: number;
  durationMs: number;
  focusBounds: Bounds;
  establishingBounds: Bounds;
  createdAt: number;
};

let closeTimer: number | undefined;
let activeRun = 0;

type GradeProfile = {
  tint: { x: number; y: number; z: number };
  saturation: number;
  grade: number;
  glow: number;
  vignette: number;
  bars: number;
  particles: number;
  grain: number;
  flash: number;
};

const GRADE_PROFILES: Record<CinematicStyle, GradeProfile> = {
  melancholic: {
    tint: { x: 0.72, y: 0.82, z: 1.0 }, saturation: 0.58, grade: 0.28,
    glow: 0.07, vignette: 0.42, bars: 0.92, particles: 0.34, grain: 0.035, flash: 0.025,
  },
  heroic: {
    tint: { x: 1.0, y: 0.76, z: 0.43 }, saturation: 1.12, grade: 0.22,
    glow: 0.25, vignette: 0.25, bars: 0.88, particles: 0.9, grain: 0.025, flash: 0.16,
  },
  hopeful: {
    tint: { x: 1.0, y: 0.9, z: 0.65 }, saturation: 1.08, grade: 0.18,
    glow: 0.32, vignette: 0.18, bars: 0.82, particles: 0.72, grain: 0.02, flash: 0.12,
  },
  tragic: {
    tint: { x: 0.92, y: 0.43, z: 0.39 }, saturation: 0.48, grade: 0.4,
    glow: 0.025, vignette: 0.56, bars: 1.0, particles: 0.82, grain: 0.055, flash: 0.07,
  },
};

const CINEMATIC_SHADER = `
uniform shader scene;
uniform vec2 size;
uniform float time;
uniform float startTime;
uniform float duration;
uniform vec2 focus;
uniform vec3 tint;
uniform float saturation;
uniform float grade;
uniform float glow;
uniform float vignette;
uniform float bars;
uniform float particles;
uniform float grain;
uniform float flash;

half4 main(float2 coord) {
  vec2 uv = coord / size;
  half4 source = scene.eval(coord);
  float phase = clamp((time - startTime) / duration, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.10, phase);
  float fadeOut = 1.0 - smoothstep(0.88, 1.0, phase);
  float envelope = fadeIn * fadeOut;

  vec3 color = source.rgb;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, saturation);
  color = mix(color, color * tint, grade);

  vec2 centered = uv - focus;
  float distanceToFocus = length(centered * vec2(1.0, 0.82));
  float focusLight = 1.0 - smoothstep(0.12, 0.82, distanceToFocus);
  float breathing = 0.92 + 0.08 * sin(time * 1.15);
  color += tint * focusLight * glow * breathing;

  float edge = length((uv - vec2(0.5, 0.5)) * vec2(1.0, 0.84));
  float edgeShade = smoothstep(0.28, 0.82, edge);
  color *= 1.0 - edgeShade * vignette;

  float edgeY = min(uv.y, 1.0 - uv.y);
  float letterbox = 1.0 - smoothstep(0.052, 0.078, edgeY);
  color = mix(color, vec3(0.0), letterbox * bars);

  vec2 grid = uv * vec2(19.0, 11.0);
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  vec2 mote = vec2(fract(seed * 17.13), fract(seed * 31.71 + time * (0.018 + seed * 0.025)));
  float moteDistance = length((local - mote) * vec2(1.0, 1.55));
  float moteShape = 1.0 - smoothstep(0.012, 0.045, moteDistance);
  float moteVisibility = step(0.84, seed) * particles * (0.55 + 0.45 * sin(time * 1.7 + seed * 19.0));
  color += tint * moteShape * moteVisibility * 0.52;

  float noise = fract(sin(dot(coord + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color += vec3(noise * grain);

  float openingFlash = exp(-pow((phase - 0.115) * 34.0, 2.0)) * flash;
  color = mix(color, vec3(1.0), openingFlash);

  return half4(mix(source.rgb, color, envelope), source.a);
}
`;

async function addCinematicGrade(style: CinematicStyle, intensity: number, durationMs: number): Promise<string | undefined> {
  const profile = GRADE_PROFILES[style];
  const effect = buildEffect()
    .effectType('VIEWPORT')
    .layer('POST_PROCESS')
    .locked(true)
    .disableHit(true)
    .sksl(CINEMATIC_SHADER)
    .uniforms([
      { name: 'startTime', value: Date.now() / 1000 },
      { name: 'duration', value: durationMs / 1000 },
      { name: 'focus', value: { x: 0.5, y: 0.44 } },
      { name: 'tint', value: profile.tint },
      { name: 'saturation', value: profile.saturation },
      { name: 'grade', value: profile.grade * intensity },
      { name: 'glow', value: profile.glow * intensity },
      { name: 'vignette', value: profile.vignette * intensity },
      { name: 'bars', value: profile.bars },
      { name: 'particles', value: profile.particles * intensity },
      { name: 'grain', value: profile.grain * intensity },
      { name: 'flash', value: profile.flash * intensity },
    ])
    .build();

  try {
    await OBR.scene.local.addItems([effect]);
    return effect.id;
  } catch (error) {
    console.error('Não foi possível aplicar a gradação cinematográfica:', error);
    return undefined;
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function isStyle(value: unknown): value is CinematicStyle {
  return value === 'melancholic' || value === 'heroic' || value === 'hopeful' || value === 'tragic';
}

function isBounds(value: unknown): value is Bounds {
  if (!value || typeof value !== 'object') return false;
  const b = value as Bounds;
  return !!b.min && !!b.max && !!b.center
    && [b.min.x, b.min.y, b.max.x, b.max.y, b.width, b.height, b.center.x, b.center.y].every(Number.isFinite)
    && b.width > 0 && b.height > 0;
}

function validPayload(value: unknown): value is CinematicPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<CinematicPayload>;
  return data.version === 3 && data.kind === 'farewell'
    && typeof data.id === 'string'
    && typeof data.character === 'string'
    && typeof data.epitaph === 'string'
    && isStyle(data.style)
    && typeof data.intensity === 'number' && Number.isFinite(data.intensity)
    && typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
    && isBounds(data.focusBounds) && isBounds(data.establishingBounds)
    && typeof data.createdAt === 'number'
    && Date.now() - data.createdAt < 60_000 && data.createdAt <= Date.now() + 5_000;
}

function expandBounds(bounds: Bounds, factor: number, minimumWidth = 0, minimumHeight = 0): Bounds {
  const width = Math.max(bounds.width * factor, minimumWidth);
  const height = Math.max(bounds.height * factor, minimumHeight);
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    min: { x: bounds.center.x - halfW, y: bounds.center.y - halfH },
    max: { x: bounds.center.x + halfW, y: bounds.center.y + halfH },
    width, height, center: bounds.center,
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const min = { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y) };
  const max = { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y) };
  const width = Math.max(1, max.x - min.x);
  const height = Math.max(1, max.y - min.y);
  return { min, max, width, height, center: { x: min.x + width / 2, y: min.y + height / 2 } };
}

async function runCameraSequence(payload: CinematicPayload, runId: number): Promise<void> {
  let original: ViewportTransform | undefined;
  let gradeId: string | undefined;
  try {
    const [position, scale] = await Promise.all([OBR.viewport.getPosition(), OBR.viewport.getScale()]);
    original = { position, scale };
    if (runId !== activeRun) return;

    // O tratamento é um shader POST_PROCESS local: atua sobre a imagem do mapa,
    // não é apenas um painel HTML sobreposto.
    gradeId = await addCinematicGrade(payload.style, payload.intensity, payload.durationMs);
    if (runId !== activeRun) return;

    // Ato I: o mundo perde saturação, surgem barras de cinema e a luz começa a se concentrar.
    await OBR.viewport.animateToBounds(payload.establishingBounds);
    if (runId !== activeRun) return;
    await wait(1700);

    // Ato II: a câmera se aproxima enquanto o shader cria foco de luz e partículas atmosféricas.
    await OBR.viewport.animateToBounds(payload.focusBounds);
    if (runId !== activeRun) return;

    // Ato III: segura o plano para o momento emocional.
    const revealHold = payload.style === 'tragic' ? 1500 : payload.style === 'heroic' ? 2100 : 1800;
    const focusHold = Math.max(2200, payload.durationMs - 7200 - revealHold);
    await wait(focusHold);
    if (runId !== activeRun) return;

    // Ato IV: a luz se espalha de novo no plano de contexto.
    await OBR.viewport.animateToBounds(payload.establishingBounds);
    if (runId !== activeRun) return;
    await wait(revealHold);

    if (runId === activeRun) await OBR.viewport.animateTo(original);
  } catch (error) {
    console.error('Falha na coreografia da câmera CINEMÁTICA:', error);
    if (original && runId === activeRun) {
      try { await OBR.viewport.animateTo(original); } catch (restoreError) {
        console.error('Não foi possível restaurar a câmera:', restoreError);
      }
    }
  } finally {
    if (gradeId) {
      try { await OBR.scene.local.deleteItems([gradeId]); } catch (error) {
        console.warn('Não foi possível remover o tratamento cinematográfico:', error);
      }
    }
  }
}

async function openScene(payload: CinematicPayload): Promise<void> {
  const runId = ++activeRun;
  if (closeTimer !== undefined) window.clearTimeout(closeTimer);

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

  void runCameraSequence(payload, runId);
  closeTimer = window.setTimeout(async () => {
    if (runId !== activeRun) return;
    try { await OBR.modal.close(MODAL_ID); } catch (error) {
      console.warn('Falha ao fechar a cena CINEMÁTICA:', error);
    }
    closeTimer = undefined;
  }, payload.durationMs + 1800);
}

async function resolveFocus(root: HTMLElement, mode: FocusMode): Promise<Bounds> {
  const [viewportWidth, viewportHeight, scale, position] = await Promise.all([
    OBR.viewport.getWidth(), OBR.viewport.getHeight(),
    OBR.viewport.getScale(), OBR.viewport.getPosition(),
  ]);
  const worldWidth = viewportWidth / Math.max(scale, 0.05);
  const worldHeight = viewportHeight / Math.max(scale, 0.05);

  if (mode === 'selected') {
    const selection = await OBR.player.getSelection();
    if (!selection?.length) throw new Error('Selecione o personagem ou objeto que será o foco da cena.');
    const bounds = await OBR.scene.items.getItemBounds(selection);
    return expandBounds(bounds as Bounds, 2.8, worldWidth * 0.16, worldHeight * 0.16);
  }

  if (mode === 'custom') {
    const x = Number(root.querySelector<HTMLInputElement>('#cinematic-focus-x')?.value);
    const y = Number(root.querySelector<HTMLInputElement>('#cinematic-focus-y')?.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Informe coordenadas X e Y válidas.');
    const pointBounds: Bounds = {
      min: { x, y }, max: { x, y }, width: 1, height: 1, center: { x, y },
    };
    return expandBounds(pointBounds, 1, worldWidth * 0.22, worldHeight * 0.22);
  }

  const centerBounds: Bounds = {
    min: position, max: position, width: 1, height: 1, center: position,
  };
  return expandBounds(centerBounds, 1, worldWidth * 0.22, worldHeight * 0.22);
}

async function resolveEstablishingBounds(focusBounds: Bounds): Promise<Bounds> {
  const characters = await OBR.scene.items.getItems((item) =>
    item.visible && item.layer === 'CHARACTER'
  );
  if (!characters.length) return expandBounds(focusBounds, 2.1);

  // O plano de contexto inclui apenas companheiros próximos do foco.
  // Isso evita que tokens espalhados por outras regiões do mapa reduzam a cena inteira.
  const radiusX = Math.max(focusBounds.width * 3, 1);
  const radiusY = Math.max(focusBounds.height * 3, 1);
  const nearby = characters.filter((item) =>
    Math.abs(item.position.x - focusBounds.center.x) <= radiusX
    && Math.abs(item.position.y - focusBounds.center.y) <= radiusY
  );
  if (!nearby.length) return expandBounds(focusBounds, 2.1);

  try {
    const groupBounds = await OBR.scene.items.getItemBounds(nearby.map((item) => item.id));
    return expandBounds(unionBounds(groupBounds as Bounds, focusBounds), 1.35);
  } catch {
    return expandBounds(focusBounds, 2.1);
  }
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
      : 'O Owlbear enquadra os itens reais da cena. Cada jogador recupera sua própria visão ao final.';

  return `
    <section class="cinematic-welcome">
      <div class="cinematic-welcome-copy">
        <span class="cinematic-kicker">DIREÇÃO DE CENA · SEQUÊNCIA 02</span>
        <h3>Não é um efeito.<br><em>É um olhar dirigido.</em></h3>
        <p>A câmera conta a despedida: primeiro revela o lugar e quem está presente, depois se aproxima do foco e, por fim, mostra o que permanece.</p>
      </div>
      <div class="cinematic-preview" aria-hidden="true">
        <div class="cinematic-preview-light"></div>
        <div class="cinematic-preview-horizon"></div>
        <div class="cinematic-preview-caption">O QUE PERMANECE</div>
      </div>
    </section>

    <div class="cinematic-editor-heading">
      <div><span>01 / DESPEDIDA</span><h3>Dirigir a cena</h3></div>
      <small>PLANO DE CONTEXTO · FOCO · PLANO FINAL</small>
    </div>

    <section class="cinematic-editor cinematic-editor-v2">
      <div class="cinematic-editor-description">
        <div class="cinematic-act-list">
          <div><span>ATO I · O LUGAR</span><strong>Antes da última palavra</strong><p>A câmera abre no grupo de personagens visíveis, preservando o espaço que compartilham.</p></div>
          <div><span>ATO II · O FOCO</span><strong>O mundo se estreita</strong><p>O enquadramento se aproxima dos limites reais do personagem, objeto ou ponto escolhido.</p></div>
          <div><span>ATO III · O INSTANTE</span><strong>Deixe a cena respirar</strong><p>O tempo de permanência sustenta a emoção. O texto aparece discretamente, sem cobrir o mapa.</p></div>
          <div><span>ATO IV · O QUE FICA</span><strong>A ausência ocupa o espaço</strong><p>A câmera recua para revelar novamente o grupo e então devolve a visão original de cada jogador.</p></div>
        </div>
      </div>
      <div class="cinematic-controls">
        <label for="cinematic-character">PERSONAGEM</label>
        <input id="cinematic-character" maxlength="80" value="A última luz" placeholder="Nome do personagem">

        <label for="cinematic-epitaph">ÚLTIMAS PALAVRAS</label>
        <textarea id="cinematic-epitaph" maxlength="240" rows="3" placeholder="Uma última frase, lembrança ou despedida...">Algumas histórias não terminam quando a luz se apaga.</textarea>

        <label for="cinematic-style">TOM DA DESPEDIDA</label>
        <select id="cinematic-style">
          <option value="melancholic">Melancólica — perda e silêncio</option>
          <option value="heroic">Heroica — sacrifício e legado</option>
          <option value="hopeful">Esperançosa — partida e continuidade</option>
          <option value="tragic">Trágica — ruptura e vazio</option>
        </select>

        <label for="cinematic-focus">FOCO DA CÂMERA</label>
        <select id="cinematic-focus">
          <option value="selected">Personagem / objeto selecionado</option>
          <option value="center">Centro da visão atual</option>
          <option value="custom">Coordenadas no mapa</option>
        </select>
        <div class="cinematic-coordinate-fields">
          <input id="cinematic-focus-x" type="number" step="1" value="0" aria-label="Coordenada X" placeholder="X">
          <input id="cinematic-focus-y" type="number" step="1" value="0" aria-label="Coordenada Y" placeholder="Y">
        </div>

        <div class="cinematic-control-range">
          <label for="cinematic-intensity">VINHETA <output id="cinematic-intensity-value">24%</output></label>
          <input id="cinematic-intensity" type="range" min="0.08" max="0.42" step="0.02" value="0.24">
          <small>Tratamento discreto nas bordas. O mapa continua sendo o protagonista.</small>
        </div>
        <div class="cinematic-control-range">
          <label for="cinematic-duration">DURAÇÃO <output id="cinematic-duration-value">24 s</output></label>
          <input id="cinematic-duration" type="range" min="16" max="40" step="1" value="24">
          <small>Controla o tempo de permanência entre a aproximação e o plano final.</small>
        </div>
        <button class="cinematic-launch" data-cinematic-launch="farewell" ${disabled}>INICIAR DESPEDIDA</button>
        <p class="cinematic-status">${status}</p>
      </div>
    </section>
    <p class="cinematic-footnote">A coreografia usa os limites dos itens existentes na cena. Nenhum token ou dado da campanha é alterado.</p>
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
      const focusMode = (focusSelect?.value || 'selected') as FocusMode;
      const focusBounds = await resolveFocus(root, focusMode);
      const establishingBounds = await resolveEstablishingBounds(focusBounds);
      const payload: CinematicPayload = {
        version: 3,
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
        kind: 'farewell',
        character: character.slice(0, 80),
        epitaph: epitaph.slice(0, 240),
        style: (root.querySelector<HTMLSelectElement>('#cinematic-style')?.value || 'melancholic') as CinematicStyle,
        intensity: Math.max(0.08, Math.min(0.42, Number(intensity?.value) || 0.24)),
        durationMs: Math.max(16, Math.min(40, Number(duration?.value) || 24)) * 1000,
        focusBounds,
        establishingBounds,
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
  const intensity = Math.max(0.08, Math.min(0.42, Number(params.get('intensity')) || 0.24));
  const duration = Math.max(16, Math.min(40, Number(params.get('duration')) || 24)) / 1000;

  document.documentElement.style.cssText = 'margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  document.body.classList.add('cinematic-mode');
  document.body.style.cssText = 'margin:0!important;padding:0!important;min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  root.className = 'cinematic-overlay';
  root.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;pointer-events:none!important;';
  root.innerHTML = `
    <main class="farewell-scene farewell-${style}" style="--farewell-intensity:${intensity};--farewell-duration:${duration}s">
      <div class="farewell-vignette"></div>
      <div class="farewell-caption">
        <span class="farewell-overline">UMA VIDA · UMA HISTÓRIA · UMA AUSÊNCIA</span>
        <h1>${character}</h1>
        ${epitaph ? '<p>' + epitaph + '</p>' : ''}
        <span class="farewell-rule"></span>
      </div>
    </main>
  `;
}
