// 离线自测：抽掉 window 包装，直接驱动 client.js 里的星历与评分引擎。
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8')
const start = src.indexOf('window.__ModuleLoader__.load(') + 'window.__ModuleLoader__.load('.length
const objSrc = src.slice(start, src.lastIndexOf(')'))

const fakeRequire = (name) => {
  if (name !== 'react') throw new Error('unexpected require ' + name)
  return {
    createElement: () => null,
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
  }
}
// eslint-disable-next-line no-new-func
const loader = new Function('require', 'return (' + objSrc + ')')(fakeRequire)
const I = loader.factory(fakeRequire).__internals

let pass = 0
let fail = 0
function ok(cond, msg, extra) {
  if (cond) { pass++ } else { fail++; console.log('FAIL:', msg, extra === undefined ? '' : JSON.stringify(extra)) }
}

const DIMS = ['career', 'love', 'money', 'body', 'social']
const UTC = (y, m, d, hh = 12, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh, mm))

/* 1. 十二星座分界 */
const cases = [
  [1, 19, 'capricorn'], [1, 20, 'aquarius'], [2, 18, 'aquarius'], [2, 19, 'pisces'],
  [3, 20, 'pisces'], [3, 21, 'aries'], [4, 19, 'aries'], [4, 20, 'taurus'],
  [5, 20, 'taurus'], [5, 21, 'gemini'], [6, 21, 'gemini'], [6, 22, 'cancer'],
  [7, 22, 'cancer'], [7, 23, 'leo'], [8, 22, 'leo'], [8, 23, 'virgo'],
  [9, 22, 'virgo'], [9, 23, 'libra'], [10, 22, 'libra'], [10, 23, 'scorpio'],
  [11, 21, 'scorpio'], [11, 22, 'sagittarius'], [12, 21, 'sagittarius'], [12, 22, 'capricorn'],
]
for (const [m, d, want] of cases) {
  const got = I.signOf(m, d)
  ok(got.id === want, 'sign ' + m + '/' + d, { got: got.id, want })
}

/* 2. 牌库完整性（五维） */
ok(I.CARDS.length === 22, '22 cards', I.CARDS.length)
ok(new Set(I.CARDS.map((c) => c.id)).size === 22, 'unique card ids')
for (const c of I.CARDS) {
  ok(!!c.upright && !!c.reversed && !!c.keywords && !!c.detail && !!c.tip, 'text present ' + c.name)
  for (const k of DIMS) ok(typeof c.aff[k] === 'number', 'aff ' + k + ' ' + c.name)
  ok(DIMS.indexOf(c.main) >= 0, 'main dim ' + c.name)
}

/* 3. 星历：太阳黄经（低精度，±1.5°） */
const sunChecks = [
  [UTC(2024, 3, 20), 0, '春分'],
  [UTC(2024, 6, 20), 90, '夏至'],
  [UTC(2024, 9, 22), 180, '秋分'],
  [UTC(2024, 12, 21, 12), 270, '冬至'],
]
for (const [d, want, label] of sunChecks) {
  const got = I.earthSunLon(d)
  const diff = Math.abs(((got - want + 540) % 360) - 180)
  ok(diff < 1.6, 'sun ' + label, { got: got.toFixed(2), want, diff: diff.toFixed(2) })
}

/* 4. 星座黄经区间 */
ok(I.signOfLon(0).id === 'aries' && I.signOfLon(29.9).id === 'aries', 'aries range')
ok(I.signOfLon(30).id === 'taurus' && I.signOfLon(210).id === 'scorpio', 'taurus/scorpio range')
ok(I.signOfLon(359.9).id === 'pisces', 'pisces range')

/* 5. 月亮：2024-04-23 23:49 UTC 满月（与太阳相距 180°） */
{
  const t = UTC(2024, 4, 23, 23, 49)
  const elong = ((I.moonLon(t) - I.earthSunLon(t)) % 360 + 360) % 360
  const diff = Math.abs(elong - 180)
  ok(diff < 2, 'full moon 2024-04-23', { elong: elong.toFixed(2), diff: diff.toFixed(2) })
  const phase = I.moonPhaseOf(I.earthSunLon(t), I.moonLon(t))
  ok(phase.phase === '满月' || phase.phase === '盈凸月' || phase.phase === '亏凸月', 'phase near full', phase.phase)
}

/* 6. 水星逆行：用黄经差判定 */
const retroCases = [
  [UTC(2024, 4, 10), true, '2024-04 水逆'],
  [UTC(2024, 5, 1), false, '2024-05 非水逆'],
  [UTC(2025, 3, 20), true, '2025-03 水逆'],
  [UTC(2026, 3, 10), true, '2026-03 水逆'],
]
for (const [d, want, label] of retroCases) {
  const got = I.isRetrograde('水星', d)
  ok(got === want, label, { got, want })
}

/* 7. 相位判定 */
const asp = I.aspectOf(0, 180)
ok(asp && asp.name === '对分相', 'opposition detected')
const asp2 = I.aspectOf(10, 130)
ok(asp2 && asp2.name === '三分相', 'trine detected')
ok(I.aspectOf(0, 45) === null, 'no aspect at 45°')

/* 8. 同一生日同一天：确定性 */
const now = new Date(2026, 9, 30, 12, 0, 0)
const profile = { month: 7, day: 23, year: 1996, name: 'x' }
const b1 = I.buildBase(profile, now)
const b2 = I.buildBase(profile, now)
ok(JSON.stringify(b1.dims) === JSON.stringify(b2.dims), 'base deterministic')
ok(b1.sign.id === 'leo', 'leo for 7/23', b1.sign.id)
ok(b1.dateStr === '2026-10-30', 'dateStr', b1.dateStr)
ok(b1.transits.length === 7, 'seven transit planets', b1.transits.length)

