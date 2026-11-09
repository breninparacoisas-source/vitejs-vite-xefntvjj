import OBR, { buildShape } from '@owlbear-rodeo/sdk';
import './false-ascendido.css';

const METADATA_KEY = 'com.arton.engine/falso-ascendido/v1';
const SCENE_METADATA_KEY = 'com.arton.engine/falso-ascendido/local/v1';
const SCENE_EFFECTS_KEY = 'com.arton.engine/falso-ascendido/effects/v1';

type FAVisualKind = 'mist' | 'shadow' | 'abyss' | 'fracture';
type FAVisualPayload = { version: 1; id: string; kind: FAVisualKind; intensity: number; durationMs: number; createdAt: number };
const FA_VISUAL_CHANNEL = 'com.arton.engine/falso-ascendido/manifestation/v1';
const FA_VISUAL_MODAL = 'com.arton.engine/falso-ascendido/manifestation-overlay';
let faVisualTimer: number | undefined;

async function openFalsoAscendidoVisual(payload: FAVisualPayload): Promise<void> {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('falsoAscendido', '1');
  url.searchParams.set('kind', payload.kind);
  url.searchParams.set('effectId', payload.id);
  url.searchParams.set('intensity', String(payload.intensity));
  url.searchParams.set('duration', String(payload.durationMs));
  try { await OBR.modal.close(FA_VISUAL_MODAL); } catch { /* Sem efeito anterior. */ }
  await OBR.modal.open({
    id: FA_VISUAL_MODAL, url: url.toString(), fullScreen: true,
    hideBackdrop: true, hidePaper: true, disablePointerEvents: true,
  });
  if (faVisualTimer !== undefined) window.clearTimeout(faVisualTimer);
  faVisualTimer = window.setTimeout(() => {
    void OBR.modal.close(FA_VISUAL_MODAL).catch(() => undefined);
    faVisualTimer = undefined;
  }, payload.durationMs);
}

function validFAVisual(value: unknown): value is FAVisualPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<FAVisualPayload>;
  return p.version === 1 && typeof p.id === 'string'
    && ['mist', 'shadow', 'abyss', 'fracture'].includes(p.kind || '')
    && typeof p.intensity === 'number' && p.intensity >= 0.15 && p.intensity <= 1
    && typeof p.durationMs === 'number' && p.durationMs >= 5000 && p.durationMs <= 45000
    && typeof p.createdAt === 'number' && Date.now() - p.createdAt < 60000;
}

export function initializeFalseAscendidoVisuals(): void {
  OBR.broadcast.onMessage(FA_VISUAL_CHANNEL, (event) => {
    if (!validFAVisual(event.data)) return;
    void openFalsoAscendidoVisual(event.data).catch((error) => console.error('Falha na manifestação do Falso Ascendido:', error));
  });
}

async function triggerFalsoAscendidoVisual(kind: FAVisualKind, intensity: number, durationSeconds: number): Promise<void> {
  if (!connected || !isGM) {
    OBR.notification.show('Somente o mestre pode despertar uma manifestação.');
    return;
  }
  const payload: FAVisualPayload = {
    version: 1, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    kind, intensity: Math.max(0.15, Math.min(1, intensity)),
    durationMs: Math.max(5, Math.min(45, durationSeconds)) * 1000, createdAt: Date.now(),
  };
  try {
    await openFalsoAscendidoVisual(payload);
    await OBR.broadcast.sendMessage(FA_VISUAL_CHANNEL, payload, { destination: 'REMOTE' });
  } catch (error) {
    console.error('Erro ao despertar manifestação do Falso Ascendido:', error);
    OBR.notification.show('A manifestação não conseguiu atravessar a cena.');
  }
}

