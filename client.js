/**
 * 今日好运来临（dsh-daily-luck）—— 浏览器半
 *
 * 全流程都在浏览器本地完成，不向 Host 发送生日、名字或抽牌数据：
 *   1. 用户写入生日 → 用真实星象（太阳/月亮/水星…土星的黄经、相位、逆行）
 *      生成一份「基础运势」，默认不展示；
 *   2. 22 张大阿尔卡纳随机洗牌（含正/逆位），用户自己点一张；
 *   3. 牌义与基础运势叠加 → 事业 / 感情 / 财运 / 身心 / 交际 五维评分
 *      + 综合分 + 今日评语。
 *
 * 星座行星位置用 JPL 近似轨道根数 + 简化 ELP 月亮公式计算，属于低精度
 * 星历（误差约 0.1°–1°，对相位判定足够）；评分是启发式，不是命理结论，
 * 也不构成任何医疗、投资或法律建议。
 */

window.__ModuleLoader__.load({
  id: 'dsh-daily-luck',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo } = React

    /* ------------------------------------------------------------------ */
    /* 常量与数据                                                          */
    /* ------------------------------------------------------------------ */

    const STORAGE_KEY = 'dsh-daily-luck:v1'
    const DIMS = ['career', 'love', 'money', 'body', 'social']
    const DIM_META = {
      career: { label: '事业', icon: '💼' },
      love: { label: '感情', icon: '💗' },
      money: { label: '财运', icon: '🪙' },
      body: { label: '身心', icon: '🌿' },
      social: { label: '交际', icon: '🤝' },
    }
    const ELEMENTS = {
      fire: { label: '火', note: '行动与热度' },
      earth: { label: '土', note: '现实与积累' },
      air: { label: '风', note: '思考与沟通' },
      water: { label: '水', note: '感受与流动' },
    }
    const ELEMENT_CN = { fire: '火象', earth: '土象', air: '风象', water: '水象' }

    // 元素 → 五维「接受度」：同一张牌落在不同星座身上，落点不同。
    const RECEPTION = {
      fire: { career: 1.08, love: 0.94, money: 0.98, body: 1.06, social: 1.02 },
      earth: { career: 1.08, love: 0.96, money: 1.1, body: 1.0, social: 0.97 },
      air: { career: 1.0, love: 1.08, money: 0.98, body: 0.98, social: 1.1 },
      water: { career: 0.94, love: 1.12, money: 0.96, body: 1.06, social: 1.06 },
    }

    const SIGNS = [
      {
        id: 'aries', name: '白羊座', glyph: '♈', element: 'fire', mode: '基本宫', ruler: '火星',
        from: [3, 21], to: [4, 19],
        color: '朱红', stones: '红玛瑙 / 血石', number: 9,
        aff: { career: 82, love: 68, money: 56, body: 84, social: 74 },
        traits: ['直接', '行动派', '不怕开局'],
        note: '你的能量来得快、方向感强，适合在空白处先落子；也容易在等待和反复确认里耗掉耐心。',
        callings: '开拓型项目、销售、运动与竞赛、需要拍板的岗位',
      },
      {
        id: 'taurus', name: '金牛座', glyph: '♉', element: 'earth', mode: '固定宫', ruler: '金星',
        from: [4, 20], to: [5, 20],
        color: '苔绿', stones: '绿松石 / 玉', number: 6,
        aff: { career: 68, love: 76, money: 86, body: 74, social: 70 },
        traits: ['稳', '有审美', '重质地'],
        note: '你靠持续累积赢，不靠短跑；一旦认定，耐力惊人，但改变路线时需要一段缓冲。',
        callings: '财务、餐饮、设计工艺、长期经营与资产管理',
      },
      {
        id: 'gemini', name: '双子座', glyph: '♊', element: 'air', mode: '变动宫', ruler: '水星',
        from: [5, 21], to: [6, 21],
        color: '明黄', stones: '玛瑙 / 黄水晶', number: 5,
        aff: { career: 72, love: 78, money: 64, body: 70, social: 86 },
        traits: ['好奇', '会聊', '上手快'],
        note: '你的优势是信息差与表达，能把复杂的事讲明白；缺点是同时开的窗口太多。',
        callings: '传播、写作、教学、跨界协作、需要快速学习的岗位',
      },
      {
        id: 'cancer', name: '巨蟹座', glyph: '♋', element: 'water', mode: '基本宫', ruler: '月亮',
        from: [6, 22], to: [7, 22],
        color: '月白', stones: '月长石 / 珍珠', number: 2,
        aff: { career: 64, love: 84, money: 68, body: 72, social: 78 },
        traits: ['顾家', '共情', '记性好'],
        note: '你对氛围和安全感极敏感，照顾人的能力很强；但别让「怕失去」替你做决定。',
        callings: '照护与教育、家居餐饮、内容社区、需要信任关系的岗位',
      },
      {
        id: 'leo', name: '狮子座', glyph: '♌', element: 'fire', mode: '固定宫', ruler: '太阳',
        from: [7, 23], to: [8, 22],
        color: '日金', stones: '琥珀 / 石榴石', number: 1,
        aff: { career: 80, love: 76, money: 64, body: 78, social: 84 },
        traits: ['有光', '担当', '爱被看见'],
        note: '你天生适合站在台前，带得动人；舞台和掌声既是燃料，也容易变成评价的绳子。',
        callings: '管理、演艺与内容、品牌、需要代表团队出面的位置',
      },
      {
        id: 'virgo', name: '处女座', glyph: '♍', element: 'earth', mode: '变动宫', ruler: '水星',
        from: [8, 23], to: [9, 22],
        color: '藏青', stones: '蓝宝石 / 橄榄石', number: 5,
        aff: { career: 78, love: 66, money: 76, body: 70, social: 68 },
        traits: ['细致', '可靠', '爱优化'],
        note: '你能把混乱变整齐，是团队里的质检员；对自己的标准常常比对别人高两档。',
        callings: '分析、审计、医疗与整理、流程与质量控制',
      },
      {
        id: 'libra', name: '天秤座', glyph: '♎', element: 'air', mode: '基本宫', ruler: '金星',
        from: [9, 23], to: [10, 22],
        color: '雾粉', stones: '蛋白石 / 粉晶', number: 6,
        aff: { career: 70, love: 84, money: 66, body: 70, social: 88 },
        traits: ['讲分寸', '重平衡', '会协调'],
        note: '你在关系里找平衡感，天然擅长斡旋；真正的难题不是选哪边，而是先承认自己要什么。',
        callings: '设计、公关与谈判、法务、合作型项目',
      },
      {
        id: 'scorpio', name: '天蝎座', glyph: '♏', element: 'water', mode: '固定宫', ruler: '冥王星 / 火星',
        from: [10, 23], to: [11, 21],
        color: '深酒红', stones: '黑曜石 / 石榴石', number: 8,
        aff: { career: 76, love: 80, money: 72, body: 76, social: 66 },
        traits: ['专注', '看穿', '不表态'],
        note: '你能沉到别人不愿意去的地方，洞察力是武器；但信任需要慢慢给，不必一次押上全部。',
        callings: '研究、金融风控、心理与调查、深度专注型岗位',
      },
      {
        id: 'sagittarius', name: '射手座', glyph: '♐', element: 'fire', mode: '变动宫', ruler: '木星',
        from: [11, 22], to: [12, 21],
        color: '紫罗兰', stones: '青金石 / 紫水晶', number: 3,
        aff: { career: 74, love: 72, money: 66, body: 82, social: 82 },
        traits: ['爱自由', '乐观', '看远处'],
        note: '你需要空间和意义感，视野打开时状态最好；被琐碎框住时容易用「换个环境」逃避。',
        callings: '旅行与教育、海外业务、内容创作、需要开拓新场的岗位',
      },
      {
        id: 'capricorn', name: '摩羯座', glyph: '♑', element: 'earth', mode: '基本宫', ruler: '土星',
        from: [12, 22], to: [1, 19],
        color: '炭灰', stones: '黑碧玺 / 茶晶', number: 8,
        aff: { career: 88, love: 62, money: 78, body: 68, social: 64 },
        traits: ['能扛', '有结构', '看长线'],
        note: '你把时间当盟友，耐得住慢；但价值感别只挂在产出上，休息不是扣分项。',
        callings: '管理与工程、规划、实业、需要长期责任的位置',
      },
      {
        id: 'aquarius', name: '水瓶座', glyph: '♒', element: 'air', mode: '固定宫', ruler: '天王星 / 土星',
        from: [1, 20], to: [2, 18],
        color: '电光蓝', stones: '海蓝宝 / 紫水晶', number: 4,
        aff: { career: 76, love: 66, money: 64, body: 74, social: 76 },
        traits: ['独立', '有想法', '不合群也自在'],
        note: '你习惯从人群外面看事情，能看到别人忽略的结构；疏离感是保护，也是门槛。',
        callings: '科技与产品、社会议题、研究、需要创新的协作',
      },
      {
        id: 'pisces', name: '双鱼座', glyph: '♓', element: 'water', mode: '变动宫', ruler: '海王星 / 木星',
        from: [2, 19], to: [3, 20],
        color: '海沫绿', stones: '海蓝宝 / 月光石', number: 7,
        aff: { career: 62, love: 86, money: 60, body: 78, social: 80 },
        traits: ['体贴', '有想象', '容易心软'],
        note: '你接收情绪的能力像海绵，创作和共情是天赋；边界感是今年最值得练的功课。',
        callings: '艺术与音乐、疗愈与公益、影像、需要想象力的岗位',
      },
    ]

    // 22 张大阿尔卡纳。aff 为牌面在五维上的落点，1 = 强落点。
    const CARDS = [
      {
        id: 0, numeral: '0', name: '愚者', en: 'The Fool', element: 'air', planet: '天王星',
        keywords: '开始 · 天真 · 自由 · 冒险',
        upright: '愚者站在悬崖边，背包很轻，眼里是路而不是风险。这是「先迈一步，再学走路」的信号：新的方向、新的关系、新的尝试都值得开一个口子，代价是接受前几步的不完美。',
        reversed: '逆位的愚者不是「没运气」，而是准备不足或方向含糊：想跳，却还没想清楚跳去哪。今天更适合把冲动画成一个具体的实验，而不是一次性的豪赌。',
        detail: '愚者出现在日常里，常常就是那个「还没准备好就上场」的时刻：新项目的第一版、第一次见面、第一次尝试。它不要求你算无遗策，只要求你别在门口站太久。',
        tip: '今天先做一件「做了才知道」的小事——发一条消息、报一个名、试一个新工具，再谈风险。',
        aff: { career: 0.7, love: 0.6, money: 0.7, body: 0.7, social: 0.55 },
        main: 'career',
      },
      {
        id: 1, numeral: 'I', name: '魔术师', en: 'The Magician', element: 'air', planet: '水星',
        keywords: '资源 · 表达 · 启动 · 掌控',
        upright: '魔术师桌上四样工具俱全，缺的从来不是资源，而是把资源聚成一件作品的动作。今天适合开口、提案、展示、把想法落地成看得见的东西。',
        reversed: '逆位的魔术师提醒「工具齐 ≠ 用得好」：话说得漂亮、执行却空转，或把力气花在包装上。今天先问自己一句——手里的事，哪一步是真的在推进？',
        detail: '魔术师的「魔法」其实是整合：把零散的能力、人脉、信息拼成一件可交付的东西。今天你缺的往往不是资源，而是把它们摆到桌面上、挑出能用的那几样。',
        tip: '把可用资源列成三条（人、工具、信息），今天就推动其中一条，不追求三条一起动。',
        aff: { career: 0.8, love: 0.45, money: 0.65, body: 0.5, social: 0.6 },
        main: 'career',
      },
      {
        id: 2, numeral: 'II', name: '女祭司', en: 'The High Priestess', element: 'water', planet: '月亮',
        keywords: '直觉 · 沉静 · 内在 · 时机未到',
        upright: '女祭司坐在帷幕前，手里握着未说出口的答案。今天的聪明不是多说，而是先听——听自己第一反应里的那点不适或笃定，它比分析更接近真相。',
        reversed: '逆位的女祭司是「知道却装作不知道」：你在回避某个已经被自己看见的信号，或用忙碌盖过直觉。允许自己承认它，比继续绕圈更省力。',
        detail: '女祭司的能量在生活里表现为「信息不全但直觉很清楚」：一个人说话时你莫名觉得别扭，一件事推进时你总觉得哪里不对。今天该做的是停一下、记下来，而不是立刻反驳或说服自己。',
        tip: '把心里那个「不太对劲」写下来，先观察一天，别急着用道理压过去。',
        aff: { career: 0.55, love: 0.7, money: 0.45, body: 0.75, social: 0.45 },
        main: 'body',
      },
      {
        id: 3, numeral: 'III', name: '皇后', en: 'The Empress', element: 'earth', planet: '金星',
        keywords: '丰盛 · 滋养 · 美感 · 身体',
        upright: '皇后把种子养成花园：今天的关键词是「照顾」——照顾一段关系、一个项目、自己的身体。越肯给耐心，回报越厚，财富也常从「持续经营」里长出来。',
        reversed: '逆位的皇后容易过度付出或过度享受：把别人的需要排在自己前面，或用消费安抚情绪。今天先把「照顾自己」放回清单第一行。',
        detail: '皇后不靠爆发力，靠的是「持续供给」：一顿好好做的饭、一次认真浇灌的关系、一个不急着收成的项目。它的提醒是，丰盛是照料出来的，不是抢来的。',
        tip: '挑一件你一直在消耗的事，今天给它一次真正的照顾：好好吃饭、早睡、或者认真听对方说完。',
        aff: { career: 0.5, love: 0.8, money: 0.55, body: 0.8, social: 0.7 },
        main: 'love',
      },
      {
        id: 4, numeral: 'IV', name: '皇帝', en: 'The Emperor', element: 'fire', planet: '白羊座',
        keywords: '秩序 · 责任 · 边界 · 执行力',
        upright: '皇帝用规则给混沌画框：今天适合定计划、排优先级、把边界说清楚。该你拍板的事别再拖给别人，掌控感会直接换成效率和信任。',
        reversed: '逆位的皇帝是控制过头或权威缺位：要么硬碰硬，要么该管的没管。今天松一格，先问「这件事真正需要的是什么」，再决定要不要立规矩。',
        detail: '皇帝的处理方式是「把模糊变明确」：谁负责、什么时候交、什么算完成。它不讨喜，但能止住内耗；今天你会发现，很多焦虑其实来自一条没写下来的规则。',
        tip: '把今天最重要的一件事写成「负责人 + 截止时间 + 完成标准」，贴在看得见的地方。',
        aff: { career: 0.85, love: 0.4, money: 0.6, body: 0.5, social: 0.5 },
        main: 'career',
      },
      {
        id: 5, numeral: 'V', name: '教皇', en: 'The Hierophant', element: 'earth', planet: '金牛座',
        keywords: '传统 · 学习 · 规则 · 引路人',
        upright: '教皇代表被验证过的路径：经验、师承、规则、契约。今天向懂的人请教、按流程走、把根基打稳，比另起炉灶更划算。',
        reversed: '逆位的教皇不是说传统全错，而是提醒你：有些规矩已经不适合你当前的位置。可以质疑，但要先弄清楚自己在质疑什么，而不是为了反叛而反叛。',
        detail: '教皇牌常对应「问对人」的场景：前辈的一句提醒、文档里的一条约定、行业里默认的做法。今天别闭门造车，找一个走过这条路的人聊十分钟，可能省掉一周试错。',
        tip: '今天挑一个你卡住的问题，去问一个真正做过这件事的人，并把听到的记下来。',
        aff: { career: 0.6, love: 0.55, money: 0.6, body: 0.5, social: 0.65 },
        main: 'career',
      },
      {
        id: 6, numeral: 'VI', name: '恋人', en: 'The Lovers', element: 'air', planet: '双子座',
        keywords: '关系 · 选择 · 契合 · 价值一致',
        upright: '恋人不只是爱情牌，更是「价值对齐」牌。今天适合谈清楚、做选择、与同频的人靠近；把心意说明白，关系会往前走一格。',
        reversed: '逆位的恋人指向摇摆：承诺、选择或价值观上有一处对不上。别急着逼对方表态，先看清自己在哪一步犹豫，答案往往在那里。',
        detail: '恋人牌讲的是「选」，不只是「爱」：选一个人、选一条路、选一种合作方式。它出现时，往往意味着你心里其实已有偏好，只是还没敢承认；承认之后，关系反而轻松。',
        tip: '把你在犹豫的那个选择写成两行：我想要的 / 我害怕的。看清害怕的那一行，再决定。',
        aff: { career: 0.45, love: 0.9, money: 0.4, body: 0.5, social: 0.95 },
        main: 'love',
      },
      {
        id: 7, numeral: 'VII', name: '战车', en: 'The Chariot', element: 'water', planet: '巨蟹座',
        keywords: '意志 · 推进 · 克服 · 方向',
        upright: '两匹兽朝不同方向，驾车的人靠意志让它们并进。今天适合设一个明确目标，集中火力往前推——把「想」换成「今天必须完成的下一步」。',
        reversed: '逆位的战车是内耗：目标太多、油门踩太猛、方向没对齐。今天先停下来排一次序，别用忙碌证明自己在前进。',
        detail: '战车的形象是「带着矛盾前进」：一边想休息一边想冲刺，一边想合作一边想独立。它的解法不是消除矛盾，而是先定一个方向，让矛盾暂时为这个方向服务。',
        tip: '今天只保留一个主目标，其他想做的事写进「改天」清单，别同时开三条战线。',
        aff: { career: 0.85, love: 0.4, money: 0.55, body: 0.75, social: 0.55 },
        main: 'career',
      },
      {
        id: 8, numeral: 'VIII', name: '力量', en: 'Strength', element: 'fire', planet: '狮子座',
        keywords: '耐心 · 温柔 · 驯服 · 内在力量',
        upright: '力量牌里没有蛮力：一个人轻轻按住狮子的嘴。今天真正的强是稳住情绪、温和而坚定地推进，越不急，越拿得住局面。',
        reversed: '逆位的力量是「用力过猛或自我怀疑」：硬撑、憋着不发、或反过来被情绪牵着走。今天给自己一点缓冲，先安顿好身体再处理事。',
        detail: '力量的核心是「和自己的冲动谈判」：想发火时先缓三秒，想放弃时先做完眼前这一小步。它不承诺事情变简单，只承诺你比冲动更有耐心。',
        tip: '今天遇到让你上头的事，先离开屏幕两分钟，回来再回那条消息。',
        aff: { career: 0.6, love: 0.65, money: 0.5, body: 0.8, social: 0.6 },
        main: 'body',
      },
      {
        id: 9, numeral: 'IX', name: '隐士', en: 'The Hermit', element: 'earth', planet: '处女座',
        keywords: '内省 · 独处 · 寻找答案 · 慢',
        upright: '隐士提灯独行，光只照脚下几步。今天适合收小社交半径，把一个问题想透；答案不来自热闹，而来自你愿不愿意独自待一会儿。',
        reversed: '逆位的隐士是躲得太深：把独处当避难所，或拒绝本来有用的外界帮助。今天试着让一个人走进来，哪怕只聊十分钟。',
        detail: '隐士不是孤僻，而是「主动减少噪音」：关掉几个群、推掉一场可去可不去的局、给自己一段不被打断的时间。它常出现在你需要做长期判断的时候。',
        tip: '今天给自己留一段 30 分钟不被打扰的时间，只用来想那一件一直没想清的事。',
        aff: { career: 0.55, love: 0.45, money: 0.4, body: 0.75, social: 0.3 },
        main: 'body',
      },
      {
        id: 10, numeral: 'X', name: '命运之轮', en: 'Wheel of Fortune', element: 'fire', planet: '木星',
        keywords: '周期 · 转机 · 顺势 · 变化',
        upright: '轮子在转，位置会变。今天适合顺势而为：抓住一个正在推开的门，别跟已经过去的那一格较劲。变化本身不是坏事，卡住才是。',
        reversed: '逆位的命运之轮提醒「时机还没转过来」：一件事推不动时，先别加力，检查是不是方向或节点错了。等风来也是一种判断。',
        detail: '命运之轮讲的是节奏：有些事在上升期，轻轻一推就动；有些事在低谷，越用力越累。今天值得分辨的是——你手上这件事，现在到底在轮子的哪一格。',
        tip: '给正在推进的事标一个「现在顺不顺势」：顺就加一步，不顺就先放着，别硬顶。',
        aff: { career: 0.65, love: 0.55, money: 0.7, body: 0.55, social: 0.5 },
        main: 'money',
      },
      {
        id: 11, numeral: 'XI', name: '正义', en: 'Justice', element: 'air', planet: '天秤座',
        keywords: '公平 · 契约 · 因果 · 清晰',
        upright: '正义手持天平与剑：今天适合把账算清、把话说清、把合同看清。你付出的和应得的大体相称，做对的事比赢下争论更重要。',
        reversed: '逆位的正义指向失衡：分配不公、承诺打折、或你在替别人的问题买单。今天把界限和条件摆到明面上，别靠默契赌人性。',
        detail: '正义牌关注的是「对等」：这段关系里谁在付出、这份合作里谁承担风险、这笔钱该不该花。它不制造冲突，它只是把已经存在的不平衡指给你看。',
        tip: '今天检查一件「口头约定」：该写下来的写下来，该说清的条件说清楚。',
        aff: { career: 0.65, love: 0.55, money: 0.65, body: 0.45, social: 0.55 },
        main: 'money',
      },
      {
        id: 12, numeral: 'XII', name: '倒吊人', en: 'The Hanged Man', element: 'water', planet: '海王星',
        keywords: '暂停 · 换视角 · 放手 · 等待',
        upright: '倒吊人倒挂着，表情却很平静。今天的好运可能藏在「不推进」里：换个角度看问题、暂时搁置一件事，反而会看清真正的解法。',
        reversed: '逆位的倒吊人是无意义的等待：明明该动却拖着，或一边牺牲一边不甘。今天给自己一个期限，到点就做决定。',
        detail: '倒吊人的智慧是「主动暂停」：不是拖延，而是承认现在硬推没用，先换一个姿势看。它常出现在你反复纠结同一件事、怎么想都想不通的时候。',
        tip: '把那件卡住的事换一种问法写下来：如果必须放弃一个前提，我会放弃哪个？',
        aff: { career: 0.4, love: 0.6, money: 0.4, body: 0.7, social: 0.4 },
        main: 'body',
      },
      {
        id: 13, numeral: 'XIII', name: '死神', en: 'Death', element: 'water', planet: '天蝎座',
        keywords: '结束 · 更新 · 割舍 · 转化',
        upright: '死神很少说「死亡」，它说的是「这一章该翻页了」。今天适合清理：结束一段消耗、放下一个旧身份、删掉不再服务你的安排。清空之后才有位置。',
        reversed: '逆位的死神是拖着不结束：明知该断的关系或习惯，还在原地耗。今天不必一次断干净，但可以承认「它已经结束了」。',
        detail: '死神牌在生活里往往很具体：一个不再回消息的群、一份拖了半年的计划、一种已经不适合你的作息。它不要求你戏剧性地告别，只要求你停止继续投入。',
        tip: '今天删掉一件「已经结束但还在占地方」的事：退一个群、关一个项目、丢一件旧物。',
        aff: { career: 0.5, love: 0.6, money: 0.45, body: 0.75, social: 0.5 },
        main: 'body',
      },
      {
        id: 14, numeral: 'XIV', name: '节制', en: 'Temperance', element: 'fire', planet: '射手座',
        keywords: '平衡 · 调和 · 节奏 · 治愈',
        upright: '天使把水在两个杯子间来回倒，不多不少。今天是「刚刚好」的一天：把节奏调匀、把冲突调柔、把身体和情绪调到同频，长久比猛烈更有效。',
        reversed: '逆位的节制是失衡：熬夜、过量、过度投入某一头。今天先把一件过头的事减半，身体会立刻给你反馈。',
        detail: '节制不是平庸，而是「配比」：工作与休息、表达与倾听、投入与抽离。它出现时，通常意味着你最近在某一头加得太猛，需要把另一个杯子也倒上。',
        tip: '今天给最过头的那件事设一个上限：比如再刷十分钟就关、再加班一小时就停。',
        aff: { career: 0.55, love: 0.7, money: 0.55, body: 0.85, social: 0.65 },
        main: 'body',
      },
      {
        id: 15, numeral: 'XV', name: '恶魔', en: 'The Devil', element: 'earth', planet: '摩羯座',
        keywords: '欲望 · 束缚 · 执念 · 现实',
        upright: '恶魔牌里的锁链其实很松——束缚多半是自愿的。今天适合诚实地看见：你在为什么上瘾、在什么关系里不敢走、把哪个欲望当成了需要。看见就能松一格。',
        reversed: '逆位的恶魔是松绑的信号：一段依赖正在退潮，一个执念开始褪色。今天做一个小的「戒断」动作，会比立大誓有效。',
        detail: '恶魔牌不邪恶，它讲的是「交换」：用睡眠换进度、用讨好换安全感、用消费换情绪。今天值得问的是——这笔交换，现在还算划算吗？',
        tip: '找出今天最像「不得不」的一件事，问自己：如果明天不做，最坏会怎样？',
        aff: { career: 0.55, love: 0.6, money: 0.65, body: 0.45, social: 0.55 },
        main: 'money',
      },
      {
        id: 16, numeral: 'XVI', name: '高塔', en: 'The Tower', element: 'fire', planet: '火星',
        keywords: '突变 · 拆解 · 真相 · 重建',
        upright: '高塔被雷劈中，塌的是本来就不稳的结构。今天可能有一件「计划外」的事，但它更像拆掉违建：先别急着救火，看看它在提醒你哪块地基有问题。',
        reversed: '逆位的高塔是「差一点就爆」的压抑：问题还在，只是被拖后了。今天主动排掉一个小隐患，好过等它自己找上门。',
        detail: '高塔的日常版本没那么戏剧化：一个临时改期、一条推翻方案的消息、一次不得不面对的问题。它针对的从来不是「你」，而是「那个本来就不牢的结构」。',
        tip: '今天主动检查一件「靠运气撑着」的事，把那个小隐患先补上。',
        aff: { career: 0.7, love: 0.5, money: 0.5, body: 0.55, social: 0.45 },
        main: 'career',
      },
      {
        id: 17, numeral: 'XVII', name: '星星', en: 'The Star', element: 'air', planet: '水瓶座',
        keywords: '希望 · 疗愈 · 灵感 · 远方',
        upright: '星星是风暴后的夜空：愿望还在，只是需要一点耐心。今天适合许愿、复盘、把长期想做的事写下来——希望本身就是资源，它让人愿意继续走。',
        reversed: '逆位的星星是「暂时看不见光」：不是运气差，是耗得太久。今天别追求振作，先做一件让自己舒服的小事，信心会慢慢回来。',
        detail: '星星牌谈的是「长线信念」：你现在做的事，可能要到很久以后才有结果。它的提醒是，别用今天的反馈评估一件需要三年的事；给过程一点信任。',
        tip: '写下你三个月后想看到的一个小变化，然后为它做一件今天就能做的最小动作。',
        aff: { career: 0.55, love: 0.7, money: 0.5, body: 0.8, social: 0.65 },
        main: 'body',
      },
      {
        id: 18, numeral: 'XVIII', name: '月亮', en: 'The Moon', element: 'water', planet: '双鱼座',
        keywords: '模糊 · 直觉 · 情绪 · 未明',
        upright: '月光下路是模糊的，狗和狼都在叫。今天信息不全，判断容易受情绪放大。适合观察、记录、暂缓重大决定，把「我以为」和「事实」分开。',
        reversed: '逆位的月亮是雾在散：一段误解有机会澄清，一个担心可能被证明没那么糟。今天适合把心里的事说出口，验证比猜测省力。',
        detail: '月亮牌描述的是「情绪滤镜」：同一句话，疲惫时会听成指责，安心时会听成玩笑。今天先确认自己的状态，再决定要不要回应；很多误会都是滤镜造成的。',
        tip: '遇到让你不安的信息，先问一句「这是事实，还是我现在的感受？」再回。',
        aff: { career: 0.4, love: 0.7, money: 0.45, body: 0.7, social: 0.6 },
        main: 'love',
      },
      {
        id: 19, numeral: 'XIX', name: '太阳', en: 'The Sun', element: 'fire', planet: '太阳',
        keywords: '清晰 · 成功 · 活力 · 被看见',
        upright: '太阳把一切照亮：今天状态在线，表达和行动都容易被接住。适合推进重要的事、公开你的成果、把关系往前推一步。好运不是等来的，是你出场时自带的。',
        reversed: '逆位的太阳不是没有光，是光被云挡了一半：成果在那，但你不太敢认领，或期待太高。今天把标准从「完美」调到「完成」，心情会亮起来。',
        detail: '太阳牌是「可见度」：你的努力被看见、你的表达被接住、你的存在带来温度。今天适合少一点自我怀疑，多一点直接展示——遮住太阳的通常不是云，是谦虚过头。',
        tip: '今天把一件做完的事发出去、说出来或交出去，别等「再完善一点」。',
        aff: { career: 0.85, love: 0.7, money: 0.65, body: 0.85, social: 0.9 },
        main: 'career',
      },
      {
        id: 20, numeral: 'XX', name: '审判', en: 'Judgement', element: 'fire', planet: '冥王星',
        keywords: '觉醒 · 复盘 · 召唤 · 决定',
        upright: '号角响起，旧事被重新审视。今天适合复盘、道歉、和解、做一个拖了很久的决定。你不是被审判，而是被邀请重新选择一次。',
        reversed: '逆位的审判是「听见了却不动」：知道该改变，却还在等一个更好的时机。今天先做最小的那一步，别让决定一直停在脑子里。',
        detail: '审判牌讲的是「第二次机会」：旧账可以翻篇，旧关系可以重新定义，旧决定可以改写。它不要求你原谅所有人，只要求你别再用过去给自己定罪。',
        tip: '今天给一件旧事一个明确的收尾：道个歉、说声谢谢、或正式把它归档。',
        aff: { career: 0.7, love: 0.6, money: 0.55, body: 0.6, social: 0.65 },
        main: 'career',
      },
      {
        id: 21, numeral: 'XXI', name: '世界', en: 'The World', element: 'earth', planet: '土星',
        keywords: '完成 · 圆满 · 整合 · 收束',
        upright: '世界是循环的收尾：一件事终于走完，可以好好收尾、庆祝、归档。今天适合结项、交付、把散落的经验整理成自己的方法，再开下一轮。',
        reversed: '逆位的世界是「差最后一步」：进度卡在 95%，收尾比开头更难。今天把那个尾巴列出来，一件一件收掉，别让未完成持续占着心力。',
        detail: '世界牌的核心是「闭环」：把做过的事沉淀成经验，把悬着的事收进抽屉。它出现时，往往不是要你开新局，而是提醒你——先关掉几个没关完的窗口。',
        tip: '今天挑一件拖在 90% 的事，花 20 分钟把它真正收尾，然后做个小小的庆祝。',
        aff: { career: 0.75, love: 0.65, money: 0.7, body: 0.6, social: 0.75 },
        main: 'money',
      },
    ]

    // 牌势：传统上「吉牌/重牌」的强弱倾向，直接影响当天整体基调（-1 ~ +1）
    const CARD_VALENCE = {
      0: 0, 1: 0.6, 2: 0.1, 3: 0.7, 4: 0.4, 5: 0.3, 6: 0.6, 7: 0.5,
      8: 0.5, 9: 0, 10: 0.7, 11: 0.3, 12: -0.3, 13: -0.5, 14: 0.6,
      15: -0.5, 16: -0.8, 17: 0.7, 18: -0.3, 19: 0.9, 20: 0.4, 21: 0.8,
    }

    // 22 张牌的线条图标（24×24 viewBox，stroke 风格）
    const GLYPHS = {
      0: ['M4 20 L10 11 L14 14 L20 5', 'M15.5 5 H20 V9.5'],
      1: ['M12 2.5 L12 21.5', 'M5 7.5 H19', 'M12 2.5 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0'],
      2: ['M12 3 L12 15', 'M4 21 Q12 16 20 21', 'M12 3 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0'],
      3: ['M12 3 L12 11', 'M5 21 V13 A7 7 0 0 1 19 13 V21', 'M8.5 21 V15.5 H15.5 V21'],
      4: ['M5 21 V7 L12 3 L19 7 V21', 'M9 21 V13 H15 V21', 'M12 3 V21'],
      5: ['M5 21 C5 13 9 8 12 8 C15 8 19 13 19 21', 'M12 8 V4', 'M9 4 H15'],
      6: ['M12 3 C12 8 16 9 20 9 C20 15 17 20 12 21 C7 20 4 15 4 9 C8 9 12 8 12 3 Z'],
      7: ['M7 20 L7 10 A5 5 0 0 1 17 10 L17 20', 'M7 15 H17', 'M12 5 V2'],
      8: ['M12 3 C14.5 7 20 9 20 14 A8 8 0 0 1 4 14 C4 9 9.5 7 12 3 Z', 'M9 14 A3 3 0 0 0 15 14'],
      9: ['M6 21 V13 L11 8 L16 13 V21', 'M6 13 H16', 'M11 8 V3'],
      10: ['M12 3 V21', 'M7 5 L17 19', 'M17 5 L7 19'],
      11: ['M12 3 V21', 'M5 8 L19 8', 'M8 21 H16'],
      12: ['M6 10 H18', 'M6 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M18 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0'],
      13: ['M12 3 L12 16', 'M5 21 L19 21', 'M5 21 C9 16 15 16 19 21'],
      14: ['M12 3 C16 7 19 11 19 15 A7 7 0 0 1 5 15 C5 11 8 7 12 3 Z', 'M12 14 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0'],
      15: ['M12 2.5 L12 21.5', 'M5 8 H19', 'M5 21 H19'],
      16: ['M4 21 L12 14 L20 21', 'M12 14 V3', 'M8 7 L12 3 L16 7'],
      17: ['M12 4 L12 20', 'M4 12 H20', 'M7 7 L17 17', 'M17 7 L7 17'],
      18: ['M4 8 C9 8 11 10.5 11 14 C11 18 8 20 5 19 C9 16.5 9 12 4 8 Z'],
      19: ['M12 2.5 L12 21.5', 'M5 7.5 L19 7.5', 'M5 16.5 H19'],
      20: ['M12 2 L12 12', 'M7 6 H17', 'M7 9 H17'],
      21: ['M12 2.5 C16 5 20 6.5 20 11 C20 16 16 20 12 21.5 C8 20 4 16 4 11 C4 6.5 8 5 12 2.5 Z', 'M12 5 V19'],
    }

    const WEEKDAY_RULER = ['太阳', '月亮', '火星', '水星', '木星', '金星', '土星']
    const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    // 黄道十二宫区间（不含回绕的摩羯座单独处理）
    const ZODIAC = [
      { sign: 'aries', name: '白羊', start: 0 },
      { sign: 'taurus', name: '金牛', start: 30 },
      { sign: 'gemini', name: '双子', start: 60 },
      { sign: 'cancer', name: '巨蟹', start: 90 },
      { sign: 'leo', name: '狮子', start: 120 },
      { sign: 'virgo', name: '处女', start: 150 },
      { sign: 'libra', name: '天秤', start: 180 },
      { sign: 'scorpio', name: '天蝎', start: 210 },
      { sign: 'sagittarius', name: '射手', start: 240 },
      { sign: 'capricorn', name: '摩羯', start: 270 },
      { sign: 'aquarius', name: '水瓶', start: 300 },
      { sign: 'pisces', name: '双鱼', start: 330 },
    ]

    /* ------------------------------------------------------------------ */
    /* 低精度星历：JPL 近似轨道根数 + 简化 ELP 月亮公式                     */
    /* ------------------------------------------------------------------ */

    const DEG = Math.PI / 180
    const J2000 = 2451545.0
    const norm360 = (d) => { const x = d % 360; return x < 0 ? x + 360 : x }
    const norm180 = (d) => { const x = norm360(d); return x > 180 ? x - 360 : x }

    function julianDay(date) {
      // 用 UTC 字段把 Date 当作绝对时刻处理，避免本地时区偏移进星历
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()) / 86400000 + 2440587.5
    }
    function centuries(date) { return (julianDay(date) - J2000) / 36525 }

    // JPL "Keplerian Elements for Approximate Positions"（1800–2050 足够）
    const ORBITS = {
      mercury: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, peri: 77.45779628, node: 48.33076593, aR: 0.00000037, eR: 0.00001906, iR: -0.00594749, LR: 149472.67411175, periR: 0.16047689, nodeR: -0.12534081 },
      venus: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, peri: 131.60246718, node: 76.67984255, aR: 0.0000039, eR: -0.00004107, iR: -0.0007889, LR: 58517.81538729, periR: 0.00268329, nodeR: -0.27769418 },
      earth: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0, aR: 0.00000562, eR: -0.00004392, iR: -0.01294668, LR: 35999.37244981, periR: 0.32327364, nodeR: 0 },
      mars: { a: 1.52371034, e: 0.0933941, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891, aR: 0.00001847, eR: 0.00007882, iR: -0.00813131, LR: 19140.30268499, periR: 0.44441088, nodeR: -0.29257343 },
      jupiter: { a: 5.202887, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909, aR: -0.00011607, eR: -0.00013253, iR: -0.00183714, LR: 3034.74612775, periR: 0.21252668, nodeR: 0.20469106 },
      saturn: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448, aR: -0.0012506, eR: -0.00050991, iR: 0.00193609, LR: 1222.49362201, periR: -0.41897216, nodeR: -0.28867519 },
    }

    function solveKepler(M, e) {
      let E = M
      for (let k = 0; k < 10; k++) {
        const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
        E -= d
        if (Math.abs(d) < 1e-9) break
      }
      return E
    }

    function helioXYZ(key, T) {
      const o = ORBITS[key]
      const a = o.a + o.aR * T
      const e = o.e + o.eR * T
      const inc = (o.i + o.iR * T) * DEG
      const L = norm360(o.L + o.LR * T)
      const wbar = o.peri + o.periR * T
      const O = (o.node + o.nodeR * T) * DEG
      const w = (wbar * DEG) - O
      const M = norm360(L - wbar) * DEG
      const E = solveKepler(M, e)
      const xp = a * (Math.cos(E) - e)
      const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
      const cw = Math.cos(w), sw = Math.sin(w)
      const cO = Math.cos(O), sO = Math.sin(O)
      const ci = Math.cos(inc), si = Math.sin(inc)
      return {
        x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
        y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
        z: (sw * si) * xp + (cw * si) * yp,
      }
    }

    function earthSunLon(date) {
      const e = helioXYZ('earth', centuries(date))
      return norm360(Math.atan2(-e.y, -e.x) / DEG)
    }

    // 地心黄经
    function planetLon(key, date) {
      const T = centuries(date)
      const earth = helioXYZ('earth', T)
      const p = helioXYZ(key, T)
      return norm360(Math.atan2(p.y - earth.y, p.x - earth.x) / DEG)
    }

    // 月亮黄经：只取主项，误差约 0.1°–0.3°，足够判相位
    function moonLon(date) {
      const T = centuries(date)
      const Lp = 218.3164477 + 481267.88123421 * T
      const D = 297.8501921 + 445267.1114034 * T
      const M = 357.5291092 + 35999.0502909 * T
      const Mp = 134.9633964 + 477198.8675055 * T
      const F = 93.272095 + 483202.0175233 * T
      const lon = Lp
        + 6.289 * Math.sin(Mp * DEG)
        + 1.274 * Math.sin((2 * D - Mp) * DEG)
        + 0.658 * Math.sin(2 * D * DEG)
        + 0.214 * Math.sin(2 * Mp * DEG)
        - 0.186 * Math.sin(M * DEG)
        - 0.114 * Math.sin(2 * F * DEG)
      return norm360(lon)
    }

    const TRANSIT_PLANETS = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星']
    const PLANET_KEY = { 太阳: null, 月亮: null, 水星: 'mercury', 金星: 'venus', 火星: 'mars', 木星: 'jupiter', 土星: 'saturn' }

    function signOfLon(lon) {
      const idx = Math.floor(norm360(lon) / 30) % 12
      const z = ZODIAC[idx]
      return { id: z.sign, name: z.name, degree: norm360(lon) - z.start }
    }

    // 主要相位与容许度
    const ASPECT_DEFS = [
      { name: '合相', angle: 0, orb: 6, kind: 'conj' },
      { name: '六分相', angle: 60, orb: 4, kind: 'easy' },
      { name: '四分相', angle: 90, orb: 5, kind: 'hard' },
      { name: '三分相', angle: 120, orb: 5, kind: 'easy' },
      { name: '对分相', angle: 180, orb: 6, kind: 'hard' },
    ]

    function aspectOf(lonA, lonB) {
      const diff = Math.abs(norm180(lonA - lonB))
      let best = null
      for (const a of ASPECT_DEFS) {
        const d = Math.abs(diff - a.angle)
        if (d <= a.orb) {
          const weight = 1 - d / (a.orb + 0.001)
          if (!best || weight > best.weight) best = { name: a.name, kind: a.kind, orb: a.orb, weight, angle: a.angle }
        }
      }
      return best
    }

    function isRetrograde(name, date) {
      const key = PLANET_KEY[name]
      if (!key) return false
      const before = new Date(date.getTime() - 12 * 3600 * 1000)
      const after = new Date(date.getTime() + 12 * 3600 * 1000)
      const d = norm180(planetLon(key, after) - planetLon(key, before))
      return d < 0
    }

    /* ------------------------------------------------------------------ */
    /* 工具函数                                                            */
    /* ------------------------------------------------------------------ */

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n)
    const todayString = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)

    function hash32(str) {
      let h = 2166136261
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
      return h >>> 0
    }

    function rngOf(seed) {
      let state = seed >>> 0
      return function next() {
        state ^= state << 13; state >>>= 0
        state ^= state >>> 17
        state ^= state << 5; state >>>= 0
        return state / 4294967296
      }
    }

    function signOf(month, day) {
      for (let i = 0; i < SIGNS.length; i++) {
        const s = SIGNS[i]
        const [fm, fd] = s.from
        const [tm, td] = s.to
        if (fm <= tm) {
          if ((month === fm && day >= fd) || (month === tm && day <= td)) return s
        } else {
          if ((month === fm && day >= fd) || (month === tm && day <= td)) return s
        }
      }
      return SIGNS[9]
    }

    function signByName(name) {
      for (const s of SIGNS) if (s.name === name) return s
      return null
    }

    function elementRelation(signEl, cardEl) {
      if (signEl === cardEl) return { kind: 'same', label: '同元素 · 共振', factor: 1.1 }
      const compat = { fire: 'air', air: 'fire', earth: 'water', water: 'earth' }
      if (compat[signEl] === cardEl) return { kind: 'friendly', label: '风火 / 水土 · 相生', factor: 1.04 }
      const clash = { fire: 'water', water: 'fire', earth: 'air', air: 'earth' }
      if (clash[signEl] === cardEl) return { kind: 'tension', label: '元素相冲 · 磨合', factor: 0.93 }
      return { kind: 'neutral', label: '元素互补 · 平稳', factor: 0.99 }
    }

    function moonPhaseOf(sunLon, moonLonValue) {
      const elong = norm360(moonLonValue - sunLon)
      const ratio = elong / 360
      let phase, emoji
      if (ratio < 0.03 || ratio > 0.97) { phase = '新月'; emoji = '🌑' }
      else if (ratio < 0.22) { phase = '娥眉月'; emoji = '🌒' }
      else if (ratio < 0.28) { phase = '上弦月'; emoji = '🌓' }
      else if (ratio < 0.47) { phase = '盈凸月'; emoji = '🌔' }
      else if (ratio < 0.53) { phase = '满月'; emoji = '🌕' }
      else if (ratio < 0.72) { phase = '亏凸月'; emoji = '🌖' }
      else if (ratio < 0.78) { phase = '下弦月'; emoji = '🌗' }
      else { phase = '残月'; emoji = '🌘' }
      return { phase, emoji, ratio, elongation: Math.round(elong) }
    }

    function shuffleInPlace(arr, rand) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t
      }
      return arr
    }

    /* ------------------------------------------------------------------ */
    /* 基础运势（内部层，默认不展示）                                       */
    /* ------------------------------------------------------------------ */

    // 每颗行星的主题维度与影响权重
    const PLANET_THEME = {
      太阳: { dims: ['body', 'career'], weight: 1.0 },
      月亮: { dims: ['body', 'love'], weight: 0.7 },
      水星: { dims: ['career', 'social'], weight: 0.6 },
      金星: { dims: ['love', 'social', 'money'], weight: 0.8 },
      火星: { dims: ['career', 'body'], weight: 0.7 },
      木星: { dims: ['money', 'social', 'love'], weight: 0.8 },
      土星: { dims: ['career', 'money'], weight: 0.7 },
    }
    const ASPECT_VALENCE = { easy: 1, conj: 0.45, hard: -0.9 }

    function buildBase(profile, now) {
      const dateStr = todayString(now)
      const date = dayStart(now)
      const sign = profile ? signOf(profile.month, profile.day) : null
      const signEl = sign ? sign.element : 'air'

      // 出生太阳黄经：有年份用真实计算，否则用星座中点
      let natalLon
      if (profile && profile.year) {
        natalLon = earthSunLon(dayStart(new Date(profile.year, profile.month - 1, profile.day, 12)))
      } else if (sign) {
        const idx = ZODIAC.findIndex((z) => z.sign === sign.id)
        natalLon = norm360(idx * 30 + 15)
      } else {
        natalLon = 15
      }

      const sunLon = earthSunLon(date)
      const moon = moonLon(date)
      const phase = moonPhaseOf(sunLon, moon)

      // 各行星今日黄经、所在星座、与本人太阳的相位、是否逆行
      const transits = TRANSIT_PLANETS.map((name) => {
        const lon = name === '太阳' ? sunLon : name === '月亮' ? moon : planetLon(PLANET_KEY[name], date)
        const z = signOfLon(lon)
        return {
          name,
          lon,
          sign: z,
          aspect: aspectOf(lon, natalLon),
          retro: isRetrograde(name, date),
        }
      })

      // 底盘：星座亲和 + 当日行星相位/落座修正（无随机数，全部可解释）
      const dims = {}
      DIMS.forEach((k) => {
        let score = 33 + (sign ? sign.aff[k] : 64) * 0.36

        for (const t of transits) {
          const theme = PLANET_THEME[t.name]
          if (!theme || theme.dims.indexOf(k) < 0) continue
          const el = signByName(t.sign.name)
          if (!el) continue
          const rel = elementRelation(signEl, el.element)

          // 相位：三分/六分给顺风，四分/对分给摩擦，合相看行星
          if (t.aspect) {
            let v = ASPECT_VALENCE[t.aspect.kind] || 0
            if (t.aspect.kind === 'conj') {
              v = (t.name === '土星' || t.name === '火星') ? -0.2 : 0.55
            }
            score += v * theme.weight * t.aspect.weight * 8
          }

          // 落座元素：同元素最顺，相冲最磨
          if (rel.kind === 'same') score += 3.0 * theme.weight
          else if (rel.kind === 'friendly') score += 1.9 * theme.weight
          else if (rel.kind === 'tension') score -= 2.4 * theme.weight

          // 逆行：沟通 / 推进类维度打折
          if (t.retro && (k === 'career' || k === 'social')) score -= 3 * theme.weight
        }

        // 月相：新月利开局（事业），满月情绪张力大（身心/感情）
        if (phase.phase === '新月') score += k === 'career' ? 1.6 : 0
        if (phase.phase === '满月') score += k === 'body' ? 1.2 : k === 'love' ? 0.8 : 0
        if (phase.phase === '上弦月' || phase.phase === '下弦月') score -= k === 'body' ? 0.8 : 0

        dims[k] = clamp(score, 20, 84) / 100
      })

      return {
        dateStr,
        sign,
        signEl,
        natalLon,
        sunLon,
        phase,
        transits,
        dims,
        weekday: now.getDay(),
        weekRuler: WEEKDAY_RULER[now.getDay()],
      }
    }

    /* ------------------------------------------------------------------ */
    /* 抽牌与合成                                                          */
    /* ------------------------------------------------------------------ */

    function drawCard() {
      const cryptoObj = typeof window !== 'undefined' ? window.crypto : null
      let rand
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        rand = () => cryptoObj.getRandomValues(new Uint32Array(1))[0] / 4294967296
      } else {
        rand = Math.random
      }
      const deck = CARDS.map((c) => ({ card: c, reversed: rand() < 0.5 }))
      shuffleInPlace(deck, rand)
      const index = Math.floor(rand() * deck.length)
      return { deck, index, pick: deck[index] }
    }

    function computeReading(base, picked) {
      if (!base || !picked) return null
      const { card, reversed } = picked
      const sign = base.sign
      const signEl = sign ? sign.element : 'air'
      const rel = elementRelation(signEl, card.element)
      const rec = RECEPTION[signEl]

      const details = {}
      const valence = (CARD_VALENCE[card.id] || 0) * 8
      DIMS.forEach((k) => {
        const aff = card.aff[k]
        const weight = card.main === k ? 1.35 : 1
        // 以 0.58 为中性轴：牌面强的维度被抬高，牌面弱的维度被压低，五维才拉开差异；
        // 再叠加「牌势」：吉牌整体抬、重牌整体压，好牌与坏牌的综合分才能真正拉开。
        let delta = (aff - 0.58) * weight * rel.factor * rec[k] * 110 + (reversed ? valence - 5 : valence)
        // 逆位统一「削峰 + 下压」：任何维度都必须比正位低，避免弱势维度被逆位反向抬高
        if (reversed) delta = Math.min(delta * 0.8 - 3.5, delta - 1)
        const raw = base.dims[k] * 100 + delta
        details[k] = {
          score: Math.round(clamp(raw, 22, 97)),
          meta: DIM_META[k],
          cardHit: delta,
        }
      })

      const strongest = DIMS.reduce((a, k) => (details[k].score > details[a].score ? k : a), DIMS[0])
      const weakest = DIMS.reduce((a, k) => (details[k].score < details[a].score ? k : a), DIMS[0])

      // 综合分：基础分打底，牌面按好坏做「加减」。
      // 基础分 = 五维基础盘均值映射到 40 起的分数；牌面 = 五维牌面增量的加权和
      // （主落点 1.4、最短板 1.15、其余 1.0），好牌加、坏牌减，负向扣得更实。
      // 原始分再线性映射到 40–100。
      const baseC = DIMS.reduce((a, k) => a + base.dims[k] * 100, 0) / DIMS.length
      const baseScore = 40 + clamp((baseC - 50) * 2.6, 0, 60)
      let sw = 0
      let sd = 0
      for (const k of DIMS) {
        const w = card.main === k ? 1.4 : k === weakest ? 1.15 : 1
        sw += w
        sd += details[k].cardHit * w
      }
      const weightedDelta = sd / sw
      const cardShift = weightedDelta * (weightedDelta >= 0 ? 0.6 : 1.2)
      const raw = baseScore + 7 + cardShift
      const total = Math.round(clamp(40 + (raw - 48) * 60 / 49, 40, 100))

      const totalLevel =
        total >= 86 ? { label: '大吉', tone: 'great', stars: 5, verdict: '今日大吉，运势不错' } :
        total >= 74 ? { label: '顺遂', tone: 'good', stars: 4, verdict: '今日顺遂，稳中有进' } :
        total >= 62 ? { label: '平稳', tone: 'steady', stars: 3, verdict: '今日平稳，按部就班' } :
        total >= 50 ? { label: '留意', tone: 'careful', stars: 2, verdict: '今日需留意，宜守不宜攻' } :
        { label: '蓄力', tone: 'low', stars: 1, verdict: '今日低谷，先蓄力' }

      return { card, reversed, rel, details, total, strongest, weakest, totalLevel, sign, base }
    }

    const ADVICE = {
      career: [
        '把今天最小的一步写下来并立刻做掉，别让计划停在待办里。',
        '需要推动的事，约一个明确的 20 分钟沟通，比来回发消息有效。',
        '如果今天要表态，先给结论，再给两条理由，别把过程铺得太长。',
      ],
      love: [
        '把「你懂我意思吧」换成具体的一句需求，关系会少很多猜测。',
        '今天适合主动给一个具体的小回应：一句谢谢、一次约饭、一条语音。',
        '对方情绪上来时先接住情绪，再谈事情，顺序反了容易吵。',
      ],
      money: [
        '把今天想买的东西放进购物车，隔 24 小时再决定。',
        '花十分钟核对一项固定支出，能省下的往往比新赚的多。',
        '今天适合问清一笔钱的条件和期限，别用「应该没事」糊过去。',
      ],
      body: [
        '给自己留出一段不被打断的 20 分钟，只用来恢复。',
        '今天早一点睡，比任何励志话都管用。',
        '站起来走两圈、喝杯水；身体顺了，情绪才好带。',
      ],
      social: [
        '今天主动给一个人发消息，不是求人办事，只是让关系保持温度。',
        '在群里把话说具体：时间、地点、你要什么，别让人猜。',
        '遇到分歧先复述对方的观点，确认没听错，再讲你的。',
      ],
    }

    function pickAdvice(rng, k, offset) {
      const pool = ADVICE[k]
      return pool[Math.floor(rng() * pool.length + offset) % pool.length]
    }

    function buildReadingText(reading) {
      const { card, reversed, rel, details, strongest, weakest, total, totalLevel, base } = reading
      const rng = rngOf(hash32(base.dateStr + '|' + card.id + '|' + (reversed ? 'r' : 'u') + '|' + strongest + '|' + weakest))
      const sign = base.sign
      const meaning = reversed ? card.reversed : card.upright

      const opening = totalLevel.tone === 'great'
        ? '今天整体是顺风口：' + (reversed ? '牌是逆位，顺里带一点慢，别把速度当成果。' : '牌是正位，适合把要紧的事往前推。')
        : totalLevel.tone === 'good'
          ? (reversed ? '今天底子不错，逆位提醒的是节奏而非运气，慢半拍反而稳。' : '今天底子稳，正位给了你一点额外的推力。')
          : totalLevel.tone === 'steady'
            ? '今天不算大起大落，牌面更像在提示你把注意力放回具体的事上。'
            : '今天外部的推拉感偏强，先把可控的部分收好，不必跟全部对着干。'

      const elementNote = rel.kind === 'same'
        ? '牌的元素与你的太阳元素同属' + (sign ? ELEMENT_CN[sign.element] : '同一元素') + '，能量咬得很紧，感受会明显。'
        : rel.kind === 'tension'
          ? '牌的元素与你的太阳元素相冲，今天容易「想要」和「实际」打架，留一点回旋余地。'
          : '牌的元素与你的太阳元素互补，事情进展会比情绪慢半拍，算稳。'

      const dimLine = '五维里最亮的是【' + DIM_META[strongest].label + '】' + details[strongest].score + ' 分，最需要照看的是【' + DIM_META[weakest].label + '】' + details[weakest].score + ' 分。'

      // 今日天象：取与本人太阳有相位的行运，或月亮落座，作为「为什么是这个分数」的解释
      const aspectTransits = base.transits.filter((t) => t.aspect && t.name !== '太阳').slice(0, 2)
      const moonSign = base.transits.find((t) => t.name === '月亮')
      const skyParts = []
      if (moonSign) skyParts.push('月亮行经' + moonSign.sign.name + '座')
      for (const t of aspectTransits) {
        skyParts.push(t.name + (t.aspect.kind === 'hard' ? '与你的太阳成' : '与你的太阳') + t.aspect.name)
      }
      const skyNote = skyParts.length ? '今日天象：' + skyParts.join('，') + '。' : ''

      const advice = [
        pickAdvice(rng, strongest, 0),
        pickAdvice(rng, weakest, 1),
      ]

      return { opening, meaning, detail: card.detail, elementNote, dimLine, skyNote, advice, tip: card.tip }
    }

    const QUESTION_THEMES = [
      { key: 'career', words: ['工作', '项目', '面试', '跳槽', '升职', '老板', '方案', '推进', '创业', '考试', '学业', '合作'] },
      { key: 'love', words: ['感情', '喜欢', '对象', '恋爱', '分手', '复合', '婚姻', '表白', '约会', '关系'] },
      { key: 'money', words: ['钱', '财', '投资', '买', '卖', '收入', '工资', '预算', '存'] },
      { key: 'body', words: ['身体', '健康', '睡', '累', '病', '运动', '减', '休息'] },
      { key: 'social', words: ['朋友', '社交', '人际', '聚会', '沟通', '同事', '圈子'] },
    ]

    function themeOfQuestion(text) {
      for (const theme of QUESTION_THEMES) {
        if (theme.words.some((w) => text.indexOf(w) >= 0)) return theme.key
      }
      return null
    }

    const QUESTION_TOPIC_WORDS = [
      '方案', '项目', '面试', '跳槽', '升职', '老板', '创业', '考试', '学习',
      '表白', '约会', '分手', '复合', '婚姻', '投资', '预算', '工资', '买房',
      '朋友', '聚会', '沟通', '同事', '身体', '睡眠', '运动', '旅行', '搬家',
      '签约', '谈判', '加班', '简历', 'offer',
    ]

    const QUESTION_STEPS = {
      career: [
        '把这件事拆成今天能完成的一步：列出 3 个待确认项，先解决第 1 个。',
        '约相关的人聊 15 分钟，只问目标、节点、谁拍板这三件事。',
        '写下最坏结果和你能接受的替代方案，再决定要不要推进。',
      ],
      love: [
        '把想问的话改成一句具体请求，比如「这周能见一面吗」，别用「你怎么想」。',
        '先确认对方最近的状态，再讲你的需求；一句「你最近还好吗」比追问有效。',
        '给对方一个明确的选择项（时间、地点、要不要），减少对方猜的成本。',
      ],
      money: [
        '把金额、期限、最坏亏损写成一行；超过这条线就不做。',
        '先查清这笔钱的退出条件，再谈收益。',
        '把想买的东西放进购物车，24 小时后再决定。',
      ],
      body: [
        '今晚提前 30 分钟睡，明天再看这件事，判断会不一样。',
        '今天只安排一件消耗体力的事，其余往后挪。',
        '先走 10 分钟或喝杯水，再回到这件事上。',
      ],
      social: [
        '先复述对方的观点，确认没听错，再表达你的。',
        '把请求说具体：时间、地点、你要对方做什么。',
        '今天先联系一个关键的人，别群发。',
      ],
    }

    function questionTopics(q) {
      const found = []
      for (const w of QUESTION_TOPIC_WORDS) {
        if (q.indexOf(w) >= 0 && found.indexOf(w) < 0) found.push(w)
      }
      return found.slice(0, 3)
    }

    function questionType(q) {
      if (/该不该|要不要|能不能|可不可以|会不会|是不是|行不行|值不值|适不适合/.test(q)) return 'yesno'
      if (/怎么|如何|怎样|咋办|该怎么办/.test(q)) return 'how'
      if (/什么时候|何时|哪天|多久|几时/.test(q)) return 'when'
      if (/为什么|为啥|怎么会/.test(q)) return 'why'
      return 'general'
    }

    function shortStep(s) {
      const clean = String(s).replace(/[「」“”"]/g, '').replace(/\s+/g, ' ')
      return clean.length > 18 ? clean.slice(0, 18) + '…' : clean
    }

    // 就用户的问题给一个答案：牌面占七成、基础运势占三成；按问题类型给具体做法
    function buildAnswer(reading, rawQuestion) {
      const q = (rawQuestion || '').trim()
      if (!q) return null
      const theme = themeOfQuestion(q) || reading.card.main
      const meta = DIM_META[theme]
      const card = reading.card
      const rev = reading.reversed
      const topics = questionTopics(q)
      const type = questionType(q)
      const baseScore = Math.round(reading.base.dims[theme] * 100)
      const cardScore = reading.details[theme].score
      const lean = Math.round(baseScore * 0.3 + cardScore * 0.7)
      const toneKey = lean >= 78 ? 'advance' : lean >= 64 ? 'try' : lean >= 50 ? 'wait' : 'hold'
      const tone = {
        advance: { text: '现在可以推进', color: 'var(--dsw-alias-state-success-primary)' },
        try: { text: '可以试，给自己留一点余地', color: 'var(--dsw-alias-brand-primary)' },
        wait: { text: '先缓一缓，别急着定', color: 'var(--dsw-alias-state-warn-primary)' },
        hold: { text: '今天不适合硬推', color: 'var(--dsw-alias-state-error-primary)' },
      }[toneKey]

      const DIRECT = {
        yesno: {
          advance: '可以，今天就适合做；别一次押上全部。',
          try: '可以做，但先给自己留一条退路。',
          wait: '今天先别拍板，补一个关键信息再说。',
          hold: '今天不建议直接做，先把条件准备好。',
        },
        general: {
          advance: '可以往前推，但把第一步做小一点。',
          try: '可以试，先设一个可回退的节点。',
          wait: '先别急着定，观察一天再决定。',
          hold: '今天先不动，把准备做足。',
        },
        how: {
          advance: '按下面三步走，今天先完成第一步。',
          try: '可以试，但每一步都留个验证点。',
          wait: '先别一次做全，按顺序来，卡住就停。',
          hold: '先做最小的一步，别把整件事一次推。',
        },
        when: {
          advance: '今天就能先动第一步；节点放在做完准备之后。',
          try: '今天先准备，明天再看要不要动。',
          wait: '时机还没到，今天只做铺垫。',
          hold: '今天不是动的时机，先把条件补齐。',
        },
        why: {
          advance: '牌面和底盘指向同一个方向，所以可以。',
          try: '两边都还行，但有一步需要先确认。',
          wait: '牌面在提醒你信息不全，别急着下结论。',
          hold: '牌面和底盘都在说「先停」，原因在下面。',
        },
      }

      const topicLabel = topics.length ? topics.join('、') : meta.label
      const rng = rngOf(hash32('answer|' + q + '|' + card.id + '|' + (rev ? 'r' : 'u')))
      const pool = QUESTION_STEPS[theme].slice()
      const steps = []
      while (steps.length < 2 && pool.length) {
        const idx = Math.floor(rng() * pool.length)
        steps.push(pool.splice(idx, 1)[0])
      }
      // 牌面提示放在最后，避免「世界牌收尾」这类提示盖过你问的感情/健康问题
      steps.push('牌面提示：' + card.tip)

      let headline
      if (type === 'why') {
        const kw = card.keywords.split(' · ')[0]
        headline = '关于「' + topicLabel + '」：原因更可能在「' + kw + '」这一层——' +
          (toneKey === 'advance'
            ? '牌面与底盘同向，说明方向没大错，卡的是执行节奏。'
            : toneKey === 'try'
              ? '牌面和底盘都还行，缺的是把某一步说清楚。'
              : toneKey === 'wait'
                ? '牌面还没给明确信号，先补信息比硬推更有用。'
                : '牌面和底盘都在压，先停掉最耗你的那件事。')
      } else {
        headline = '关于「' + topicLabel + '」：' + DIRECT[type][toneKey]
      }

      const moon = reading.base.transits.find((t) => t.name === '月亮')
      const sky = moon ? '，月亮今天在' + moon.sign.name + '座' : ''
      const cardLine = '这张牌说：' + card.name + (rev ? '逆位' : '正位') + '——' +
        (rev ? card.reversed : card.upright) + ' 说人话：' + card.detail
      const baseLine = '再看今天的状态：你在【' + meta.label + '】的底盘约 ' + baseScore + ' 分' + sky +
        '；执行力度按这个状态来，别拿意志力硬顶。'
      const check = {
        yesno: '判断标准：今晚之前能不能完成「' + shortStep(steps[1]) + '」；能，就按牌面推进；不能，就先停在准备阶段。',
        how: '今天收尾时数一下完成了几步；只完成第一步，就把明天的时间留给第二步，别跳步。',
        when: '时机判断：等你完成「' + shortStep(steps[1]) + '」之后，就是可以动的节点。',
        why: '把「' + shortStep(steps[1]) + '」做掉，比继续想「为什么」更有用。',
        general: '先做「' + shortStep(steps[1]) + '」，做完再决定下一步。',
      }[type]

      return {
        q, theme, type, topics, lean, tone,
        headline,
        cardLine, baseLine, steps, check,
      }
    }

    /* ------------------------------------------------------------------ */
    /* 存储                                                                */
    /* ------------------------------------------------------------------ */

    function loadState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return { profile: null, draw: null }
        const obj = JSON.parse(raw)
        const profile = obj && obj.profile && typeof obj.profile === 'object' &&
          Number.isInteger(obj.profile.month) && Number.isInteger(obj.profile.day)
          ? {
              year: Number.isInteger(obj.profile.year) ? obj.profile.year : null,
              month: obj.profile.month,
              day: obj.profile.day,
              name: typeof obj.profile.name === 'string' ? obj.profile.name.slice(0, 20) : '',
            }
          : null
        const draw = obj && obj.draw && Number.isInteger(obj.draw.cardId) && obj.draw.date
          ? {
              cardId: obj.draw.cardId,
              reversed: !!obj.draw.reversed,
              date: String(obj.draw.date).slice(0, 10),
              question: typeof obj.draw.question === 'string' ? obj.draw.question.slice(0, 80) : '',
            }
          : null
        return { profile, draw }
      } catch (e) {
        return { profile: null, draw: null }
      }
    }

    function saveState(next) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          profile: next.profile
            ? { year: next.profile.year, month: next.profile.month, day: next.profile.day, name: next.profile.name || '' }
            : null,
          draw: next.draw
            ? {
                cardId: next.draw.cardId,
                reversed: next.draw.reversed,
                date: next.draw.date,
                question: typeof next.draw.question === 'string' ? next.draw.question.slice(0, 80) : '',
              }
            : null,
        }))
      } catch (e) { /* 隐私模式或配额满时静默降级为内存态 */ }
    }

    /* ------------------------------------------------------------------ */
    /* 极简事件 store + hook                                               */
    /* ------------------------------------------------------------------ */

    const store = {
      state: {
        open: false,
        phase: 'idle', // idle | setup | pick | result
        profile: null,
        draw: null,
        firstDraw: null,
        reading: null,
        question: '',
        error: '',
      },
      listeners: new Set(),
      set(patch) {
        this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch)
        this.listeners.forEach((fn) => { try { fn(this.state) } catch (e) { /* noop */ } })
      },
      subscribe(fn) {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
      },
    }

    function useStore() {
      const [, force] = useState(0)
      useEffect(() => {
        return store.subscribe(() => { force((n) => n + 1) })
      }, [])
      return store.state
    }

    let hydrated = false
    function hydrate() {
      if (hydrated) return
      hydrated = true
      const saved = loadState()
      const today = todayString(new Date())
      if (saved.profile) store.set({ profile: saved.profile })
      if (saved.draw && saved.draw.date === today) {
        const card = CARDS.find((c) => c.id === saved.draw.cardId)
        if (card) {
          const base = buildBase(saved.profile, new Date())
          store.set({
            draw: saved.draw,
            firstDraw: saved.draw,
            question: saved.draw.question || '',
            reading: computeReading(base, { card, reversed: saved.draw.reversed }),
          })
        }
      }
    }

    function openPanel() {
      const cur = store.state
      if (cur.phase === 'idle') {
        if (cur.reading) store.set({ open: true, phase: 'result' })
        else store.set({ open: true, phase: cur.profile ? 'pick' : 'setup' })
        return
      }
      store.set({ open: true })
    }

    /* ------------------------------------------------------------------ */
    /* 图标                                                                */
    /* ------------------------------------------------------------------ */

    // 侧栏入口的徽标：塔罗牌 + 星芒，紫金渐变
    function LuckMark(props) {
      const size = (props && props.size) || 26
      return h('span', {
        className: 'dll-mark',
        style: {
          width: size, height: size, borderRadius: Math.round(size * 0.34),
          display: 'grid', placeItems: 'center', flex: '0 0 auto',
          background: 'linear-gradient(150deg, #4c2f80 0%, #2c1b4e 55%, #7a5a2c 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,226,160,0.38), 0 2px 6px rgba(0,0,0,0.35)',
          color: '#f6dda6',
          transition: 'transform .18s ease, box-shadow .18s ease',
        },
        'aria-hidden': true,
      },
        h('svg', {
          viewBox: '0 0 24 24', width: Math.round(size * 0.62), height: Math.round(size * 0.62),
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.15,
          strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          h('path', { d: 'M9.1 3.6h5.8l2.4 3.4-5.3 13.4L6.7 7z' }),
          h('path', {
            d: 'M12 7.1l.9 2.2 2.3.3-1.7 1.6.5 2.3-2-1.2-2 1.2.5-2.3-1.7-1.6 2.3-.3z',
            fill: 'currentColor', opacity: 0.92,
          }),
          h('circle', { cx: 4.4, cy: 5.4, r: 0.75, fill: 'currentColor', stroke: 'none', opacity: 0.8 }),
          h('circle', { cx: 19.6, cy: 15.4, r: 0.55, fill: 'currentColor', stroke: 'none', opacity: 0.7 })))
    }

    /* ------------------------------------------------------------------ */
    /* UI：卡面                                                             */
    /* ------------------------------------------------------------------ */

    function CardArt(props) {
      const { card, reversed, size, showName } = props
      const idx = (card && card.id) || 0
      const hue = 210 + ((idx * 37) % 120)
      const reversedStyle = reversed ? { transform: 'rotate(180deg)' } : null
      return h('div', {
        style: {
          width: size, height: Math.round(size * 1.55), borderRadius: Math.round(size * 0.08),
          background: 'linear-gradient(160deg, hsl(' + hue + ' 38% 13%) 0%, hsl(' + (hue + 26) + ' 34% 22%) 55%, hsl(' + (hue + 60) + ' 30% 14%) 100%)',
          border: '1px solid rgba(214,176,106,0.55)',
          boxShadow: '0 18px 44px -18px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.04)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          padding: Math.round(size * 0.11),
          color: '#e7c987', position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
        },
      },
        h('div', { style: { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: Math.round(size * 0.17), letterSpacing: '0.08em', opacity: 0.9 } }, card ? card.numeral : ''),
        h('div', { style: Object.assign({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }, reversedStyle) },
          h(CardGlyph, { id: idx, size: Math.round(size * 0.52) })),
        h('div', { style: { textAlign: 'center' } },
          showName !== false && h('div', { style: { fontSize: Math.round(size * 0.115), letterSpacing: '0.18em', fontWeight: 600 } }, card ? card.name : ''),
          showName !== false && h('div', { style: { fontSize: Math.round(size * 0.055), letterSpacing: '0.14em', opacity: 0.62, marginTop: 2, textTransform: 'uppercase' } }, card ? card.en : '')),
        h('div', { style: { position: 'absolute', inset: 5, border: '1px solid rgba(214,176,106,0.28)', borderRadius: Math.round(size * 0.06), pointerEvents: 'none' } }))
    }

    function CardGlyph(props) {
      const paths = GLYPHS[props.id] || GLYPHS[0]
      return h('svg', {
        viewBox: '0 0 24 24', width: props.size || 64, height: props.size || 64,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.1,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block' },
      }, paths.map((d, i) => h('path', { key: i, d })))
    }

    function CardBack(props) {
      const size = props.size || 74
      return h('div', {
        style: {
          width: size, height: Math.round(size * 1.55), borderRadius: Math.round(size * 0.09),
          background: 'radial-gradient(circle at 50% 35%, #3b2a68 0%, #221741 55%, #17102e 100%)',
          border: '1px solid rgba(214,176,106,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 26px -14px rgba(0,0,0,0.8)',
          position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
          transition: 'transform .25s ease, box-shadow .25s ease',
        },
      },
        h('div', { style: { position: 'absolute', inset: 4, borderRadius: Math.round(size * 0.06), border: '1px solid rgba(214,176,106,0.22)' } }),
        h('div', { style: { color: '#d8b166', opacity: 0.85 } },
          h('svg', { width: Math.round(size * 0.5), height: Math.round(size * 0.5), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true },
            h('circle', { cx: 12, cy: 12, r: 8.5, opacity: 0.55 }),
            h('path', { d: 'M12 3.5l1.8 6.7 6.7 1.8-6.7 1.8-1.8 6.7-1.8-6.7-6.7-1.8 6.7-1.8z', opacity: 0.9 }),
            h('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }))))
    }

    /* ------------------------------------------------------------------ */
    /* UI：小部件                                                           */
    /* ------------------------------------------------------------------ */

    function SectionTitle(props) {
      return h('div', {
        style: {
          fontSize: 12, letterSpacing: '0.14em', color: 'var(--dsw-alias-label-secondary)',
          textTransform: 'uppercase', margin: '0 0 10px',
        },
      }, props.children)
    }

    // 没提问时不出答案区块（不再显示「心想事成」）
    function ScoreBar(props) {
      const { score, label, icon, hit } = props
      const filled = Math.round(score / 20)
      const color = score >= 80 ? 'var(--dsw-alias-state-success-primary)' : score >= 62 ? 'var(--dsw-alias-brand-primary)' : score >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-error-primary)'
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--dsw-alias-label-primary)' } },
            h('span', { style: { fontSize: 14 }, 'aria-hidden': true }, icon),
            h('span', null, label),
            Math.abs(hit) >= 8 ? h('span', {
              style: { fontSize: 10, padding: '1px 5px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-secondary)' },
            }, hit > 0 ? '牌面加成' : '牌面压一压') : null),
          h('span', { style: { fontVariantNumeric: 'tabular-nums', fontFamily: 'Georgia, serif', fontSize: 17, color } }, String(score))),
        h('div', { style: { display: 'flex', gap: 4 } },
          [0, 1, 2, 3, 4].map((i) => h('div', {
            key: i,
            style: {
              flex: 1, height: 5, borderRadius: 999,
              background: i < filled ? color : 'var(--dsw-alias-border-l1)',
              opacity: i < filled ? 1 : 0.6,
              transition: 'background .3s ease',
            },
          }))))
    }

    function Tag(props) {
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 999, fontSize: 11.5, lineHeight: 1.5,
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-2)',
          color: 'var(--dsw-alias-label-secondary)',
          whiteSpace: 'nowrap',
        },
      }, props.children)
    }

    function ShuffleIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 6h3l10 12h3' }),
        h('path', { d: 'M4 18h3l3.5-4.2' }),
        h('path', { d: 'M17 3l3 3-3 3' }),
        h('path', { d: 'M17 15l3 3-3 3' }))
    }

    function PenIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z' }),
        h('path', { d: 'M13.5 6.5l3 3' }))
    }

    function CalendarIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 3 }),
        h('path', { d: 'M8 3v4M16 3v4M3.5 10.5h17' }))
    }

    // 结果页操作按钮：紫金渐变主按钮 + 淡紫描边次按钮，避免「白色方框」观感
    function ActionButton(props) {
      const primary = props.variant !== 'soft'
      return h('button', {
        type: 'button', onClick: props.onClick, className: 'dll-action',
        style: {
          appearance: 'none', cursor: 'pointer',
          border: primary ? '1px solid rgba(255,224,160,0.25)' : '1px solid rgba(150,120,220,0.32)',
          borderRadius: 13, padding: '10px 15px',
          display: 'inline-flex', alignItems: 'center', gap: 9,
          background: primary
            ? 'linear-gradient(135deg, #6d4bc4 0%, #8a5cae 45%, #a5763a 100%)'
            : 'linear-gradient(135deg, rgba(120,90,200,0.14), rgba(200,160,80,0.10))',
          color: primary ? '#fffdf6' : 'var(--dsw-alias-label-primary)',
          boxShadow: primary ? '0 10px 24px -12px rgba(109,75,196,0.85)' : 'none',
          fontSize: 13.5, fontWeight: 600, letterSpacing: '0.02em', lineHeight: 1.2,
          transition: 'transform .15s ease, box-shadow .15s ease, filter .15s ease',
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.filter = 'brightness(1.06)'
          e.currentTarget.style.boxShadow = primary
            ? '0 14px 28px -12px rgba(109,75,196,0.95)'
            : '0 8px 18px -12px rgba(120,90,200,0.6)'
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.filter = 'none'
          e.currentTarget.style.boxShadow = primary ? '0 10px 24px -12px rgba(109,75,196,0.85)' : 'none'
        },
      },
        h('span', {
          style: {
            width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', flex: '0 0 auto',
            background: primary ? 'rgba(255,255,255,0.18)' : 'rgba(120,90,200,0.20)',
            color: primary ? '#fff' : 'var(--dsw-alias-brand-primary)',
          },
        }, props.icon || null),
        h('span', null, props.children))
    }

    /* ------------------------------------------------------------------ */
    /* UI：生日设置                                                         */
    /* ------------------------------------------------------------------ */

    const MONTH_NAMES = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月']

    function daysInMonth(month, year) {
      if (month === 2) {
        return year && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28
      }
      return [4, 6, 9, 11].indexOf(month) >= 0 ? 30 : 31
    }

    function fieldStyle() {
      return {
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 14, outline: 'none',
      }
    }

    function SetupForm() {
      const existing = store.state.profile
      const nowYear = new Date().getFullYear()
      const [month, setMonth] = useState(existing ? existing.month : 0)
      const [day, setDay] = useState(existing ? existing.day : 0)
      const [year, setYear] = useState(existing && existing.year ? String(existing.year) : '')
      const [name, setName] = useState(existing ? existing.name || '' : '')
      const [err, setErr] = useState('')

      const maxDay = month ? daysInMonth(month, Number(year) || null) : 31
      const effDay = day && day > maxDay ? maxDay : day

      const submit = () => {
        if (!month || !day) { setErr('先把月份和日子选好（太阳星座只看月日）。'); return }
        const y = year ? Number(year) : null
        if (y !== null && (y < 1900 || y > nowYear)) { setErr('出生年份看起来不太对，填 1900 到今年之间。'); return }
        const profile = { year: y, month, day, name: name.trim().slice(0, 20) }
        store.set({ profile, reading: null, draw: null, firstDraw: null, error: '' })
        saveState({ profile, draw: null })
        store.set({ phase: 'pick' })
      }

      const preview = month && day ? signOf(month, day) : null

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h('div', {
          style: {
            padding: '14px 16px', borderRadius: 12,
            background: 'linear-gradient(120deg, rgba(120,90,200,0.14), rgba(200,160,80,0.10))',
            border: '1px solid var(--dsw-alias-border-l1)',
            fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)',
          },
        },
          '今天的运势由两层叠成：一层是用你的生日和今天真实星象（太阳、月亮、金星、火星…的黄经与相位）算出的「基础运势」，它只留在背景里、不直接展示；另一层是你亲手抽到的塔罗牌。两层一起，才给出下面的五维评分与评语。',
        ),
        h('div', null,
          h(SectionTitle, null, '你的生日'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1.2fr', gap: 10 } },
            h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '月份'),
              h('select', {
                value: month || '', onChange: (e) => { setMonth(Number(e.target.value)); setErr('') },
                style: fieldStyle(), 'aria-label': '出生月份',
              }, h('option', { value: '' }, '月份'),
                MONTH_NAMES.map((m, i) => h('option', { key: i, value: i + 1 }, m)))),
            h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '日子'),
              h('select', {
                value: effDay || '', onChange: (e) => { setDay(Number(e.target.value)); setErr('') },
                style: fieldStyle(), 'aria-label': '出生日',
              }, h('option', { value: '' }, '日'),
                Array.from({ length: maxDay }, (_, i) => h('option', { key: i + 1, value: i + 1 }, String(i + 1))))),
            h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '年份（可选）'),
              h('input', {
                type: 'number', inputMode: 'numeric', min: 1900, max: nowYear, placeholder: '如 1996',
                value: year, onChange: (e) => { setYear(e.target.value); setErr('') },
                style: fieldStyle(), 'aria-label': '出生年份（可选）',
              })))),
        h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '称呼（可选，只显示在面板里）'),
          h('input', {
            type: 'text', maxLength: 20, placeholder: '比如：小李',
            value: name, onChange: (e) => setName(e.target.value),
            style: fieldStyle(), 'aria-label': '称呼',
          })),
        preview
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              h(Tag, null, h('span', { style: { fontSize: 15 }, 'aria-hidden': true }, preview.glyph), preview.name),
              h(Tag, null, ELEMENT_CN[preview.element] + ' · ' + preview.mode),
              h(Tag, null, '守护星：' + preview.ruler),
              year ? h(Tag, null, '太阳黄经按真实星历计算') : null)
          : null,
        err ? h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12.5 } }, err) : null,
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
          h(ActionButton, { variant: 'primary', icon: h(CalendarIcon), onClick: submit },
            existing ? '更新生日，重新开始' : '保存生日，去抽牌'),
          h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } }, '只存在这台设备的本地存储，不上传。')),
      )
    }

    /* ------------------------------------------------------------------ */
    /* UI：抽牌                                                             */
    /* ------------------------------------------------------------------ */

    function QuestionField() {
      const [value, setValue] = useState(store.state.question || '')
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '今天想问的事（可留空；写下来抽牌会更专注）'),
        h('input', {
          type: 'text', maxLength: 60,
          placeholder: '比如：今天该不该主动推进那个方案？',
          value,
          onChange: (e) => { setValue(e.target.value); store.set({ question: e.target.value }) },
          style: fieldStyle(), 'aria-label': '今天想问的事',
        }))
    }

    function ShuffleStage() {
      return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '18px 0 6px' } },
        h('div', { style: { position: 'relative', width: 96, height: 150 } },
          [0, 1, 2, 3].map((i) => h('div', {
            key: i,
            style: {
              position: 'absolute', left: 0, top: 0,
              animation: 'dll-shuffle 1.5s ease-in-out infinite',
              animationDelay: (i * 0.12) + 's',
              transform: 'rotate(' + (i * 3 - 4) + 'deg)',
            },
          }, h(CardBack, { size: 74 })))),
        h('div', { style: { fontSize: 13.5, color: 'var(--dsw-alias-label-secondary)' } }, '正在洗牌……把注意力放在你想问的那件事上。'))
    }

    function PickStage() {
      const deck = useMemo(() => {
        const arr = []
        for (let i = 0; i < 22; i++) arr.push(i)
        // 展示顺序固定打乱，避免用户从编号推断牌面
        return shuffleInPlace(arr, rngOf(hash32('fan|' + todayString(new Date()))))
      }, [])

      const onPick = (slotIndex) => {
        const res = drawCard()
        const card = res.pick.card
        const reversed = res.pick.reversed
        const base = buildBase(store.state.profile, new Date())
        const reading = computeReading(base, { card, reversed })
        const q = (store.state.question || '').trim().slice(0, 80)
        const draw = { cardId: card.id, reversed, date: base.dateStr, question: q }
        // 今日第一抽只记一次：再抽只展示当前结果，不覆盖今日第一抽
        let first = store.state.firstDraw && store.state.firstDraw.date === base.dateStr
          ? store.state.firstDraw
          : draw
        // 旧的第一抽没存问题、这次补上了，就把问题补进记录
        if (first && !first.question && q) first = Object.assign({}, first, { question: q })
        store.set({ draw, firstDraw: first, reading, phase: 'result', error: '' })
        saveState({ profile: store.state.profile, draw: first })
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
          h('div', { style: { fontSize: 13.5, color: 'var(--dsw-alias-label-primary)', fontWeight: 600 } }, '22 张大阿尔卡纳已洗好'),
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '默念你的问题，凭直觉点一张')),
        h('div', {
          role: 'group', 'aria-label': '选择一张塔罗牌',
          style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8, padding: '10px 2px 4px' },
        },
          deck.map((_, i) => h('button', {
            key: i,
            type: 'button',
            'aria-label': '第 ' + (i + 1) + ' 张牌',
            onClick: () => onPick(i),
            className: 'dll-pick',
            style: {
              appearance: 'none', background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', borderRadius: 10, lineHeight: 0,
              transition: 'transform .18s ease',
            },
            onMouseEnter: (e) => { e.currentTarget.style.transform = 'translateY(-6px)' },
            onMouseLeave: (e) => { e.currentTarget.style.transform = 'none' },
          }, h(CardBack, { size: 52 })))),
        h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.7 } },
          '正逆位在洗牌时随机确定。抽完一次后可以再洗一次，但今天真正的「一抽」只算第一张。'),
      )
    }

    /* ------------------------------------------------------------------ */
    /* UI：结果                                                             */
    /* ------------------------------------------------------------------ */

    function ResultStage() {
      const snap = useStore()
      const reading = snap.reading
      if (!reading) return null
      const { card, reversed, details, total, totalLevel, strongest, weakest, rel, sign } = reading
      const text = buildReadingText(reading)
      const stars = totalLevel.stars
      const toneColor = totalLevel.tone === 'great' ? 'var(--dsw-alias-state-success-primary)'
        : totalLevel.tone === 'good' ? 'var(--dsw-alias-brand-primary)'
          : totalLevel.tone === 'careful' ? 'var(--dsw-alias-state-warn-primary)'
            : totalLevel.tone === 'low' ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-label-primary)'

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 2px' } },
          h('div', { style: { fontSize: 17, fontWeight: 700, letterSpacing: '0.01em' } },
            (snap.profile && snap.profile.name ? 'Hi，' + snap.profile.name + '，今天好' : 'Hi，今天好')),
          h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } },
            '这是今天为你抽到的一张牌 · ' + baseLine(reading))),
        h('div', {
          style: {
            display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
            padding: '16px 18px', borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(120,90,200,0.13), rgba(200,160,80,0.08))',
            border: '1px solid var(--dsw-alias-border-l1)',
          },
        },
          h('div', { style: { flex: '0 0 auto' } }, h(CardArt, { card, reversed, size: 108 })),
          h('div', { style: { flex: '1 1 220px', minWidth: 190, display: 'flex', flexDirection: 'column', gap: 8 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('span', { style: { fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' } }, card.name),
              h(Tag, null, reversed ? '逆位' : '正位'),
              h(Tag, null, card.numeral + ' · ' + card.en)),
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, card.keywords),
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 } },
              h('span', { style: { fontFamily: 'Georgia, serif', fontSize: 34, lineHeight: 1, color: toneColor } }, String(total)),
              h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, '/ 100'),
              h('span', { style: { fontSize: 12.5, padding: '3px 10px', borderRadius: 999, color: toneColor, border: '1px solid currentColor' } }, totalLevel.label)),
            h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' }, 'aria-label': '综合 ' + stars + ' 星' },
              [1, 2, 3, 4, 5].map((i) => h('span', { key: i, style: { color: i <= stars ? '#d8a13c' : 'var(--dsw-alias-border-l2)', fontSize: 15 } }, '★')),
              h('span', { style: { marginLeft: 6, fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } },
                sign ? sign.glyph + ' ' + sign.name + ' · ' + (reversed ? '逆位解读' : '正位解读') : '')),
            h('div', { style: { fontSize: 13, fontWeight: 600, color: toneColor, letterSpacing: '0.02em' } }, totalLevel.verdict))),

        (function answerBlock() {
          const answer = buildAnswer(reading, snap.question)
          if (!answer) return null
          return h('div', {
            style: {
              padding: '15px 17px', borderRadius: 15,
              border: '1px solid rgba(150,120,220,0.28)',
              background: 'linear-gradient(135deg, rgba(120,90,200,0.10), rgba(200,160,80,0.07))',
              display: 'flex', flexDirection: 'column', gap: 8,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
              h(SectionTitle, null, '就你的问题')),
            h('div', { style: { fontSize: 12.5, fontStyle: 'italic', color: 'var(--dsw-alias-label-secondary)' } }, '「' + answer.q + '」'),
            h('div', { style: { fontSize: 15.5, fontWeight: 700, color: answer.tone.color, marginTop: 2, lineHeight: 1.65 } }, answer.headline),
            h('p', { style: { margin: '2px 0 0', fontSize: 13.5, lineHeight: 1.8 } }, answer.cardLine),
            h('p', { style: { margin: 0, fontSize: 12.5, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary)' } }, answer.baseLine),
            h('div', { style: { fontSize: 11.5, letterSpacing: '0.12em', color: 'var(--dsw-alias-label-secondary)', marginTop: 2 } }, '接下来怎么做'),
            h('ol', { style: { margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.85 } },
              answer.steps.map((s, i) => h('li', { key: i }, s))),
            h('div', { style: { fontSize: 12.5, lineHeight: 1.7, paddingTop: 6, borderTop: '1px dashed var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-secondary)' } }, answer.check))
        })(),

        h('div', null,
          h(SectionTitle, null, '今日五维'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 24px' } },
            DIMS.map((k) => h(ScoreBar, {
              key: k, score: details[k].score, label: details[k].meta.label,
              icon: details[k].meta.icon, hit: details[k].cardHit,
            })))),

        h('div', null,
          h(SectionTitle, null, reversed ? '这张牌（逆位）在说什么' : '这张牌（正位）在说什么'),
          h('p', { style: { margin: '0 0 8px', fontSize: 14, lineHeight: 1.85, color: 'var(--dsw-alias-label-primary)' } }, text.meaning),
          h('p', { style: { margin: 0, fontSize: 13, lineHeight: 1.85, color: 'var(--dsw-alias-label-secondary)' } }, text.detail),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
            h(Tag, null, ELEMENT_CN[card.element] + ' · ' + card.planet),
            h(Tag, null, '主落点：' + DIM_META[card.main].label),
            h(Tag, null, rel.label))),

        h('div', {
          style: {
            padding: '16px 18px', borderRadius: 14,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1)',
            display: 'flex', flexDirection: 'column', gap: 10,
          },
        },
          h(SectionTitle, null, '今日评语'),
          h('p', { style: { margin: 0, fontSize: 14, lineHeight: 1.85 } }, text.opening + ' ' + text.dimLine),
          text.skyNote ? h('p', { style: { margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary)' } }, text.skyNote) : null,
          h('p', { style: { margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary)' } }, text.elementNote),
          h('div', {
            style: { marginTop: 4, padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--dsw-alias-border-l2)' },
          },
            h('div', { style: { fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, '今天可以这样用这张牌'),
            h('div', { style: { fontSize: 13.5, lineHeight: 1.75 } }, text.tip)),
          h('ul', { style: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9 } },
            text.advice.map((a, i) => h('li', { key: i }, a)))),

        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
          h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
            h(ActionButton, {
              variant: 'primary', icon: h(ShuffleIcon),
              onClick: () => store.set({ phase: 'pick', draw: null }),
            }, '重新抽卡'),
            h(ActionButton, {
              variant: 'soft', icon: h(PenIcon),
              onClick: () => store.set({ phase: 'setup' }),
            }, '修改生日')),
          h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
            '今日第一抽已记录；再抽仅供娱乐，不覆盖今天的记录。')),
      )
    }

    function baseLine(reading) {
      const b = reading.base
      const moon = b.transits.find((t) => t.name === '月亮')
      const parts = []
      if (b.sign) parts.push('太阳 ' + b.sign.name)
      parts.push(b.phase.emoji + ' ' + b.phase.phase)
      if (moon) parts.push('月亮在' + moon.sign.name)
      if (b.transits.some((t) => t.retro && t.name === '水星')) parts.push('水星逆行')
      return parts.join(' · ')
    }

    /* ------------------------------------------------------------------ */
    /* UI：面板                                                             */
    /* ------------------------------------------------------------------ */

    function Modal() {
      const snap = useStore()

      useEffect(() => {
        if (!snap.open) return
        const onKey = (e) => {
          if (e.key !== 'Escape') return
          const panel = document.getElementById('dsh-daily-luck-panel')
          const active = document.activeElement
          if (panel && (panel.contains(active) || active === document.body || !active)) {
            e.preventDefault()
            e.stopPropagation()
            store.set({ open: false })
          }
        }
        document.addEventListener('keydown', onKey, true)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
          document.removeEventListener('keydown', onKey, true)
          document.body.style.overflow = prevOverflow
        }
      }, [snap.open])

      if (!snap.open) return null

      const title = snap.phase === 'setup' ? '先写入你的生日'
        : snap.phase === 'result' ? '今日运势已生成'
          : snap.phase === 'pick' ? '抽一张牌'
            : '准备中'

      return h('div', {
        style: {
          position: 'fixed', inset: 0, zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 16px',
          background: 'rgba(6, 5, 12, 0.62)',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'auto',
          animation: 'dll-fade .18s ease',
        },
        onMouseDown: (e) => { if (e.target === e.currentTarget) store.set({ open: false }) },
        role: 'dialog', 'aria-modal': 'true', 'aria-label': '今日好运来临',
      },
        h('div', {
          id: 'dsh-daily-luck-panel',
          tabIndex: -1,
          style: {
            width: 'min(760px, 100%)', maxHeight: 'min(88vh, 900px)',
            display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            background: 'var(--dsw-alias-bg-overlay)',
            border: '1px solid var(--dsw-alias-border-l2)',
            boxShadow: '0 40px 120px -30px rgba(0,0,0,0.8)',
            animation: 'dll-rise .22s ease',
          },
        },
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 20px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
              position: 'sticky', top: 0, background: 'var(--dsw-alias-bg-overlay)', zIndex: 2,
            },
          },
            h(LuckMark, { size: 34 }),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 15.5, fontWeight: 700, letterSpacing: '0.02em' } }, '今日好运来临'),
              h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' } }, title + ' · ' + formatToday())),
            h('button', {
              type: 'button', 'aria-label': '关闭', onClick: () => store.set({ open: false }),
              style: {
                marginLeft: 'auto', appearance: 'none', border: '1px solid var(--dsw-alias-border-l1)',
                background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
                borderRadius: 10, width: 30, height: 30, cursor: 'pointer', fontSize: 15, lineHeight: 1,
              },
            }, '✕')),
          h('div', { style: { overflowY: 'auto', padding: '18px 20px 22px' } },
            (function renderPhase() {
              if (snap.phase === 'setup') return h(SetupForm)
              if (snap.phase === 'pick') {
                return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } }, h(QuestionField), h(PickStage))
              }
              return h(ResultStage)
            })()),
          h('div', {
            style: {
              padding: '9px 20px', borderTop: '1px solid var(--dsw-alias-border-l1)',
              fontSize: 10.5, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)',
              background: 'var(--dsw-alias-bg-layer-1)',
            },
          }, '内容依据：太阳星座与出生太阳黄经、当日太阳/月亮/水星/金星/火星/木星/土星黄经与主要相位（低精度星历，纯本地计算）、22 张大阿尔卡纳通行正逆位牌义；五维评分为上述元素的简化判定与可视化，属娱乐向自我观照，不构成医疗、投资、法律或婚姻建议。'),
        ))
    }

    function formatToday() {
      const d = new Date()
      return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WEEKDAY_CN[d.getDay()]
    }

    /* ------------------------------------------------------------------ */
    /* UI：侧栏入口                                                         */
    /* ------------------------------------------------------------------ */

    function FooterButton(props) {
      const snap = useStore()
      const reading = snap.reading
      const wide = !props || props.wide !== false
      return h('button', {
        type: 'button',
        title: '今日好运来临',
        'aria-label': '今日好运来临',
        className: 'dll-entry',
        onClick: () => { hydrate(); openPanel() },
        style: {
          appearance: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10,
          background: 'transparent', border: '1px solid transparent',
          color: 'var(--dsw-alias-label-secondary)', fontSize: 13, textAlign: 'left',
          maxWidth: '100%', boxSizing: 'border-box',
          transition: 'background .15s ease',
        },
        onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-2)' },
        onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent' },
      },
        h(LuckMark, { size: 26 }),
        wide ? h('span', {
          style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        }, '今日好运') : null,
        wide && reading ? h('span', {
          style: { flex: '0 0 auto', fontFamily: 'Georgia, serif', fontSize: 12, color: 'var(--dsw-alias-brand-primary)' },
        }, String(reading.total)) : null)
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                */
    /* ------------------------------------------------------------------ */

    const CSS = [
      '@keyframes dll-fade { from { opacity: 0 } to { opacity: 1 } }',
      '@keyframes dll-rise { from { opacity: 0; transform: translateY(10px) scale(0.99) } to { opacity: 1; transform: none } }',
      '@keyframes dll-shuffle {',
      '  0% { transform: translateY(0) rotate(-5deg) }',
      '  35% { transform: translateY(-14px) rotate(7deg) }',
      '  70% { transform: translateY(4px) rotate(-3deg) }',
      '  100% { transform: translateY(0) rotate(-5deg) }',
      '}',
      '.dll-entry:hover .dll-mark { transform: rotate(-5deg) scale(1.06); box-shadow: inset 0 0 0 1px rgba(255,226,160,0.6), 0 3px 10px rgba(120,90,200,0.45) }',
      '.dll-pick:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px }',
      '.dll-action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px }',
    ].join('\n')

    function injectStyle() {
      if (typeof document === 'undefined') return () => {}
      if (document.getElementById('dsh-daily-luck-style')) return () => {}
      const el = document.createElement('style')
      el.id = 'dsh-daily-luck-style'
      el.textContent = CSS
      document.head.appendChild(el)
      return () => { if (el.parentNode) el.parentNode.removeChild(el) }
    }

    /* ------------------------------------------------------------------ */
    /* 插件入口                                                             */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      ctx.effect(() => { hydrate(); return () => {} })
      ctx.effect(() => injectStyle())

      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({ name: 'shell.overlay', id: 'daily-luck-modal', order: 40 }, Modal)
      })

      ctx.slots.inject('sidebar.footer.action', function* () {
        yield ctx.slots.register({ name: 'sidebar.footer.action', id: 'daily-luck-entry', order: 20, label: '今日好运' }, FooterButton)
      })
    }

    return {
      apply,
      inject: ['slots'],
      // 便于离线自测：不参与运行时渲染。
      __internals: {
        SIGNS, CARDS, signOf, signOfLon, buildBase, computeReading,
        drawCard, buildReadingText, todayString, hash32, rngOf,
        earthSunLon, moonLon, planetLon, aspectOf, isRetrograde, moonPhaseOf,
        buildAnswer, themeOfQuestion, questionTopics, questionType,
        __store: store, __hydrate: hydrate,
        __ui: { SetupForm, PickStage, ResultStage, Modal, FooterButton, LuckMark },
      },
    }
  },
})
