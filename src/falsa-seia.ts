import OBR from '@owlbear-rodeo/sdk';
import './falsa-seia.css';

const CHANNEL='com.arton.engine/falsa-seia/v1';
const MODAL_ID='com.arton.engine/falsa-seia/overlay';
const KEY='com.arton.engine/falsa-seia/state';
let backgroundIsGM=false;
let overlayOpened=false;
let overlayOpening:Promise<void>|null=null;

type Figure={id:string;title:string;x:number;y:number;depth:number};
type State={
 active:boolean;mode:'cinematic'|'explore';fog:number;presence:string;
 whisper:string;wid:string;question:string;qid:string;figures:Figure[];
 reaction:string;rid:string;
};
let state:State={active:false,mode:'cinematic',fog:72,presence:'absent',whisper:'',wid:'',question:'',qid:'',figures:[],reaction:'',rid:''};
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const valid=(v:unknown):v is State=>!!v&&typeof v==='object'&&typeof (v as State).active==='boolean'&&((v as State).mode==='cinematic'||(v as State).mode==='explore')&&typeof (v as State).fog==='number'&&Array.isArray((v as State).figures);

async function openOverlay(){
 if(overlayOpened)return;
 if(overlayOpening){await overlayOpening;return;}
 const url=new URL('/',window.location.origin);url.searchParams.set('falsaSeia','1');if(backgroundIsGM)url.searchParams.set('gm','1');
 overlayOpening=OBR.modal.open({id:MODAL_ID,url:url.toString(),fullScreen:true,hideBackdrop:true,hidePaper:true,disablePointerEvents:false}).then(()=>{overlayOpened=true;}).finally(()=>{overlayOpening=null;});
 await overlayOpening;
}
async function closeOverlay(){overlayOpened=false;try{await OBR.modal.close(MODAL_ID);}catch{/* já fechada */}}
async function publish(next:State){
 state={...next};
 await OBR.room.setMetadata({[KEY]:state});
 await OBR.broadcast.sendMessage(CHANNEL,{type:'state',state},{destination:'REMOTE'});
}

export async function initializeFalsaSeiaBackground(){
 try{backgroundIsGM=(await OBR.player.getRole())==='GM';}catch(error){console.error('Falha ao identificar o Mestre na Falsa Seia.',error);}
 OBR.broadcast.onMessage(CHANNEL,e=>{
  const d=e.data as {type?:string;state?:State};
  if(d?.type==='state'&&valid(d.state)){state=d.state;if(state.active)void openOverlay().catch(console.error);else void closeOverlay();}
 });
 try{const m=await OBR.room.getMetadata();const v=m[KEY];if(valid(v)){state=v;if(v.active)await openOverlay();}}catch(error){console.error('Falha ao recuperar Falsa Seia.',error);}
 OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v)){state=v;if(v.active)void openOverlay().catch(console.error);else void closeOverlay();}});
}

export function renderFalsaSeiaPanel(connected:boolean,isGM:boolean){
 const disabled=connected&&isGM?'':'disabled';
 return '<section class="fs-intro"><span>EVENTO ONÍRICO · EXPERIÊNCIA IMERSIVA</span><h3>Falsa Seia</h3><p>Um espaço mental distorcido pelo Abismo. Inicie a experiência e conduza a cena de dentro dela.</p></section><section class="fs-panel"><div class="fs-panel-status">'+(state.active?'A Falsa Seia está ativa.':'Aguardando início.')+'</div><button class="fs-start" data-start '+(disabled||state.active?'disabled':'')+'>ENTRAR NA FALSA SEIA</button><button data-stop '+(disabled||!state.active?'disabled':'')+'>ENCERRAR EXPERIÊNCIA</button><p class="fs-note">Na cena, use o painel discreto do Mestre para controlar a atmosfera, as presenças e as interações.</p></section>';
}
export function bindFalsaSeiaActions(root:HTMLElement,connected:boolean,isGM:boolean){
 const can=connected&&isGM;
 root.querySelector('[data-start]')?.addEventListener('click',()=>{if(can)void publish({...state,active:true}).catch(e=>{console.error(e);OBR.notification.show('Não foi possível abrir a Falsa Seia.');});});
 root.querySelector('[data-stop]')?.addEventListener('click',()=>{if(can)void publish({...state,active:false}).then(closeOverlay);});
 OBR.broadcast.onMessage(CHANNEL,e=>{const d=e.data as {type?:string;text?:string;player?:string};if(d?.type==='reply'&&d.text){const el=root.querySelector('#fs-reply');if(el)el.textContent=(d.player?d.player+': ':'')+d.text;}});
}

