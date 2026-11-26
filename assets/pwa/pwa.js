(()=>{'use strict';
const url='https://mr-radio.github.io/bukahyeon-dashboard/';
const title='북아현3구역 브리핑';
const install=document.getElementById('pwaInstall'), share=document.getElementById('pwaShare'), dialog=document.getElementById('pwaDialog'), body=document.getElementById('pwaBody'), status=document.getElementById('pwaStatus');
let promptEvent=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const sync=()=>{install.hidden=standalone()};
sync();matchMedia('(display-mode: standalone)').addEventListener?.('change',sync);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;sync()});
window.addEventListener('appinstalled',()=>{promptEvent=null;install.hidden=true;if(dialog.open)dialog.close()});
function open(label,markup){document.getElementById('pwaTitle').textContent=label;body.innerHTML=markup;status.textContent='';if(!dialog.open)dialog.showModal()}
document.getElementById('pwaClose').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
install.addEventListener('click',async()=>{
 if(promptEvent){const p=promptEvent;promptEvent=null;try{await p.prompt();await p.userChoice;return}catch{}}
 const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 open('앱 설치하기', '<p>홈 화면에 추가하면 주소창 없이 앱처럼 이용할 수 있습니다.</p>'+(ios?'<p><b>아이폰·아이패드</b><br>Safari에서 열기 → 공유 버튼 → 홈 화면에 추가</p><p>홈 화면에 추가할 때 웹 앱으로 열기 옵션이 있으면 켜 주세요.</p>':'<p><b>갤럭시·안드로이드</b><br>Chrome에서 열기 → 우측 상단 ⋮ → 앱 설치 또는 홈 화면에 추가</p><p><b>아이폰</b><br>Safari → 공유 → 홈 화면에 추가</p>')+'<p>카카오톡 안에서 열었다면 먼저 외부 브라우저(Chrome 또는 Safari)로 열어 주세요.</p><p>설치하지 않아도 기존 주소로 이용 가능합니다.</p>');
});
share.addEventListener('click',()=>open('대시보드 공유','<p>카카오톡이나 문자로 주소를 보내거나 QR코드를 스캔해 접속하세요.</p><input class="pwa-link" id="pwaUrl" readonly aria-label="공유 주소" value="'+url+'"><div class="pwa-buttons"><button id="pwaCopy" type="button">주소 복사</button>'+(navigator.share?'<button id="pwaNativeShare" type="button">카카오톡 등 공유</button>':'')+'</div><img src="assets/pwa/qr.svg" alt="북아현3구역 대시보드 접속 QR코드" width="164" height="164">'));
body.addEventListener('click',async e=>{
 if(e.target.id==='pwaCopy'){try{await navigator.clipboard.writeText(url);status.textContent='주소를 복사했습니다.'}catch{const field=document.getElementById('pwaUrl');field.focus();field.select();status.textContent='선택된 주소를 직접 복사해 주세요.'}}
 if(e.target.id==='pwaNativeShare'){try{await navigator.share({title,url})}catch(e){if(e.name!=='AbortError')status.textContent='주소 복사로 공유해 주세요.'}}
});
const offline=document.getElementById('pwaOffline');const net=()=>{offline.hidden=navigator.onLine};net();window.addEventListener('online',()=>{net();if(offline.dataset.stale==='true')location.reload()});window.addEventListener('offline',net);
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='PWA_OFFLINE'){offline.dataset.stale='true';offline.hidden=false}else if(e.data?.type==='PWA_ONLINE'){offline.dataset.stale='false';net()}})}
// Reopening an existing installed app after a long pause should fetch current data.
let hiddenAt=0;document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(hiddenAt&&Date.now()-hiddenAt>300000&&navigator.onLine&&standalone())location.reload()});
})();
