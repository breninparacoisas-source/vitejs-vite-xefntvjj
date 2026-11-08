
import './style.css';
import OBR from '@owlbear-rodeo/sdk';
import { bindShowtimeActions, initializeShowtimeBackground, renderShowtimeOverlay, renderShowtimePanel } from './showtime';
import { bindAmbienceActions, initializeAmbienceBackground, initializeAmbiencePanel, renderAmbienceOverlay, renderAmbiencePanel } from './ambience';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Elemento #app não encontrado.');
}

const pages = {
  central: {
    title: 'Central do Mestre',
    subtitle: 'O coração da sua campanha.',
  },
  eventos: {
    title: 'SHOWTIME',
    subtitle: 'Transforme acontecimentos narrativos em momentos cinematográficos.',
  },
  ambience: {
    title: 'AMBIENCE',
    subtitle: 'Crie uma atmosfera contínua com efeitos visuais e paisagens sonoras.',
  },
  cenas: {
    title: 'Cenas',
    subtitle: 'Prepare momentos que seus jogadores não vão esquecer.',
  },
  interacoes: {
    title: 'Interações',
    subtitle: 'Transforme elementos do cenário em experiências.',
  },
  configuracoes: {
    title: 'Configurações',
    subtitle: 'Ajuste o funcionamento do ARTON ENGINE.',
  },
};

type Page = keyof typeof pages;

type SessionLog = {
  text: string;
  date: string;
};

type SessionData = {
  active: boolean;
  startedAt: string | null;
  logs: SessionLog[];
};

const METADATA_KEY = 'com.arton.engine/session';

let currentPage: Page = 'central';
let connected = false;
let isGM = false;
let playerCount = 1;
let playerName = 'Mestre';
let saving = false;

let session: SessionData = {
  active: false,
  startedAt: null,
  logs: [],
};

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]!);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function elapsedTime(date: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  );

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours > 0
    ? `${hours}h ${remainingMinutes}min`
    : `${remainingMinutes}min`;
}

function render() {
  const page = pages[currentPage];

  app!.innerHTML = `
    <div class="engine">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-symbol">A</div>
          <div>
            <h1>ARTON <span>ENGINE</span></h1>
            <small>CAMPAIGN CONTROL SYSTEM</small>
          </div>
        </div>

        <div class="menu-label">PAINEL PRINCIPAL</div>

        <nav class="navigation">
          <button data-page="central" class="${currentPage === 'central' ? 'active' : ''}">
            <span class="nav-icon">⌂</span> Central
          </button>
          <button data-page="eventos" class="${currentPage === 'eventos' ? 'active' : ''}">
            SHOWTIME
          </button>
          <button data-page="ambience" class="${currentPage === 'ambience' ? 'active' : ''}">
            AMBIENCE
          </button>
          <button data-page="cenas" class="${currentPage === 'cenas' ? 'active' : ''}">
            <span class="nav-icon">◉</span> Cenas
          </button>
          <button data-page="interacoes" class="${currentPage === 'interacoes' ? 'active' : ''}">
            Interações
          </button>
        </nav>

        <div class="menu-label secondary-label">SISTEMA</div>

        <nav class="navigation">
          <button data-page="configuracoes" class="${currentPage === 'configuracoes' ? 'active' : ''}">
            <span class="nav-icon">⚙</span> Configurações
          </button>
        </nav>

        <div class="sidebar-footer">
          <span class="status-dot"></span>
          ${connected ? 'CONECTADO AO OWLBEAR' : 'AGUARDANDO CONEXÃO'}
          <small>ARTON ENGINE · ALPHA 0.1</small>
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <div class="breadcrumb">
            ARTON ENGINE <span>/</span> ${page.title.toUpperCase()}
          </div>
          <div class="topbar-right">
            <span class="connection"><i></i> ${connected ? 'OWLBEAR' : 'OFFLINE'}</span>
            <div class="master-avatar">${escapeHTML(playerName.charAt(0).toUpperCase())}</div>
          </div>
        </header>

        <div class="content">
          <div class="page-heading">
            <div>
              <div class="eyebrow">GM CONTROL CENTER</div>
              <h2>${page.title}</h2>
              <p>${page.subtitle}</p>
            </div>
          </div>

          ${renderPage()}
        </div>
      </main>
    </div>
  `;

  app!.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const pageName = button.dataset.page as Page;

      if (pageName in pages) {
        currentPage = pageName;
        render();
      }
    });
  });

  bindCentralActions();
  bindShowtimeActions(app!, connected, isGM);
  bindAmbienceActions(app!, connected, isGM);
}

