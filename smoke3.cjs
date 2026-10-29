// 组件冒烟：直接调用各阶段视图函数，验证它们返回有效元素树（五维版）。
const fs = require('fs')
const path = require('path')
const SRC = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8')

function makeEnv(storage) {
  const head = []
  const doc = {
    head: { appendChild(el) { head.push(el) } },
    body: { style: {} },
    activeElement: null,
    getElementById() { return null },
    createElement(tag) { return { tag, id: '', textContent: '', parentNode: null } },
    addEventListener() {}, removeEventListener() {},
  }
  const map = new Map()
  let CUR = null
  const R = {
    createElement: (t, p, ...ch) => {
      const children = ch.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)
      if (typeof t === 'function') {
        const prevCur = CUR
        CUR = t
        if (map.has(t)) map.get(t).cursor = 0
        let out
        try { out = t(Object.assign({}, p || {}, { children })) }
        finally { CUR = prevCur }
        return out === undefined ? null : out
      }
      return { type: t, props: Object.assign({}, p || {}), children }
    },
    useState(i) {
      const k = CUR
      if (!map.has(k)) map.set(k, { arr: [], cursor: 0 })
      const slot = map.get(k)
      const idx = slot.cursor++
      if (!(idx in slot.arr)) slot.arr[idx] = typeof i === 'function' ? i() : i
      return [slot.arr[idx], (v) => { slot.arr[idx] = typeof v === 'function' ? v(slot.arr[idx]) : v }]
    },
    useEffect() {},
    useRef: (v) => ({ current: v }),
    useMemo: (f) => f(),
    useCallback: (f) => f,
  }
  const g = {
    window: null, document: doc,
    localStorage: { data: Object.assign({}, storage), getItem(k) { return this.data[k] === undefined ? null : this.data[k] }, setItem(k, v) { this.data[k] = String(v) } },
    __ModuleLoader__: null,
  }
  g.window = g
  let plug = null
  g.__ModuleLoader__ = { load(m) { plug = m.factory(() => R) } }
  const prev = { window: global.window, document: global.document, localStorage: global.localStorage, __ModuleLoader__: global.__ModuleLoader__ }
  global.window = g
  global.document = doc
  global.localStorage = g.localStorage
  global.__ModuleLoader__ = g.__ModuleLoader__
  new Function(SRC)()
  const reg = {}
  plug.apply({ effect: (f) => f(), slots: { inject: (n, gg) => { gg().next() }, register: (o, cc) => { reg[o.name] = cc } } })
  return {
    ui: plug.__internals.__ui,
    I: plug.__internals,
    call(comp, props) {
      CUR = comp
      if (map.has(comp)) map.get(comp).cursor = 0
      return comp(props || {})
    },
    restore() { Object.assign(global, prev) },
  }
}

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return }
  if (node.type) visit(node)
  const kids = node.children
  if (Array.isArray(kids)) kids.forEach((c) => walk(c, visit))
  else walk(kids, visit)
}
function collectText(node) {
  const out = []
  walk(node, (el) => {
    const kids = Array.isArray(el.children) ? el.children : [el.children]
    kids.forEach((c) => { if (typeof c === 'string') out.push(c) })
  })
  return out.join(' ')
}
function count(node, tag) { let n = 0; walk(node, (el) => { if (el.type === tag) n++ }); return n }

let pass = 0
const ok = (c, m) => { if (c) pass++; else { console.log('FAIL:', m); process.exitCode = 1 } }

