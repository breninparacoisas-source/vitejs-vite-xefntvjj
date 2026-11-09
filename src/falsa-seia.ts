import OBR from '@owlbear-rodeo/sdk';
import './falsa-seia.css';

const CHANNEL='com.arton.engine/falsa-seia/v2';
const MODAL_ID='com.arton.engine/falsa-seia/overlay';
const KEY='com.arton.engine/falsa-seia/state';
let backgroundIsGM=false;
let overlayOpened=false;
let overlayOpening:Promise<void>|null=null;

type Figure={id:string;title:string;x:number;y:number;depth:number;seed:number};
type State={
 active:boolean;mode:'cinematic'|'explore';fog:number;presence:'absent'|'distant'|'observing'|'nearby'|'manifested';
 whisper:string;wid:string;question:string;qid:string;figures:Figure[];rid:string;
};
type Interaction={type:'reply'|'approach'|'figure-action';text:string;player:string;figure?:string;action?:string};
const DEFAULT:State={active:false,mode:'cinematic',fog:72,presence:'absent',whisper:'',wid:'',question:'',qid:'',figures:[],rid:''};
let state:State={...DEFAULT};
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const valid=(v:unknown):v is State=>!!v&&typeof v==='object'&&typeof (v as State).active==='boolean'&&['cinematic','explore'].includes((v as State).mode)&&typeof (v as State).fog==='number'&&Array.isArray((v as State).figures);

async function openOverlay(){
 if(overlayOpened)return;
 if(overlayOpening){await overlayOpening;return;}
 const url=new URL('/',window.location.origin);url.searchParams.set('falsaSeia','1');if(backgroundIsGM)url.searchParams.set('gm','1');
 overlayOpening=OBR.modal.open({id:MODAL_ID,url:url.toString(),fullScreen:true,hideBackdrop:true,hidePaper:true,disablePointerEvents:false}).then(()=>{overlayOpened=true;}).finally(()=>{overlayOpening=null;});
 await overlayOpening;
}
async function closeOverlay(){overlayOpened=false;try{await OBR.modal.close(MODAL_ID);}catch{/* modal já encerrado */}}
async function publish(next:State){
 state={...next};
 await OBR.room.setMetadata({[KEY]:state});
 await OBR.broadcast.sendMessage(CHANNEL,{type:'state',state},{destination:'REMOTE'});
}
async function sendInteraction(data:Interaction){await OBR.broadcast.sendMessage(CHANNEL,data,{destination:'REMOTE'});}

export async function initializeFalsaSeiaBackground(){
 try{backgroundIsGM=(await OBR.player.getRole())==='GM';}catch(error){console.error('Falha ao identificar o Mestre na Falsa Seia.',error);}
 OBR.broadcast.onMessage(CHANNEL,e=>{
  const d=e.data as {type?:string;state?:State};
  if(d?.type==='state'&&valid(d.state)){state=d.state;if(state.active)void openOverlay().catch(console.error);else void closeOverlay();}
 });
 try{const m=await OBR.room.getMetadata();const v=m[KEY];if(valid(v)){state=v;if(v.active)await openOverlay();}}catch(error){console.error('Falha ao recuperar estado da Falsa Seia.',error);}
 OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v)){state=v;if(state.active)void openOverlay().catch(console.error);else void closeOverlay();}});
}

export function renderFalsaSeiaPanel(connected:boolean,isGM:boolean){
 const disabled=connected&&isGM?'':'disabled';
 return '<section class="fs-intro"><span>EVENTO ONÍRICO · EXPERIÊNCIA IMERSIVA</span><h3>Falsa Seia</h3><p>Um espaço mental distorcido pelo Abismo. Entre na experiência e conduza o que acontece dentro dela.</p></section><section class="fs-panel"><div class="fs-panel-status">'+(state.active?'A Falsa Seia está ativa.':'Aguardando início.')+'</div><button class="fs-start" data-start '+(disabled||state.active?'disabled':'')+'>ENTRAR NA FALSA SEIA</button><button data-stop '+(disabled||!state.active?'disabled':'')+'>ENCERRAR EXPERIÊNCIA</button><p class="fs-note">A condução da cena acontece dentro do ambiente imersivo.</p></section>';
}
export function bindFalsaSeiaActions(root:HTMLElement,connected:boolean,isGM:boolean){
 const can=connected&&isGM;
 root.querySelector('[data-start]')?.addEventListener('click',()=>{if(can)void publish({...state,...DEFAULT,active:true}).catch(e=>{console.error(e);OBR.notification.show('Não foi possível abrir a Falsa Seia.');});});
 root.querySelector('[data-stop]')?.addEventListener('click',()=>{if(can)void publish({...state,active:false}).catch(console.error);});
}

