import OBR from '@owlbear-rodeo/sdk';
import './ambience.css';

const CHANNEL = 'com.arton.engine/ambience/v1';
const MODAL_ID = 'com.arton.engine/ambience/overlay';
const METADATA_KEY = 'com.arton.engine/ambience';
const SFX_CHANNEL = 'com.arton.engine/soundboard/v1';

export type AmbiencePreset = 'forest' | 'tavern' | 'dungeon' | 'city' | 'storm' | 'desert' | 'snow' | 'swamp' | 'coast' | 'battlefield' | 'abyss' | 'off';
type AmbiencePayload = { version: 1; preset: AmbiencePreset; settings?: AmbienceSettings; createdAt: number };
type SfxId = 'sword'|'impact'|'arrow'|'spell'|'portal'|'heal'|'roar'|'growl'|'thunder'|'explosion'|'door'|'footsteps'|'metal'|'thud'|'knock'|'steps'|'wolf'|'birds'|'fire'|'chime'|'rain'|'creak';
type SfxPayload = { version: 1; id: SfxId; createdAt: number };

type AmbienceSettings = { intensity: number; brightness: number; motion: number };
const DEFAULT_SETTINGS: AmbienceSettings = { intensity: 70, brightness: 0, motion: 65 };
let ambienceSettings: AmbienceSettings = { ...DEFAULT_SETTINGS };
let settingsTimer = 0;
let activePreset: AmbiencePreset = 'off';

function normalizeSettings(value?: Partial<AmbienceSettings>): AmbienceSettings {
  return {
    intensity: Math.max(0, Math.min(100, Number.isFinite(value?.intensity) ? Number(value?.intensity) : DEFAULT_SETTINGS.intensity)),
    brightness: Math.max(-40, Math.min(40, Number.isFinite(value?.brightness) ? Number(value?.brightness) : DEFAULT_SETTINGS.brightness)),
    motion: Math.max(0, Math.min(100, Number.isFinite(value?.motion) ? Number(value?.motion) : DEFAULT_SETTINGS.motion)),
  };
}

function settingsQuery(settings: AmbienceSettings): URLSearchParams {
  const params = new URLSearchParams();
  params.set('intensity', String(settings.intensity));
  params.set('brightness', String(settings.brightness));
  params.set('motion', String(settings.motion));
  return params;
}

function applyOverlaySettings(root: HTMLElement, settings: AmbienceSettings): void {
  root.style.setProperty('--ambience-intensity', String(settings.intensity / 100));
  root.style.setProperty('--ambience-brightness', String(settings.brightness / 100));
  root.style.setProperty('--ambience-motion', String(settings.motion / 100));
  root.querySelectorAll<HTMLElement>('.ambience-atmosphere,.ambience-clouds,.ambience-grain,.ambience-edge').forEach((layer) => {
    layer.style.animationDuration = (30 - settings.motion * 0.25) + 's';
    layer.style.animationPlayState = settings.motion === 0 ? 'paused' : 'running';
  });
}

function refreshAudioPanel(): void {
  const enable = document.querySelector<HTMLButtonElement>('#ambience-audio-enable');
  const status = document.querySelector<HTMLElement>('#ambience-audio-status');
  const volume = document.querySelector<HTMLInputElement>('#ambience-volume');
  const mute = document.querySelector<HTMLButtonElement>('#ambience-audio-mute');
  if (!enable || !status || !volume || !mute) return;
  const available = ['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss'].includes(activePreset);
  enable.disabled = !available || Boolean(audio);
  enable.textContent = audio ? 'ÁUDIO ATIVO' : 'ATIVAR ÁUDIO';
  volume.disabled = !audio;
  mute.disabled = !audio;
  if (!available && !audio) status.textContent = 'Escolha um ambiente para liberar a paisagem sonora.';
  else if (available && !audio) status.textContent = 'Ambiente pronto. Ative o áudio neste dispositivo.';
  else status.textContent = 'Paisagem sonora em reprodução neste dispositivo.';
}

function validPayload(value: unknown): value is AmbiencePayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AmbiencePayload>;
  return data.version === 1
    && ['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss', 'off'].includes(data.preset || '')
    && (!data.settings || typeof data.settings === 'object')
    && typeof data.createdAt === 'number'
    && Date.now() - data.createdAt < 120_000
    && data.createdAt <= Date.now() + 5_000;
}

async function openAmbience(preset: AmbiencePreset, settings: AmbienceSettings = ambienceSettings): Promise<void> {
  if (preset === 'off') {
    try { await OBR.modal.close(MODAL_ID); } catch { /* Nenhum ambiente aberto. */ }
    return;
  }
  try { await OBR.modal.close(MODAL_ID); } catch { /* Troca de ambiente ou primeira abertura. */ }
  const url = new URL('/', window.location.origin);
  url.searchParams.set('ambience', '1');
  url.searchParams.set('preset', preset);
  settingsQuery(settings).forEach((value, key) => url.searchParams.set(key, value));
  await OBR.modal.open({
    id: MODAL_ID,
    url: url.toString(),
    fullScreen: true,
    hideBackdrop: true,
    hidePaper: true,
    disablePointerEvents: true,
  });
}

export function initializeAmbienceBackground(): void {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    if (activePreset !== event.data.preset && audio) stopAudio();
    activePreset = event.data.preset;
    ambienceSettings = normalizeSettings(event.data.settings);
    if (activePreset === 'off') stopAudio();
    refreshAudioPanel();
    void openAmbience(event.data.preset).catch((error) => {
      console.error('Falha ao atualizar AMBIENCE:', error);
    });
  });
  void OBR.room.getMetadata().then((metadata) => {
    const saved = metadata[METADATA_KEY] as { preset?: string; settings?: Partial<AmbienceSettings> } | undefined;
    if (saved && ['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss', 'off'].includes(saved.preset || '')) {
      activePreset = saved.preset as AmbiencePreset;
      ambienceSettings = normalizeSettings(saved.settings);
      refreshAudioPanel();
      if (activePreset === 'off') return openAmbience('off');
      return openAmbience(activePreset);
    }
    return undefined;
  }).catch((error) => console.warn('Não foi possível recuperar AMBIENCE:', error));
  console.log('ARTON ENGINE: receptor AMBIENCE ativo.');
}

