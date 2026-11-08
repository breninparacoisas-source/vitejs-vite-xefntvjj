import OBR from '@owlbear-rodeo/sdk';
import './ambience.css';

const CHANNEL = 'com.arton.engine/ambience/v1';
const MODAL_ID = 'com.arton.engine/ambience/overlay';
const METADATA_KEY = 'com.arton.engine/ambience';

export type AmbiencePreset = 'forest' | 'tavern' | 'dungeon' | 'off';
type AmbiencePayload = { version: 1; preset: AmbiencePreset; createdAt: number };


function validPayload(value: unknown): value is AmbiencePayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AmbiencePayload>;
  return data.version === 1
    && ['forest', 'tavern', 'dungeon', 'off'].includes(data.preset || '')
    && typeof data.createdAt === 'number'
    && Date.now() - data.createdAt < 120_000
    && data.createdAt <= Date.now() + 5_000;
}

async function openAmbience(preset: AmbiencePreset): Promise<void> {
  if (preset === 'off') {
    try { await OBR.modal.close(MODAL_ID); } catch { /* Nenhum ambiente aberto. */ }
    return;
  }
  try { await OBR.modal.close(MODAL_ID); } catch { /* Troca de ambiente ou primeira abertura. */ }
  const url = new URL('/', window.location.origin);
  url.searchParams.set('ambience', '1');
  url.searchParams.set('preset', preset);
  await OBR.modal.open({
    id: MODAL_ID,
    url: url.toString(),
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: false,
  });
}

export function initializeAmbienceBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    void openAmbience(event.data.preset).catch((error) => {
      console.error('Falha ao atualizar AMBIENCE:', error);
    });
  });
  void OBR.room.getMetadata().then((metadata) => {
    const saved = metadata[METADATA_KEY] as { preset?: string } | undefined;
    if (saved && ['forest', 'tavern', 'dungeon'].includes(saved.preset || '')) {
      return openAmbience(saved.preset as AmbiencePreset);
    }
    return undefined;
  }).catch((error) => console.warn('Não foi possível recuperar AMBIENCE:', error));
  console.log('ARTON ENGINE: receptor AMBIENCE ativo.');
}

export function renderAmbiencePanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const status = !connected
    ? 'Conecte a extensão a uma sala do Owlbear Rodeo para controlar a ambientação.'
    : !isGM
      ? 'O mestre controla o ambiente da sala. Cada jogador ativa o próprio áudio.'
      : 'A troca de ambiente é sincronizada com todos os participantes da sala.';
  const presets: Array<{ id: AmbiencePreset; title: string; description: string }> = [
    { id: 'forest', title: 'Floresta', description: 'Vento entre as árvores, insetos e vida distante.' },
    { id: 'tavern', title: 'Taverna', description: 'Calor de lareira, crepitar de madeira e murmúrio acolhedor.' },
    { id: 'dungeon', title: 'Masmorra', description: 'Ressonância subterrânea, correntes de ar e tensão grave.' },
  ];
  return [
    '<section class="ambience-intro"><div><span class="ambience-eyebrow">ATMOSFERA CONTÍNUA</span><h3>O cenário também pode ser sentido.</h3><p>Escolha um ambiente para transformar a atmosfera da mesa. A camada visual fica sobre o mapa sem bloquear os comandos, enquanto cada jogador controla o próprio áudio.</p><div class="ambience-status">AMBIENTE COMPARTILHADO · ÁUDIO INDIVIDUAL</div></div></section>',
    '<div class="ambience-section-heading"><div><span>01 / AMBIENTES</span><h3>Escolha a atmosfera</h3></div><small>VISUAL + PAISAGEM SONORA</small></div>',
    '<section class="ambience-presets">',
    ...presets.map((preset) => '<button class="ambience-preset ambience-' + preset.id + '" data-ambience="' + preset.id + '" ' + disabled + '><span class="ambience-preset-preview"></span><span class="ambience-preset-copy"><strong>' + preset.title + '</strong><small>' + preset.description + '</small></span><span class="ambience-preset-action">ATIVAR</span></button>'),
    '</section>',
    '<div class="ambience-controls-row"><button class="ambience-stop" data-ambience="off" ' + disabled + '>DESLIGAR AMBIENTAÇÃO</button><span class="ambience-footnote">' + status + '</span></div>',
    '<section class="ambience-note"><h4>Como o áudio funciona</h4><p>Ao trocar o ambiente, cada participante verá a mesma ambientação. Para ouvir, cada jogador precisa clicar em “Ativar áudio” na camada que aparece sobre o mapa. Essa etapa é exigida pelo navegador e o volume é individual.</p><p>Os sons desta versão são sintetizados em tempo real pelo navegador. Não há faixas externas ou arquivos de áudio carregados.</p></section>',
  ].join('');
}

export function bindAmbienceActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  root.querySelectorAll<HTMLButtonElement>('[data-ambience]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!connected || !isGM) return;
      const preset = button.dataset.ambience as AmbiencePreset;
      if (!['forest', 'tavern', 'dungeon', 'off'].includes(preset)) return;
      void (async () => {
        const payload: AmbiencePayload = { version: 1, preset, createdAt: Date.now() };
        try {
          if (preset === 'off') await openAmbience('off');
          else await openAmbience(preset);
          await OBR.room.setMetadata({ [METADATA_KEY]: { preset, updatedAt: payload.createdAt } });
          await OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
          OBR.notification.show(preset === 'off' ? 'Ambientação desligada.' : 'Ambientação enviada para a sala.');
        } catch (error) {
          console.error('Erro ao alterar AMBIENCE:', error);
          OBR.notification.show('Não foi possível alterar a ambientação da sala.');
        }
      })();
    });
  });
}