export async function renderFalsaSeiaOverlay(root:HTMLElement){
 root.classList.add('falsa-seia-overlay');
 root.innerHTML='<main class="fs-world" data-mode="cinematic" data-presence="absent"><div class="fs-atmosphere"><div class="fs-cloud cloud-a"></div><div class="fs-cloud cloud-b"></div><div class="fs-cloud cloud-c"></div><div class="fs-grain"></div></div><div class="fs-scene"><div class="fs-distance distance-back"></div><div class="fs-distance distance-mid"></div><div class="fs-ground"></div><div class="fs-presence"></div><div class="fs-figures"></div></div><div class="fs-whisper"></div><div class="fs-ripple"></div><div class="fs-interaction-hint"></div><form class="fs-question"><p></p><div><input placeholder="Responder..." maxlength="500" aria-label="Sua resposta"><button>Enviar</button></div></form><aside class="fs-gm-console" hidden><button class="fs-console-close" title="Recolher painel">×</button><span>CONDUÇÃO DA CENA</span><label>Atmosfera <input id="fs-gm-fog" type="range" min="15" max="100" value="72"></label><label>Presença <select id="fs-gm-presence"><option value="absent">Ausente</option><option value="distant">Distante</option><option value="observing">Observando</option><option value="nearby">Próxima</option><option value="manifested">Manifestada</option></select></label><label>Sussurro <input id="fs-gm-whisper" maxlength="180" placeholder="Fragmento de voz..."></label><button type="button" data-fs-whisper>Deixar o sussurro atravessar</button><label>Pergunta <input id="fs-gm-question" maxlength="300" placeholder="Pergunta aos personagens..."></label><button type="button" data-fs-question>Projetar na névoa</button><label>Silhueta <input id="fs-gm-title" maxlength="80" placeholder="Título opcional"></label><button type="button" data-fs-figure>Fazer emergir</button><button type="button" data-fs-mode>Ativar exploração livre</button><button type="button" data-fs-reaction>Fazer o espaço reagir</button><div class="fs-replies" aria-live="polite"><small>RESPOSTAS DOS JOGADORES</small></div><button type="button" data-fs-end>Encerrar Falsa Seia</button></aside><button class="fs-gm-tab" hidden title="Abrir condução">◈</button><div class="fs-player-hint">A névoa se move. Algo observa.</div><div class="fs-explore-help">WASD / setas para caminhar · arraste para olhar · roda do mouse para aproximar</div></main>';

 const world=root.querySelector<HTMLElement>('.fs-world')!;
 const scene=root.querySelector<HTMLElement>('.fs-scene')!;
 const figures=root.querySelector<HTMLElement>('.fs-figures')!;
 const whisper=root.querySelector<HTMLElement>('.fs-whisper')!;
 const question=root.querySelector<HTMLElement>('.fs-question')!;
 const consolePanel=root.querySelector<HTMLElement>('.fs-gm-console')!;
 const gmTab=root.querySelector<HTMLButtonElement>('.fs-gm-tab')!;
 const hint=root.querySelector<HTMLElement>('.fs-interaction-hint')!;
 const isGM=new URLSearchParams(window.location.search).get('gm')==='1';
 let lastWhisper='',lastQuestion='',lastReaction='';
 let camX=0,camY=0,zoom=1,dragging=false,lastX=0,lastY=0;
 let targetX=0,targetY=0,approachTimer:number|undefined;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const applyCamera=()=>{scene.style.transform='translate3d('+camX+'px,'+camY+'px,0) scale('+zoom+')';};
 const moveCamera=(x:number,y:number)=>{targetX=x;targetY=y;if(reduced){camX=x;camY=y;applyCamera();return;}scene.style.transition='transform 1.25s cubic-bezier(.18,.72,.18,1)';camX=x;camY=y;applyCamera();window.setTimeout(()=>{scene.style.transition='transform .16s linear';},1300);};
 const showHint=(text:string)=>{hint.textContent=text;hint.classList.add('visible');window.clearTimeout(approachTimer);approachTimer=window.setTimeout(()=>hint.classList.remove('visible'),3300);};
 const makeFigure=(f:Figure)=>'<button class="fs-figure" data-figure="'+esc(f.id)+'" data-x="'+f.x+'" data-y="'+f.y+'" style="--x:'+f.x+'%;--y:'+f.y+'%;--depth:'+f.depth+'"><span class="figure-aura"></span><span class="figure-body"><i class="figure-head"></i><i class="figure-torso"></i><i class="figure-cloak"></i></span><span class="figure-title">'+esc(f.title||'')+'</span></button>';
 const paint=(v:State)=>{
  state=v;world.style.setProperty('--fog',String(v.fog/100));world.dataset.mode=v.mode;world.dataset.presence=v.presence;
  figures.innerHTML=v.figures.map(makeFigure).join('');
  const fog=root.querySelector<HTMLInputElement>('#fs-gm-fog');if(fog)fog.value=String(v.fog);
  const presence=root.querySelector<HTMLSelectElement>('#fs-gm-presence');if(presence)presence.value=v.presence;
  const mode=root.querySelector<HTMLButtonElement>('[data-fs-mode]');if(mode)mode.textContent=v.mode==='explore'?'Voltar à condução cinematográfica':'Ativar exploração livre';
  if(v.wid&&v.wid!==lastWhisper){lastWhisper=v.wid;whisper.textContent=v.whisper;whisper.style.left=(12+Math.random()*58)+'%';whisper.style.top=(18+Math.random()*48)+'%';whisper.classList.remove('show');void whisper.offsetWidth;whisper.classList.add('show');}
  if(v.qid&&v.qid!==lastQuestion){lastQuestion=v.qid;question.querySelector('p')!.textContent=v.question;question.classList.add('show');}
  if(v.rid&&v.rid!==lastReaction){lastReaction=v.rid;world.classList.remove('world-reaction');void world.offsetWidth;world.classList.add('world-reaction');}
 };
 const send=(patch:Partial<State>)=>{if(isGM)void publish({...state,...patch}).catch(error=>{console.error(error);OBR.notification.show('Não foi possível atualizar a Falsa Seia.');});};

 if(isGM){consolePanel.hidden=false;gmTab.hidden=false;}
 try{const m=await OBR.room.getMetadata();const v=m[KEY];if(valid(v))paint(v);}catch(e){console.error(e);}
 OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v))paint(v);});
 OBR.broadcast.onMessage(CHANNEL,e=>{
  const d=e.data as {type?:string;state?:State;text?:string;player?:string};
  if(d?.type==='state'&&valid(d.state))paint(d.state);
  if(d?.type==='reply'&&d.text&&isGM){const log=root.querySelector<HTMLElement>('.fs-replies');if(log){const line=document.createElement('p');line.textContent=(d.player?d.player+': ':'Jogador: ')+d.text;log.prepend(line);}}
 });

 consolePanel.querySelector('.fs-console-close')?.addEventListener('click',()=>{consolePanel.classList.add('collapsed');});
 gmTab.addEventListener('click',()=>consolePanel.classList.remove('collapsed'));
 root.querySelector('#fs-gm-fog')?.addEventListener('input',e=>{world.style.setProperty('--fog',String(Number((e.target as HTMLInputElement).value)/100));});
 root.querySelector('#fs-gm-fog')?.addEventListener('change',e=>send({fog:Number((e.target as HTMLInputElement).value)}));
 root.querySelector('#fs-gm-presence')?.addEventListener('change',e=>send({presence:(e.target as HTMLSelectElement).value}));
 root.querySelector('[data-fs-whisper]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-whisper')!;if(el.value.trim())send({whisper:el.value.trim(),wid:String(Date.now())});el.value='';});
 root.querySelector('[data-fs-question]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-question')!;if(el.value.trim())send({question:el.value.trim(),qid:String(Date.now())});el.value='';});
 root.querySelector('[data-fs-figure]')?.addEventListener('click',()=>{const n=state.figures.length,el=root.querySelector<HTMLInputElement>('#fs-gm-title')!;const f:Figure={id:String(Date.now()),title:el.value.trim(),x:26+(n*23)%48,y:38+(n*13)%28,depth:0.75+(n%4)*0.1};send({figures:[...state.figures,f]});el.value='';});
 root.querySelector('[data-fs-mode]')?.addEventListener('click',()=>send({mode:state.mode==='explore'?'cinematic':'explore'}));
 root.querySelector('[data-fs-reaction]')?.addEventListener('click',()=>send({rid:String(Date.now())}));
 root.querySelector('[data-fs-end]')?.addEventListener('click',()=>send({active:false}));

 question.addEventListener('submit',e=>{e.preventDefault();const input=question.querySelector('input')!,value=input.value.trim();if(value){void OBR.player.getName().then(player=>OBR.broadcast.sendMessage(CHANNEL,{type:'reply',text:value,player},{destination:'REMOTE'}));}input.value='';question.classList.remove('show');});

 figures.addEventListener('click',e=>{
  const figure=(e.target as HTMLElement).closest<HTMLButtonElement>('.fs-figure');if(!figure)return;
  const x=Number(figure.dataset.x),y=Number(figure.dataset.y);
  const vw=world.clientWidth,vh=world.clientHeight;
  moveCamera(vw/2-(x/100)*(vw*2),vh/2-(y/100)*(vh*2));
  figures.querySelectorAll('.fs-figure').forEach(el=>el.classList.remove('approached'));
  figure.classList.add('approached');
  const title=figure.querySelector('.figure-title')?.textContent?.trim();
  showHint(title?'Você se aproxima de '+title+'.':'A silhueta parece perceber sua aproximação.');
  world.classList.remove('world-reaction');void world.offsetWidth;world.classList.add('world-reaction');
 });

 const move=(dx:number,dy:number)=>{if(state.mode!=='explore')return;moveCamera(Math.max(-world.clientWidth*.7,Math.min(world.clientWidth*.7,camX+dx)),Math.max(-world.clientHeight*.55,Math.min(world.clientHeight*.55,camY+dy)));};
 world.addEventListener('pointerdown',e=>{if(state.mode!=='explore'||(e.target as HTMLElement).closest('button,input,form,aside'))return;dragging=true;lastX=e.clientX;lastY=e.clientY;world.classList.add('looking');world.setPointerCapture(e.pointerId);});
 world.addEventListener('pointermove',e=>{if(!dragging)return;camX+=e.clientX-lastX;camY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;camX=Math.max(-world.clientWidth*.7,Math.min(world.clientWidth*.7,camX));camY=Math.max(-world.clientHeight*.55,Math.min(world.clientHeight*.55,camY));targetX=camX;targetY=camY;applyCamera();});
 const stopDrag=()=>{dragging=false;world.classList.remove('looking');};world.addEventListener('pointerup',stopDrag);world.addEventListener('pointercancel',stopDrag);
 world.addEventListener('wheel',e=>{if(state.mode!=='explore')return;e.preventDefault();zoom=Math.max(.8,Math.min(1.65,zoom+(e.deltaY<0?.06:-.06)));scene.style.transition='transform .25s ease-out';applyCamera();},{passive:false});
 const onKey=(e:KeyboardEvent)=>{if(state.mode!=='explore'||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;const k=e.key.toLowerCase();const step=e.shiftKey?38:22;if(['w','arrowup'].includes(k)){e.preventDefault();move(0,step);}else if(['s','arrowdown'].includes(k)){e.preventDefault();move(0,-step);}else if(['a','arrowleft'].includes(k)){e.preventDefault();move(step,0);}else if(['d','arrowright'].includes(k)){e.preventDefault();move(-step,0);}else if(k==='escape'){question.classList.remove('show');}};
 window.addEventListener('keydown',onKey);
 root.addEventListener('keydown',onKey);
 if(!isGM)world.dataset.mode=state.mode;
}
