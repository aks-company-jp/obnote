// OBノート：ラウンド中にショットの場所と結果を記録し、OB の原因を分析する。
// データはこの端末の中（localStorage）だけに保存する。外へは送らない。
const KEY = "obnote.v1";
const CLUBS = ["1W", "3W", "5W", "UT", "4I", "5I", "6I", "7I", "8I", "9I", "PW", "AW", "SW"];
const RESULTS = [["FW", "フェアウェイ"], ["ラフ", "ラフ"], ["バンカー", "バンカー"], ["林", "林"], ["グリーン", "グリーン"], ["OB", "OB"], ["ワンペナ", "ワンペナ"]];
const DIRS = ["左", "まっすぐ", "右"];
const SLOPES = ["平ら", "つま先上がり", "つま先下がり", "左足上がり", "左足下がり"];
const WINDS = ["無風", "アゲ", "フォロー", "左から", "右から"];
const MINDS = ["普通", "力んだ", "迷った", "急いだ", "飛ばしたい"];
const OBSIDES = ["なし", "右", "左", "両側"];

const $app = document.getElementById("app");
let db = load();
let draft = null;      // 入力中のショット
let view = db.current ? "round" : "home";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { rounds: [], current: null }; }
  catch { return { rounds: [], current: null }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast("保存できませんでした。書き出しでバックアップしてください"); }
}
function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cur = () => db.rounds.find(r => r.id === db.current);
const curHole = rd => rd.holes.find(h => h.no === rd.holeNo);
const pct = x => x == null ? "—" : Math.round(x * 100) + "%";

function chips(name, list, value, cls = "g3", extra = () => "") {
  return `<div class="grid ${cls}">${list.map(v => {
    const [val, label] = Array.isArray(v) ? v : [v, v];
    return `<button data-set="${name}" data-val="${esc(val)}" class="${value === val ? "sel" : ""} ${extra(val)}">${esc(label)}</button>`;
  }).join("")}</div>`;
}

// ---------- 画面 ----------
function render() {
  if (view === "home") return renderHome();
  if (view === "round") return renderRound();
  if (view === "holeEnd") return renderHoleEnd();
  if (view === "analysis") return renderAnalysis();
}

function renderHome() {
  const done = db.rounds.filter(r => r.finished);
  $app.innerHTML = `
    <h1>OBノート</h1>
    <p class="sub">打つ場所を GPS で残し、OB とワンペナの原因を見つけるためのメモです。</p>
    <div class="card">
      <div class="label">コース名（なくても可）</div>
      <input type="text" id="course" placeholder="例：〇〇カントリー" autocomplete="off">
      <div style="height:10px"></div>
      <button class="primary big" data-act="start">ラウンドを始める</button>
    </div>
    ${db.rounds.some(r => !r.finished) ? `<button class="big" data-act="resume">続きから記録する</button>` : ""}
    <button class="big" data-act="analysis" style="margin-top:10px">OB の分析を見る（${done.length}ラウンド）</button>
    <h2>これまでのラウンド</h2>
    ${db.rounds.length ? db.rounds.slice().reverse().map(r => {
      const total = r.holes.reduce((s, h) => s + (h.score || 0), 0);
      const ob = r.holes.flatMap(h => h.shots).filter(s => s.result === "OB").length;
      return `<div class="card row"><div><b>${esc(r.course || "コース名なし")}</b><div class="sub">${esc(r.date)}・${r.holes.length}ホール・OB ${ob}回${r.finished ? "" : "・記録中"}</div></div><div class="hole" style="font-size:22px">${total || "—"}</div></div>`;
    }).join("") : `<p class="sub">まだありません。</p>`}
    <h2>データ</h2>
    <div class="notice">記録はこの iPhone の中だけに保存されます。機種変更や消えたときのために、ときどき書き出してください。ホーム画面に追加して使うと、消えにくくなります。</div>
    <div class="grid g2" style="margin-top:10px">
      <button data-act="export">書き出す</button>
      <button data-act="import">読み込む</button>
    </div>
    <input type="file" id="file" accept="application/json" class="hidden">`;
}