type AudioNodes = { context: AudioContext; master: GainNode; sources: AudioNode[]; timers: number[] };
let audio: AudioNodes | undefined;

function createNoise(context: AudioContext): AudioBufferSourceNode {
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function stopAudio(): void {
  if (!audio) return;
  audio.timers.forEach((timer) => window.clearInterval(timer));
  audio.sources.forEach((source) => {
    try { (source as AudioScheduledSourceNode).stop(); } catch { /* Já encerrado. */ }
  });
  void audio.context.close();
  audio = undefined;
}

function addDrone(context: AudioContext, destination: AudioNode, frequency: number, volume: number, type: OscillatorType = 'sine'): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  audio?.sources.push(oscillator);
  audio?.sources.push(gain);
}

function startAudio(preset: AmbiencePreset, volume: number): void {
  stopAudio();
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  audio = { context, master, sources: [], timers: [] };

  const noise = createNoise(context);
  const filter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.connect(filter).connect(noiseGain).connect(master);
  noise.start();
  audio.sources.push(noise, filter, noiseGain);

  if (preset === 'forest') {
    filter.type = 'lowpass'; filter.frequency.value = 780;
    noiseGain.gain.value = 0.19;
    addDrone(context, master, 92, 0.018);
    const high = context.createBiquadFilter();
    const insects = createNoise(context);
    const insectGain = context.createGain();
    high.type = 'highpass'; high.frequency.value = 4200;
    insects.connect(high).connect(insectGain).connect(master);
    insectGain.gain.value = 0.025;
    insects.start();
    audio.sources.push(insects, high, insectGain);
  } else if (preset === 'tavern') {
    filter.type = 'lowpass'; filter.frequency.value = 420;
    noiseGain.gain.value = 0.24;
    addDrone(context, master, 58, 0.025, 'triangle');
    const crackle = () => {
      if (!audio || audio.context !== context) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 180 + Math.random() * 520;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035 + Math.random() * 0.035, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
      osc.connect(gain).connect(master);
      osc.start(); osc.stop(context.currentTime + 0.18);
    };
    audio.timers.push(window.setInterval(crackle, 260 + Math.random() * 220));
  } else if (preset === 'dungeon') {
    filter.type = 'lowpass'; filter.frequency.value = 190;
    noiseGain.gain.value = 0.12;
    addDrone(context, master, 48, 0.045);
    addDrone(context, master, 73.4, 0.018, 'triangle');
    const air = context.createBiquadFilter();
    const airNoise = createNoise(context);
    const airGain = context.createGain();
    air.type = 'bandpass'; air.frequency.value = 680; air.Q.value = 0.7;
    airNoise.connect(air).connect(airGain).connect(master);
    airGain.gain.value = 0.045;
    airNoise.start();
    audio.sources.push(airNoise, air, airGain);
  }
}

export function renderAmbienceOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset') as AmbiencePreset;
  if (!['forest', 'tavern', 'dungeon'].includes(preset)) return;

  document.documentElement.style.background = 'transparent';
  document.body.style.cssText = 'margin:0!important;padding:0!important;min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;';
  root.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;';
  root.innerHTML = '<main class="ambience-overlay ambience-overlay-' + preset + '"><div class="ambience-atmosphere"></div><div class="ambience-grain"></div><div class="ambience-edge"></div><section class="ambience-audio-panel"><div class="ambience-audio-heading"><strong>AMBIENCE</strong><span>' + (preset === 'forest' ? 'FLORESTA' : preset === 'tavern' ? 'TAVERNA' : 'MASMORRA') + '</span></div><p id="ambience-audio-status">O ambiente está ativo. Ative o áudio para ouvir a paisagem sonora.</p><button id="ambience-audio-enable">ATIVAR ÁUDIO</button><label for="ambience-volume">VOLUME <output id="ambience-volume-value">35%</output></label><input id="ambience-volume" type="range" min="0" max="1" step="0.01" value="0.35" disabled><button id="ambience-audio-mute" disabled>DESATIVAR ÁUDIO</button></section></main>';

  const enable = root.querySelector<HTMLButtonElement>('#ambience-audio-enable')!;
  const volume = root.querySelector<HTMLInputElement>('#ambience-volume')!;
  const value = root.querySelector<HTMLOutputElement>('#ambience-volume-value')!;
  const status = root.querySelector<HTMLElement>('#ambience-audio-status')!;
  const mute = root.querySelector<HTMLButtonElement>('#ambience-audio-mute')!;

  enable.addEventListener('click', async () => {
    try {
      startAudio(preset, Number(volume.value));
      await audio?.context.resume();
      enable.disabled = true;
      enable.textContent = 'ÁUDIO ATIVO';
      volume.disabled = false;
      mute.disabled = false;
      status.textContent = 'Paisagem sonora em reprodução neste dispositivo.';
    } catch (error) {
      console.error('Não foi possível iniciar o áudio:', error);
      status.textContent = 'O navegador não liberou o áudio. Tente novamente.';
    }
  });
  volume.addEventListener('input', () => {
    value.textContent = Math.round(Number(volume.value) * 100) + '%';
    if (audio) audio.master.gain.setTargetAtTime(Number(volume.value), audio.context.currentTime, 0.08);
  });
  mute.addEventListener('click', () => {
    stopAudio();
    enable.disabled = false;
    enable.textContent = 'ATIVAR ÁUDIO';
    volume.disabled = true;
    mute.disabled = true;
    status.textContent = 'Áudio desativado neste dispositivo. O ambiente visual continua ativo.';
  });
}