export async function renderFalsaSeiaOverlay(root:HTMLElement){
 root.classList.add('falsa-seia-overlay');
 root.innerHTML=`<main class="fs-world" data-mode="cinematic" data-presence="absent">
 <div class="fs-atmosphere"><div class="fs-mist mist-one"></div><div class="fs-mist mist-two"></div><div class="fs-mist mist-three"></div><div class="fs-haze"></div><div class="fs-grain"></div></div>
 <div class="fs-scene"><div class="fs-depth depth-far"></div><div class="fs-depth depth-near"></div><div class="fs-ground"></div><div class="fs-presence"></div><div class="fs-figures"></div></div>
 <div class="fs-whisper" aria-live="polite"></div><div class="fs-ripple"></div><div class="fs-interaction-hint"></div>
 <div class="fs-action-veil"><div class="fs-action-card"><p class="fs-action-title"></p><div><button type="button" data-player-action="observe">Observar</button><button type="button" data-player-action="speak">Falar</button><button type="button" data-player-action="touch">Tocar</button></div></div></div>
 <form class="fs-question"><p></p><div><input placeholder="Responder..." maxlength="500" aria-label="Sua resposta"><button>Enviar</button></div></form>
 <aside class="fs-gm-console" hidden><button class="fs-console-close" title="Recolher painel">×</button><span>CONDUÇÃO DA CENA</span>
 <label>Intensidade da névoa <input id="fs-gm-fog" type="range" min="15" max="100" value="72"></label>
 <label>Presença <select id="fs-gm-presence"><option value="absent">Ausente</option><option value="distant">Distante</option><option value="observing">Observando</option><option value="nearby">Próxima</option><option value="manifested">Manifestada</option></select></label>
 <label>Fragmento de voz <input id="fs-gm-whisper" maxlength="180" placeholder="Uma frase que atravessa a névoa..."></label><button type="button" data-fs-whisper>Soltar sussurro</button>
 <label>Pergunta <input id="fs-gm-question" maxlength="300" placeholder="Pergunta aos personagens..."></label><button type="button" data-fs-question>Projetar pergunta</button>
 <label>Identidade da silhueta <input id="fs-gm-title" maxlength="80" placeholder="Título opcional"></label><button type="button" data-fs-figure>Fazer emergir silhueta</button>
 <button type="button" data-fs-mode>Permitir exploração livre</button><button type="button" data-fs-reaction>Fazer o espaço reagir</button>
 <label>Resposta do Mestre <input id="fs-gm-response" maxlength="220" placeholder="Responder à interação..."></label><button type="button" data-fs-response>Deixar resposta no ambiente</button>
 <div class="fs-replies" aria-live="polite"><small>O QUE ACONTECE NA CENA</small><div class="fs-reply-list"></div></div><button type="button" data-fs-end>Encerrar Falsa Seia</button></aside>
 <button class="fs-gm-tab" hidden title="Abrir condução">◈</button><div class="fs-player-hint">A névoa se move. Algo observa.</div><div class="fs-explore-help">WASD / setas para caminhar · arraste para olhar · roda do mouse para aproximar</div>
 </main>`;

 const world=root.querySelector<HTMLElement>('.fs-world')!;
 const scene=root.querySelector<HTMLElement>('.fs-scene')!;
 const figures=root.querySelector<HTMLElement>('.fs-figures')!;
 const whisper=root.querySelector<HTMLElement>('.fs-whisper')!;
 const question=root.querySelector<HTMLElement>('.fs-question')!;
 const consolePanel=root.querySelector<HTMLElement>('.fs-gm-console')!;
 const gmTab=root.querySelector<HTMLButtonElement>('.fs-gm-tab')!;
 const hint=root.querySelector<HTMLElement>('.fs-interaction-hint')!;
 const actionVeil=root.querySelector<HTMLElement>('.fs-action-veil')!;
 const isGM=new URLSearchParams(window.location.search).get('gm')==='1';
 let lastWhisper='',lastQuestion='',lastReaction='',selectedFigure:Figure|null=null;
 let camX=0,camY=0,targetX=0,targetY=0,zoom=1,targetZoom=1,dragging=false,lastX=0,lastY=0;
 let approachTimer=0,raf=0;
 const keys=new Set<string>();
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
 const applyCamera=()=>{scene.style.transform='translate3d('+camX.toFixed(1)+'px,'+camY.toFixed(1)+'px,0) scale('+zoom.toFixed(3)+')';};
 const frame=()=>{
  const ease=reduced?1:.105;
  camX+=(targetX-camX)*ease;camY+=(targetY-camY)*ease;zoom+=(targetZoom-zoom)*.12;
  if(state.mode==='explore'&&keys.size&&!dragging){
   const speed=keys.has('shift')?4.8:2.6;
   if(keys.has('w')||keys.has('arrowup'))targetY+=speed;
   if(keys.has('s')||keys.has('arrowdown'))targetY-=speed;
   if(keys.has('a')||keys.has('arrowleft'))targetX+=speed;
   if(keys.has('d')||keys.has('arrowright'))targetX-=speed;
   targetX=clamp(targetX,-world.clientWidth*.62,world.clientWidth*.62);targetY=clamp(targetY,-world.clientHeight*.46,world.clientHeight*.46);
  }
  applyCamera();raf=window.requestAnimationFrame(frame);
 };
 const showHint=(text:string)=>{hint.textContent=text;hint.classList.add('visible');window.clearTimeout(approachTimer);approachTimer=window.setTimeout(()=>hint.classList.remove('visible'),3600);};
 const makeFigure=(f:Figure)=>'<button type="button" class="fs-figure" data-figure="'+esc(f.id)+'" style="--x:'+f.x+'%;--y:'+f.y+'%;--depth:'+(f.depth||1)+';--seed:'+f.seed+'"><span class="figure-aura"></span><span class="figure-body"><i class="figure-head"></i><i class="figure-neck"></i><i class="figure-torso"></i><i class="figure-cloak"></i><i class="figure-trail"></i></span><span class="figure-title">'+esc(f.title||'')+'</span></button>';
 const log=(text:string)=>{const list=root.querySelector<HTMLElement>('.fs-reply-list');if(!list)return;const p=document.createElement('p');p.textContent=text;list.prepend(p);};
 const paint=(v:State)=>{
  state=v;world.style.setProperty('--fog',String(v.fog/100));world.dataset.mode=v.mode;world.dataset.presence=v.presence;
  const existing=new Set(Array.from(figures.querySelectorAll<HTMLElement>('.fs-figure')).map(el=>el.dataset.figure||''));
  const incoming=new Set(v.figures.map(f=>f.id));
  for(const el of Array.from(figures.querySelectorAll<HTMLElement>('.fs-figure')))if(!incoming.has(el.dataset.figure||''))el.remove();
  for(const f of v.figures)if(!existing.has(f.id))figures.insertAdjacentHTML('beforeend',makeFigure(f));
  const fog=root.querySelector<HTMLInputElement>('#fs-gm-fog');if(fog&&document.activeElement!==fog)fog.value=String(v.fog);
  const presence=root.querySelector<HTMLSelectElement>('#fs-gm-presence');if(presence&&document.activeElement!==presence)presence.value=v.presence;
  const mode=root.querySelector<HTMLButtonElement>('[data-fs-mode]');if(mode)mode.textContent=v.mode==='explore'?'Retomar condução cinematográfica':'Permitir exploração livre';
  if(v.wid&&v.wid!==lastWhisper){lastWhisper=v.wid;whisper.textContent=v.whisper;whisper.style.left=(12+Math.random()*54)+'%';whisper.style.top=(20+Math.random()*43)+'%';whisper.classList.remove('show');void whisper.offsetWidth;whisper.classList.add('show');}
  if(v.qid&&v.qid!==lastQuestion){lastQuestion=v.qid;question.querySelector('p')!.textContent=v.question;question.classList.add('show');}
  if(v.rid&&v.rid!==lastReaction){lastReaction=v.rid;world.classList.remove('world-reaction');void world.offsetWidth;world.classList.add('world-reaction');const ripple=root.querySelector<HTMLElement>('.fs-ripple')!;ripple.style.left='50%';ripple.style.top='58%';ripple.classList.remove('pulse');void ripple.offsetWidth;ripple.classList.add('pulse');}
 };
 const send=(patch:Partial<State>)=>{if(isGM)void publish({...state,...patch}).catch(error=>{console.error(error);OBR.notification.show('Não foi possível atualizar a Falsa Seia.');});};
 if(isGM){consolePanel.hidden=false;gmTab.hidden=false;}
 try{const m=await OBR.room.getMetadata();const v=m[KEY];if(valid(v))paint(v);}catch(e){console.error(e);}
 OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v))paint(v);});
 OBR.broadcast.onMessage(CHANNEL,e=>{
  const d=e.data as {type?:string;state?:State;text?:string;player?:string;figure?:string;action?:string};
  if(d?.type==='state'&&valid(d.state))paint(d.state);
  if(isGM&&(d?.type==='reply'||d?.type==='approach'||d?.type==='figure-action'))log((d.player||'Jogador')+' '+(d.type==='approach'?'se aproximou de ':d.type==='figure-action'?'decidiu ':'respondeu: ')+(d.figure?d.figure+' — ':'')+(d.action?d.action+' — ':'')+(d.text||''));
 });

 consolePanel.querySelector('.fs-console-close')?.addEventListener('click',()=>{consolePanel.classList.add('collapsed');});
 gmTab.addEventListener('click',()=>consolePanel.classList.remove('collapsed'));
 root.querySelector('#fs-gm-fog')?.addEventListener('input',e=>{world.style.setProperty('--fog',String(Number((e.target as HTMLInputElement).value)/100));});
 root.querySelector('#fs-gm-fog')?.addEventListener('change',e=>send({fog:Number((e.target as HTMLInputElement).value)}));
 root.querySelector('#fs-gm-presence')?.addEventListener('change',e=>send({presence:(e.target as HTMLSelectElement).value as State['presence']}));
 root.querySelector('[data-fs-whisper]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-whisper')!;if(el.value.trim())send({whisper:el.value.trim(),wid:crypto.randomUUID()});el.value='';});
 root.querySelector('[data-fs-question]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-question')!;if(el.value.trim())send({question:el.value.trim(),qid:crypto.randomUUID()});el.value='';});
 root.querySelector('[data-fs-figure]')?.addEventListener('click',()=>{
  const n=state.figures.length,el=root.querySelector<HTMLInputElement>('#fs-gm-title')!;
  const spots=[{x:18,y:46},{x:36,y:39},{x:55,y:47},{x:76,y:42},{x:27,y:61},{x:67,y:59},{x:46,y:31},{x:86,y:55},{x:12,y:34},{x:58,y:67}];
  const spot=spots[n%spots.length];
  const f:Figure={id:crypto.randomUUID(),title:el.value.trim(),x:spot.x+(Math.random()*7-3.5),y:spot.y+(Math.random()*8-4),depth:.72+Math.random()*.48,seed:Math.floor(Math.random()*1000)};
  send({figures:[...state.figures,f]});el.value='';
 });
 root.querySelector('[data-fs-mode]')?.addEventListener('click',()=>send({mode:state.mode==='explore'?'cinematic':'explore'}));
 root.querySelector('[data-fs-reaction]')?.addEventListener('click',()=>send({rid:crypto.randomUUID()}));
 root.querySelector('[data-fs-response]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-response')!;if(el.value.trim())send({whisper:el.value.trim(),wid:crypto.randomUUID(),rid:crypto.randomUUID()});el.value='';});
 root.querySelector('[data-fs-end]')?.addEventListener('click',()=>send({active:false}));

 question.addEventListener('submit',e=>{e.preventDefault();const input=question.querySelector('input')!,value=input.value.trim();if(value){void OBR.player.getName().then(player=>sendInteraction({type:'reply',text:value,player}));}input.value='';question.classList.remove('show');});
 figures.addEventListener('click',e=>{
  const el=(e.target as HTMLElement).closest<HTMLButtonElement>('.fs-figure');if(!el)return;
  const figure=state.figures.find(f=>f.id===el.dataset.figure);if(!figure)return;
  selectedFigure=figure;targetX=clamp(world.clientWidth*.5-(figure.x/100)*(world.clientWidth*1.22),-world.clientWidth*.62,world.clientWidth*.62);targetY=clamp(world.clientHeight*.48-(figure.y/100)*(world.clientHeight*1.22),-world.clientHeight*.46,world.clientHeight*.46);targetZoom=1.13;
  figures.querySelectorAll('.fs-figure').forEach(item=>item.classList.toggle('approached',item===el));
  actionVeil.querySelector('.fs-action-title')!.textContent=figure.title||'A silhueta não possui nome';
  actionVeil.classList.add('show');showHint('A figura parece perceber que você a notou.');
  if(!isGM)void OBR.player.getName().then(player=>sendInteraction({type:'approach',text:'aproximou-se da figura',player,figure:figure.title||'silhueta sem nome'}));
  world.classList.remove('world-reaction');void world.offsetWidth;world.classList.add('world-reaction');
 });
 actionVeil.querySelectorAll<HTMLButtonElement>('[data-player-action]').forEach(button=>button.addEventListener('click',()=>{
  if(!selectedFigure)return;const action=button.dataset.playerAction||'observe';
  const labels:Record<string,string>={observe:'observa em silêncio',speak:'tenta falar com a figura',touch:'estende a mão em direção à figura'};
  const text=labels[action]||'interage com a figura';
  void OBR.player.getName().then(player=>sendInteraction({type:'figure-action',text,player,figure:selectedFigure?.title||'silhueta sem nome',action}));
  showHint(action==='observe'?'A névoa parece se contrair ao redor da figura.':action==='speak'?'Sua voz parece viajar para muito longe.':'A forma vacila antes do contato.');
  actionVeil.classList.remove('show');world.classList.remove('world-reaction');void world.offsetWidth;world.classList.add('world-reaction');
 }));
 world.addEventListener('pointerdown',e=>{if(state.mode!=='explore'||(e.target as HTMLElement).closest('button,input,form,aside,.fs-action-veil'))return;dragging=true;lastX=e.clientX;lastY=e.clientY;world.classList.add('looking');world.setPointerCapture(e.pointerId);});
 world.addEventListener('pointermove',e=>{if(!dragging)return;targetX=clamp(targetX+e.clientX-lastX,-world.clientWidth*.62,world.clientWidth*.62);targetY=clamp(targetY+e.clientY-lastY,-world.clientHeight*.46,world.clientHeight*.46);lastX=e.clientX;lastY=e.clientY;});
 const stopDrag=()=>{dragging=false;world.classList.remove('looking');};world.addEventListener('pointerup',stopDrag);world.addEventListener('pointercancel',stopDrag);
 world.addEventListener('wheel',e=>{if(state.mode!=='explore')return;e.preventDefault();targetZoom=clamp(targetZoom+(e.deltaY<0?.08:-.08),.78,1.7);},{passive:false});
 const onKeyDown=(e:KeyboardEvent)=>{if(state.mode!=='explore'||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){keys.add(key);if(key.startsWith('arrow'))e.preventDefault();}if(key==='escape'){question.classList.remove('show');actionVeil.classList.remove('show');}};
 const onKeyUp=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
 window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
 raf=window.requestAnimationFrame(frame);
 if(!isGM)world.dataset.mode=state.mode;
}
