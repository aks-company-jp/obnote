// OB の原因分析。ブラウザ（window.GolfAnalysis）と node のテストの両方で使う。
(function (root) {
  const PENALTY = { OB: 2, ワンペナ: 1 };
  const MIN_N = 3; // これより少ない件数の割合は「参考」と表示する

  function haversine(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function penaltyOf(shot) { return PENALTY[shot.result] || 0; }

  function holeStrokes(hole) {
    return hole.shots.reduce((s, sh) => s + 1 + penaltyOf(sh), 0);
  }

  // すべてのショットを、分析に使う状況つきの1行にする
  function flatten(rounds) {
    const rows = [];
    for (const rd of rounds) {
      const holes = [...rd.holes].sort((a, b) => a.no - b.no);
      holes.forEach((hole, hi) => {
        const prev = holes[hi - 1];
        const prevBad = prev && prev.score != null && prev.par != null && prev.score - prev.par >= 2;
        hole.shots.forEach((sh, si) => {
          const next = hole.shots[si + 1];
          rows.push({
            round: rd.id, hole: hole.no, par: hole.par, obSide: hole.obSide || "なし",
            seg: hole.no <= 6 ? "1〜6番" : hole.no <= 12 ? "7〜12番" : "13〜18番",
            tee: si === 0 && hole.par >= 4, club: sh.club, result: sh.result, dir: sh.dir || "",
            slope: sh.slope || "平ら", wind: sh.wind || "無風", mind: sh.mind || "普通",
            afterBad: !!prevBad, ob: sh.result === "OB", pen: sh.result === "OB" || sh.result === "ワンペナ",
            dist: sh.result === "OB" || !next ? null : haversine(sh.pos, next.pos)
          });
        });
      });
    }
    return rows.filter(r => r.club !== "PT");
  }

  function groupRate(rows, keyFn, flag = "ob") {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r); if (k == null || k === "") continue;
      const g = m.get(k) || { key: k, n: 0, hit: 0 };
      g.n++; if (r[flag]) g.hit++; m.set(k, g);
    }
    return [...m.values()].map(g => ({ ...g, rate: g.n ? g.hit / g.n : 0, few: g.n < MIN_N }))
      .sort((a, b) => b.rate - a.rate || b.n - a.n);
  }

  // OB の出る側と、ホールの OB の側が同じか（右OBのホールで右に出た、など）
  function sideMatch(rows) {
    const obs = rows.filter(r => r.ob);
    const toward = obs.filter(r => (r.obSide === "右" && r.dir === "右") || (r.obSide === "左" && r.dir === "左") || r.obSide === "両側").length;
    const byDir = groupRate(obs, r => r.dir || "不明", "ob").map(g => ({ key: g.key, n: g.n }));
    return { total: obs.length, toward, byDir };
  }

  function avgDistance(rows) {
    const m = new Map();
    for (const r of rows) {
      if (r.dist == null || r.dist < 5 || r.dist > 400) continue;
      const g = m.get(r.club) || { key: r.club, n: 0, sum: 0 };
      g.n++; g.sum += r.dist; m.set(r.club, g);
    }
    return [...m.values()].map(g => ({ key: g.key, n: g.n, yd: Math.round(g.sum / g.n / 0.9144) }))
      .sort((a, b) => b.yd - a.yd);
  }

  // いちばん OB の割合が高い状況を、項目をまたいで上から並べる（件数が少ないものは除く）
  function topSituations(rows, limit = 3) {
    const dims = [
      ["クラブ", r => r.club], ["ホールのOB", r => r.obSide === "なし" ? null : r.obSide + "がOB"],
      ["ライの傾斜", r => r.slope], ["風", r => r.wind], ["気持ち", r => r.mind],
      ["前のホール", r => r.afterBad ? "前のホールで+2以上" : "前のホールは普通"], ["ホール", r => r.seg]
    ];
    const base = rows.length ? rows.filter(r => r.ob).length / rows.length : 0;
    const plain = new Set(["普通", "平ら", "無風", "前のホールは普通"]); // ふだんの状態は原因の候補にしない
    const all = [];
    for (const [label, fn] of dims) {
      for (const g of groupRate(rows, fn)) if (!g.few && g.hit > 0 && !plain.has(g.key)) all.push({ dim: label, ...g, lift: base ? g.rate / base : 0 });
    }
    return all.sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, limit);
  }

  function summary(rounds) {
    const rows = flatten(rounds);
    const holes = rounds.flatMap(r => r.holes);
    return {
      rounds: rounds.length, holes: holes.length, shots: rows.length,
      ob: rows.filter(r => r.ob).length, onePen: rows.filter(r => r.result === "ワンペナ").length,
      penStrokes: rows.reduce((s, r) => s + (r.ob ? 2 : r.result === "ワンペナ" ? 1 : 0), 0),
      teeObRate: (() => { const t = rows.filter(r => r.tee); return t.length ? t.filter(r => r.ob).length / t.length : null; })(),
      top: topSituations(rows),
      byClub: groupRate(rows, r => r.club),
      bySide: sideMatch(rows),
      byMind: groupRate(rows, r => r.mind),
      bySlope: groupRate(rows, r => r.slope),
      byWind: groupRate(rows, r => r.wind),
      bySeg: groupRate(rows, r => r.seg),
      byAfterBad: groupRate(rows, r => r.afterBad ? "前のホールで+2以上" : "前のホールは普通"),
      distance: avgDistance(rows)
    };
  }

  const api = { haversine, holeStrokes, penaltyOf, flatten, groupRate, topSituations, summary, MIN_N };
  if (typeof module !== "undefined") module.exports = api; else root.GolfAnalysis = api;
})(this);
