(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function e(){return`PR #4 · 8b09935 · built 2026-10-09 03:32 UTC`}function t(e){return(e.replace(/^#\/?/,``).split(`?`)[0]??``).replace(/\/+$/,``)}function n(e,n,r){let i,a=()=>{i?.(),i=void 0,e.replaceChildren(),i=(n[t(location.hash)]??n[r])?.(e)};window.addEventListener(`hashchange`,a),a()}var r=e=>{e.innerHTML=`
    <h1>Lineup</h1>
    <p>Rhythm games you play with a real instrument.</p>
    <ul class="menu">
      <li><a href="#/mic">Mic &amp; latency test</a></li>
      <li><span>Strumline: ukulele (coming)</span></li>
      <li><span>Singline: voice (coming)</span></li>
      <li><span>Windline: ocarina, recorder, whistle (later)</span></li>
      <li><span>Beatline: claps, taps and percussion (coming)</span></li>
    </ul>
  `},i=[`echoCancellation`,`noiseSuppression`,`autoGainControl`];function a(e){let t={echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1};return e&&(t.deviceId={exact:e}),t}function o(e,t){return i.map(n=>{let r=e[n],i=r===void 0?`unreported`:r?`on`:`off`;return{key:n,supported:t[n]===!0,status:i}})}var s=new URL(`input-processor-g6qUgONh.js`,import.meta.url).href,c=`lineup-input`;function l(){return!!navigator.mediaDevices?.getUserMedia&&typeof AudioContext<`u`&&typeof AudioWorkletNode<`u`}async function u(e,t=0){let n=await navigator.mediaDevices.getUserMedia({audio:a(e)}),r=n.getAudioTracks()[0];if(!r)throw Error(`No audio track in the mic stream`);let i=new AudioContext({latencyHint:`interactive`});try{await i.audioWorklet.addModule(s);let e=i.createMediaStreamSource(n),a={channel:t},o=new AudioWorkletNode(i,c,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCountMode:`max`,processorOptions:a}),l=i.createGain();l.gain.value=0,e.connect(o).connect(l).connect(i.destination);let u=i.createAnalyser();u.fftSize=2048,e.connect(u);let d={ctx:i,stream:n,track:r,analyser:u,onMessage:()=>void 0,setChannel(e){let t={type:`channel`,value:e};o.port.postMessage(t)},async close(){o.port.onmessage=null,e.disconnect(),o.disconnect();for(let e of n.getTracks())e.stop();i.state!==`closed`&&await i.close()}};return o.port.onmessage=e=>d.onMessage(e.data),await i.resume().catch(()=>void 0),d}catch(e){for(let e of n.getTracks())e.stop();throw i.close(),e}}async function d(){return(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind===`audioinput`)}var f=[`C`,`C#`,`D`,`D#`,`E`,`F`,`F#`,`G`,`G#`,`A`,`A#`,`B`];function p(e){return 440*2**((e-69)/12)}function m(e){return 69+12*Math.log2(e/440)}function h(e,t){return 1200*Math.log2(e/t)}function g(e){let t=m(e),n=Math.round(t),r=f[(n%12+12)%12]??`?`,i=Math.floor(n/12)-1;return{midi:n,name:r,octave:i,label:`${r}${i}`,cents:(t-n)*100}}var _=[{number:4,label:`G4`,midi:67},{number:3,label:`C4`,midi:60},{number:2,label:`E4`,midi:64},{number:1,label:`A4`,midi:69}];function v(e){let t=_[0],n=1/0;for(let r of _){let i=h(e,p(r.midi));Math.abs(i)<Math.abs(n)&&(t=r,n=i)}return{string:t,cents:n}}function y(e){let t=window.devicePixelRatio||1,{width:n,height:r}=e.getBoundingClientRect(),i=Math.max(1,Math.round(n*t)),a=Math.max(1,Math.round(r*t));(e.width!==i||e.height!==a)&&(e.width=i,e.height=a);let o=e.getContext(`2d`);if(!o)throw Error(`2D canvas unsupported`);return o.setTransform(t,0,0,t,0,0),{g:o,width:n,height:r}}var b=`#1f1c30`,x=`#3b3656`;function S(e,t,n){let{g:r,width:i,height:a}=y(e);r.fillStyle=b,r.fillRect(0,0,i,a),r.strokeStyle=x,r.lineWidth=1,r.beginPath(),r.moveTo(0,a/2),r.lineTo(i,a/2),r.stroke(),r.strokeStyle=n,r.lineWidth=1.5,r.beginPath();let o=t.length/i;for(let e=0;e<i;e++){let n=1,i=-1,s=Math.min(t.length,Math.floor((e+1)*o));for(let r=Math.floor(e*o);r<s;r++){let e=t[r];e<n&&(n=e),e>i&&(i=e)}n>i||(r.moveTo(e+.5,a/2-a/2*i),r.lineTo(e+.5,a/2-a/2*n+1))}r.stroke()}function C(e,t,n,r){let{g:i,width:a,height:o}=y(e),s=e=>a*Math.min(1,Math.max(0,(e- -72)/72));i.fillStyle=b,i.fillRect(0,0,a,o),i.fillStyle=t>-6?r.hot:r.bar,i.fillRect(0,0,s(t),o),i.fillStyle=n>-1?r.hot:r.peak,i.fillRect(s(n)-1.5,0,3,o),i.fillStyle=x;for(let e=-72;e<=0;e+=12)i.fillRect(s(e),o-6,1,6)}function w(e){return e==null||!Number.isFinite(e)?`n/a`:`${(e*1e3).toFixed(1)} ms`}function T(e){return e<=-120?`-∞ dB`:`${e.toFixed(1)} dB`}function E(e){let t=Math.round(e);return`${t>0?`+`:t<0?`−`:`±`}${Math.abs(t)}¢`}var D=.4,O=1.5,k={echoCancellation:`Echo cancellation`,noiseSuppression:`Noise suppression`,autoGainControl:`Auto gain control`},A=`
  <p><a href="#/">← Back</a></p>
  <h1>Mic &amp; latency test</h1>
  <div class="row">
    <button data-id="start">Start mic</button>
    <button data-id="stop" disabled>Stop</button>
    <button data-id="resume" hidden>Resume audio</button>
  </div>
  <div class="row">
    <label>Input <select data-id="device"><option value="">Default</option></select></label>
    <label>Channel <select data-id="channel" disabled>
      <option value="0">1</option>
    </select></label>
  </div>
  <p class="status" data-id="status">Tap “Start mic”. Safari will ask for microphone access.</p>

  <section class="grid">
    <div class="panel">
      <h2>Pitch</h2>
      <div class="note" data-id="note">–</div>
      <div class="cents"><div class="cents-needle" data-id="needle"></div></div>
      <dl>
        <dt>Frequency</dt><dd data-id="hz">–</dd>
        <dt>Cents</dt><dd data-id="cents">–</dd>
        <dt>Nearest string</dt><dd data-id="string">–</dd>
        <dt>Clarity</dt><dd data-id="clarity">–</dd>
      </dl>
    </div>
    <div class="panel">
      <h2>Level</h2>
      <canvas class="meter" data-id="meter"></canvas>
      <dl>
        <dt>RMS</dt><dd data-id="rms">–</dd>
        <dt>Peak</dt><dd data-id="peak">–</dd>
        <dt>Clipping</dt><dd data-id="clip">–</dd>
      </dl>
      <h2>Onsets</h2>
      <div class="onset-row"><span class="onset-dot" data-id="dot"></span>
        <span data-id="onsets">0</span> detected</div>
      <dl>
        <dt>Last velocity</dt><dd data-id="velocity">–</dd>
        <dt>Detect → screen</dt><dd data-id="lag">–</dd>
      </dl>
    </div>
  </section>

  <div class="panel">
    <h2>Waveform</h2>
    <canvas class="scope" data-id="scope"></canvas>
  </div>

  <section class="grid">
    <div class="panel">
      <h2>Audio context</h2>
      <dl data-id="ctx-info"><dt>Not started</dt><dd></dd></dl>
    </div>
    <div class="panel">
      <h2>Voice processing <small>(requested: all off)</small></h2>
      <dl data-id="constraints"><dt>Not started</dt><dd></dd></dl>
    </div>
  </section>
  <div class="row">
    <button data-id="copy" disabled>Copy diagnostics</button>
  </div>
`,j=e=>{e.innerHTML=A;let t=t=>{let n=e.querySelector(`[data-id="${t}"]`);if(!n)throw Error(`missing [data-id=${t}]`);return n},n=t(`start`),r=t(`stop`),i=t(`resume`),a=t(`copy`),s=t(`device`),c=t(`channel`),f=t(`status`),p=t(`scope`),m=t(`meter`),h=null,_=0,y=!1,b=new Float32Array(2048),x=null,j=null,F=-120,I=-1/0,L=0,R=null,z=[],B=(e,t=`info`)=>{f.textContent=e,f.classList.toggle(`error`,t===`error`)},V=async()=>{try{let e=await d(),t=s.value;s.replaceChildren(new Option(`Default`,``)),e.forEach((e,t)=>{e.deviceId!=="default"&&e.deviceId&&s.add(new Option(e.label||`Input ${t+1}`,e.deviceId))}),s.value=[...s.options].some(e=>e.value===t)?t:``}catch{}},H=e=>t=>{t.type===`frame`?(x=t.frame,t.frame.pitchHz!==null&&(j=t.frame),F=Math.max(F,t.frame.peakDb),t.frame.peakDb>-.5&&(I=t.frame.time+O)):(L++,R=t.event,z.push(e.currentTime-t.event.time),z.length>10&&z.shift())},U=e=>{let{ctx:n,track:r}=e,i=r.getSettings(),a=navigator.audioSession,o=[[`State`,n.state],[`currentTime`,`${n.currentTime.toFixed(3)} s`],[`Context sampleRate`,`${n.sampleRate} Hz`],[`Mic sampleRate`,i.sampleRate?`${i.sampleRate} Hz`:`n/a`],[`baseLatency`,w(n.baseLatency)],[`outputLatency`,w(n.outputLatency)],[`Mic latency (reported)`,w(i.latency)],[`Channels`,String(i.channelCount??`n/a`)],[`Device`,r.label||`n/a`],[`audioSession.type`,a?.type??`n/a`]];i.sampleRate&&i.sampleRate!==n.sampleRate&&o.push([`⚠️ Rate mismatch`,`Browser is resampling the mic`]),t(`ctx-info`).innerHTML=o.map(([e,t])=>`<dt>${e}</dt><dd>${P(t)}</dd>`).join(``)},W=e=>{let n=o(e.track.getSettings(),navigator.mediaDevices.getSupportedConstraints()),r={off:`<span class="badge ok">OFF ✓</span>`,on:`<span class="badge bad">ON ✗</span>`,unreported:`<span class="badge warn">not reported</span>`};t(`constraints`).innerHTML=n.map(e=>`<dt>${k[e.key]}</dt><dd>${r[e.status]}${e.supported?``:` <small>(constraint unsupported)</small>`}</dd>`).join(``)},G=e=>{let t=e.track.getSettings().channelCount??1,n=c.value;c.replaceChildren();for(let e=0;e<t;e++)c.add(new Option(String(e+1),String(e)));t>1&&c.add(new Option(`Mix all`,`mix`)),c.value=[...c.options].some(e=>e.value===n)?n:`0`,c.disabled=t<2},K=()=>{_=requestAnimationFrame(K);let e=h;if(!e)return;let n=e.ctx.currentTime;b.length!==e.analyser.fftSize&&(b=new Float32Array(e.analyser.fftSize)),e.analyser.getFloatTimeDomainData(b),S(p,b,`#06d6a0`);let r=x;r&&(C(m,r.rmsDb,F,{bar:`#118ab2`,peak:`#ffd166`,hot:`#ef476f`}),t(`rms`).textContent=T(r.rmsDb),t(`peak`).textContent=T(F),t(`clarity`).textContent=r.clarity.toFixed(2),F=Math.max(r.peakDb,F-.5));let i=n<I;t(`clip`).innerHTML=i?`<span class="badge bad">CLIP – turn input gain down</span>`:`<span class="badge ok">no</span>`;let a=j&&n-j.time<D?j:null;if(a?.pitchHz){let e=g(a.pitchHz),n=v(a.pitchHz);t(`note`).textContent=e.label,t(`hz`).textContent=`${a.pitchHz.toFixed(1)} Hz`,t(`cents`).textContent=E(e.cents),t(`needle`).style.left=`${50+e.cents}%`,t(`needle`).classList.toggle(`in-tune`,Math.abs(e.cents)<5),t(`string`).textContent=`${n.string.label} ${E(n.cents)}`}else t(`note`).textContent=`–`,t(`needle`).style.left=`50%`,t(`needle`).classList.remove(`in-tune`);if(t(`onsets`).textContent=String(L),t(`dot`).classList.toggle(`lit`,!!R&&n-R.time<.12),R&&(t(`velocity`).textContent=(R.velocity??0).toFixed(2)),z.length){let e=z.reduce((e,t)=>e+t,0)/z.length;t(`lag`).textContent=`${w(e)} avg of ${z.length}`}U(e)},q=async()=>{let e=h;h=null,n.disabled=!1,r.disabled=!0,i.hidden=!0,e&&await e.close()},J=async()=>{await q(),n.disabled=!0,B(`Opening microphone…`);try{let e=c.value===`mix`?`mix`:Number(c.value)||0,t=await u(s.value||void 0,e);if(y){await t.close();return}h=t,t.onMessage=H(t.ctx),t.track.addEventListener(`ended`,()=>{B(`Input disconnected. Tap “Start mic” again.`,`error`),q()}),t.ctx.addEventListener(`statechange`,()=>{i.hidden=t.ctx.state===`running`||t.ctx.state===`closed`}),i.hidden=t.ctx.state===`running`,r.disabled=!1,a.disabled=!1,W(t),G(t),await V(),B(t.ctx.state===`running`?`Listening. Pluck a string.`:`Audio is “${t.ctx.state}”. Tap “Resume audio”.`)}catch(e){n.disabled=!1,B(N(e),`error`)}};n.addEventListener(`click`,()=>void J()),r.addEventListener(`click`,()=>{q(),B(`Stopped.`)}),i.addEventListener(`click`,()=>{h?.ctx.resume()}),s.addEventListener(`change`,()=>{h&&J()}),c.addEventListener(`change`,()=>{h?.setChannel(c.value===`mix`?`mix`:Number(c.value))}),a.addEventListener(`click`,()=>{if(!h)return;let e=JSON.stringify(M(h),null,2);navigator.clipboard.writeText(e).then(()=>B(`Diagnostics copied. Paste them into a PR comment.`),()=>B(`Copy failed. Clipboard access was blocked.`,`error`))});let Y=()=>void V();return navigator.mediaDevices?.addEventListener?.(`devicechange`,Y),l()||(n.disabled=!0,B(`This browser lacks getUserMedia or AudioWorklet. Use Safari 14.5+ or Chrome, over HTTPS.`,`error`)),_=requestAnimationFrame(K),()=>{y=!0,cancelAnimationFrame(_),navigator.mediaDevices?.removeEventListener?.(`devicechange`,Y),q()}};function M(t){let{ctx:n,track:r}=t,i=navigator.mediaDevices.getSupportedConstraints();return{build:e(),userAgent:navigator.userAgent,standalone:matchMedia(`(display-mode: standalone)`).matches,context:{state:n.state,sampleRate:n.sampleRate,baseLatency:n.baseLatency??null,outputLatency:n.outputLatency??null},track:{label:r.label,settings:r.getSettings()},constraints:o(r.getSettings(),i)}}function N(e){if(e instanceof DOMException){switch(e.name){case`NotAllowedError`:return`Microphone permission denied. In Safari, tap aA → Website Settings → Microphone → Allow, then reload.`;case`NotFoundError`:return`No microphone found.`;case`NotReadableError`:return`The microphone is busy or unavailable (another app may be using it).`;case`OverconstrainedError`:return`That input device is no longer available. Pick another one.`}return`${e.name}: ${e.message}`}return e instanceof Error?e.message:String(e)}function P(e){return e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}var F=document.getElementById(`app`);if(!F)throw Error(`#app missing`);var I=document.getElementById(`build-info`);I&&(I.textContent=e()),n(F,{"":r,mic:j},``),`serviceWorker`in navigator&&navigator.serviceWorker.register(`./sw.js`).catch(e=>{console.warn(`Service worker registration failed`,e)});