export function initializeAmbiencePanel(): void {
  OBR.broadcast.onMessage(SFX_CHANNEL, (event) => { receiveSfx(event.data); receiveTrack(event.data); });
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (!validPayload(event.data)) return;
    activePreset = event.data.preset;
    if (activePreset === 'off') stopAudio();
    refreshAudioPanel();
  });
  void OBR.room.getMetadata().then((metadata) => {
    const saved = metadata[METADATA_KEY] as { preset?: string; settings?: Partial<AmbienceSettings> } | undefined;
    if (saved && ['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss', 'off'].includes(saved.preset || '')) {
      activePreset = saved.preset as AmbiencePreset;
      ambienceSettings = normalizeSettings(saved.settings);
      if (activePreset === 'off') stopAudio();
      refreshAudioPanel();
    }
  }).catch((error) => console.warn('Não foi possível recuperar estado do AMBIENCE:', error));
}

export function renderAmbiencePanel(connected: boolean, isGM: boolean): string {
  const disabled = !connected || !isGM ? 'disabled' : '';
  const presets: Array<{ id: AmbiencePreset; title: string; description: string }> = [
    { id: 'forest', title: 'Floresta', description: 'Vento entre as árvores, insetos e vida distante.' },
    { id: 'tavern', title: 'Taverna', description: 'Calor de lareira, crepitar de madeira e murmúrio acolhedor.' },
    { id: 'dungeon', title: 'Masmorra', description: 'Ressonância subterrânea, correntes de ar e tensão grave.' },
    { id: 'city', title: 'Cidade', description: 'Movimento distante, vozes indistintas e o ruído das ruas.' },
    { id: 'storm', title: 'Tempestade', description: 'Chuva intensa, vento forte e trovões ao longe.' },
    { id: 'desert', title: 'Deserto', description: 'Vento seco, areia em movimento e vastidão silenciosa.' },
    { id: 'snow', title: 'Nevasca', description: 'Rajadas geladas, vento cortante e um silêncio amplo.' },
    { id: 'swamp', title: 'Pântano', description: 'Insetos, água parada e bolhas sob a vegetação.' },
    { id: 'coast', title: 'Litoral', description: 'Ondas ritmadas, brisa marítima e espuma na areia.' },
    { id: 'battlefield', title: 'Campo de batalha', description: 'Tensão distante, impactos abafados e ecos de guerra.' },
    { id: 'abyss', title: 'Abismo', description: 'Pressão profunda, frequências dissonantes e vazio.' },
  ];
  return [
    '<section class="ambience-hero"><div class="ambience-hero-copy"><span class="ambience-eyebrow">AMBIENTAÇÃO DE CENA</span><h3>O mundo muda antes mesmo da primeira palavra.</h3><p>Escolha uma atmosfera para envolver o mapa em luz, clima e som. O cenário é compartilhado; o volume continua individual.</p><div class="ambience-hero-meta"><span class="ambience-live-dot"></span> CONTROLE DO MESTRE <i></i> ÁUDIO POR JOGADOR</div></div><div class="ambience-hero-art" aria-hidden="true"><span class="hero-orb"></span><span class="hero-ridge hero-ridge-back"></span><span class="hero-ridge hero-ridge-front"></span><span class="hero-haze"></span></div></section>',
    '<div class="ambience-library-head"><div><span class="ambience-eyebrow">BIBLIOTECA DE CENÁRIOS</span><h3>Escolha onde a cena acontece</h3><p>11 atmosferas disponíveis</p></div><button class="ambience-stop" data-ambience="off" ' + disabled + '>DESLIGAR AMBIENTE</button></div>',
    '<section class="ambience-presets">',
    ...presets.map((preset, index) => '<button class="ambience-preset ambience-' + preset.id + '" data-ambience="' + preset.id + '" ' + disabled + '><span class="ambience-preset-preview" aria-hidden="true"><span class="scene-light"></span><span class="scene-shape"></span><span class="scene-depth"></span><span class="scene-label">' + String(index + 1).padStart(2, '0') + '</span></span><span class="ambience-preset-copy"><strong>' + preset.title + '</strong><small>' + preset.description + '</small><span class="ambience-preset-action">APLICAR AMBIENTAÇÃO</span></span></button>'),
    '</section>',
    '<section class="ambience-customizer"><div class="ambience-customizer-heading"><div><span class="ambience-eyebrow">AJUSTE FINO</span><h3>Personalize a atmosfera</h3><p>Os ajustes são aplicados a todos na sala. O volume de áudio continua individual.</p></div><div class="ambience-customizer-actions"><button type="button" id="ambience-reset-settings" ' + disabled + '>RESTAURAR PADRÃO</button><button type="button" id="ambience-apply-settings" class="ambience-apply-settings" ' + disabled + '>APLICAR AJUSTES</button></div></div><div class="ambience-setting-grid"><label class="ambience-setting"><span><strong>Intensidade</strong><output id="ambience-intensity-value">' + ambienceSettings.intensity + '%</output></span><small>Força dos efeitos visuais</small><input id="ambience-intensity" type="range" min="0" max="100" value="' + ambienceSettings.intensity + '" ' + disabled + '></label><label class="ambience-setting"><span><strong>Clareza</strong><output id="ambience-brightness-value">' + (ambienceSettings.brightness > 0 ? '+' : '') + ambienceSettings.brightness + '</output></span><small>Clarear ou escurecer a cena</small><input id="ambience-brightness" type="range" min="-40" max="40" value="' + ambienceSettings.brightness + '" ' + disabled + '></label><label class="ambience-setting"><span><strong>Movimento</strong><output id="ambience-motion-value">' + ambienceSettings.motion + '%</output></span><small>Velocidade dos efeitos animados</small><input id="ambience-motion" type="range" min="0" max="100" value="' + ambienceSettings.motion + '" ' + disabled + '></label></div><p class="ambience-customizer-note">Ajustes em tempo real: escolha o nível de presença visual sem alterar a imagem original do mapa.</p></section>',
    '<section class="ambience-audio-settings"><div class="ambience-audio-copy"><span class="ambience-eyebrow">MESA DE SOM</span><h3>Paisagem sonora</h3><p>O som é reproduzido neste dispositivo. Ative uma vez para liberar a reprodução no navegador.</p><p id="ambience-audio-status">' + (activePreset === 'off' ? 'Escolha um ambiente para liberar a paisagem sonora.' : 'Ambiente pronto. Ative o áudio neste dispositivo.') + '</p></div><div class="ambience-audio-controls"><button id="ambience-audio-enable" ' + (activePreset === 'off' ? 'disabled' : '') + '>ATIVAR ÁUDIO</button><label for="ambience-volume"><span>VOLUME</span><output id="ambience-volume-value">35%</output></label><input id="ambience-volume" type="range" min="0" max="1" step="0.01" value="0.35" disabled><button id="ambience-audio-mute" class="ambience-mute" disabled>SILENCIAR NESTE DISPOSITIVO</button></div></section>',
    `<section class="soundtrack-panel"><div class="soundboard-heading"><div><span class="ambience-eyebrow">TRILHAS MUSICAIS</span><h3>Composições completas, não loops de sintetizador</h3><p>Cada opção toca uma gravação musical diferente, com instrumentos, arranjo e duração próprios.</p></div><div class="soundboard-audio-access"><button id="music-audio-enable" type="button">ATIVAR MÚSICA</button><span id="music-audio-status">Cada participante ativa a música no próprio dispositivo.</span></div></div><div class="soundtrack-grid"><button data-track="calm" ${disabled}>Cotidiano tranquilo<small>Instrumental leve e acolhedor · 6 min</small></button><button data-track="village" ${disabled}>Mercado e vila<small>Melodia medieval discreta · 2 min</small></button><button data-track="travel" ${disabled}>Estrada e jornada<small>Folk acústico, violão e cordas · 3 min</small></button><button data-track="tavern" ${disabled}>Taverna e convivência<small>Clima medieval e intimista · 2 min</small></button><button data-track="mystery" ${disabled}>Contemplação mística<small>Ambient instrumental · 2 min</small></button><button data-track="rest" ${disabled}>Memória e descanso<small>Piano, cordas e marimba · 6 min</small></button><button data-track="stop" ${disabled}>Parar música<small>Encerra a trilha compartilhada</small></button></div><div class="soundboard-volume"><label for="music-volume">VOLUME DA MÚSICA <output id="music-volume-value">28%</output></label><input id="music-volume" type="range" min="0" max="1" step="0.01" value="0.28" disabled></div><p class="soundboard-footnote">Faixas e créditos: <a href="https://commons.wikimedia.org/wiki/File:Wholesome_by_Kevin_MacLeod.ogg" target="_blank" rel="noreferrer">Wholesome — Kevin MacLeod</a> · <a href="https://commons.wikimedia.org/wiki/File:Medieval_Dream_by_Frank_Schröter.ogg" target="_blank" rel="noreferrer">Medieval Dream — Frank Schröter</a> · <a href="https://commons.wikimedia.org/wiki/File:Warm_Sunset_by_MusicLFiles.ogg" target="_blank" rel="noreferrer">Warm Sunset — MusicLFiles</a> · <a href="https://commons.wikimedia.org/wiki/File:Medieval_Story_by_Frank_Schröter.ogg" target="_blank" rel="noreferrer">Medieval Story — Frank Schröter</a> · <a href="https://commons.wikimedia.org/wiki/File:Spiritual_Ambient_by_MusicLFiles.ogg" target="_blank" rel="noreferrer">Spiritual Ambient — MusicLFiles</a> · <a href="https://commons.wikimedia.org/wiki/File:Purrple_Cat_-_Quiet_Night.ogg" target="_blank" rel="noreferrer">Quiet Night — Purrple Cat</a>. Licenças CC BY 4.0; créditos nos links de cada faixa.</p></section>`,
    '<section class="soundboard"><div class="soundboard-heading"><div><span class="ambience-eyebrow">SOUNDBOARD</span><h3>Efeitos sonoros pontuais</h3><p>Seus efeitos originais continuam disponíveis. Os novos sons gravados ampliam a biblioteca com detalhes naturais e ambientes.</p></div><div class="soundboard-audio-access"><button id="sfx-audio-enable" type="button">LIBERAR EFEITOS</button><span id="sfx-audio-status">Libere o áudio neste dispositivo para ouvir os efeitos.</span></div></div><div class="soundboard-volume"><label for="sfx-volume">VOLUME DOS EFEITOS <output id="sfx-volume-value">55%</output></label><input id="sfx-volume" type="range" min="0" max="1" step="0.01" value="0.55" disabled></div><div class="soundboard-category"><h4>Combate e ação</h4><div class="soundboard-grid"><button data-sfx="sword" ' + (!connected || !isGM ? 'disabled' : '') + '>Choque de espadas</button><button data-sfx="impact" ' + (!connected || !isGM ? 'disabled' : '') + '>Impacto pesado</button><button data-sfx="arrow" ' + (!connected || !isGM ? 'disabled' : '') + '>Flecha disparada</button><button data-sfx="explosion" ' + (!connected || !isGM ? 'disabled' : '') + '>Explosão</button></div></div><div class="soundboard-category"><h4>Magia</h4><div class="soundboard-grid"><button data-sfx="spell" ' + (!connected || !isGM ? 'disabled' : '') + '>Conjuração arcana</button><button data-sfx="portal" ' + (!connected || !isGM ? 'disabled' : '') + '>Portal dimensional</button><button data-sfx="heal" ' + (!connected || !isGM ? 'disabled' : '') + '>Energia restauradora</button></div></div><div class="soundboard-category"><h4>Criaturas</h4><div class="soundboard-grid"><button data-sfx="roar" ' + (!connected || !isGM ? 'disabled' : '') + '>Rugido monstruoso</button><button data-sfx="growl" ' + (!connected || !isGM ? 'disabled' : '') + '>Rosnado grave</button></div></div><div class="soundboard-category"><h4>Ambiente e objetos</h4><div class="soundboard-grid"><button data-sfx="rain" ' + (!connected || !isGM ? 'disabled' : '') + '>Trovão próximo</button><button data-sfx="creak" ' + (!connected || !isGM ? 'disabled' : '') + '>Portão rangendo</button><button data-sfx="footsteps" ' + (!connected || !isGM ? 'disabled' : '') + '>Passos pesados</button><button data-sfx="metal" ' + (!connected || !isGM ? 'disabled' : '') + '>Metal batendo</button><button data-sfx="thud" ' + (!connected || !isGM ? 'disabled' : '') + '>Objeto pesado caindo</button><button data-sfx="knock" ' + (!connected || !isGM ? 'disabled' : '') + '>Batidas na madeira</button><button data-sfx="steps" ' + (!connected || !isGM ? 'disabled' : '') + '>Passos em cascalho</button></div></div><div class="soundboard-category"><h4>Natureza e detalhes</h4><div class="soundboard-grid"><button data-sfx="wolf" ' + (!connected || !isGM ? 'disabled' : '') + '>Uivos distantes</button><button data-sfx="birds" ' + (!connected || !isGM ? 'disabled' : '') + '>Pássaros na mata</button><button data-sfx="fire" ' + (!connected || !isGM ? 'disabled' : '') + '>Estalos da madeira</button><button data-sfx="chime" ' + (!connected || !isGM ? 'disabled' : '') + '>Sino ao vento</button></div></div><p class="soundboard-footnote">Os efeitos originais foram preservados. As novas gravações acrescentam opções; não substituem os sons que você já utilizava.</p></section>',
  ].join('');;
}



