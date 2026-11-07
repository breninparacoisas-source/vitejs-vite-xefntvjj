import './style.css';
import OBR from '@owlbear-rodeo/sdk';

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
    title: 'Eventos',
    subtitle: 'Controle acontecimentos e sequências narrativas.',
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

let currentPage: Page = 'central';

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
          <button data-page="central" class="${
            currentPage === 'central' ? 'active' : ''
          }">
            <span class="nav-icon">⌂</span> Central
          </button>
          <button data-page="eventos" class="${
            currentPage === 'eventos' ? 'active' : ''
          }">
            <span class="nav-icon">◈</span> Eventos
          </button>
          <button data-page="cenas" class="${
            currentPage === 'cenas' ? 'active' : ''
          }">
            <span class="nav-icon">◉</span> Cenas
          </button>
          <button data-page="interacoes" class="${
            currentPage === 'interacoes' ? 'active' : ''
          }">
            <span class="nav-icon">✧</span> Interações
          </button>
        </nav>

        <div class="menu-label secondary-label">SISTEMA</div>

        <nav class="navigation">
          <button data-page="configuracoes" class="${
            currentPage === 'configuracoes' ? 'active' : ''
          }">
            <span class="nav-icon">⚙</span> Configurações
          </button>
        </nav>

        <div class="sidebar-footer">
          <span class="status-dot"></span>
          SISTEMA INICIALIZADO
          <small>ARTON ENGINE · ALPHA 0.1</small>
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <div class="breadcrumb">ARTON ENGINE <span>/</span> ${page.title.toUpperCase()}</div>
          <div class="topbar-right">
            <span class="connection"><i></i> LOCAL</span>
            <div class="master-avatar">M</div>
          </div>
        </header>

        <div class="content">
          <div class="page-heading">
            <div>
              <div class="eyebrow">◆ &nbsp; GM CONTROL CENTER</div>
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
}

function renderPage(): string {
  if (currentPage === 'central') {
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
          <span class="tool-symbol">✧</span>
          <strong>Interações</strong>
          <p>Crie objetos e experiências para os jogadores.</p>
          <span class="card-link">ABRIR MÓDULO →</span>
        </button>
      </section>

      <section class="bottom-panel">
        <div>
          <div class="eyebrow">◆ &nbsp; STATUS DO PROJETO</div>
          <h3>Uma nova ferramenta está tomando forma.</h3>
          <p>Esta é a primeira versão da central. Os módulos serão construídos gradualmente.</p>
        </div>
        <span class="version-tag">ALPHA 0.1</span>
      </section>
    `;
  }

  const descriptions: Record<Exclude<Page, 'central'>, string> = {
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
      <div class="placeholder-symbol">✧</div>
      <div class="eyebrow">MÓDULO EM CONSTRUÇÃO</div>
      <h3>${pages[currentPage].title}</h3>
      <p>${descriptions[currentPage]}</p>
      <span class="version-tag">EM DESENVOLVIMENTO</span>
    </section>
  `;
}

// ======================================
// CONEXÃO COM O OWLBEAR RODEO
// ======================================

if (OBR.isAvailable) {
  OBR.onReady(() => {
    console.log('ARTON ENGINE conectado ao Owlbear Rodeo!');
  });
} else {
  console.log('ARTON ENGINE aberto fora do Owlbear Rodeo.');
}

render();