function renderRound() {
  const rd = cur(); if (!rd) { view = "home"; return render(); }
  const hole = curHole(rd);
  const strokes = GolfAnalysis.holeStrokes(hole);
  $app.innerHTML = `
    <div class="row"><button class="link" data-act="home">← ホーム</button><span class="sub">${esc(rd.course || "")}</span></div>
    <div class="row" style="margin-top:4px">
      <button data-act="prevHole" ${rd.holeNo <= 1 ? "disabled" : ""}>‹</button>
      <div style="text-align:center"><div class="hole">${hole.no}番</div><div class="sub">ここまで ${strokes}打（パット除く）</div></div>
      <button data-act="nextHole" ${rd.holeNo >= 18 ? "disabled" : ""}>›</button>
    </div>
    <div class="card">
      <div class="label" style="margin-top:0">パー</div>
      ${chips("par", [3, 4, 5], hole.par)}
      <div class="label">このホールの OB の側</div>
      ${chips("obSide", OBSIDES, hole.obSide, "g4")}
    </div>
    ${draft ? renderDraft(hole) : `<button class="primary big" data-act="shot">📍 ここから打つ</button>`}
    ${hole.shots.length ? `<div class="card"><ul class="shots">${hole.shots.map((s, i) => `
      <li><span>${i + 1}打目 ${esc(s.club)} ${s.dir ? "・" + esc(s.dir) : ""}</span>
      <span><span class="tag ${s.result === "OB" ? "ob" : s.result === "ワンペナ" ? "pen" : ""}">${esc(s.result)}</span>${s.pos ? "" : ' <span class="sub">位置なし</span>'}</span></li>`).join("")}</ul>
      ${draft ? "" : `<button class="link" data-act="undo">最後の1打を取り消す</button>`}</div>` : ""}
    ${draft ? "" : `<button class="big" data-act="holeEnd" style="margin-top:6px">グリーンに乗った／ホール終了</button>`}
    ${draft ? "" : `<button class="link" data-act="finish">ラウンドを終える</button>`}`;
}

function renderDraft(hole) {
  const d = draft;
  return `<div class="card">
    <div class="row"><b>${hole.shots.length + 1}打目</b><span class="sub">${d.pos ? `位置 ±${Math.round(d.pos.acc)}m` : d.locating ? "位置を取得中…" : "位置なしで記録"}</span></div>
    <div class="label">クラブ</div>${chips("club", CLUBS, d.club, "g5")}
    <div class="label">結果</div>${chips("result", RESULTS, d.result, "g4", v => v === "OB" ? "ob" : v === "ワンペナ" ? "pen" : "")}
    <div class="label">曲がった方向</div>${chips("dir", DIRS, d.dir)}
    ${d.more ? `
      <div class="label">気持ち</div>${chips("mind", MINDS, d.mind)}
      <div class="label">ライの傾斜</div>${chips("slope", SLOPES, d.slope)}
      <div class="label">風</div>${chips("wind", WINDS, d.wind, "g5")}` :
      `<button class="link" data-act="more">気持ち・傾斜・風も記録する</button>`}
    <div class="grid g2" style="margin-top:12px">
      <button data-act="cancelShot">やめる</button>
      <button class="primary" data-act="saveShot" ${d.result ? "" : "disabled"}>記録する</button>
    </div></div>`;
}

function renderHoleEnd() {
  const rd = cur(), hole = curHole(rd);
  if (hole.putts == null) hole.putts = 2;
  const pre = GolfAnalysis.holeStrokes(hole) + hole.putts;
  if (hole.score == null || hole.scoreAuto) { hole.score = pre; hole.scoreAuto = true; }
  $app.innerHTML = `
    <div class="hole" style="margin-top:8px">${hole.no}番 の結果</div>
    <div class="card"><div class="label" style="margin-top:0">パット数</div>
      <div class="stepper"><button data-act="putt-">−</button><span>${hole.putts}</span><button data-act="putt+">＋</button></div></div>
    <div class="card"><div class="label" style="margin-top:0">スコア（ペナルティ込み）</div>
      <div class="stepper"><button data-act="score-">−</button><span>${hole.score}</span><button data-act="score+">＋</button></div>
      <p class="sub" style="text-align:center">記録から計算：${pre}打${hole.par ? `（パー${hole.par}）` : ""}</p></div>
    <button class="primary big" data-act="holeDone">${rd.holeNo >= 18 ? "ラウンドを終える" : `${rd.holeNo + 1}番へ`}</button>
    <button class="link" data-act="backRound">← ホールに戻る</button>`;
}