/* 9. 抽牌分布：22 张全可达、正逆都有 */
const seenCard = new Set()
const seenRev = new Set()
for (let i = 0; i < 3000; i++) {
  const res = I.drawCard()
  seenCard.add(res.pick.card.id)
  seenRev.add(res.pick.reversed)
  ok(res.deck.length === 22, 'deck length')
  ok(res.pick === res.deck[res.index], 'pick from deck')
}
ok(seenCard.size === 22, 'all 22 cards reachable', seenCard.size)
ok(seenRev.size === 2, 'both orientations', seenRev.size)

/* 10. 评分范围 + 正逆单调 + 五维齐全 */
let sumU = 0, sumR = 0, n = 0
for (let mi = 1; mi <= 12; mi++) {
  for (const day of [3, 12, 21, 28]) {
    const base = I.buildBase({ month: mi, day, year: 1995, name: '' }, now)
    for (const card of I.CARDS) {
      const up = I.computeReading(base, { card, reversed: false })
      const re = I.computeReading(base, { card, reversed: true })
      for (const k of DIMS) {
        ok(up.details[k] && up.details[k].score >= 22 && up.details[k].score <= 97, 'score range ' + k)
        ok(re.details[k].score <= up.details[k].score, 'reversed <= upright ' + card.name + ' ' + k)
      }
      ok(up.total >= 40 && up.total <= 100, 'total range', up.total)
      sumU += up.total; sumR += re.total; n++
    }
  }
}
ok(sumU / n > sumR / n, 'upright avg > reversed avg', { u: sumU / n, r: sumR / n })
console.log('avg total upright/reversed:', (sumU / n).toFixed(2), (sumR / n).toFixed(2), 'samples', n)

/* 11. 评语可生成且含天象/建议/提示 */
for (const card of I.CARDS) {
  for (const rev of [false, true]) {
    const base = I.buildBase(profile, now)
    const r = I.computeReading(base, { card, reversed: rev })
    const t = I.buildReadingText(r)
    ok(!!t.opening && !!t.meaning && !!t.detail && !!t.elementNote && !!t.dimLine && !!t.tip, 'text fields ' + card.name)
    ok(t.advice.length === 2 && t.advice.every(Boolean), 'advice ' + card.name)
    ok(!/undefined|NaN/.test(JSON.stringify(t)), 'no undefined/NaN ' + card.name)
  }
}

/* 12. 提问答案：牌面 70% + 基础 30%；没问题返回 null */
{
  const base = I.buildBase(profile, now)
  const r = I.computeReading(base, { card: I.CARDS[19], reversed: false })
  ok(I.buildAnswer(r, '') === null, 'no question -> null')
  ok(I.buildAnswer(r, '   ') === null, 'blank question -> null')
  ok(I.themeOfQuestion('今天该不该推进那个项目') === 'career', 'theme career')
  ok(I.themeOfQuestion('他到底喜不喜欢我') === 'love', 'theme love')
  ok(I.themeOfQuestion('最近手头有点紧要不要投资') === 'money', 'theme money')
  const a = I.buildAnswer(r, '今天该不该主动推进那个方案？')
  ok(a && a.q === '今天该不该主动推进那个方案？', 'answer keeps question')
  ok(a.tone && a.tone.text && a.cardLine.indexOf('这张牌说') === 0, 'answer card line')
  ok(a.baseLine.indexOf('再看今天的状态') === 0, 'answer base line')
  ok(!/70%|30%|七成|三成/.test(JSON.stringify(a)), 'answer hides ratio')
  ok(a.headline.indexOf('关于「方案」') === 0, 'answer headline targets topic', a.headline)
  ok(a.steps.length === 3 && a.steps.every(Boolean), 'answer three steps')
  ok(!!a.check, 'answer check line')
  ok(I.questionType('今天该不该主动推进那个方案？') === 'yesno', 'type yesno')
  ok(I.questionType('这个项目怎么推进') === 'how', 'type how')
  ok(I.questionType('什么时候适合表白') === 'when', 'type when')
  ok(a.lean >= 40 && a.lean <= 100, 'answer lean range', a.lean)
  ok(!/undefined|NaN/.test(JSON.stringify(a)), 'answer no undefined/NaN')
}

/* 13. 分布统计（供人工核对阈值） */
let buckets = {}
let all = []
for (let mi = 1; mi <= 12; mi++) {
  for (const day of [3, 12, 21, 28]) {
    const base = I.buildBase({ month: mi, day, year: 1995, name: '' }, now)
    for (const card of I.CARDS) {
      for (const rev of [false, true]) {
        const x = I.computeReading(base, { card, reversed: rev })
        all.push(x.total)
        buckets[x.totalLevel.label] = (buckets[x.totalLevel.label] || 0) + 1
      }
    }
  }
}
all.sort((a, b) => a - b)
console.log('total min', all[0], 'p10', all[Math.floor(all.length * 0.1)], 'median', all[Math.floor(all.length / 2)],
  'p90', all[Math.floor(all.length * 0.9)], 'max', all[all.length - 1])
console.log('levels', buckets)

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': pass=' + pass + ' fail=' + fail)
process.exit(fail === 0 ? 0 : 1)