function renderPage(): string {
  if (currentPage === 'eventos') return renderShowtimePanel(connected, isGM);
  if (currentPage === 'ambience') return renderAmbiencePanel(connected, isGM);

  if (currentPage === 'central') {
    const active = session.active;
    const started = session.startedAt;

    return `
      <section class="welcome-panel">
        <div class="welcome-content">
          <div class="eyebrow">SUA MESA. SUAS REGRAS.</div>
          <h3>As histórias começam<br>com uma decisão.</h3>
          <p>Prepare o próximo momento extraordinário da sua campanha.</p>
        </div>
        <div class="welcome-mark">A</div>
      </section>

      <div class="section-heading">
        <h3>Estado da sessão</h3>
        <span>CONTROLE DA MESA</span>
      </div>

      <section class="central-status-grid">
        <div class="central-stat">
          <span class="central-stat-label">SESSÃO</span>
          <strong class="central-stat-value">
            ${active ? 'Em andamento' : 'Não iniciada'}
          </strong>
          <span class="central-stat-detail">
            ${active ? 'Sua aventura está acontecendo.' : 'Aguardando o mestre iniciar.'}
          </span>
        </div>

        <div class="central-stat">
          <span class="central-stat-label">PARTICIPANTES</span>
          <strong class="central-stat-value">${connected ? playerCount : '—'}</strong>
          <span class="central-stat-detail">Jogadores conectados à sala</span>
        </div>

        <div class="central-stat">
          <span class="central-stat-label">DURAÇÃO</span>
          <strong class="central-stat-value">
            ${active && started ? elapsedTime(started) : '—'}
          </strong>
          <span class="central-stat-detail">
            ${active ? 'Tempo desde o início' : 'Nenhuma sessão ativa'}
          </span>
        </div>
      </section>

      <section class="session-control-panel">
        <div>
          <div class="eyebrow">CONTROLE DA SESSÃO</div>
          <h3>${active ? 'Sessão em andamento' : 'Tudo pronto para começar?'}</h3>
          <p>
            ${active
              ? `Iniciada em ${formatDate(started!)}.`
              : 'Ao iniciar, o ARTON ENGINE registrará o começo da aventura.'}
          </p>
        </div>

        <div class="session-actions">
          ${active
            ? `<button class="engine-action danger" data-action="end" ${!isGM || saving ? 'disabled' : ''}>Encerrar sessão</button>`
            : `<button class="engine-action primary" data-action="start" ${!isGM || saving || !connected ? 'disabled' : ''}>Iniciar sessão</button>`
          }
        </div>
      </section>

      <div class="section-heading">
        <h3>Ferramentas do Mestre</h3>
        <span>ACESSO RÁPIDO</span>
      </div>

      <section class="tool-grid">
        <button class="tool-card" data-page="eventos">
          <span class="tool-symbol">◈</span>
          <strong>Eventos</strong>
          <p>Crie sequências e acontecimentos narrativos.</p>
          <span class="card-link">ABRIR MÓDULO →</span>
        </button>

        <button class="tool-card" data-page="cenas">
          <span class="tool-symbol">◉</span>
          <strong>Cenas</strong>
          <p>Prepare entradas, revelações e momentos especiais.</p>
          <span class="card-link">ABRIR MÓDULO →</span>
        </button>

        <button class="tool-card" data-page="interacoes">
          
          <strong>Interações</strong>
          <p>Crie objetos e experiências para os jogadores.</p>
          <span class="card-link">ABRIR MÓDULO →</span>
        </button>
      </section>

      <section class="activity-panel">
        <div class="section-heading">
          <h3>Diário da sessão</h3>
          <span>${session.logs.length} REGISTROS</span>
        </div>

        <form id="log-form" class="log-form">
          <input
            id="log-input"
            type="text"
            maxlength="300"
            placeholder="Registre um acontecimento importante..."
            ${!isGM || !active || saving ? 'disabled' : ''}
          />
          <button type="submit" ${!isGM || !active || saving ? 'disabled' : ''}>
            Registrar
          </button>
        </form>

        <div class="activity-list">
          ${session.logs.length
            ? [...session.logs].reverse().map((log) => `
                <div class="activity-entry">
                  <span class="activity-dot"></span>
                  <div>
                    <p>${escapeHTML(log.text)}</p>
                    <small>${formatDate(log.date)}</small>
                  </div>
                </div>
              `).join('')
            : '<p class="empty-activity">Nenhum acontecimento registrado ainda.</p>'
          }
        </div>
      </section>
    `;
  }

  const descriptions: Record<Exclude<Page, 'central' | 'ambience'>, string> = {
    eventos:
      'Aqui construiremos o sistema de eventos manuais, automáticos e acionados pelos jogadores.',
    cenas:
      'Aqui construiremos transições, efeitos visuais, sons e revelações cinematográficas.',
    interacoes:
      'Aqui construiremos objetos clicáveis, escolhas, enigmas e desafios para os jogadores.',
    configuracoes:
      'Aqui ficarão as preferências e os ajustes gerais da extensão.',
  };

  return `
    <section class="module-placeholder">
      
      <div class="eyebrow">MÓDULO EM CONSTRUÇÃO</div>
      <h3>${pages[currentPage].title}</h3>
      <p>${descriptions[currentPage]}</p>
      <span class="version-tag">EM DESENVOLVIMENTO</span>
    </section>
  `;
}

