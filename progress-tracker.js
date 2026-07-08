/* =====================================================================
   ブートキャンプ進捗トラッカー（全課題ページ共通）
   -----------------------------------------------------------------
   使い方（新しい課題ページに入れる手順は2行だけ）:
     <script>window.BOOTCAMP_PAGE='vol05';</script>
     <script src="progress-tracker.js"></script>
   を </body> の直前（既存の<script>より後）に追加する。
   チェックボックスは <input type="checkbox" data-step="N"> 形式であること
   （既存の課題ページはすべてこの形式）。

   仕組み:
   - 受講生が完了チェックを付け外しするたび、GAS（Google Apps Script）
     経由でスプレッドシートに1行記録する
   - 受講生の識別は「初回チェック時に聞くニックネーム」＋
     「ブラウザごとに自動発行する匿名ID」の組み合わせ
   - PROGRESS_API が空のときは何もしない（記録なしでページは普通に動く）
   ===================================================================== */

// ▼▼▼ GASをデプロイしたらウェブアプリURLをここに貼る（編集箇所はここ1つだけ） ▼▼▼
window.BOOTCAMP_PROGRESS_API = 'https://script.google.com/macros/s/AKfycbzZ5EyARVK2hRBwuUKPt-zA9yjuWJWV1p4iqlqAXKNp74BbRyxM795CLr5LQJmVXmlgLQ/exec';
// ▲▲▲ 例: 'https://script.google.com/macros/s/AKfycb.../exec' ▲▲▲

(function(){
  const API  = window.BOOTCAMP_PROGRESS_API;
  const PAGE = window.BOOTCAMP_PAGE || '';
  const boxes = document.querySelectorAll('input[data-step]');
  if(!API || !PAGE || boxes.length === 0) return; // 未設定 or 課題ページ以外では動かない

  // ---- 受講生の識別 ----
  function getUid(){
    let uid = localStorage.getItem('bootcamp_uid');
    if(!uid){
      uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('bootcamp_uid', uid);
    }
    return uid;
  }
  function getName(){ return localStorage.getItem('bootcamp_name') || ''; }

  // ---- サーバーへ記録（掲示板と同じ no-cors POST。失敗しても画面には影響させない） ----
  function send(step, checked){
    try{
      fetch(API, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({
          type: 'check',
          page: PAGE,
          step: String(step),
          checked: !!checked,
          name: getName(),
          uid: getUid()
        })
      });
    }catch(e){ /* 記録失敗は無視（受講生の操作を止めない） */ }
  }

  // ---- 名前の入力モーダル（初回チェック時に1度だけ表示） ----
  let askedThisVisit = false;
  function ensureName(onDone){
    if(getName() || askedThisVisit){ onDone(); return; }
    askedThisVisit = true;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(31,45,61,.45);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(31,45,61,.2);max-width:400px;width:100%;padding:26px 24px;font-family:inherit">' +
        '<div style="font-weight:800;font-size:16px;margin-bottom:8px">🌸 はじめてのチェックですね！</div>' +
        '<div style="font-size:13.5px;color:#5b6b7e;line-height:1.7;margin-bottom:14px">進捗の記録のため、お名前またはニックネームを教えてください。運営が「どこでつまずいている方が多いか」を把握し、サポートに活用します。</div>' +
        '<input id="bcNameInput" type="text" placeholder="例：たけだ" style="width:100%;box-sizing:border-box;border:1px solid #e6ebf1;border-radius:10px;padding:10px 12px;font-size:14.5px;font-family:inherit;background:#f5f7fa">' +
        '<div style="display:flex;gap:10px;margin-top:14px;align-items:center">' +
          '<button id="bcNameSave" style="background:#2864f0;color:#fff;font-weight:800;font-size:14px;border:none;border-radius:99px;padding:10px 24px;cursor:pointer;font-family:inherit">保存してチェック</button>' +
          '<button id="bcNameSkip" style="background:none;border:none;color:#5b6b7e;font-size:13px;cursor:pointer;font-family:inherit;text-decoration:underline">あとで</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const input = ov.querySelector('#bcNameInput');
    input.focus();
    function close(saveName){
      if(saveName){
        const v = input.value.trim();
        if(v) localStorage.setItem('bootcamp_name', v);
      }
      ov.remove();
      onDone();
    }
    ov.querySelector('#bcNameSave').onclick = () => close(true);
    ov.querySelector('#bcNameSkip').onclick = () => close(false);
    input.addEventListener('keydown', e => { if(e.key === 'Enter') close(true); });
  }

  // ---- チェック状態の変化を検知して差分だけ送る ----
  // （課題ページはラベル部分のクリックでcheckedを直接書き換えるため、
  //   changeイベントだけでは拾えない。クリック後に全体を見比べる方式にする）
  function snapshot(){
    const s = {};
    document.querySelectorAll('input[data-step]').forEach(cb => { s[cb.dataset.step] = cb.checked; });
    return s;
  }
  let last = snapshot(); // 読み込み時の状態を基準にする（復元分を再送しない）

  function sync(){
    const now = snapshot();
    const changed = Object.keys(now).filter(k => now[k] !== last[k]);
    if(changed.length === 0) return;
    last = now;
    ensureName(() => { changed.forEach(k => send(k, now[k])); });
  }

  document.addEventListener('click', e => {
    if(e.target.closest('.check')) setTimeout(sync, 0);
  });
  document.querySelectorAll('input[data-step]').forEach(cb => {
    cb.addEventListener('change', () => setTimeout(sync, 0));
  });
})();