function bars(list, fmt = g => `${g.hit}/${g.n}`) {
  if (!list.length) return `<p class="sub">まだデータがありません。</p>`;
  return list.map(g => `<div class="bar ${g.few ? "few" : ""}"><span>${esc(g.key)}</span><span class="t"><i style="width:${Math.round(g.rate * 100)}%"></i></span><span class="v">${pct(g.rate)} ${fmt(g)}</span></div>`).join("");
}

function renderAnalysis() {
  const rounds = db.rounds.filter(r => r.holes.some(h => h.shots.length));
  const s = GolfAnalysis.summary(rounds);
  const side = s.bySide;
  $app.innerHTML = `
    <div class="row"><button class="link" data-act="home">← ホーム</button></div>
    <h1>OB の分析</h1>
    <p class="sub">${s.rounds}ラウンド・${s.shots}ショット（パット除く）。件数が${GolfAnalysis.MIN_N}回未満の項目は薄く表示しています。</p>
    <div class="stat"><div><b>${s.ob}</b>OB</div><div><b>${s.onePen}</b>ワンペナ</div><div><b>${s.penStrokes}</b>罰打の合計</div></div>
    <h2>ラウンドごとの推移</h2>
    ${rounds.length ? rounds.map(r => {
      const shots = r.holes.flatMap(h => h.shots);
      const pen = shots.reduce((t, x) => t + GolfAnalysis.penaltyOf(x), 0);
      const total = r.holes.reduce((t, h) => t + (h.score || 0), 0);
      return `<div class="bar"><span>${esc(r.date)}</span><span class="sub">${total ? `スコア ${total}・` : ""}OB ${shots.filter(x => x.result === "OB").length}回</span><span class="v">罰打 ${pen}</span></div>`;
    }).join("") : `<p class="sub">まだありません。</p>`}
    <p class="notice">罰打がなければ、スコアはその分だけ少なくなります。まず「1ラウンドの罰打」を減らすことを目標にしましょう。</p>
    <div class="card"><b>OB が出やすい状況</b>
      ${s.top.length ? `<ol style="margin:8px 0 0;padding-left:1.4em">${s.top.map(t => `<li><b>${esc(t.dim)}：${esc(t.key)}</b> … ${pct(t.rate)}（${t.hit}/${t.n}）${t.lift >= 1.5 ? `<br><span class="sub">全体の ${t.lift.toFixed(1)} 倍</span>` : ""}</li>`).join("")}</ol>`
        : `<p class="sub">OB の記録が増えると、ここに出ます。</p>`}
      ${s.teeObRate != null ? `<p class="sub" style="margin-bottom:0">パー4・5のティーショットの OB 率：${pct(s.teeObRate)}</p>` : ""}</div>
    <div class="card"><b>OB の方向</b>
      <p style="margin:6px 0">${side.total ? `OB ${side.total}回のうち、ホールの OB の側に曲げたのは ${side.toward}回。` : "まだ OB の記録がありません。"}</p>
      ${side.byDir.map(d => `<span class="tag ob" style="margin-right:6px">${esc(d.key)} ${d.n}回</span>`).join("")}</div>
    <h2>クラブ別の OB 率</h2>${bars(s.byClub)}
    <h2>気持ち</h2>${bars(s.byMind)}
    <h2>前のホールの影響</h2>${bars(s.byAfterBad)}
    <h2>ホールの時間帯</h2>${bars(s.bySeg)}
    <h2>ライの傾斜</h2>${bars(s.bySlope)}
    <h2>風</h2>${bars(s.byWind)}
    <h2>クラブ別の飛距離（GPS・目安）</h2>
    ${s.distance.length ? s.distance.map(d => `<div class="bar"><span>${esc(d.key)}</span><span class="sub">${d.n}回の平均</span><span class="v">${d.yd}y</span></div>`).join("") : `<p class="sub">位置つきのショットが続くと出ます。</p>`}
    <p class="notice">飛距離は「打った場所」から「次に打った場所」までの直線です。スマホの GPS は数m〜10mほどずれます。</p>`;
}

// ---------- 操作 ----------
function defaultClub(rd, hole) {
  if (!hole.shots.length && hole.par >= 4) return "1W";
  const last = rd.holes.flatMap(h => h.shots).slice(-1)[0];
  return hole.shots.length ? (last?.club || "7I") : (hole.par === 3 ? "7I" : "1W");
}