function bindCentralActions() {
  const startButton = app!.querySelector<HTMLButtonElement>('[data-action="start"]');
  const endButton = app!.querySelector<HTMLButtonElement>('[data-action="end"]');
  const logForm = app!.querySelector<HTMLFormElement>('#log-form');

  startButton?.addEventListener('click', () => {
    void startSession();
  });

  endButton?.addEventListener('click', () => {
    void endSession();
  });

  logForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const input = app!.querySelector<HTMLInputElement>('#log-input');
    const text = input?.value.trim();

    if (text) {
      void addLog(text);
    }
  });
}

async function saveSession(updatedSession: SessionData) {
  if (!connected || !isGM) return;

  saving = true;
  render();

  try {
    await OBR.room.setMetadata({
      [METADATA_KEY]: updatedSession,
    });

    session = updatedSession;
  } catch (error) {
    console.error('Erro ao salvar sessão:', error);
    OBR.notification.show('Não foi possível salvar os dados da sessão.');
  } finally {
    saving = false;
    render();
  }
}

async function startSession() {
  if (!isGM || !connected || session.active) return;

  const now = new Date().toISOString();

  await saveSession({
    active: true,
    startedAt: now,
    logs: [
      ...session.logs,
      {
        text: 'Sessão iniciada.',
        date: now,
      },
    ],
  });
}

async function endSession() {
  if (!isGM || !connected || !session.active) return;

  const now = new Date().toISOString();

  await saveSession({
    ...session,
    active: false,
    logs: [
      ...session.logs,
      {
        text: 'Sessão encerrada.',
        date: now,
      },
    ],
  });
}

async function addLog(text: string) {
  if (!isGM || !connected || !session.active) return;

  const updatedLogs = [
    ...session.logs,
    {
      text,
      date: new Date().toISOString(),
    },
  ].slice(-100);

  await saveSession({
    ...session,
    logs: updatedLogs,
  });
}

// ======================================
// CONEXÃO COM O OWLBEAR RODEO
// ======================================

const runtimeParams = new URLSearchParams(window.location.search);
const isShowtimeBackground = runtimeParams.get('background') === '1';
const isShowtimeOverlay = runtimeParams.get('showtime') === '1';
const isAmbienceOverlay = runtimeParams.get('ambience') === '1';

if (OBR.isAvailable && isShowtimeBackground) {
  OBR.onReady(() => { initializeShowtimeBackground(); initializeAmbienceBackground(); });
} else if (OBR.isAvailable && !isShowtimeOverlay && !isAmbienceOverlay) {
  OBR.onReady(async () => {
    initializeAmbiencePanel();
    connected = true;
    try {
      isGM = (await OBR.player.getRole()) === 'GM';
      playerName = await OBR.player.getName();
      const metadata = await OBR.room.getMetadata();
      const savedSession = metadata[METADATA_KEY] as SessionData | undefined;
      if (savedSession) session = savedSession;
      const updatePlayers = async () => {
        const players = await OBR.party.getPlayers();
        playerCount = players.length + 1;
        render();
      };
      await updatePlayers();
      OBR.party.onChange((players) => { playerCount = players.length + 1; render(); });
      OBR.room.onMetadataChange((metadata) => {
        const updated = metadata[METADATA_KEY] as SessionData | undefined;
        if (updated) { session = updated; render(); }
      });
      console.log('ARTON ENGINE conectado ao Owlbear Rodeo!');
      render();
    } catch (error) {
      console.error('Erro ao inicializar ARTON ENGINE:', error);
      render();
    }
  });
} else if (!OBR.isAvailable && !isShowtimeOverlay && !isShowtimeBackground) {
  console.log('ARTON ENGINE aberto fora do Owlbear Rodeo.');
}

if (isShowtimeOverlay) renderShowtimeOverlay(app!);
else if (isAmbienceOverlay) renderAmbienceOverlay(app!);
else if (!isShowtimeBackground) render();