let sfxVolume=0.55;
let sfxEnabled=false;
const SFX_IDS:SfxId[]=['sword','impact','arrow','spell','portal','heal','roar','growl','thunder','explosion','door','footsteps','metal','thud','knock','steps','wolf','birds','fire','chime','rain','creak'];
const SFX_SOURCES:Partial<Record<SfxId,string>>={
 metal:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Metal_Clanging_Noises.ogg',
 thud:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Dull_thud.ogg',
 creak:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Door_handle_creaking.ogg',
 knock:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Knocking_on_wood_or_door.ogg',
 steps:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Walkingongravel.ogg',
 wolf:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wolf_howls.ogg',
 birds:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Birds_singing_in_garden.ogg',
 rain:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rain_and_thunder_%281%29.ogg',
 fire:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Bones_breaking_wood_fire_ice_crackling.ogg',
 chime:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Windchime.ogg'
};

let sfxContext:AudioContext|undefined;
let sfxMaster:GainNode|undefined;
function noiseBurst(ctx:AudioContext,out:AudioNode,duration:number,frequency:number,volume:number,filter:BiquadFilterType='lowpass'):void{
 const length=Math.floor(ctx.sampleRate*duration),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.1);
 const source=ctx.createBufferSource(),band=ctx.createBiquadFilter(),gain=ctx.createGain();
 source.buffer=buffer;band.type=filter;band.frequency.value=frequency;gain.gain.value=volume;source.connect(band).connect(gain).connect(out);source.start();
}
function tone(ctx:AudioContext,out:AudioNode,hz:number,duration:number,volume:number,endHz?:number,type:OscillatorType='sine',delay=0):void{
 const osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+delay;osc.type=type;osc.frequency.setValueAtTime(hz,start);
 if(endHz)osc.frequency.exponentialRampToValueAtTime(Math.max(1,endHz),start+duration);
 gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
 osc.connect(gain).connect(out);osc.start(start);osc.stop(start+duration+.03);
}
function playLegacySfx(id:SfxId):boolean{
 if(!['sword','impact','arrow','spell','portal','heal','roar','growl','thunder','explosion','door','footsteps'].includes(id)||!sfxContext||!sfxMaster||sfxContext.state!=='running')return false;
 const x=sfxContext,y=sfxMaster;
 switch(id){
 case 'sword':noiseBurst(x,y,.32,2100,.32,'highpass');tone(x,y,920,.46,.16,310,'triangle');tone(x,y,1460,.2,.08,760);break;
 case 'impact':noiseBurst(x,y,.4,480,.5);tone(x,y,105,.48,.4,35);break;
 case 'arrow':noiseBurst(x,y,.38,2700,.23,'bandpass');tone(x,y,700,.25,.07,160);break;
 case 'spell':tone(x,y,220,.72,.18,1300);tone(x,y,480,.6,.1,1600,'triangle',.08);tone(x,y,950,.5,.07,520,'sine',.18);noiseBurst(x,y,.5,3600,.07,'highpass');break;
 case 'portal':tone(x,y,78,1.7,.16,34,'sawtooth');tone(x,y,300,1.4,.1,900);tone(x,y,620,1.1,.07,150,'triangle',.12);noiseBurst(x,y,1.3,720,.12,'bandpass');break;
 case 'heal':[523,659,784,1047].forEach((hz,i)=>tone(x,y,hz,.8,.12,hz*1.01,'sine',i*.12));break;
 case 'roar':tone(x,y,90,1.1,.28,40,'sawtooth');tone(x,y,135,.9,.18,55,'triangle',.04);noiseBurst(x,y,1,800,.25);break;
 case 'growl':tone(x,y,65,.85,.23,32,'sawtooth');tone(x,y,92,.7,.12,45,'triangle',.08);noiseBurst(x,y,.7,390,.16);break;
 case 'thunder':noiseBurst(x,y,2.1,180,.5);tone(x,y,52,2.2,.38,24,'triangle');break;
 case 'explosion':noiseBurst(x,y,1,680,.65);tone(x,y,120,.85,.45,22);break;
 case 'door':noiseBurst(x,y,1.1,350,.28,'bandpass');tone(x,y,112,.8,.12,75,'sawtooth');tone(x,y,70,.5,.16,40,'triangle',.3);break;
 case 'footsteps':[0,.38,.78].forEach((d,i)=>{tone(x,y,i===1?75:90,.18,.2,36,'sine',d);noiseBurst(x,y,.1,240,.13);});break;
 }
 return true;
}
function enableLegacySfx():void{
 if(!sfxContext||sfxContext.state==='closed'){sfxContext=new AudioContext();sfxMaster=sfxContext.createGain();sfxMaster.gain.value=sfxVolume;sfxMaster.connect(sfxContext.destination);}
 void sfxContext.resume().then(()=>{sfxEnabled=sfxContext?.state==='running';const status=document.querySelector<HTMLElement>('#sfx-audio-status'),volume=document.querySelector<HTMLInputElement>('#sfx-volume'),button=document.querySelector<HTMLButtonElement>('#sfx-audio-enable');if(status)status.textContent=sfxEnabled?'Efeitos liberados neste dispositivo.':'O navegador não liberou o áudio. Tente novamente.';if(volume)volume.disabled=!sfxEnabled;if(button)button.textContent=sfxEnabled?'EFEITOS LIBERADOS':'LIBERAR EFEITOS';}).catch(error=>console.error('Falha ao liberar soundboard:',error));
}
const activeSfx=new Set<HTMLAudioElement>();
function playSfx(id:SfxId):void{
 if(!sfxEnabled)return;
 if(playLegacySfx(id))return;
 const source=SFX_SOURCES[id];if(!source){playLegacySfx(id);return;}const player=new Audio(source);player.preload='auto';player.volume=sfxVolume;activeSfx.add(player);
 player.addEventListener('ended',()=>activeSfx.delete(player),{once:true});
 player.addEventListener('error',()=>{activeSfx.delete(player);const status=document.querySelector<HTMLElement>('#sfx-audio-status');if(status)status.textContent='Não foi possível carregar uma gravação. Verifique a conexão.';},{once:true});
 void player.play().catch(error=>{activeSfx.delete(player);console.warn('Falha ao reproduzir gravação:',id,error);const status=document.querySelector<HTMLElement>('#sfx-audio-status');if(status)status.textContent='Não foi possível reproduzir o som. Tente liberar o áudio novamente.';});
}
function enableSfxAudio():void{
 sfxEnabled=true;
 const status=document.querySelector<HTMLElement>('#sfx-audio-status'),volume=document.querySelector<HTMLInputElement>('#sfx-volume'),button=document.querySelector<HTMLButtonElement>('#sfx-audio-enable');
 if(status)status.textContent='Sons liberados neste dispositivo.';
 if(volume)volume.disabled=false;
 if(button)button.textContent='SONS LIBERADOS';
}
function receiveSfx(value:unknown):void{
 if(!value||typeof value!=='object')return;
 const p=value as Partial<SfxPayload>;
 if(p.version!==1||typeof p.id!=='string'||typeof p.createdAt!=='number'||Math.abs(Date.now()-p.createdAt)>12000)return;
 if(!SFX_IDS.includes(p.id as SfxId))return;
 playSfx(p.id as SfxId);
}
function bindSoundboard(root:HTMLElement,connected:boolean,isGM:boolean):void{
 const enable=root.querySelector<HTMLButtonElement>('#sfx-audio-enable'),volume=root.querySelector<HTMLInputElement>('#sfx-volume'),output=root.querySelector<HTMLOutputElement>('#sfx-volume-value'),status=root.querySelector<HTMLElement>('#sfx-audio-status');
 if(!enable||!volume||!output||!status)return;
 enable.textContent=sfxEnabled?'SONS LIBERADOS':'LIBERAR SONS';volume.disabled=!sfxEnabled;volume.value=String(sfxVolume);output.textContent=Math.round(sfxVolume*100)+'%';
 enable.addEventListener('click',()=>{enableSfxAudio();enableLegacySfx();});
 volume.addEventListener('input',()=>{sfxVolume=Number(volume.value);output.textContent=Math.round(sfxVolume*100)+'%';activeSfx.forEach(player=>{player.volume=sfxVolume;});});
 root.querySelectorAll<HTMLButtonElement>('[data-sfx]').forEach(button=>button.addEventListener('click',()=>{
  if(!connected||!isGM)return;
  if(!sfxEnabled){status.textContent='Libere os sons neste dispositivo antes de disparar.';return;}
  const id=button.dataset.sfx as SfxId;if(!SFX_IDS.includes(id))return;
  const payload:SfxPayload={version:1,id,createdAt:Date.now()};playSfx(id);
  void OBR.broadcast.sendMessage(SFX_CHANNEL,payload,{destination:'REMOTE'}).catch(error=>{console.error('Falha ao enviar som:',error);status.textContent='Não foi possível enviar o som à sala.';});
 }));
}