function newHole(no) { return { no, par: 4, obSide: "なし", shots: [], putts: null, score: null }; }

function startShot() {
  const rd = cur(), hole = curHole(rd);
  const lastShot = rd.holes.flatMap(h => h.shots).slice(-1)[0];
  draft = { club: defaultClub(rd, hole), result: null, dir: null, mind: "普通", slope: "平ら", wind: lastShot?.wind || "無風", more: false, locating: true, pos: null };
  render();
  if (!navigator.geolocation) { draft.locating = false; return render(); }
  const mine = draft;
  navigator.geolocation.getCurrentPosition(p => {
    if (draft !== mine) return;
    draft.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    draft.locating = false; render();
  }, err => {
    if (draft !== mine) return;
    draft.locating = false; render();
    toast(err.code === 1 ? "位置情報が許可されていません（位置なしで記録します）" : "位置を取れませんでした");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

$app.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const rd = cur(), hole = rd && curHole(rd);
  if (b.dataset.set) {
    const k = b.dataset.set, v = b.dataset.val;
    if (k === "par") { hole.par = Number(v); save(); }
    else if (k === "obSide") { hole.obSide = v; save(); }
    else if (draft) {
      draft[k] = draft[k] === v && k === "dir" ? null : v;
      if (k === "result" && (v === "FW" || v === "グリーン") && !draft.dir) draft.dir = "まっすぐ";
    }
    return render();
  }
  switch (b.dataset.act) {
    case "start": {
      const id = Date.now().toString(36);
      const d = new Date();
      db.rounds.push({ id, course: document.getElementById("course").value.trim(), date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, holes: [newHole(1)], holeNo: 1, finished: false });
      db.current = id; save(); view = "round"; draft = null;
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      break;
    }
    case "resume": db.current = db.rounds.filter(r => !r.finished).slice(-1)[0].id; save(); view = "round"; break;
    case "home": view = "home"; draft = null; break;
    case "analysis": view = "analysis"; break;
    case "shot": startShot(); return;
    case "more": draft.more = true; break;
    case "cancelShot": draft = null; break;
    case "saveShot": {
      const { club, result, dir, mind, slope, wind, pos } = draft;
      hole.shots.push({ club, result, dir, mind, slope, wind, pos, t: Date.now() });
      hole.scoreAuto = true; draft = null; save();
      toast(result === "OB" ? "OB を記録しました（+2打）" : result === "ワンペナ" ? "ワンペナを記録しました（+1打）" : "記録しました");
      break;
    }
    case "undo": hole.shots.pop(); save(); toast("1打取り消しました"); break;
    case "prevHole": case "nextHole": {
      rd.holeNo += b.dataset.act === "nextHole" ? 1 : -1;
      if (!curHole(rd)) rd.holes.push(newHole(rd.holeNo));
      save(); break;
    }
    case "holeEnd": view = "holeEnd"; break;
    case "backRound": view = "round"; break;
    case "putt-": hole.putts = Math.max(0, hole.putts - 1); break;
    case "putt+": hole.putts++; break;
    case "score-": hole.score = Math.max(1, hole.score - 1); hole.scoreAuto = false; break;
    case "score+": hole.score++; hole.scoreAuto = false; break;
    case "holeDone": {
      save();
      if (rd.holeNo >= 18) { rd.finished = true; db.current = null; save(); view = "analysis"; toast("おつかれさまでした"); break; }
      rd.holeNo++; if (!curHole(rd)) rd.holes.push(newHole(rd.holeNo));
      save(); view = "round"; break;
    }
    case "finish":
      rd.holes = rd.holes.filter(h => h.shots.length || h.score != null);
      rd.finished = true; db.current = null; save(); view = "analysis"; break;
    case "export": {
      const blob = new Blob([JSON.stringify(db, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `obnote-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000); return;
    }
    case "import": document.getElementById("file").click(); return;
  }
  render();
});

$app.addEventListener("change", async e => {
  if (e.target.id !== "file" || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.rounds)) throw new Error();
    const have = new Set(db.rounds.map(r => r.id));
    const add = data.rounds.filter(r => !have.has(r.id));
    db.rounds.push(...add); save(); toast(`${add.length}ラウンドを読み込みました`); render();
  } catch { toast("読み込めないファイルです"); }
});

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
render();