export function renderFalsoAscendidoOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const kind = (['mist', 'shadow', 'abyss', 'fracture'].includes(params.get('kind') || '') ? params.get('kind') : 'mist') as FAVisualKind;
  const intensity = Math.max(0.15, Math.min(1, Number(params.get('intensity')) || 0.65));
  const effectId = params.get('effectId') || 'vestigio';
  let seed = 0;
  for (let i = 0; i < effectId.length; i++) seed = (seed * 31 + effectId.charCodeAt(i)) >>> 0;
  const x = 18 + seed % 64;
  const y = 16 + (seed >>> 8) % 68;
  document.documentElement.style.cssText = 'background:transparent!important;margin:0!important;padding:0!important;';
  document.body.style.cssText = 'margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  root.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;';
  root.innerHTML = '<main class="fa-cinema fa-cinema-' + kind + '" style="--fa-force:' + intensity + ';--fa-origin-x:' + x + '%;--fa-origin-y:' + y + '%">'
    + '<div class="fa-cinema-depth"></div><div class="fa-cinema-fog fa-cinema-fog-a"></div><div class="fa-cinema-fog fa-cinema-fog-b"></div>'
    + '<div class="fa-cinema-shadow"></div><div class="fa-cinema-silhouette"></div><div class="fa-cinema-fracture"></div>'
    + '<div class="fa-cinema-grain"></div><div class="fa-cinema-vignette"></div></main>';
}

const STAGES = [
  { name: 'Vestígios', description: 'Sinais isolados de algo que não deveria existir.' },
  { name: 'Ressonância', description: 'Os vestígios começam a se conectar.' },
  { name: 'Interferência', description: 'A influência começa a tocar acontecimentos, lugares e pessoas.' },
  { name: 'Manifestação', description: 'A realidade apresenta sinais claros de uma presença atuante.' },
  { name: 'Convergência', description: 'Os planos alcançam um ponto decisivo.' },
] as const;
const LOCAL_LEVELS = [
  'Nenhuma manifestação',
  'Sinais sutis',
  'Anomalias',
  'Interferências perceptíveis',
  'Alterações intensas',
  'Manifestação extraordinária',
] as const;

type ChronicleEntry = {
  id: string;
  title: string;
  description: string;
  impact: number;
  date: string;
};
type LocalInfluence = { level: number; note: string; updatedAt: string };
type InfluenceState = {
  version: 1;
  globalStage: number;
  globalNote: string;
  local: Record<string, LocalInfluence>;
  history: ChronicleEntry[];
  updatedAt: string;
};

const DEFAULT_STATE: InfluenceState = {
  version: 1,
  globalStage: 0,
  globalNote: '',
  local: {},
  history: [],
  updatedAt: new Date(0).toISOString(),
};
let state: InfluenceState = structuredClone(DEFAULT_STATE);
let currentSceneLabel = 'Cena atual';
let local: LocalInfluence = { level: 0, note: '', updatedAt: new Date(0).toISOString() };
let connected = false;
let isGM = false;
let initialized = false;
let saving = false;
let sceneEffectIds: string[] = [];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function normalizeState(value: unknown): InfluenceState {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_STATE);
  const raw = value as Partial<InfluenceState>;
  const local: Record<string, LocalInfluence> = {};
  if (raw.local && typeof raw.local === 'object') {
    for (const [key, item] of Object.entries(raw.local)) {
      if (!item || typeof item !== 'object') continue;
      local[key] = {
        level: clamp(Number(item.level) || 0, 0, 5),
        note: typeof item.note === 'string' ? item.note.slice(0, 500) : '',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      };
    }
  }
  const history = Array.isArray(raw.history) ? raw.history
    .filter((entry): entry is ChronicleEntry => !!entry && typeof entry === 'object'
      && typeof entry.id === 'string' && typeof entry.title === 'string'
      && typeof entry.description === 'string' && typeof entry.date === 'string'
      && typeof entry.impact === 'number')
    .slice(-100).map((entry) => ({
      id: entry.id, title: entry.title.slice(0, 100),
      description: entry.description.slice(0, 500),
      impact: clamp(entry.impact, -2, 2), date: entry.date,
    })) : [];
  return {
    version: 1,
    globalStage: clamp(Number(raw.globalStage) || 0, 0, 5),
    globalNote: typeof raw.globalNote === 'string' ? raw.globalNote.slice(0, 500) : '',
    local, history,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}