type TrackId='calm'|'village'|'travel'|'tavern'|'mystery'|'rest'|'stop';
type TrackDefinition={url:string;credit:string};
const TRACKS:Record<Exclude<TrackId,'stop'>,TrackDefinition>={
 calm:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wholesome_by_Kevin_MacLeod.ogg',credit:'Wholesome — Kevin MacLeod'},
 village:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Medieval_Dream_by_Frank_Schr%C3%B6ter.ogg',credit:'Medieval Dream — Frank Schröter'},
 travel:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Warm_Sunset_by_MusicLFiles.ogg',credit:'Warm Sunset — MusicLFiles'},
 tavern:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Medieval_Story_by_Frank_Schr%C3%B6ter.ogg',credit:'Medieval Story — Frank Schröter'},
 mystery:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Placid_Ambient_by_MusicLFiles.ogg',credit:'Placid Ambient — MusicLFiles'},
 rest:{url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Purrple_Cat_-_Quiet_Night.ogg',credit:'Quiet Night — Purrple Cat'}
};
let musicAudio:HTMLAudioElement|undefined;
let musicFadeTimer:number|undefined;
let currentTrack:TrackId='stop';
let musicVolume=.28;
let musicEnabled=false;
function fadeOutMusic(player:HTMLAudioElement):void{
 const initial=player.volume;const started=Date.now();
 const timer=window.setInterval(()=>{
  const progress=Math.min(1,(Date.now()-started)/650);player.volume=Math.max(0,initial*(1-progress));
  if(progress>=1){window.clearInterval(timer);player.pause();player.src='';}
 },30);
}
function stopMusic():void{
 currentTrack='stop';
 if(musicFadeTimer!==undefined){window.clearInterval(musicFadeTimer);musicFadeTimer=undefined;}
 if(musicAudio){fadeOutMusic(musicAudio);musicAudio=undefined;}
}
function startMusic(track:TrackId,createdAt=Date.now()):void{
 currentTrack=track;
 if(track==='stop'){stopMusic();return;}
 if(!musicEnabled)return;
 const definition=TRACKS[track];if(!definition)return;
 if(musicFadeTimer!==undefined){window.clearInterval(musicFadeTimer);musicFadeTimer=undefined;}
 const previous=musicAudio;
 const next=new Audio(definition.url);next.preload='auto';next.loop=true;next.volume=0;
 next.addEventListener('error',()=>{
  const status=document.querySelector<HTMLElement>('#music-audio-status');
  if(status)status.textContent='Não foi possível carregar a faixa. Verifique a conexão e tente novamente.';
 },{once:true});
 next.addEventListener('loadedmetadata',()=>{
  if(Number.isFinite(next.duration)&&next.duration>0){
   const elapsed=Math.max(0,(Date.now()-createdAt)/1000);
   try{next.currentTime=elapsed%next.duration;}catch{/* O navegador pode ainda estar preparando a faixa. */}
  }
 },{once:true});
 musicAudio=next;
 void next.play().then(()=>{
  const status=document.querySelector<HTMLElement>('#music-audio-status');
  if(status)status.textContent='Em reprodução: '+definition.credit+'.';
  if(previous)fadeOutMusic(previous);
  const started=Date.now();
  musicFadeTimer=window.setInterval(()=>{
   if(musicAudio!==next){if(musicFadeTimer!==undefined)window.clearInterval(musicFadeTimer);return;}
   const progress=Math.min(1,(Date.now()-started)/900);next.volume=musicVolume*progress;
   if(progress>=1&&musicFadeTimer!==undefined){window.clearInterval(musicFadeTimer);musicFadeTimer=undefined;}
  },30);
 }).catch(error=>{
  console.warn('Falha ao iniciar trilha:',track,error);
  const status=document.querySelector<HTMLElement>('#music-audio-status');
  if(status)status.textContent='Trilha selecionada. Clique em ATIVAR MÚSICA neste dispositivo.';
 });
}
function enableMusic():void{
 musicEnabled=true;
 const status=document.querySelector<HTMLElement>('#music-audio-status'),volume=document.querySelector<HTMLInputElement>('#music-volume'),button=document.querySelector<HTMLButtonElement>('#music-audio-enable');
 if(volume)volume.disabled=false;
 if(button)button.textContent='MÚSICA LIBERADA';
 if(status)status.textContent='Música liberada neste dispositivo.';
 if(currentTrack!=='stop')startMusic(currentTrack);
}
function receiveTrack(value:unknown):void{
 if(!value||typeof value!=='object')return;
 const data=value as {version?:number;track?:TrackId;createdAt?:number};
 if(data.version!==1||!['calm','village','travel','tavern','mystery','rest','stop'].includes(data.track||'')||typeof data.createdAt!=='number'||Math.abs(Date.now()-data.createdAt)>120000)return;
 startMusic(data.track!,data.createdAt);
}
function bindSoundtracks(root:HTMLElement,connected:boolean,isGM:boolean):void{
 const enable=root.querySelector<HTMLButtonElement>('#music-audio-enable'),volume=root.querySelector<HTMLInputElement>('#music-volume'),output=root.querySelector<HTMLOutputElement>('#music-volume-value');
 if(!enable||!volume||!output)return;
 enable.textContent=musicEnabled?'MÚSICA LIBERADA':'ATIVAR MÚSICA';
 enable.addEventListener('click',enableMusic);
 volume.disabled=!musicEnabled;volume.value=String(musicVolume);output.textContent=Math.round(musicVolume*100)+'%';
 volume.addEventListener('input',()=>{musicVolume=Number(volume.value);output.textContent=Math.round(musicVolume*100)+'%';if(musicAudio)musicAudio.volume=musicVolume;});
 root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach(button=>button.addEventListener('click',()=>{
  if(!connected||!isGM)return;
  const track=button.dataset.track as TrackId;if(!['calm','village','travel','tavern','mystery','rest','stop'].includes(track))return;
  const createdAt=Date.now();const payload={version:1,track,createdAt};
  startMusic(track,createdAt);
  void OBR.broadcast.sendMessage(SFX_CHANNEL,payload,{destination:'REMOTE'}).catch(error=>console.error('Falha ao sincronizar trilha:',error));
 }));
}

function bindLocalAudioControls(root: HTMLElement): void {
  const enable = root.querySelector<HTMLButtonElement>('#ambience-audio-enable');
  const volume = root.querySelector<HTMLInputElement>('#ambience-volume');
  const value = root.querySelector<HTMLOutputElement>('#ambience-volume-value');
  const status = root.querySelector<HTMLElement>('#ambience-audio-status');
  const mute = root.querySelector<HTMLButtonElement>('#ambience-audio-mute');
  if (!enable || !volume || !value || !status || !mute) return;

  enable.addEventListener('click', async () => {
    if (!['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss'].includes(activePreset)) {
      status.textContent = 'O mestre ainda não escolheu um ambiente.';
      return;
    }
    try {
      startAudio(activePreset, Number(volume.value));
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
    enable.disabled = !['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss'].includes(activePreset);
    enable.textContent = 'ATIVAR ÁUDIO';
    volume.disabled = true;
    mute.disabled = true;
    status.textContent = 'Áudio desativado neste dispositivo. O ambiente visual continua ativo.';
  });
}

async function publishSettings(root: HTMLElement, connected: boolean, isGM: boolean): Promise<void> {
  if (!connected || !isGM) return;
  const intensity = root.querySelector<HTMLInputElement>('#ambience-intensity');
  const brightness = root.querySelector<HTMLInputElement>('#ambience-brightness');
  const motion = root.querySelector<HTMLInputElement>('#ambience-motion');
  if (!intensity || !brightness || !motion) return;
  ambienceSettings = normalizeSettings({
    intensity: Number(intensity.value),
    brightness: Number(brightness.value),
    motion: Number(motion.value),
  });
  const intensityValue = root.querySelector<HTMLOutputElement>('#ambience-intensity-value');
  const brightnessValue = root.querySelector<HTMLOutputElement>('#ambience-brightness-value');
  const motionValue = root.querySelector<HTMLOutputElement>('#ambience-motion-value');
  if (intensityValue) intensityValue.textContent = ambienceSettings.intensity + '%';
  if (brightnessValue) brightnessValue.textContent = (ambienceSettings.brightness > 0 ? '+' : '') + ambienceSettings.brightness;
  if (motionValue) motionValue.textContent = ambienceSettings.motion + '%';
  window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => {
    const payload: AmbiencePayload = { version: 1, preset: activePreset, settings: ambienceSettings, createdAt: Date.now() };
    void OBR.room.setMetadata({ [METADATA_KEY]: { preset: activePreset, settings: ambienceSettings, updatedAt: payload.createdAt } });
    void OBR.broadcast.sendMessage(CHANNEL, payload, { destination: 'REMOTE' });
    if (activePreset !== 'off') void openAmbience(activePreset, ambienceSettings);
  }, 180);
}

function bindAmbienceCustomizer(root: HTMLElement, connected: boolean, isGM: boolean): void {
  const controls = ['#ambience-intensity', '#ambience-brightness', '#ambience-motion'];
  const updateLabels = () => {
    const intensity = root.querySelector<HTMLInputElement>('#ambience-intensity');
    const brightness = root.querySelector<HTMLInputElement>('#ambience-brightness');
    const motion = root.querySelector<HTMLInputElement>('#ambience-motion');
    const intensityValue = root.querySelector<HTMLOutputElement>('#ambience-intensity-value');
    const brightnessValue = root.querySelector<HTMLOutputElement>('#ambience-brightness-value');
    const motionValue = root.querySelector<HTMLOutputElement>('#ambience-motion-value');
    if (intensity && intensityValue) intensityValue.textContent = intensity.value + '%';
    if (brightness && brightnessValue) brightnessValue.textContent = (Number(brightness.value) > 0 ? '+' : '') + brightness.value;
    if (motion && motionValue) motionValue.textContent = motion.value + '%';
  };
  controls.forEach((selector) => root.querySelector<HTMLInputElement>(selector)?.addEventListener('input', updateLabels));
  root.querySelector<HTMLButtonElement>('#ambience-apply-settings')?.addEventListener('click', () => {
    void publishSettings(root, connected, isGM);
  });
  root.querySelector<HTMLButtonElement>('#ambience-reset-settings')?.addEventListener('click', () => {
    const values: Array<[string, number]> = [
      ['#ambience-intensity', DEFAULT_SETTINGS.intensity],
      ['#ambience-brightness', DEFAULT_SETTINGS.brightness],
      ['#ambience-motion', DEFAULT_SETTINGS.motion],
    ];
    values.forEach(([selector, value]) => {
      const input = root.querySelector<HTMLInputElement>(selector);
      if (input) input.value = String(value);
    });
    updateLabels();
    void publishSettings(root, connected, isGM);
  });
}

export function bindAmbienceActions(root: HTMLElement, connected: boolean, isGM: boolean): void {
  bindLocalAudioControls(root);
  bindAmbienceCustomizer(root, connected, isGM);
  bindSoundboard(root, connected, isGM);
  bindSoundtracks(root, connected, isGM);
  root.querySelectorAll<HTMLButtonElement>('[data-ambience]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!connected || !isGM) return;
      const preset = button.dataset.ambience as AmbiencePreset;
      if (!['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss', 'off'].includes(preset)) return;
      void (async () => {
        const payload: AmbiencePayload = { version: 1, preset, settings: ambienceSettings, createdAt: Date.now() };
        try {
          if (activePreset !== preset && audio) stopAudio();
          activePreset = preset;
          if (preset === 'off') { stopAudio(); await openAmbience('off'); }
          else await openAmbience(preset, ambienceSettings);
          refreshAudioPanel();
          await OBR.room.setMetadata({ [METADATA_KEY]: { preset, settings: ambienceSettings, updatedAt: payload.createdAt } });
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
  } else if (preset === 'city') {
    filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = 0.45;
    noiseGain.gain.value = 0.11;
    addDrone(context, master, 118, 0.008, 'triangle');
    const murmur = () => {
      if (!audio || audio.context !== context) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const band = context.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 280 + Math.random() * 700; band.Q.value = 0.8;
      osc.type = 'sawtooth'; osc.frequency.value = 65 + Math.random() * 45;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.006 + Math.random() * 0.006, context.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.8);
      osc.connect(band).connect(gain).connect(master);
      osc.start(); osc.stop(context.currentTime + 1.9);
    };
    audio.timers.push(window.setInterval(murmur, 900));
  } else if (preset === 'storm') {
    filter.type = 'highpass'; filter.frequency.value = 850;
    noiseGain.gain.value = 0.17;
    addDrone(context, master, 42, 0.025);
    const thunder = () => {
      if (!audio || audio.context !== context) return;
      const rumble = context.createOscillator();
      const gain = context.createGain();
      const low = context.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = 110;
      rumble.type = 'triangle'; rumble.frequency.value = 38 + Math.random() * 24;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.8);
      rumble.connect(low).connect(gain).connect(master);
      rumble.start(); rumble.stop(context.currentTime + 2.9);
    };
    audio.timers.push(window.setInterval(thunder, 7200 + Math.random() * 5000));
  } else if (preset === 'desert') {
    filter.type = 'lowpass'; filter.frequency.value = 460;
    noiseGain.gain.value = 0.16;
    addDrone(context, master, 64, 0.012, 'triangle');
    const sweep = context.createOscillator();
    const sweepGain = context.createGain();
    sweep.type = 'sine'; sweep.frequency.value = 0.07;
    sweepGain.gain.value = 120;
    sweep.connect(sweepGain).connect(filter.frequency);
    sweep.start();
    audio.sources.push(sweep, sweepGain);
  } else if (preset === 'snow') {
    filter.type = 'highpass'; filter.frequency.value = 1250;
    noiseGain.gain.value = 0.12;
    addDrone(context, master, 156, 0.009);
    const gust = context.createOscillator();
    const gustGain = context.createGain();
    gust.frequency.value = 0.035; gustGain.gain.value = 0.07;
    gust.connect(gustGain).connect(noiseGain.gain);
    gust.start();
    audio.sources.push(gust, gustGain);
  } else if (preset === 'swamp') {
    filter.type = 'lowpass'; filter.frequency.value = 1050;
    noiseGain.gain.value = 0.09;
    addDrone(context, master, 55, 0.018);
    const bubble = () => {
      if (!audio || audio.context !== context) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(95 + Math.random() * 90, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38 + Math.random() * 25, context.currentTime + 0.35);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
      osc.connect(gain).connect(master);
      osc.start(); osc.stop(context.currentTime + 0.42);
    };
    audio.timers.push(window.setInterval(bubble, 1100 + Math.random() * 700));
  } else if (preset === 'coast') {
    filter.type = 'lowpass'; filter.frequency.value = 680;
    noiseGain.gain.value = 0.035;
    const waves = context.createOscillator();
    const waveGain = context.createGain();
    waves.frequency.value = 0.075; waveGain.gain.value = 0.13;
    waves.connect(waveGain).connect(noiseGain.gain);
    waves.start();
    audio.sources.push(waves, waveGain);
    addDrone(context, master, 82, 0.006);
  } else if (preset === 'battlefield') {
    filter.type = 'lowpass'; filter.frequency.value = 300;
    noiseGain.gain.value = 0.14;
    addDrone(context, master, 46, 0.025);
    const impact = () => {
      if (!audio || audio.context !== context) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(100 + Math.random() * 60, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, context.currentTime + 0.5);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
      osc.connect(gain).connect(master);
      osc.start(); osc.stop(context.currentTime + 0.7);
    };
    audio.timers.push(window.setInterval(impact, 2400 + Math.random() * 1800));
  } else if (preset === 'abyss') {
    filter.type = 'lowpass'; filter.frequency.value = 150;
    noiseGain.gain.value = 0.055;
    addDrone(context, master, 31, 0.035);
    addDrone(context, master, 46.2, 0.018, 'triangle');
    addDrone(context, master, 69.3, 0.008, 'sawtooth');
    const pulse = context.createOscillator();
    const pulseGain = context.createGain();
    pulse.frequency.value = 0.045; pulseGain.gain.value = 0.035;
    pulse.connect(pulseGain).connect(master.gain);
    pulse.start();
    audio.sources.push(pulse, pulseGain);
  }
}

export function renderAmbienceOverlay(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset') as AmbiencePreset;
  const supported: AmbiencePreset[] = ['forest', 'tavern', 'dungeon', 'city', 'storm', 'desert', 'snow', 'swamp', 'coast', 'battlefield', 'abyss'];
  if (!supported.includes(preset)) return;
  const settings = normalizeSettings({ intensity: params.has('intensity') ? Number(params.get('intensity')) : undefined, brightness: params.has('brightness') ? Number(params.get('brightness')) : undefined, motion: params.has('motion') ? Number(params.get('motion')) : undefined });

  // A camada é um viewport independente: não depende da altura do conteúdo do #app.
  document.documentElement.style.cssText = 'width:100%;height:100%;min-height:100%;margin:0;padding:0;overflow:hidden;background:transparent;';
  document.body.style.cssText = 'position:fixed!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;';
  root.style.cssText = 'position:fixed!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important;pointer-events:none!important;z-index:2147483000!important;';
  root.innerHTML = '<main class="ambience-overlay ambience-overlay-' + preset + '" aria-hidden="true"><div class="ambience-atmosphere"></div><div class="ambience-clouds"></div><canvas class="ambience-weather-canvas"></canvas><div class="ambience-grain"></div><div class="ambience-edge"></div></main>';

  applyOverlaySettings(root, settings);
  const canvas = root.querySelector<HTMLCanvasElement>('.ambience-weather-canvas');
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !ctx) return;

  let width = 0;
  let height = 0;
  let frame = 0;
  let lastTime = 0;
  let lightning = 0;
  let nextLightning = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const random = (min: number, max: number) => min + Math.random() * (max - min);

  type Particle = { x: number; y: number; size: number; speed: number; drift: number; phase: number };
  let particles: Particle[] = [];

  const resize = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(window.innerWidth, rect.width, document.documentElement.clientWidth);
    height = Math.max(window.innerHeight, rect.height, document.documentElement.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.cssText = 'position:absolute!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;pointer-events:none!important;';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = preset === 'snow' ? Math.round(width * height / 2100) : preset === 'storm' ? Math.round(width * height / 1500) : 0;
    particles = Array.from({ length: Math.min(count, 950) }, () => ({
      x: random(-40, width + 40), y: random(-height, height),
      size: preset === 'snow' ? random(1.2, 5.2) : random(8, 26),
      speed: preset === 'snow' ? random(18, 85) : random(500, 1100),
      drift: random(-1, 1), phase: random(0, Math.PI * 2),
    }));
  };

  const drawSnowflake = (p: Particle) => {
    const r = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(p.phase) * 0.6);
    ctx.shadowColor = 'rgba(238,248,255,.85)';
    ctx.shadowBlur = r * 2.5;
    ctx.strokeStyle = 'rgba(245,250,255,' + Math.min(.82, .35 + r / 9) + ')';
    ctx.lineWidth = Math.max(.65, r * .22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const a = arm * Math.PI / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2);
      for (const side of [-1, 1]) {
        const bx = Math.cos(a) * r * 1.35;
        const by = Math.sin(a) * r * 1.35;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + side * .75) * r * .65, by + Math.sin(a + side * .75) * r * .65);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  const draw = (time: number) => {
    const dt = Math.min(.04, (time - (lastTime || time)) / 1000);
    lastTime = time;
    ctx.clearRect(0, 0, width, height);
    const intensity = settings.intensity / 100;
    const motion = settings.motion / 65;
    ctx.globalAlpha = intensity;

    if (preset === 'snow') {
      const gust = (Math.sin(time * .00022 * motion) * 260 + Math.sin(time * .00061 * motion) * 110);
      for (const p of particles) {
        p.x += (gust + p.drift * 75) * dt * motion;
        p.y += p.speed * dt * motion;
        p.phase += dt * .55;
        if (p.y > height + 24 || p.x > width + 60 || p.x < -60) {
          p.x = random(-80, width + 80); p.y = random(-100, -20);
        }
        drawSnowflake(p);
      }
      // Rajadas de neve soprada: faixas largas e translúcidas, não uma textura de bolinhas.
      const veil = ctx.createLinearGradient(0, height * .15, width, height * .8);
      veil.addColorStop(0, 'rgba(222,239,250,0)');
      veil.addColorStop(.48, 'rgba(222,239,250,.13)');
      veil.addColorStop(1, 'rgba(222,239,250,0)');
      ctx.fillStyle = veil;
      ctx.save();
      ctx.translate(Math.sin(time * .00018) * 85, 0);
      ctx.fillRect(-width * .2, height * .22, width * 1.4, height * .48);
      ctx.restore();
    } else if (preset === 'storm') {
      for (const p of particles) {
        p.x += (-360 + p.drift * 90) * dt * motion;
        p.y += p.speed * dt * motion;
        if (p.y > height + 40 || p.x < -50) {
          p.x = random(0, width + 180); p.y = random(-180, -20);
        }
        const length = p.size * (1.1 + p.speed / 600);
        ctx.strokeStyle = 'rgba(205,220,235,' + random(.12, .32) + ')';
        ctx.lineWidth = p.speed > 850 ? 1.45 : .8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - length * .34, p.y + length);
        ctx.stroke();
      }
      if (time > nextLightning) {
        lightning = random(.25, .8);
        nextLightning = time + random(6500, 14000);
      }
      if (lightning > 0) {
        ctx.fillStyle = 'rgba(218,231,248,' + lightning * .2 + ')';
        ctx.fillRect(0, 0, width, height);
        lightning *= .78;
        if (lightning < .025) lightning = 0;
      }
    }
    ctx.globalAlpha = 1;
    frame = window.requestAnimationFrame(draw);
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(document.documentElement);
  observer.observe(root);
  window.addEventListener('resize', resize, { passive: true });
  frame = window.requestAnimationFrame(draw);
  // O documento do modal é descartado ao fechar; listeners e animação não sobrevivem à cena.
  window.addEventListener('pagehide', () => {
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', resize);
  }, { once: true });
}
