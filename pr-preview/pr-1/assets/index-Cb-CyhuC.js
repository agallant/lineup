(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function e(){return`PR #1 · b56ebe0 · built 2026-10-07 06:10 UTC`}function t(e){return(e.replace(/^#\/?/,``).split(`?`)[0]??``).replace(/\/+$/,``)}function n(e,n,r){let i,a=()=>{i?.(),i=void 0,e.replaceChildren(),i=(n[t(location.hash)]??n[r])?.(e)};window.addEventListener(`hashchange`,a),a()}var r=e=>{e.innerHTML=`
    <h1>Strumline</h1>
    <p>A rhythm game you play with a real ukulele (GCEA).</p>
    <ul class="menu">
      <li><span>Mic &amp; latency test (coming in M1)</span></li>
      <li><span>Calibration (coming in M2)</span></li>
      <li><span>Play (coming in M3)</span></li>
    </ul>
  `},i=document.getElementById(`app`);if(!i)throw Error(`#app missing`);var a=document.getElementById(`build-info`);a&&(a.textContent=e()),n(i,{"":r},``),`serviceWorker`in navigator&&navigator.serviceWorker.register(`./sw.js`).catch(e=>{console.warn(`Service worker registration failed`,e)});