/* 场景 A：新用户 → 设置表单 */
{
  const env = makeEnv({})
  const setup = env.call(env.ui.SetupForm)
  ok(setup && setup.type === 'div', 'SetupForm returns div')
  ok(count(setup, 'select') >= 2, 'two selects')
  ok(count(setup, 'input') >= 2, 'two inputs')
  ok(count(setup, 'button') >= 1, 'save button')
  const text = collectText(setup)
  ok(text.includes('你的生日'), 'has birthday label')
  ok(text.includes('五维'), 'mentions five dimensions')
  ok(!/undefined|NaN/.test(text), 'no undefined/NaN')

  const footer = env.call(env.ui.FooterButton, { wide: true })
  ok(footer && footer.type === 'button', 'footer wide button')
  const rail = env.call(env.ui.FooterButton, { wide: false })
  ok(rail && rail.type === 'button', 'footer rail button')

  const mark = env.call(env.ui.LuckMark, { size: 26 })
  ok(mark && mark.type === 'span', 'LuckMark renders span')
  ok(count(mark, 'svg') === 1, 'LuckMark has svg')
  env.restore()
}

/* 场景 B：抽牌阶段 */
{
  const env = makeEnv({})
  env.I.__store.set({ profile: { month: 7, day: 23, year: 1996, name: '' } })
  const pick = env.call(env.ui.PickStage)
  ok(pick && pick.type === 'div', 'PickStage returns div')
  ok(count(pick, 'button') === 22, '22 face-down cards, got ' + count(pick, 'button'))
  ok(collectText(pick).includes('22 张'), 'pick hint text')
  env.restore()
}

/* 场景 C：结果页（五维 + 天象 + 牌面提示） */
{
  const profile = { month: 7, day: 23, year: 1996, name: '小李' }
  const env = makeEnv({})
  const I = env.I
  const base = I.buildBase(profile, new Date())
  const card = I.CARDS[20]
  const reading = I.computeReading(base, { card, reversed: false })
  I.__store.set({ profile, question: '今天该不该主动推进那个方案？', reading, draw: { cardId: card.id, reversed: false, date: base.dateStr } })
  const res = env.call(env.ui.ResultStage)
  ok(res && res.type === 'div', 'ResultStage returns div')
  const text = collectText(res)
  ok(text.includes('Hi，小李，今天好'), 'greeting with name')
  ok(text.includes(card.name), 'card name shown')
  ok(text.includes(String(reading.total)), 'total shown')
  ok(text.includes('今日评语'), 'commentary shown')
  ok(text.includes('今日五维'), 'five-dim heading')
  ok(/今日(大吉|顺遂|平稳|需留意|低谷)/.test(text), 'verdict phrase shown')
  ok(text.includes('就你的问题'), 'answer section shown')
  ok(!text.includes('70%') && !text.includes('30%'), 'no ratio in answer')
  ok(text.includes('这张牌说'), 'answer card line shown')
  ok(text.includes('再看今天的状态'), 'answer base line shown')
  ok(text.includes('今天该不该主动推进那个方案？'), 'question echoed')
  ok(text.includes('接下来怎么做'), 'answer steps heading')
  ok(text.includes('判断标准') || text.includes('做完这三步'), 'answer check line')
  for (const label of ['事业', '感情', '财运', '身心', '交际']) {
    ok(text.includes(label), 'dimension label ' + label)
  }
  ok(text.includes('重新抽卡'), 'redraw button label')
  ok(text.includes('修改生日'), 'edit birthday button label')
  ok(text.includes('今天可以这样用这张牌'), 'card tip shown')
  ok(text.includes('今日天象'), 'sky note shown')
  // 没有提问时只显示「心想事成」
  I.__store.set({ question: '' })
  const res2 = env.call(env.ui.ResultStage)
  const text2 = collectText(res2)
  ok(text2.includes('心想事成'), 'no-question blessing shown')
  ok(!text2.includes('就你的问题'), 'no answer section without question')
  ok(count(res, 'button') >= 2, 'result actions')
  ok(!/undefined|NaN/.test(text), 'no undefined/NaN')
  console.log('result sample:', text.replace(/\s+/g, ' ').slice(0, 260))
  env.restore()
}

console.log('SMOKE ' + (process.exitCode ? 'FAILED' : 'PASS') + ' (' + pass + ' checks)')