function localState(): LocalInfluence { return local; }
function normalizeLocal(value: unknown): LocalInfluence {
  if (!value || typeof value !== 'object') return { level: 0, note: '', updatedAt: new Date(0).toISOString() };
  const item = value as Partial<LocalInfluence>;
  return { level: clamp(Number(item.level) || 0, 0, 5), note: typeof item.note === 'string' ? item.note.slice(0, 500) : '', updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString() };
}
function stageName(stage: number): string {
  return stage === 0 ? 'Adormecida' : STAGES[clamp(stage, 1, 5) - 1].name;
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data desconhecida' : date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function stageDescription(stage: number): string {
  return stage === 0 ? 'Nenhum avanço foi registrado. O mestre determina quando os planos se movem.'
    : STAGES[clamp(stage, 1, 5) - 1].description;
}

export async function initializeFalseAscendido(master: boolean): Promise<void> {
  isGM = master;
  connected = true;
  if (initialized || !master) return;
  initialized = true;
  try {
    const [roomMetadata, sceneMetadata] = await Promise.all([
      OBR.room.getMetadata(),
      OBR.scene.getMetadata(),
    ]);
    state = normalizeState(roomMetadata[METADATA_KEY]);
    local = normalizeLocal(sceneMetadata[SCENE_METADATA_KEY]);
    sceneEffectIds = Array.isArray(sceneMetadata[SCENE_EFFECTS_KEY]) ? (sceneMetadata[SCENE_EFFECTS_KEY] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
    currentSceneLabel = 'Cena aberta no Owlbear';
    OBR.room.onMetadataChange((updated) => {
      state = normalizeState(updated[METADATA_KEY]);
      renderIntoPage();
    });
    OBR.scene.onMetadataChange((updated) => {
      local = normalizeLocal(updated[SCENE_METADATA_KEY]);
      renderIntoPage();
    });
    OBR.scene.onReadyChange(async (ready) => {
      if (!ready) return;
      try {
        const metadata = await OBR.scene.getMetadata();
        local = normalizeLocal(metadata[SCENE_METADATA_KEY]);
        sceneEffectIds = Array.isArray(metadata[SCENE_EFFECTS_KEY]) ? (metadata[SCENE_EFFECTS_KEY] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
        renderIntoPage();
      } catch (error) {
        console.warn('Não foi possível carregar a influência local:', error);
      }
    });
  } catch (error) {
    console.error('Falha ao carregar o registro do Falso Ascendido:', error);
    initialized = false;
  }
}

async function persistLocal(next: LocalInfluence): Promise<void> {
  if (!connected || !isGM || saving) return;
  saving = true;
  try {
    await OBR.scene.setMetadata({ [SCENE_METADATA_KEY]: next });
    local = normalizeLocal(next);
    OBR.notification.show('Manifestação desta cena atualizada.');
  } catch (error) {
    console.error('Falha ao salvar influência local:', error);
    OBR.notification.show('Não foi possível salvar a manifestação desta cena.');
  } finally {
    saving = false;
    renderIntoPage();
  }
}
async function persist(next: InfluenceState): Promise<void> {
  if (!connected || !isGM || saving) return;
  saving = true;
  try {
    next.updatedAt = new Date().toISOString();
    await OBR.room.setMetadata({ [METADATA_KEY]: next });
    state = normalizeState(next);
    OBR.notification.show('Registro do Falso Ascendido atualizado.');
  } catch (error) {
    console.error('Falha ao salvar influência:', error);
    OBR.notification.show('Não foi possível salvar as alterações.');
  } finally {
    saving = false;
    renderIntoPage();
  }
}
async function createInfluenceZone(): Promise<void> {
  if (!connected || !isGM) return;
  try {
    const position = await OBR.viewport.getPosition();
    const zone = buildShape().name('Falso Ascendido — Área de influência')
      .shapeType('CIRCLE').width(420).height(420)
      .fillColor('#70447f').fillOpacity(0.18)
      .strokeColor('#b58ac3').strokeOpacity(0.8).strokeWidth(3)
      .position(position).layer('PROP').locked(true).disableHit(true).build();
    await OBR.scene.items.addItems([zone]);
    sceneEffectIds = [...sceneEffectIds, zone.id];
    await OBR.scene.setMetadata({ [SCENE_EFFECTS_KEY]: sceneEffectIds });
    OBR.notification.show('Área de influência posicionada no mapa.');
  } catch (error) {
    console.error('Falha ao criar área de influência:', error);
    OBR.notification.show('Não foi possível criar a área no mapa.');
  }
  renderIntoPage();
}
async function clearInfluenceZones(): Promise<void> {
  if (!connected || !isGM || !sceneEffectIds.length) return;
  try {
    await OBR.scene.items.deleteItems(sceneEffectIds);
    sceneEffectIds = [];
    await OBR.scene.setMetadata({ [SCENE_EFFECTS_KEY]: [] });
    OBR.notification.show('Áreas de influência removidas desta cena.');
  } catch (error) {
    console.error('Falha ao remover áreas de influência:', error);
    OBR.notification.show('Não foi possível remover as áreas da cena.');
  }
  renderIntoPage();
}

function renderIntoPage(): void {
  const root = document.querySelector<HTMLElement>('#app');
  const existing = root?.querySelector<HTMLElement>('.false-ascendido-panel');
  if (!root || !existing) return;
  existing.outerHTML = renderFalseAscendidoPanel(connected, isGM);
  bindFalseAscendidoActions(root, connected, isGM);
}

export function renderFalseAscendidoPanel(isConnected: boolean, master: boolean): string {
  connected = isConnected;
  isGM = master;
  if (!isConnected) return '<section class="false-ascendido-panel"><p>Conecte a extensão a uma sala do Owlbear Rodeo.</p></section>';
  if (!master) return '<section class="false-ascendido-panel"><p>Este núcleo está disponível apenas no painel do mestre.</p></section>';
  const local = localState();
  const stage = state.globalStage;
  const stageProgress = stage === 0 ? 0 : stage * 20;
  const recent = [...state.history].reverse().slice(0, 8);
  return `
    <section class="false-ascendido-panel">
      <header class="fa-hero">
        <div class="fa-hero-copy">
          <span class="fa-kicker">REGISTRO VEDADO · ACESSO DO MESTRE</span>
          <h3>O que foi apagado<br><em>ainda exerce influência.</em></h3>
          <p>Um registro de campanha para acompanhar os avanços atribuídos ao Falso Ascendido. Nenhuma alteração ocorre sem uma decisão do mestre.</p>
        </div>
        <div class="fa-seal" aria-hidden="true">∅</div>
      </header>

      <section class="fa-global">
        <div class="fa-section-title"><div><span>01 / ESTADO DA CAMPANHA</span><h3>Influência global</h3></div><small>PROGRESSO MANUAL</small></div>
        <div class="fa-global-card">
          <div class="fa-global-top"><div><span class="fa-overline">ESTÁGIO ATUAL</span><h4>${stage === 0 ? 'Sem avanço registrado' : stageName(stage)}</h4><p>${escapeHtml(stageDescription(stage))}</p></div><strong>${stage}/5</strong></div>
          <div class="fa-progress" aria-label="Estágio global ${stage} de 5"><span style="width:${stageProgress}%"></span></div>
          <label for="fa-global-stage">DEFINIR ESTÁGIO GLOBAL</label>
          <div class="fa-control-row"><select id="fa-global-stage">${['0 — Adormecida', ...STAGES.map((item, index) => (index + 1) + ' — ' + item.name)].map((label, index) => `<option value="${index}" ${index === stage ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><button class="fa-button" data-fa-action="stage" ${saving ? 'disabled' : ''}>Atualizar estágio</button></div>
          <label for="fa-global-note">ANOTAÇÃO PRIVADA DO MESTRE</label>
          <textarea id="fa-global-note" rows="2" maxlength="500" placeholder="O que justifica o estágio atual?">${escapeHtml(state.globalNote)}</textarea>
          <button class="fa-button secondary" data-fa-action="global-note" ${saving ? 'disabled' : ''}>Salvar anotação</button>
        </div>
      </section>

      <section class="fa-local">
        <div class="fa-section-title"><div><span>02 / FOCO DA CENA</span><h3>Manifestação local</h3></div><small>INDEPENDENTE DO GLOBAL</small></div>
        <div class="fa-local-card">
          <div class="fa-local-top"><div><span class="fa-overline">LOCALIDADE ATUAL</span><h4>${escapeHtml(currentSceneLabel)}</h4><p>${escapeHtml(LOCAL_LEVELS[local.level])}</p></div><strong>${local.level}<small>/5</small></strong></div>
          <label for="fa-local-level">INTENSIDADE NESTA CENA</label>
          <input id="fa-local-level" type="range" min="0" max="5" step="1" value="${local.level}">
          <div class="fa-range-labels"><span>Ausente</span><span>Extraordinária</span></div>
          <label for="fa-local-note">OBSERVAÇÃO DESTA CENA</label>
          <textarea id="fa-local-note" rows="2" maxlength="500" placeholder="Registre o que está acontecendo neste local...">${escapeHtml(local.note)}</textarea>
          <button class="fa-button" data-fa-action="local" ${saving ? 'disabled' : ''}>Salvar manifestação local</button>
          <p class="fa-help">O nível local pertence à cena atual e não altera o estágio global.</p>
        </div>
      </section>

      <section class="fa-manifestations">
        <div class="fa-section-title"><div><span>03 / AÇÃO NA MESA</span><h3>Manifestações</h3></div><small>EFEITOS PARA OS JOGADORES</small></div>
        <div class="fa-global-card">
          <p class="fa-help">Dispare uma manifestação visual nas telas dos jogadores ou marque uma região de influência diretamente no cenário.</p>
          <p class="fa-cinema-note">Não há aviso, legenda ou identificação. A influência atravessa a visão como névoa, sombra e profundidade abissal.</p>
          <label for="fa-visual-kind">NATUREZA DA MANIFESTAÇÃO</label>
          <select id="fa-visual-kind">
            <option value="mist">Névoa — o mundo perde seus contornos</option>
            <option value="shadow">Sombra — algo atravessa a luz</option>
            <option value="abyss">Abismo — a profundidade parece não ter fim</option>
            <option value="fracture">Ruptura — a realidade se dobra por um instante</option>
          </select>
          <label for="fa-visual-intensity">PRESENÇA</label>
          <input id="fa-visual-intensity" type="range" min="0.15" max="1" step="0.05" value="0.65">
          <label for="fa-visual-duration">TEMPO DE MANIFESTAÇÃO (SEGUNDOS)</label>
          <input id="fa-visual-duration" type="number" min="5" max="45" value="18">
          <button class="fa-button" data-fa-action="visual" ${saving ? 'disabled' : ''}>Deixar a influência atravessar</button>
          <div class="fa-map-tools">
            <label>MARCA NO MAPA</label>
            <p class="fa-help">Cria uma zona circular compartilhada no centro da visão atual do mestre. Ela permanece na cena até ser removida.</p>
            <button class="fa-button" data-fa-action="map-zone" ${saving ? 'disabled' : ''}>Criar área de influência</button>
            <button class="fa-button secondary" data-fa-action="clear-map" ${saving || !sceneEffectIds.length ? 'disabled' : ''}>Remover áreas criadas (${sceneEffectIds.length})</button>
          </div>
        </div>
      </section>

      <section class="fa-chronicle">
        <div class="fa-section-title"><div><span>04 / ACONTECIMENTOS</span><h3>Crônica da influência</h3></div><small>${state.history.length} REGISTROS</small></div>
        <form id="fa-event-form" class="fa-event-form">
          <label for="fa-event-title">ACONTECIMENTO</label>
          <input id="fa-event-title" maxlength="100" required placeholder="Ex.: O selo de uma antiga ruína foi rompido">
          <label for="fa-event-description">DESCRIÇÃO / CONSEQUÊNCIA</label>
          <textarea id="fa-event-description" maxlength="500" rows="3" placeholder="O que ocorreu e por que isso importa para os planos dele?"></textarea>
          <label for="fa-event-impact">IMPACTO NO ESTÁGIO GLOBAL</label>
          <select id="fa-event-impact"><option value="0">Sem alteração</option><option value="1">Avançar 1 estágio</option><option value="2">Avançar 2 estágios</option><option value="-1">Recuar 1 estágio</option><option value="-2">Recuar 2 estágios</option></select>
          <button class="fa-button" type="submit" ${saving ? 'disabled' : ''}>Registrar acontecimento</button>
          <p class="fa-help">O impacto é aplicado somente quando você registra o acontecimento. O estágio permanece entre 0 e 5.</p>
        </form>
        <div class="fa-history">
          ${recent.length ? recent.map((entry) => `
            <article class="fa-history-entry"><div class="fa-history-marker"></div><div class="fa-history-copy"><div class="fa-history-meta"><strong>${escapeHtml(entry.title)}</strong><time>${formatDate(entry.date)}</time></div><p>${escapeHtml(entry.description || 'Sem descrição adicional.')}</p><small>${entry.impact > 0 ? '+' + entry.impact + ' estágio(s)' : entry.impact < 0 ? entry.impact + ' estágio(s)' : 'Sem alteração global'}</small></div></article>
          `).join('') : '<p class="fa-empty">Nenhum acontecimento registrado. A história começa quando você decidir registrá-la.</p>'}
        </div>
      </section>
      <footer class="fa-footnote">Última atualização: ${formatDate(state.updatedAt)} · Os controles deste módulo só são exibidos ao mestre.</footer>
    </section>
  `;
}
export function bindFalseAscendidoActions(root: HTMLElement, isConnected: boolean, master: boolean): void {
  if (!isConnected || !master) return;
  root.querySelectorAll<HTMLButtonElement>('[data-fa-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.faAction === 'stage') {
        const select = root.querySelector<HTMLSelectElement>('#fa-global-stage');
        if (!select) return;
        const next = normalizeState({ ...state, globalStage: Number(select.value) });
        next.history = [...next.history, {
          id: crypto.randomUUID(), title: 'Estágio global atualizado',
          description: 'O mestre alterou manualmente o estágio para ' + stageName(next.globalStage) + '.',
          impact: next.globalStage - state.globalStage, date: new Date().toISOString(),
        }].slice(-100);
        void persist(next);
      }
      if (button.dataset.faAction === 'global-note') {
        const note = root.querySelector<HTMLTextAreaElement>('#fa-global-note')?.value || '';
        void persist(normalizeState({ ...state, globalNote: note }));
      }
      if (button.dataset.faAction === 'visual') {
        const kind = (root.querySelector<HTMLSelectElement>('#fa-visual-kind')?.value || 'mist') as FAVisualKind;
        const intensity = Number(root.querySelector<HTMLInputElement>('#fa-visual-intensity')?.value || 0.65);
        const duration = Number(root.querySelector<HTMLInputElement>('#fa-visual-duration')?.value || 18);
        void triggerFalsoAscendidoVisual(kind, intensity, duration);
      }
      if (button.dataset.faAction === 'map-zone') void createInfluenceZone();
      if (button.dataset.faAction === 'clear-map') void clearInfluenceZones();
      if (button.dataset.faAction === 'local') {
        const level = Number(root.querySelector<HTMLInputElement>('#fa-local-level')?.value || 0);
        const note = root.querySelector<HTMLTextAreaElement>('#fa-local-note')?.value || '';
        const updated = { level: clamp(level, 0, 5), note: note.slice(0, 500), updatedAt: new Date().toISOString() };
        void persistLocal(updated);
      }
    });
  });
  root.querySelector<HTMLFormElement>('#fa-event-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = root.querySelector<HTMLInputElement>('#fa-event-title')?.value.trim() || '';
    const description = root.querySelector<HTMLTextAreaElement>('#fa-event-description')?.value.trim() || '';
    const impact = clamp(Number(root.querySelector<HTMLSelectElement>('#fa-event-impact')?.value || 0), -2, 2);
    if (!title) return;
    const next = normalizeState(state);
    next.globalStage = clamp(next.globalStage + impact, 0, 5);
    next.history = [...next.history, {
      id: crypto.randomUUID(), title, description, impact, date: new Date().toISOString(),
    }].slice(-100);
    void persist(next);
  });
}
