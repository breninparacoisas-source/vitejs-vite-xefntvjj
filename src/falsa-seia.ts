import OBR from '@owlbear-rodeo/sdk';
import './falsa-seia.css';

const CHANNEL='com.arton.engine/falsa-seia/v1';
const MODAL_ID='com.arton.engine/falsa-seia/overlay';
const KEY='com.arton.engine/falsa-seia/state';
type Figure={id:string;title:string;x:number;y:number};
type State={active:boolean;mode:'cinematic'|'explore';fog:number;presence:string;whisper:string;wid:string;question:string;qid:string;figures:Figure[]};
let state:State={active:false,mode:'cinematic',fog:72,presence:'absent',whisper:'',wid:'',question:'',qid:'',figures:[]};
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const valid=(v:unknown):v is State=>!!v&&typeof v==='object'&&typeof (v as State).active==='boolean'&&((v as State).mode==='cinematic'||(v as State).mode==='explore')&&typeof (v as State).fog==='number'&&Array.isArray((v as State).figures);
async function openOverlay(){const url=new URL('/',window.location.origin);url.searchParams.set('falsaSeia','1');await OBR.modal.open({id:MODAL_ID,url:url.toString(),fullScreen:true,hideBackdrop:true,hidePaper:true,disablePointerEvents:false});}
async function closeOverlay(){try{await OBR.modal.close(MODAL_ID);}catch{/* already closed */}}
async function publish(next:State){state={...next};await OBR.room.setMetadata({[KEY]:state});await OBR.broadcast.sendMessage(CHANNEL,{type:'state',state},{destination:'REMOTE'});}
export function initializeFalsaSeiaBackground(){
 OBR.broadcast.onMessage(CHANNEL,e=>{const d=e.data as {type?:string;state?:State};if(d?.type==='state'&&valid(d.state)){state=d.state;if(state.active)void openOverlay().catch(console.error);else void closeOverlay();}});
 void OBR.room.getMetadata().then(m=>{const v=m[KEY];if(valid(v)){state=v;if(v.active)void openOverlay().catch(console.error);}}).catch(console.error);
 OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v)){state=v;if(v.active)void openOverlay().catch(console.error);else void closeOverlay();}});
}
export function renderFalsaSeiaPanel(connected:boolean,isGM:boolean){
 const disabled=connected&&isGM?'':'disabled';
 return '<section class="fs-intro"><span>EVENTO ONÍRICO · EXPERIÊNCIA IMERSIVA</span><h3>Falsa Seia</h3><p>Um espaço mental distorcido pelo Abismo. Inicie a experiência; depois, conduza a cena diretamente de dentro dela, sem precisar fechar o ambiente.</p></section><section class="fs-panel"><div class="fs-panel-status">'+(state.active?'A Falsa Seia está ativa.':'Aguardando início.')+'</div><button class="fs-start" data-start '+(disabled||state.active?'disabled':'')+'>ENTRAR NA FALSA SEIA</button><button data-stop '+(disabled||!state.active?'disabled':'')+'>ENCERRAR EXPERIÊNCIA</button><p class="fs-note">Os controles narrativos estarão disponíveis em um painel discreto dentro do próprio ambiente, exclusivo do Mestre.</p></section>';
}
export function bindFalsaSeiaActions(root:HTMLElement,connected:boolean,isGM:boolean){
 const can=connected&&isGM;
 root.querySelector('[data-start]')?.addEventListener('click',()=>{if(can)void publish({...state,active:true}).then(openOverlay).catch(e=>{console.error(e);OBR.notification.show('Não foi possível abrir a Falsa Seia.');});});
 root.querySelector('[data-stop]')?.addEventListener('click',()=>{if(can)void publish({...state,active:false}).then(closeOverlay);});
 OBR.broadcast.onMessage(CHANNEL,e=>{const d=e.data as {type?:string;text?:string;player?:string};if(d?.type==='reply'&&d.text){const el=root.querySelector('#fs-reply');if(el)el.textContent=(d.player?d.player+': ':'')+d.text;}});
}
export function renderFalsaSeiaOverlay(root:HTMLElement){
 root.classList.add('falsa-seia-overlay');
 root.innerHTML='<main class="fs-world" data-mode="cinematic"><div class="fs-sky"></div><div class="fs-horizon"></div><div class="fs-ruins"></div><div class="fs-fog"></div><div class="fs-ground"></div><div class="fs-presence"></div><div class="fs-figures"></div><div class="fs-whisper"></div><div class="fs-ripple"></div><form class="fs-question"><p></p><input placeholder="Responder..." maxlength="500" aria-label="Sua resposta"><button>Enviar</button></form><aside class="fs-gm-console" hidden><button class="fs-console-close" title="Recolher painel">×</button><span>CONDUÇÃO DA CENA</span><label>Atmosfera <input id="fs-gm-fog" type="range" min="20" max="100" value="72"></label><label>Presença <select id="fs-gm-presence"><option value="absent">Ausente</option><option value="distant">Distante</option><option value="observing">Observando</option><option value="nearby">Próxima</option><option value="manifested">Manifestada</option></select></label><label>Sussurro <input id="fs-gm-whisper" maxlength="180" placeholder="Fragmento de voz..."></label><button type="button" data-fs-whisper>Fazer surgir</button><label>Pergunta <input id="fs-gm-question" maxlength="300" placeholder="Pergunta aos personagens..."></label><button type="button" data-fs-question>Projetar na névoa</button><label>Silhueta <input id="fs-gm-title" maxlength="80" placeholder="Título opcional"></label><button type="button" data-fs-figure>Fazer emergir</button><button type="button" data-fs-mode>Ativar exploração livre</button><button type="button" data-fs-end>Encerrar Falsa Seia</button></aside><button class="fs-gm-tab" hidden title="Abrir condução">◈</button><div class="fs-player-hint">A névoa se move. Algo observa.</div></main>';
 const world=root.querySelector<HTMLElement>('.fs-world')!,figures=root.querySelector<HTMLElement>('.fs-figures')!,whisper=root.querySelector<HTMLElement>('.fs-whisper')!,question=root.querySelector<HTMLElement>('.fs-question')!,consolePanel=root.querySelector<HTMLElement>('.fs-gm-console')!,gmTab=root.querySelector<HTMLButtonElement>('.fs-gm-tab')!;
 let lastWhisper='',lastQuestion='',panX=0,panY=0,dragging=false,lastX=0,lastY=0,isGM=false;
 const paint=(v:State)=>{
  state=v;world.style.setProperty('--fog',String(v.fog/100));world.dataset.mode=v.mode;world.dataset.presence=v.presence;
  figures.innerHTML=v.figures.map(f=>'<button class="fs-figure" data-figure="'+esc(f.id)+'" style="left:'+f.x+'%;top:'+f.y+'%"><i></i><span>'+esc(f.title||'')+'</span></button>').join('');
  const fog=root.querySelector<HTMLInputElement>('#fs-gm-fog');if(fog)fog.value=String(v.fog);
  const presence=root.querySelector<HTMLSelectElement>('#fs-gm-presence');if(presence)presence.value=v.presence;
  const mode=root.querySelector<HTMLButtonElement>('[data-fs-mode]');if(mode)mode.textContent=v.mode==='explore'?'Voltar ao modo cinematográfico':'Ativar exploração livre';
  if(v.wid&&v.wid!==lastWhisper){lastWhisper=v.wid;whisper.textContent=v.whisper;whisper.style.left=(12+Math.random()*58)+'%';whisper.style.top=(18+Math.random()*48)+'%';whisper.classList.remove('show');void whisper.offsetWidth;whisper.classList.add('show');}
  if(v.qid&&v.qid!==lastQuestion){lastQuestion=v.qid;question.querySelector('p')!.textContent=v.question;question.classList.add('show');}
 };
 const send=(patch:Partial<State>)=>{if(isGM)void publish({...state,...patch}).catch(console.error);};
 OBR.onReady(async()=>{
  try{isGM=(await OBR.player.getRole())==='GM';if(isGM){consolePanel.hidden=false;gmTab.hidden=false;}}
  catch(e){console.warn('Não foi possível identificar o papel do jogador na Falsa Seia.',e);}
  try{const m=await OBR.room.getMetadata();const v=m[KEY];if(valid(v))paint(v);}catch(e){console.error(e);}
  OBR.room.onMetadataChange(m=>{const v=m[KEY];if(valid(v))paint(v);});
  OBR.broadcast.onMessage(CHANNEL,e=>{const d=e.data as {type?:string;state?:State};if(d?.type==='state'&&valid(d.state))paint(d.state);});
 });
 consolePanel.querySelector('.fs-console-close')?.addEventListener('click',()=>{consolePanel.classList.add('collapsed');});
 gmTab.addEventListener('click',()=>consolePanel.classList.remove('collapsed'));
 root.querySelector('#fs-gm-fog')?.addEventListener('input',e=>{const value=Number((e.target as HTMLInputElement).value);world.style.setProperty('--fog',String(value/100));});
 root.querySelector('#fs-gm-fog')?.addEventListener('change',e=>send({fog:Number((e.target as HTMLInputElement).value)}));
 root.querySelector('#fs-gm-presence')?.addEventListener('change',e=>send({presence:(e.target as HTMLSelectElement).value}));
 root.querySelector('[data-fs-whisper]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-whisper')!;if(el.value.trim())send({whisper:el.value.trim(),wid:String(Date.now())});el.value='';});
 root.querySelector('[data-fs-question]')?.addEventListener('click',()=>{const el=root.querySelector<HTMLInputElement>('#fs-gm-question')!;if(el.value.trim())send({question:el.value.trim(),qid:String(Date.now())});el.value='';});
 root.querySelector('[data-fs-figure]')?.addEventListener('click',()=>{const n=state.figures.length,el=root.querySelector<HTMLInputElement>('#fs-gm-title')!;send({figures:[...state.figures,{id:String(Date.now()),title:el.value.trim(),x:22+(n*21)%60,y:35+(n*17)%34}]});el.value='';});
 root.querySelector('[data-fs-mode]')?.addEventListener('click',()=>send({mode:state.mode==='explore'?'cinematic':'explore'}));
 root.querySelector('[data-fs-end]')?.addEventListener('click',()=>send({active:false}));
 question.addEventListener('submit',e=>{e.preventDefault();const input=question.querySelector('input')!,value=input.value.trim();if(value){void OBR.broadcast.sendMessage(CHANNEL,{type:'reply',text:value,player:'Jogador'},{destination:'REMOTE'});}input.value='';question.classList.remove('show');});
 world.addEventListener('click',e=>{const figure=(e.target as HTMLElement).closest<HTMLButtonElement>('.fs-figure');if(figure){figure.classList.toggle('approached');const ripple=root.querySelector<HTMLElement>('.fs-ripple')!;ripple.style.left=figure.style.left;ripple.style.top=figure.style.top;ripple.classList.remove('pulse');void ripple.offsetWidth;ripple.classList.add('pulse');}});
 world.addEventListener('pointerdown',e=>{if(state.mode!=='explore'||(e.target as HTMLElement).closest('button,input,form,aside'))return;dragging=true;lastX=e.clientX;lastY=e.clientY;world.setPointerCapture(e.pointerId);});
 world.addEventListener('pointermove',e=>{if(!dragging)return;panX+=e.clientX-lastX;panY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;world.style.setProperty('--pan-x',panX+'px');world.style.setProperty('--pan-y',panY+'px');});
 world.addEventListener('pointerup',()=>dragging=false);world.addEventListener('pointercancel',()=>dragging=false);
}
