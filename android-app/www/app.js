/* ==========================================================================
   小满 · 两个人的小小宇宙
   Local-first couple space: moments, recipes, anniversaries.
   Optional end-to-end sync through the couple's own Nutstore WebDAV.
   ========================================================================== */

'use strict';

(() => {
  const STORAGE_KEY = 'xiaoman.couple.v1';
  const SYNC_KEY = 'xiaoman.sync.v1';
  const UPDATE_KEY = 'xiaoman.update.v1';
  const APP_VERSION_NAME = '3.1.0';
  const APP_VERSION_CODE = 30100;
  const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
  const UPDATE_REPO_PLACEHOLDER = 'YOUR_GITHUB_USERNAME/xiaoman';
  const SCHEMA_VERSION = 3;
  const DEFAULT_SYNC_FOLDER = 'xiaoman';
  const SYNC_POLL_MS = 120000;
  const THEMES = ['coral', 'sage', 'sky', 'taro'];
  const THEME_NAMES = { coral: '珊瑚橘', sage: '鼠尾草', sky: '雾霾蓝', taro: '香芋紫' };
  const DIFFICULTIES = ['简单', '适中', '挑战'];
  const DEFAULT_NAMES = { me: '阿满', partner: '小糖' };

  const MOODS = {
    happy: { label: '开心', emoji: '😊', color: '#e8b75e' },
    love: { label: '超爱你', emoji: '🥰', color: '#e2948a' },
    miss: { label: '想你', emoji: '🥺', color: '#a99bd0' },
    tired: { label: '有点累', emoji: '😮‍💨', color: '#91b3ad' },
    calm: { label: '平静', emoji: '🌿', color: '#93ad83' },
  };

  const RECIPE_EMOJIS = ['🍳', '🍅', '🍜', '🍤', '🍡', '🍗', '🍄', '🥟', '🍚', '🥗', '🍰', '🍲'];
  const WISH_EMOJIS = ['🍲', '🍜', '🍣', '🍕', '🍰', '🧋', '🍢', '🥟', '🍦', '🍓', '🍗', '🥘'];
  const ANNIV_EMOJIS = ['🌷', '🎂', '🧡', '🏠', '🧳', '🎄', '🎓', '🐱', '🌙', '🍾'];
  const PROMPTS = [
    '一起散步 20 分钟，不带手机。',
    '给对方拍一张今天的照片。',
    '做一道两个人都没吃过的菜。',
    '说一件今天想感谢对方的小事。',
    '翻翻旧照片，挑一张最喜欢的。',
    '一起听一张完整的专辑。',
    '买一样对方爱吃的水果回家。',
    '把下次想去的地方写下来。',
    '今天谁先到家，谁就负责放一首歌。',
    '给对方留一张便利贴。',
    '一起把冰箱里剩下的食材变成一顿饭。',
    '认真夸对方三句话，不许重复。',
  ];

  const SUBTITLES = [
    '今天也和喜欢的人，好好过一天。',
    '把普通的日子，过成值得收藏的故事。',
    '好好吃饭，好好相爱。',
    '你们的小宇宙，今天也在发光。',
    '不赶时间，慢慢一起走。',
  ];

  const ART_NOTES = ['两颗小豆子', '今天也要牵手', '一起慢慢变圆', '爱心营业中', '小小宇宙'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let state;
  let sync;
  let update;
  let syncing = false;
  let autoSyncTimer = null;
  let availableUpdate = null;
  let downloadedApkPath = '';
  let updateDownloading = false;
  let currentVersionName = APP_VERSION_NAME;
  let currentVersionCode = APP_VERSION_CODE;
  const ui = {
    momentFilter: 'all',
    recipeTag: '全部',
    recipeQuery: '',
    dinnerId: null,
    heroAnimated: false,
    space: 'shared',
  };
  let lastFocused = null;
  let confirmCallback = null;
  let toastTimer = null;

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function isoOr(value, fallback = '') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function isNativeApp() {
    try {
      return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (error) {
      return false;
    }
  }

  function basicAuth(username, password) {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return `Basic ${window.btoa(binary)}`;
  }

  function formatSyncTime(value) {
    if (!value) return '还没有同步过';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '还没有同步过';
    const today = new Date();
    const sameDay = date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return sameDay ? `今天 ${hm}` : `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function icon(name, className = '') {
    return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function safePhoto(value) {
    return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value) ? value : '';
  }

  function localDateStr(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseLocalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return new Date(NaN);
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function isValidDateStr(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function todayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function dayDiff(from, to) {
    const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((end - start) / 86400000);
  }

  function dateInYear(year, month, day) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  function weekdayCN(date) {
    return `星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
  }

  function fmtDateCN(value) {
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return '未设置';
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function fmtDateShort(value) {
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function fmtDateDot(value) {
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  }

  function fmtMonthDay(value) {
    return fmtDateShort(value);
  }

  function relDayLabel(value) {
    const date = parseLocalDate(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = dayDiff(date, todayStart());
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    if (diff > 2 && diff < 7) return `${diff} 天前`;
    return fmtDateShort(value);
  }

  function fmtMomentTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const diff = dayDiff(new Date(date.getFullYear(), date.getMonth(), date.getDate()), todayStart());
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (diff === 0) return `今天 ${hm}`;
    if (diff === 1) return `昨天 ${hm}`;
    if (diff > 1 && diff < 7) return `${diff} 天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
  }

  function toLocalInput(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function isoDaysAgo(days, hour = 20, minute = 0) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return '还没睡呀';
    if (hour < 10) return '早上好';
    if (hour < 13) return '中午好';
    if (hour < 18) return '下午好';
    if (hour < 23) return '晚上好';
    return '夜深了';
  }

  function dayOfYear(date = new Date()) {
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((now - start) / 86400000);
  }

  function dailyItem(items) {
    return items[dayOfYear() % items.length];
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function initialOf(name) {
    const chars = Array.from(String(name || '').trim());
    return chars.length ? chars[chars.length - 1] : '♡';
  }

  function nameOf(author) {
    return author === 'partner' ? state.names.partner : state.names.me;
  }

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */

  function seedState() {
    const seeded = {
      version: SCHEMA_VERSION,
      onboarded: false,
      names: { ...DEFAULT_NAMES },
      togetherDate: '2023-05-20',
      theme: 'coral',
      moments: [
        {
          id: uid(),
          author: 'me',
          text: '下班路上看到橘子味的晚霞，第一反应是想拍给你看。',
          mood: 'miss',
          date: isoDaysAgo(1, 18, 42),
          photo: '',
        },
        {
          id: uid(),
          author: 'partner',
          text: '今天第一次做番茄牛腩，炖得软软的。等你来打分，不许只说好吃。',
          mood: 'happy',
          date: isoDaysAgo(2, 19, 6),
          photo: '',
        },
        {
          id: uid(),
          author: 'me',
          text: '一起把阳台的小灯串挂好了。晚上开灯的时候，像一小片星星落在我们家里。',
          mood: 'love',
          date: isoDaysAgo(5, 21, 18),
          photo: '',
        },
        {
          id: uid(),
          author: 'partner',
          kind: 'wish',
          text: '突然好想吃火锅，要那种咕嘟咕嘟的。',
          mood: 'love',
          date: isoDaysAgo(0, 9, 30),
          photo: '',
          foodEmoji: '🍲',
          wishStatus: 'wanted',
        },
      ],
      recipes: [
        {
          id: uid(),
          name: '番茄牛腩',
          emoji: '🍅',
          desc: '炖到软烂的牛腩，裹着酸甜的番茄汁，拌饭能吃两碗。',
          time: 90,
          difficulty: '适中',
          tags: ['下饭', '炖菜'],
          ingredients: [
            { amount: '500g', name: '牛腩' },
            { amount: '3个', name: '番茄' },
            { amount: '半个', name: '洋葱' },
            { amount: '2勺', name: '番茄膏' },
            { amount: '适量', name: '盐、黑胡椒和香叶' },
          ],
          steps: [
            '牛腩切块，冷水下锅焯水，撇去浮沫后捞出。',
            '番茄划十字，用热水烫一下去皮，两个切丁，一个切大块。',
            '锅里放一点油，炒香洋葱，再加入番茄丁和番茄膏，炒到出沙。',
            '放入牛腩，加热水没过食材，小火炖 60 分钟。',
            '加入番茄块再炖 15 分钟，最后用盐和黑胡椒调味。',
          ],
          favorite: true,
          createdAt: isoDaysAgo(40, 12, 0),
          cookedAt: isoDaysAgo(2, 19, 0),
        },
        {
          id: uid(),
          name: '蒜香黄油虾',
          emoji: '🍤',
          desc: '蒜末和黄油在锅里冒泡的时候，整个厨房都变温柔了。',
          time: 25,
          difficulty: '简单',
          tags: ['快手', '下饭'],
          ingredients: [
            { amount: '300g', name: '鲜虾' },
            { amount: '5瓣', name: '大蒜' },
            { amount: '20g', name: '黄油' },
            { amount: '1勺', name: '料酒' },
            { amount: '适量', name: '盐和黑胡椒' },
          ],
          steps: [
            '鲜虾去虾线，用料酒和一点盐腌 10 分钟。',
            '蒜切末，小火融化黄油，放入蒜末炒出香味。',
            '转中火放入虾，两面煎到变色。',
            '撒黑胡椒和盐，翻匀出锅。',
          ],
          favorite: false,
          createdAt: isoDaysAgo(28, 18, 0),
          cookedAt: '',
        },
        {
          id: uid(),
          name: '酒酿小圆子',
          emoji: '🍡',
          desc: '冷冷的晚上，一碗甜甜暖暖的小圆子。',
          time: 20,
          difficulty: '简单',
          tags: ['甜点', '暖胃'],
          ingredients: [
            { amount: '200g', name: '小圆子' },
            { amount: '3勺', name: '酒酿' },
            { amount: '1个', name: '鸡蛋' },
            { amount: '适量', name: '冰糖' },
            { amount: '1小勺', name: '水淀粉' },
          ],
          steps: [
            '水烧开，放入小圆子煮到浮起来。',
            '加入酒酿和冰糖，小火煮 2 分钟。',
            '淋入打散的蛋液，轻轻搅出蛋花。',
            '用水淀粉勾一个薄芡，煮开即可。',
          ],
          favorite: true,
          createdAt: isoDaysAgo(21, 21, 0),
          cookedAt: isoDaysAgo(7, 21, 30),
        },
        {
          id: uid(),
          name: '葱油拌面',
          emoji: '🍜',
          desc: '十五分钟的安慰，葱油香到隔壁都想来敲门。',
          time: 15,
          difficulty: '简单',
          tags: ['快手', '主食'],
          ingredients: [
            { amount: '2把', name: '细面' },
            { amount: '6根', name: '小葱' },
            { amount: '3勺', name: '生抽' },
            { amount: '1勺', name: '老抽' },
            { amount: '1小勺', name: '白糖' },
          ],
          steps: [
            '小葱切段，冷油下锅，小火慢慢炸到葱段焦黄。',
            '加入生抽、老抽和白糖，小火煮到冒小泡，关火。',
            '面条煮熟，捞出沥干。',
            '把葱油浇在面上，拌匀，撒一点葱花。',
          ],
          favorite: false,
          createdAt: isoDaysAgo(18, 8, 0),
          cookedAt: '',
        },
        {
          id: uid(),
          name: '可乐鸡翅',
          emoji: '🍗',
          desc: '甜甜咸咸，新手也很难翻车的一道菜。',
          time: 35,
          difficulty: '简单',
          tags: ['下饭', '新手'],
          ingredients: [
            { amount: '8个', name: '鸡翅中' },
            { amount: '1罐', name: '可乐' },
            { amount: '2勺', name: '生抽' },
            { amount: '1勺', name: '料酒' },
            { amount: '3片', name: '姜' },
          ],
          steps: [
            '鸡翅两面划刀，冷水下锅焯水，捞出擦干。',
            '锅里少油，把鸡翅煎到两面金黄。',
            '加入姜片、生抽、料酒和可乐，没过鸡翅。',
            '中小火煮 15 分钟，最后大火收汁。',
          ],
          favorite: false,
          createdAt: isoDaysAgo(13, 19, 0),
          cookedAt: '',
        },
        {
          id: uid(),
          name: '菌菇豆腐汤',
          emoji: '🍄',
          desc: '清清淡淡的一锅，适合不想吃太重的晚上。',
          time: 20,
          difficulty: '简单',
          tags: ['汤羹', '清淡'],
          ingredients: [
            { amount: '1盒', name: '嫩豆腐' },
            { amount: '1把', name: '混合菌菇' },
            { amount: '2片', name: '姜' },
            { amount: '适量', name: '盐和白胡椒' },
            { amount: '1小把', name: '葱花' },
          ],
          steps: [
            '菌菇洗净撕小朵，豆腐切块。',
            '锅里加水和姜片烧开，放入菌菇煮 5 分钟。',
            '加入豆腐，再煮 5 分钟。',
            '用盐和白胡椒调味，撒葱花出锅。',
          ],
          favorite: false,
          createdAt: isoDaysAgo(9, 18, 0),
          cookedAt: '',
        },
      ],
      anniversaries: [
        {
          id: uid(),
          title: '恋爱纪念日',
          date: '2023-05-20',
          recurring: true,
          icon: '🌷',
          note: '从这一天开始，有了我们。',
        },
        {
          id: uid(),
          title: '小糖的生日',
          date: '1999-09-18',
          recurring: true,
          icon: '🎂',
          note: '提前一个月开始想礼物。',
        },
        {
          id: uid(),
          title: '第一次一起旅行',
          date: '2024-04-06',
          recurring: false,
          icon: '🧳',
          note: '去了有海的城市。',
        },
      ],
      personal: {
        me: { moments: [], tombstones: {}, updatedAt: '1970-01-01T00:00:00.000Z' },
        partner: { moments: [], tombstones: {}, updatedAt: '1970-01-01T00:00:00.000Z' },
      },
    };
    const now = isoNow();
    seeded.moments.forEach((item, index) => {
      item.id = `seed-moment-${index + 1}`;
      item.updatedAt = isoOr(item.date, now);
    });
    seeded.recipes.forEach((item, index) => {
      item.id = `seed-recipe-${index + 1}`;
      item.updatedAt = isoOr(item.createdAt, now);
    });
    seeded.anniversaries.forEach((item, index) => {
      item.id = `seed-anniv-${index + 1}`;
      item.updatedAt = isoOr(`${item.date}T00:00:00`, now);
    });
    seeded.profileUpdatedAt = '1970-01-01T00:00:00.000Z';
    seeded.themeUpdatedAt = '1970-01-01T00:00:00.000Z';
    seeded.updatedAt = now;
    seeded.tombstones = { moments: {}, recipes: {}, anniversaries: {} };
    return seeded;
  }

  function normalizeMoment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = String(raw.text || '').slice(0, 800);
    const photo = safePhoto(raw.photo);
    if (!text && !photo) return null;
    const date = new Date(raw.date);
    return {
      id: String(raw.id || uid()),
      author: raw.author === 'partner' ? 'partner' : 'me',
      kind: ['moment', 'wish', 'note', 'gift'].includes(raw.kind) ? raw.kind : 'moment',
      text,
      mood: MOODS[raw.mood] ? raw.mood : 'happy',
      date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      photo,
      foodEmoji: String(raw.foodEmoji || raw.emoji || '🍲').slice(0, 8),
      wishStatus: raw.wishStatus === 'planned' ? 'planned' : 'wanted',
      updatedAt: isoOr(raw.updatedAt, isoOr(raw.date, isoNow())),
    };
  }

  function normalizeRecipe(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 40);
    if (!name) return null;
    const ingredients = Array.isArray(raw.ingredients)
      ? raw.ingredients
        .map((item) => ({
          amount: String(item && item.amount || '').trim().slice(0, 24),
          name: String(item && item.name || '').trim().slice(0, 40),
        }))
        .filter((item) => item.name)
      : [];
    const steps = Array.isArray(raw.steps)
      ? raw.steps.map((step) => String(step || '').trim().slice(0, 300)).filter(Boolean)
      : [];
    const tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map((tag) => String(tag || '').trim().slice(0, 12)).filter(Boolean))].slice(0, 8)
      : [];
    const createdAt = new Date(raw.createdAt);
    const cookedAt = new Date(raw.cookedAt);
    return {
      id: String(raw.id || uid()),
      name,
      emoji: String(raw.emoji || '🍳').slice(0, 8),
      desc: String(raw.desc || '').slice(0, 140),
      time: Math.min(999, Math.max(1, Number(raw.time) || 30)),
      difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : '简单',
      tags,
      ingredients,
      steps,
      favorite: Boolean(raw.favorite),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      cookedAt: Number.isNaN(cookedAt.getTime()) ? '' : cookedAt.toISOString(),
      updatedAt: isoOr(raw.updatedAt, Number.isNaN(createdAt.getTime()) ? isoNow() : createdAt.toISOString()),
    };
  }

  function normalizeAnniversary(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim().slice(0, 40);
    if (!title || !isValidDateStr(raw.date)) return null;
    return {
      id: String(raw.id || uid()),
      title,
      date: String(raw.date),
      recurring: Boolean(raw.recurring),
      icon: String(raw.icon || '🌷').slice(0, 8),
      note: String(raw.note || '').slice(0, 100),
      updatedAt: isoOr(raw.updatedAt, isoOr(`${raw.date}T00:00:00`, isoNow())),
    };
  }

  function normalizeTombstones(raw) {
    const result = { moments: {}, recipes: {}, anniversaries: {} };
    if (!raw || typeof raw !== 'object') return result;
    for (const type of Object.keys(result)) {
      const source = raw[type];
      if (!source || typeof source !== 'object') continue;
      for (const [id, timestamp] of Object.entries(source)) {
        const date = new Date(timestamp);
        if (id && !Number.isNaN(date.getTime())) result[type][id] = date.toISOString();
      }
    }
    return result;
  }

  function emptyPersonal() {
    return { moments: [], tombstones: {}, updatedAt: '1970-01-01T00:00:00.000Z' };
  }

  function normalizePersonal(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const moments = Array.isArray(src.moments)
      ? src.moments.map((item) => {
        const moment = normalizeMoment(item);
        if (moment) moment.kind = moment.kind === 'gift' ? 'gift' : 'note';
        return moment;
      }).filter(Boolean)
      : [];
    return {
      moments,
      tombstones: normalizeTombstones({ moments: src.tombstones }).moments,
      updatedAt: isoOr(src.updatedAt, '1970-01-01T00:00:00.000Z'),
    };
  }

  function normalizeState(raw) {
    const base = seedState();
    const src = raw && typeof raw === 'object' ? raw : {};
    const names = src.names && typeof src.names === 'object' ? src.names : {};
    return {
      version: SCHEMA_VERSION,
      onboarded: Boolean(src.onboarded),
      names: {
        me: String(names.me || base.names.me).trim().slice(0, 12) || base.names.me,
        partner: String(names.partner || base.names.partner).trim().slice(0, 12) || base.names.partner,
      },
      togetherDate: isValidDateStr(src.togetherDate) ? String(src.togetherDate) : base.togetherDate,
      theme: THEMES.includes(src.theme) ? src.theme : 'coral',
      profileUpdatedAt: isoOr(src.profileUpdatedAt, '1970-01-01T00:00:00.000Z'),
      themeUpdatedAt: isoOr(src.themeUpdatedAt, '1970-01-01T00:00:00.000Z'),
      moments: Array.isArray(src.moments) ? src.moments.map(normalizeMoment).filter(Boolean) : [],
      recipes: Array.isArray(src.recipes) ? src.recipes.map(normalizeRecipe).filter(Boolean) : [],
      anniversaries: Array.isArray(src.anniversaries)
        ? src.anniversaries.map(normalizeAnniversary).filter(Boolean)
        : [],
      personal: {
        me: normalizePersonal(src.personal && src.personal.me),
        partner: normalizePersonal(src.personal && src.personal.partner),
      },
      tombstones: normalizeTombstones(src.tombstones),
      updatedAt: isoOr(src.updatedAt, isoNow()),
    };
  }

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return seedState();
    }
    if (!raw) return seedState();
    try {
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      return seedState();
    }
  }

  function saveState(options = {}) {
    try {
      state.updatedAt = isoNow();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (!options.skipSync) scheduleAutoSync();
      return true;
    } catch (error) {
      toast('存储空间不足，先把照片换小一点，或导出备份吧');
      return false;
    }
  }

  /* ------------------------------------------------------------------------
     Sync (Nutstore / WebDAV)
     ------------------------------------------------------------------------ */

  function defaultSync() {
    return {
      enabled: false,
      baseUrl: 'https://dav.jianguoyun.com/dav',
      username: '',
      password: '',
      folder: DEFAULT_SYNC_FOLDER,
      identity: '',
      auto: true,
      deviceId: uid(),
      lastSyncAt: '',
      lastError: '',
    };
  }

  function loadSync() {
    const base = defaultSync();
    try {
      const raw = window.localStorage.getItem(SYNC_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      let folder = String(saved.folder || '').trim().replace(/^\/+|\/+$/g, '');
      if (!folder) {
        const oldFilename = String(saved.filename || '').replace(/^\/+/, '');
        folder = oldFilename.includes('/')
          ? oldFilename.split('/').slice(0, -1).join('/')
          : DEFAULT_SYNC_FOLDER;
      }
      return {
        ...base,
        ...saved,
        baseUrl: String(saved.baseUrl || base.baseUrl).trim().replace(/\/+$/, ''),
        folder: folder || DEFAULT_SYNC_FOLDER,
        identity: saved.identity === 'partner' ? 'partner' : (saved.identity === 'me' ? 'me' : ''),
        deviceId: String(saved.deviceId || base.deviceId),
      };
    } catch (error) {
      return base;
    }
  }

  function saveSync() {
    try {
      window.localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    } catch (error) {
      toast('同步设置保存失败，检查浏览器存储空间');
    }
  }

  function defaultUpdate() {
    return {
      repo: '',
      mirror: '',
      auto: true,
      lastCheckAt: '',
      lastError: '',
    };
  }

  function loadUpdate() {
    const base = defaultUpdate();
    try {
      const raw = window.localStorage.getItem(UPDATE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      return {
        ...base,
        ...saved,
        repo: String(saved.repo || '').trim(),
        mirror: String(saved.mirror || '').trim(),
        auto: saved.auto !== false,
      };
    } catch (error) {
      return base;
    }
  }

  function saveUpdate() {
    try {
      window.localStorage.setItem(UPDATE_KEY, JSON.stringify(update));
    } catch (error) {
      // Update settings are small; ignore storage errors.
    }
  }

  function updateRepo() {
    return update && update.repo ? update.repo.trim() : '';
  }

  function githubLatestJsonUrl() {
    const repo = updateRepo();
    return repo ? `https://github.com/${repo}/releases/latest/download/latest.json` : '';
  }

  function githubReleasePageUrl() {
    const repo = updateRepo();
    return repo ? `https://github.com/${repo}/releases` : 'https://github.com';
  }

  function mirrorUrl(url) {
    if (!url || !update || !update.mirror) return url;
    const prefix = update.mirror.replace(/\/+$/, '');
    if (url.startsWith(prefix + '/')) return url;
    return `${prefix}/${url}`;
  }

  function isSyncConfigured() {
    return Boolean(sync && sync.enabled && sync.baseUrl && sync.username && sync.password);
  }

  function remoteFolderUrl(config = sync) {
    if (!config) return '';
    const base = String(config.baseUrl || '').trim().replace(/\/+$/, '');
    const folder = String(config.folder || DEFAULT_SYNC_FOLDER).trim().replace(/^\/+|\/+$/g, '');
    if (!base || !folder) return '';
    return `${base}/${folder.split('/').map(encodeURIComponent).join('/')}/`;
  }

  function remoteFileUrl(space = 'shared', config = sync) {
    const folderUrl = remoteFolderUrl(config);
    if (!folderUrl) return '';
    const filename = space === 'personal'
      ? `${config.identity === 'partner' ? 'her' : 'me'}.json`
      : 'shared.json';
    return `${folderUrl}${filename}`;
  }

  function legacyFileUrl(config = sync) {
    const folderUrl = remoteFolderUrl(config);
    return folderUrl ? `${folderUrl}sync.json` : '';
  }

  function nativeHttpPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    } catch (error) {
      return null;
    }
  }

  async function davRequest(method, url, body, extraHeaders = {}, config = sync) {
    if (!config) throw new Error('同步设置还没准备好');
    const headers = {
      Authorization: basicAuth(config.username, config.password),
      ...extraHeaders,
    };
    if (body != null) headers['Content-Type'] = headers['Content-Type'] || 'application/json';

    if (isNativeApp()) {
      const plugin = nativeHttpPlugin();
      if (!plugin) throw new Error('原生网络模块不可用，请重新安装 App');
      const result = await plugin.request({
        url,
        method,
        headers,
        data: body == null ? undefined : body,
        responseType: 'text',
        connectTimeout: 15000,
        readTimeout: 30000,
      });
      const responseHeaders = {};
      Object.entries(result.headers || {}).forEach(([key, value]) => {
        responseHeaders[String(key).toLowerCase()] = String(value);
      });
      return {
        status: Number(result.status) || 0,
        headers: responseHeaders,
        etag: responseHeaders.etag || responseHeaders['etag'] || '',
        text: typeof result.data === 'string'
          ? result.data
          : (result.data == null ? '' : JSON.stringify(result.data)),
      };
    }

    let response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (error) {
      throw new Error('网络请求失败，检查网络连接');
    }
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[String(key).toLowerCase()] = value;
    });
    return {
      status: response.status,
      headers: responseHeaders,
      etag: responseHeaders.etag || '',
      text: await response.text(),
    };
  }

  async function testSyncConnection(config = sync) {
    if (!config || !config.username || !config.password) {
      throw new Error('先填写坚果云账号和应用密码');
    }
    const url = remoteFileUrl('shared', config);
    if (!url) throw new Error('WebDAV 地址或文件夹不完整');

    const result = await davRequest('GET', url, undefined, {}, config);
    if (result.status === 401) throw new Error('账号或应用密码不对');
    if (result.status === 403) throw new Error('没有权限，检查账号和应用密码');
    if (![200, 404].includes(result.status)) {
      throw new Error(`连接失败（HTTP ${result.status}）`);
    }

    const probeBase = remoteFolderUrl(config);
    const probeUrl = `${probeBase}xiaoman-write-test-${Date.now()}.json`;
    const probe = await davRequest('PUT', probeUrl, JSON.stringify({ probe: true }), {
      'Content-Type': 'application/json',
    }, config);
    if (![200, 201, 204].includes(probe.status)) {
      if (probe.status === 401) throw new Error('账号或应用密码不对');
      if (probe.status === 403) throw new Error('没有写入权限，检查账号和应用密码');
      if (probe.status === 404) {
        throw new Error('目标文件夹不存在。先在坚果云里新建文件夹 xiaoman，再把云端文件夹填成 xiaoman');
      }
      throw new Error(`连接能通，但写入测试失败（HTTP ${probe.status}）`);
    }
    await davRequest('DELETE', probeUrl, undefined, {}, config).catch(() => {});
    return { ok: true, exists: result.status === 200 };
  }

  function recordTime(item) {
    const timestamp = new Date(item && item.updatedAt).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function mergeTombstones(localTombstones, remoteTombstones) {
    const merged = normalizeTombstones(localTombstones);
    const remote = normalizeTombstones(remoteTombstones);
    for (const type of Object.keys(merged)) {
      for (const [id, timestamp] of Object.entries(remote[type])) {
        if (!merged[type][id] || new Date(timestamp) > new Date(merged[type][id])) {
          merged[type][id] = timestamp;
        }
      }
    }
    return merged;
  }

  function pruneTombstones(tombstones) {
    const cutoff = Date.now() - 365 * 86400000;
    for (const type of Object.keys(tombstones)) {
      for (const [id, timestamp] of Object.entries(tombstones[type])) {
        if (new Date(timestamp).getTime() < cutoff) delete tombstones[type][id];
      }
    }
    return tombstones;
  }

  function mergeStates(localRaw, remoteRaw) {
    const local = normalizeState(localRaw);
    const remote = normalizeState(remoteRaw);
    const merged = normalizeState(local);
    const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
    merged.tombstones = tombstones;

    for (const type of ['moments', 'recipes', 'anniversaries']) {
      const map = new Map();
      for (const item of [...remote[type], ...local[type]]) {
        const previous = map.get(item.id);
        if (!previous || recordTime(item) >= recordTime(previous)) {
          map.set(item.id, item);
        }
      }
      merged[type] = Array.from(map.values()).filter((item) => {
        const deletedAt = tombstones[type][item.id];
        return !deletedAt || new Date(deletedAt).getTime() < recordTime(item);
      });
    }

    if (new Date(remote.profileUpdatedAt) > new Date(local.profileUpdatedAt)) {
      merged.names = remote.names;
      merged.togetherDate = remote.togetherDate;
      merged.profileUpdatedAt = remote.profileUpdatedAt;
    }
    if (new Date(remote.themeUpdatedAt) > new Date(local.themeUpdatedAt)) {
      merged.theme = remote.theme;
      merged.themeUpdatedAt = remote.themeUpdatedAt;
    }

    merged.onboarded = local.onboarded || remote.onboarded;
    merged.tombstones = pruneTombstones(tombstones);
    merged.version = SCHEMA_VERSION;
    merged.updatedAt = isoNow();
    return merged;
  }

  function mergePersonal(localRaw, remoteRaw) {
    const local = normalizePersonal(localRaw);
    const remote = normalizePersonal(remoteRaw);
    const tombstones = mergeTombstones(
      { moments: local.tombstones, recipes: {}, anniversaries: {} },
      { moments: remote.tombstones, recipes: {}, anniversaries: {} },
    ).moments;

    const map = new Map();
    for (const item of [...remote.moments, ...local.moments]) {
      const previous = map.get(item.id);
      if (!previous || recordTime(item) >= recordTime(previous)) map.set(item.id, item);
    }
    const moments = Array.from(map.values()).filter((item) => {
      const deletedAt = tombstones[item.id];
      return !deletedAt || new Date(deletedAt).getTime() < recordTime(item);
    });
    return {
      moments,
      tombstones: pruneTombstones({ moments: tombstones, recipes: {}, anniversaries: {} }).moments,
      updatedAt: isoNow(),
    };
  }

  function sharedPayload() {
    return JSON.stringify({
      app: 'xiaoman',
      version: SCHEMA_VERSION,
      kind: 'shared',
      exportedAt: isoNow(),
      data: {
        version: SCHEMA_VERSION,
        onboarded: state.onboarded,
        names: state.names,
        togetherDate: state.togetherDate,
        theme: state.theme,
        profileUpdatedAt: state.profileUpdatedAt,
        themeUpdatedAt: state.themeUpdatedAt,
        moments: state.moments,
        recipes: state.recipes,
        anniversaries: state.anniversaries,
        tombstones: state.tombstones,
        updatedAt: state.updatedAt,
      },
    }, null, 2);
  }

  function personalPayload(identity) {
    return JSON.stringify({
      app: 'xiaoman',
      version: SCHEMA_VERSION,
      kind: 'personal',
      owner: identity,
      exportedAt: isoNow(),
      data: state.personal[identity] || emptyPersonal(),
    }, null, 2);
  }

  function parseRemotePayload(text) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error('云端文件不是有效的小满数据，先不要覆盖它');
    }
    const data = payload && payload.data ? payload.data : payload;
    if (!data || typeof data !== 'object') throw new Error('云端文件格式不对，先不要覆盖它');
    return data;
  }

  function refreshAfterSync() {
    if (getRoute() === 'settings') {
      updateSidebar();
      applyTheme();
      return;
    }
    render();
  }

  async function syncSharedFile() {
    const url = remoteFileUrl('shared');
    const download = await davRequest('GET', url);
    let remoteState = null;
    let etag = '';

    if (download.status === 200) {
      remoteState = parseRemotePayload(download.text);
      etag = download.etag || '';
    } else if (download.status === 404) {
      const legacyUrl = legacyFileUrl();
      if (legacyUrl) {
        const legacy = await davRequest('GET', legacyUrl);
        if (legacy.status === 200) {
          remoteState = parseRemotePayload(legacy.text);
          etag = '';
        }
      }
    } else {
      if (download.status === 401) throw new Error('账号或应用密码不对');
      if (download.status === 403) throw new Error('没有权限，检查账号和应用密码');
      throw new Error(`读取共享空间失败（HTTP ${download.status}）`);
    }

    state = remoteState ? mergeStates(state, remoteState) : normalizeState(state);
    saveState({ skipSync: true });
    applyTheme();

    const putHeaders = { 'Content-Type': 'application/json' };
    if (etag) putHeaders['If-Match'] = etag;
    let upload = await davRequest('PUT', url, sharedPayload(), putHeaders);

    if (upload.status === 412) {
      const retry = await davRequest('GET', url);
      if (retry.status === 200) {
        state = mergeStates(state, parseRemotePayload(retry.text));
        saveState({ skipSync: true });
        applyTheme();
        const retryHeaders = { 'Content-Type': 'application/json' };
        if (retry.etag) retryHeaders['If-Match'] = retry.etag;
        upload = await davRequest('PUT', url, sharedPayload(), retryHeaders);
      }
    }

    if (![200, 201, 204].includes(upload.status)) {
      if (upload.status === 404) {
        throw new Error('共享空间上传失败：先在坚果云新建 xiaoman 文件夹，再把云端文件夹填成 xiaoman');
      }
      throw new Error(`共享空间上传失败（HTTP ${upload.status}）`);
    }
  }

  async function syncPersonalFile(identity) {
    if (!identity) return;
    const url = remoteFileUrl('personal');
    const download = await davRequest('GET', url);
    let remotePersonal = null;
    let etag = '';

    if (download.status === 200) {
      remotePersonal = parseRemotePayload(download.text);
      etag = download.etag || '';
    } else if (download.status !== 404) {
      if (download.status === 401) throw new Error('账号或应用密码不对');
      if (download.status === 403) throw new Error('没有权限，检查账号和应用密码');
      throw new Error(`读取我的小抽屉失败（HTTP ${download.status}）`);
    }

    state.personal[identity] = remotePersonal
      ? mergePersonal(state.personal[identity], remotePersonal)
      : normalizePersonal(state.personal[identity]);
    saveState({ skipSync: true });

    const putHeaders = { 'Content-Type': 'application/json' };
    if (etag) putHeaders['If-Match'] = etag;
    let upload = await davRequest('PUT', url, personalPayload(identity), putHeaders);

    if (upload.status === 412) {
      const retry = await davRequest('GET', url);
      if (retry.status === 200) {
        state.personal[identity] = mergePersonal(state.personal[identity], parseRemotePayload(retry.text));
        saveState({ skipSync: true });
        const retryHeaders = { 'Content-Type': 'application/json' };
        if (retry.etag) retryHeaders['If-Match'] = retry.etag;
        upload = await davRequest('PUT', url, personalPayload(identity), retryHeaders);
      }
    }

    if (![200, 201, 204].includes(upload.status)) {
      if (upload.status === 404) {
        throw new Error('我的小抽屉上传失败：先在坚果云新建 xiaoman 文件夹');
      }
      throw new Error(`我的小抽屉上传失败（HTTP ${upload.status}）`);
    }
  }

  async function syncNow(options = {}) {
    if (syncing) return;
    if (!isSyncConfigured()) {
      if (!options.silent) openSyncSettings();
      return;
    }

    syncing = true;
    sync.lastError = '';
    updateSyncUI();

    try {
      await syncSharedFile();
      if (sync.identity) await syncPersonalFile(sync.identity);
      refreshAfterSync();

      sync.lastSyncAt = isoNow();
      sync.lastError = '';
      saveSync();
      updateSyncUI();
      if (!options.silent) {
        toast(sync.identity ? '同步完成，共享空间和小抽屉都合在一起了' : '共享空间已同步；选择身份后才会同步小抽屉');
      }
    } catch (error) {
      sync.lastError = error && error.message ? error.message : '同步失败';
      saveSync();
      updateSyncUI();
      if (!options.silent) toast(sync.lastError);
      console.warn('sync failed', error);
    } finally {
      syncing = false;
      updateSyncUI();
    }
  }

  function scheduleAutoSync() {
    if (!sync || !sync.enabled || !sync.auto || syncing) return;
    if (!isSyncConfigured()) return;
    window.clearTimeout(autoSyncTimer);
    autoSyncTimer = window.setTimeout(() => syncNow({ silent: true }), 3500);
  }

  function syncStatusText() {
    if (syncing) return '正在同步…';
    if (!isSyncConfigured()) return sync && sync.enabled ? '同步设置不完整' : '同步未开启';
    if (sync.lastError) return `同步失败：${sync.lastError}`;
    if (!sync.identity) return '共享空间已开启；选择身份后同步小抽屉';
    if (sync.lastSyncAt) return `上次同步：${formatSyncTime(sync.lastSyncAt)}`;
    return '已设置，等待第一次同步';
  }

  function updateSyncUI() {
    const configured = isSyncConfigured();
    const stateName = syncing ? 'syncing' : (sync && sync.lastError ? 'error' : (configured && sync.lastSyncAt ? 'ok' : ''));
    $$('.sync-dot').forEach((dot) => {
      dot.classList.remove('ok', 'error', 'syncing');
      if (stateName) dot.classList.add(stateName);
    });
    $$('.sync-mini, .topbar-sync').forEach((button) => {
      button.classList.toggle('is-syncing', syncing);
    });
    const label = $('#sync-label');
    if (label) {
      if (syncing) label.textContent = '同步中…';
      else if (sync && sync.lastError) label.textContent = '同步异常';
      else if (configured && sync.lastSyncAt) label.textContent = '已同步';
      else if (configured) label.textContent = '等待同步';
      else label.textContent = '同步未开启';
    }
    const status = $('#sync-status');
    if (status) {
      status.textContent = syncStatusText();
      status.classList.toggle('is-error', Boolean(sync && sync.lastError));
    }
    const statusBox = $('#sync-status-box');
    if (statusBox) statusBox.classList.toggle('is-error', Boolean(sync && sync.lastError));
    const modalStatus = $('#sync-modal-status');
    if (modalStatus) {
      modalStatus.textContent = syncStatusText();
      modalStatus.classList.toggle('is-error', Boolean(sync && sync.lastError));
    }
  }

  function openIdentityModal() {
    const active = sync && sync.identity;
    openModal({
      eyebrow: 'WHO ARE YOU',
      title: '你是哪一位？',
      subtitle: '身份只影响「我的小抽屉」；共享空间两边完全一样。',
      body: `<div class="identity-choice-grid">
        ${['me', 'partner'].map((identity) => `<button class="identity-choice ${active === identity ? 'active' : ''}" type="button" data-action="choose-identity" data-identity="${identity}">
          ${avatarFor(identity)}
          <span class="identity-choice-copy"><strong>我是 ${esc(nameOf(identity))}</strong><small>${identity === 'me' ? '我的小抽屉' : '她的小抽屉'}只在这个身份下出现</small></span>
          ${active === identity ? icon('check') : icon('chevron')}
        </button>`).join('')}
      </div>
      <p class="sync-note">换手机时重新选一次，自己的小抽屉会从云端恢复。选错可以随时在设置里切换。</p>`,
    });
  }

  function identityBanner() {
    if (sync && sync.identity) return '';
    return `<div class="identity-banner">
      ${icon('users')}
      <p>先告诉小满，你是哪一位？这样「我的小抽屉」才不会和 TA 的混在一起。</p>
      <div class="identity-picks">
        <button type="button" data-action="choose-identity" data-identity="me">我是 ${esc(state.names.me)}</button>
        <button type="button" data-action="choose-identity" data-identity="partner">我是 ${esc(state.names.partner)}</button>
      </div>
    </div>`;
  }

  async function chooseIdentity(identity) {
    if (!['me', 'partner'].includes(identity)) return;
    sync.identity = identity;
    saveSync();
    closeModal();
    updateSyncUI();
    render();
    toast(`好，你是 ${nameOf(identity)}；小抽屉只会在你这边出现`);
    if (isSyncConfigured()) await syncNow({ silent: true });
  }

  function syncModalBody() {
    if (!isSyncConfigured()) {
      return `<div class="sync-summary">
        <div class="sync-orb">${icon('cloud')}</div>
        <h3>让两台手机连在一起</h3>
        <p>用你们自己的坚果云做中转。设置一次，之后每次打开小满都会自动合一次数据。</p>
        <div class="sync-status-line" id="sync-modal-status">${esc(syncStatusText())}</div>
      </div>
      <div class="sync-modal-actions">
        <button class="btn btn-primary" type="button" data-action="open-sync-settings">去设置同步</button>
      </div>
      <p class="sync-note">需要坚果云账号和一个「应用密码」。设置里写了步骤。</p>`;
    }
    return `<div class="sync-summary">
      <div class="sync-orb">${icon('cloud-check')}</div>
      <h3>${syncing ? '正在把数据合在一起' : '数据在你们自己的云里'}</h3>
      <p>${esc(sync.folder)} 文件夹 · 共享空间和各自的小抽屉分开同步。</p>
      <div class="sync-status-line ${sync.lastError ? 'is-error' : ''}" id="sync-modal-status">${esc(syncStatusText())}</div>
    </div>
    <div class="sync-modal-actions">
      <button class="btn btn-primary" type="button" data-action="sync-now" ${syncing ? 'disabled' : ''}>${icon('refresh')} 立即同步</button>
      <button class="btn btn-ghost" type="button" data-action="open-sync-settings">同步设置</button>
    </div>
    <p class="sync-note">共享空间是 ${esc(sync.folder)}/shared.json，小抽屉是 ${esc(sync.folder)}/me.json 或 her.json。</p>`;
  }

  function openSyncModal() {
    openModal({
      eyebrow: 'TWO PHONES',
      title: '两台手机同步',
      subtitle: '通过你们自己的坚果云，把两边的小日子合在一起。',
      body: syncModalBody(),
    });
    updateSyncUI();
  }

  function openSyncSettings() {
    closeModal();
    if (getRoute() !== 'settings') {
      window.location.hash = 'settings';
    }
    window.setTimeout(() => {
      const panel = $('#sync-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  }

  function syncSettingsPanelHTML() {
    const config = sync || defaultSync();
    const native = isNativeApp();
    return `<section class="settings-panel full sync-panel" id="sync-panel">
      <div class="sync-head">
        <div class="sync-orb">${icon('cloud')}</div>
        <div>
          <h2>两台手机同步</h2>
          <p>用你们自己的坚果云 WebDAV 同步，不经过第三方服务器。</p>
        </div>
      </div>
      <p class="sync-form-help"><strong>坚果云怎么设置：</strong>登录坚果云网页版 → 设置 → 安全 → 添加应用 → 生成一个应用密码。这里填<strong>应用密码</strong>，不是登录密码。两台手机填同一份。</p>
      <div class="identity-card" style="margin-bottom:15px">
        <span class="avatar ${sync && sync.identity ? sync.identity : 'me'}">${esc(sync && sync.identity ? initialOf(nameOf(sync.identity)) : '?')}</span>
        <div class="identity-card-copy">
          <strong>${sync && sync.identity ? `${esc(nameOf(sync.identity))} · 这是我的身份` : '还没选择身份'}</strong>
          <small>身份只影响「我的小抽屉」；共享空间两边一样</small>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="open-identity">${sync && sync.identity ? '切换' : '选择'}</button>
      </div>
      <form id="sync-form">
        <div class="form-grid">
          <div class="field span-2">
            <label for="sync-base">WebDAV 地址</label>
            <input class="input" id="sync-base" name="baseUrl" value="${esc(config.baseUrl)}" placeholder="https://dav.jianguoyun.com/dav" autocomplete="off" required>
          </div>
          <div class="field">
            <label for="sync-user">坚果云账号</label>
            <input class="input" id="sync-user" name="username" value="${esc(config.username)}" placeholder="登录邮箱" autocomplete="username" required>
          </div>
          <div class="field">
            <label for="sync-pass">应用密码</label>
            <input class="input" id="sync-pass" name="password" type="password" placeholder="${config.password ? '已保存，留空表示不修改' : '坚果云应用密码'}" autocomplete="current-password">
          </div>
          <div class="field span-2">
            <label for="sync-folder">云端文件夹 <span class="field-hint">先在坚果云根目录建好，例如 xiaoman</span></label>
            <input class="input" id="sync-folder" name="folder" value="${esc(config.folder)}" placeholder="${DEFAULT_SYNC_FOLDER}" autocomplete="off" required>
          </div>
        </div>
        <label class="check-row">
          <input type="checkbox" id="sync-auto" name="auto" ${config.auto ? 'checked' : ''}>
          <span>自动同步（打开应用、修改后、每 2 分钟）</span>
        </label>
        <div class="sync-actions">
          <button class="btn btn-ghost" type="button" data-action="test-sync">${icon('refresh')} 测试连接</button>
          <button class="btn btn-primary" type="submit">保存并同步</button>
          ${isSyncConfigured() ? `<button class="btn btn-ghost" type="button" data-action="sync-now">${icon('refresh')} 立即同步</button>` : ''}
        </div>
      </form>
      <div class="sync-status-box ${sync && sync.lastError ? 'is-error' : ''}" id="sync-status-box">
        <span class="sync-dot"></span>
        <div><strong>${native ? '安卓 App · 原生网络' : '网页版 · 受浏览器限制'}</strong><span id="sync-status">${esc(syncStatusText())}</span></div>
      </div>
      <p class="sync-note">云端文件夹里会自动放 shared.json、me.json、her.json，不要手动改它们。</p>
      <p class="sync-note">${native
        ? '安卓 App 直接连坚果云，不经过任何第三方服务器。应用密码只保存在本机。'
        : '网页版会被坚果云的浏览器跨域策略拦住，建议使用安卓 App 版本同步。'}</p>
    </section>`;
  }

  function readSyncForm() {
    const form = $('#sync-form');
    if (!form) throw new Error('找不到同步设置表单');
    const baseUrl = String(form.querySelector('#sync-base').value || '').trim().replace(/\/+$/, '');
    const username = String(form.querySelector('#sync-user').value || '').trim();
    const passwordInput = String(form.querySelector('#sync-pass').value || '');
    const folder = String(form.querySelector('#sync-folder').value || '').trim().replace(/^\/+|\/+$/g, '');
    const auto = Boolean(form.querySelector('#sync-auto').checked);
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error('WebDAV 地址要以 https:// 开头');
    if (!username) throw new Error('先填坚果云账号');
    if (!passwordInput && !(sync && sync.password)) throw new Error('先填坚果云应用密码');
    if (!folder) throw new Error('云端文件夹不能为空，例如 xiaoman');
    if (folder.includes('..') || folder.includes('\\')) {
      throw new Error('云端文件夹路径不对，应该像 xiaoman 这样');
    }
    return {
      baseUrl,
      username,
      password: passwordInput || sync.password,
      folder,
      auto,
    };
  }

  async function testSyncFromForm() {
    let config;
    try {
      config = { ...(sync || defaultSync()), ...readSyncForm(), enabled: true };
    } catch (error) {
      toast(error.message);
      return;
    }
    toast('正在测试连接…');
    try {
      const result = await testSyncConnection(config);
      toast(result.exists ? '连接成功，共享空间已经在云上' : '连接成功，第一次同步会创建共享空间文件');
    } catch (error) {
      toast(error.message || '连接失败');
    }
  }

  async function saveSyncForm(form) {
    let config;
    try {
      config = readSyncForm();
    } catch (error) {
      toast(error.message);
      return;
    }
    sync = {
      ...(sync || defaultSync()),
      ...config,
      enabled: true,
      lastError: '',
    };
    saveSync();
    render();
    updateSyncUI();
    toast('同步设置保存好了，开始第一次同步');
    await syncNow();
  }

  /* ------------------------------------------------------------------------
     App updates (GitHub Releases)
     ------------------------------------------------------------------------ */

  function nativeUpdaterPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdater;
    } catch (error) {
      return null;
    }
  }

  function browserPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    } catch (error) {
      return null;
    }
  }

  async function httpGetText(url) {
    if (isNativeApp()) {
      const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      if (!plugin) throw new Error('原生网络模块不可用');
      const result = await plugin.request({
        url,
        method: 'GET',
        headers: { 'User-Agent': 'XiaomanUpdater/1.0', Accept: 'application/json' },
        responseType: 'text',
        connectTimeout: 15000,
        readTimeout: 20000,
      });
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`HTTP ${result.status}`);
      }
      return typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('请求超时');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function getCurrentVersion() {
    const plugin = nativeUpdaterPlugin();
    if (plugin && typeof plugin.getVersion === 'function') {
      try {
        const info = await plugin.getVersion();
        return {
          code: Number(info.versionCode) || APP_VERSION_CODE,
          name: String(info.versionName || APP_VERSION_NAME),
        };
      } catch (error) {
        // fall through to build-time constants
      }
    }
    return { code: APP_VERSION_CODE, name: APP_VERSION_NAME };
  }

  async function refreshCurrentVersion() {
    const current = await getCurrentVersion();
    currentVersionName = current.name;
    currentVersionCode = current.code;
    const footer = $('#app-version-label');
    if (footer) footer.textContent = `v${currentVersionName}`;
    const settingsLabel = $('#update-current-version');
    if (settingsLabel) settingsLabel.textContent = `v${currentVersionName}`;
  }

  function normalizeRepo(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
  }

  function updateStatusText() {
    if (!update || !update.repo) return '还没有配置 GitHub 仓库';
    if (update.lastError) return `上次检查失败：${update.lastError}`;
    if (update.lastCheckAt) return `上次检查：${formatSyncTime(update.lastCheckAt)}`;
    return '还没有检查过';
  }

  async function fetchUpdateMetadata() {
    const primary = githubLatestJsonUrl();
    if (!primary) throw new Error('还没有填 GitHub 仓库');
    const urls = update.mirror ? [mirrorUrl(primary), primary] : [primary];
    let lastError = null;
    for (const url of urls) {
      try {
        const text = await httpGetText(url);
        const data = JSON.parse(text);
        if (!data || !Number(data.versionCode) || !data.apkUrl) {
          throw new Error('latest.json 格式不对');
        }
        return {
          ...data,
          versionCode: Number(data.versionCode),
          versionName: String(data.versionName || ''),
          apkUrl: String(data.apkUrl),
          sha256: String(data.sha256 || ''),
          notes: String(data.notes || ''),
          size: Number(data.size) || 0,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('检查更新失败');
  }

  async function checkForUpdates(options = {}) {
    const silent = Boolean(options.silent);
    if (!updateRepo()) {
      if (!silent) toast('先在设置里填 GitHub 仓库，例如 yourname/xiaoman');
      return;
    }
    update.lastError = '';
    try {
      const latest = await fetchUpdateMetadata();
      const current = await getCurrentVersion();
      update.lastCheckAt = isoNow();
      saveUpdate();
      updateUpdateUI();
      if (latest.versionCode > current.code) {
        availableUpdate = latest;
        openUpdateModal(latest);
      } else if (!silent) {
        toast(`已经是最新版本 · v${current.name}`);
      }
    } catch (error) {
      update.lastError = error && error.message ? error.message : '检查更新失败';
      saveUpdate();
      updateUpdateUI();
      if (!silent) toast(`检查更新失败：${update.lastError}`);
    }
  }

  function updateModalBody(latest) {
    const sizeText = latest.size > 0 ? `${(latest.size / 1024 / 1024).toFixed(1)} MB` : '';
    return `<div class="sync-summary">
      <div class="sync-orb">${icon('download')}</div>
      <h3>v${esc(latest.versionName || latest.versionCode)}</h3>
      <p>${latest.notes ? '这次更新带来了一些新东西。' : '一个小版本更新。'}</p>
    </div>
    ${latest.notes ? `<div class="update-notes">${esc(latest.notes)}</div>` : ''}
    <div class="update-meta">${sizeText ? `${esc(sizeText)} · ` : ''}下载后会校验 SHA-256，再打开系统安装器</div>
    <div class="update-progress hidden" id="update-progress">
      <div class="update-progress-bar"><span id="update-progress-bar"></span></div>
      <span class="update-progress-text" id="update-progress-text">准备下载…</span>
    </div>
    <div class="sync-modal-actions">
      <button class="btn btn-primary" type="button" data-action="download-update">${nativeUpdaterPlugin() ? '下载并安装' : '打开下载页'}</button>
      <button class="btn btn-ghost" type="button" data-action="close-modal">稍后</button>
    </div>
    <p class="sync-note">下载完成后，Android 会弹出一次系统安装确认；这是普通 App 无法跳过的。</p>`;
  }

  function openUpdateModal(latest) {
    openModal({
      eyebrow: 'NEW VERSION',
      title: `发现新版本 v${latest.versionName || latest.versionCode}`,
      subtitle: '数据会保留，安装完成后直接继续用。',
      body: updateModalBody(latest),
    });
  }

  function setUpdateProgress(data) {
    const progress = Number(data && data.progress);
    const box = $('#update-progress');
    const bar = $('#update-progress-bar');
    const text = $('#update-progress-text');
    if (!box || !bar || !text) return;
    box.classList.remove('hidden');
    if (Number.isFinite(progress) && progress >= 0) {
      bar.style.width = `${Math.min(100, progress)}%`;
      text.textContent = `正在下载 ${Math.min(100, progress)}%`;
    } else {
      bar.style.width = '35%';
      text.textContent = '正在下载…';
    }
  }

  function showDownloadedState() {
    const body = $('#modal-body');
    if (!body) return;
    body.innerHTML = `<div class="sync-summary">
      <div class="sync-orb">${icon('check')}</div>
      <h3>下载完成</h3>
      <p>点下面按钮，系统会弹出安装确认。</p>
    </div>
    <div class="sync-modal-actions">
      <button class="btn btn-primary" type="button" data-action="install-downloaded">立即安装</button>
      <button class="btn btn-ghost" type="button" data-action="close-modal">稍后</button>
    </div>
    <p class="sync-note">如果跳到了「安装未知应用」设置，允许后回来再点一次「立即安装」。</p>`;
  }

  async function downloadUpdate() {
    if (!availableUpdate || updateDownloading) return;
    const latest = availableUpdate;
    const plugin = nativeUpdaterPlugin();
    if (!plugin) {
      openExternal(update.mirror ? mirrorUrl(latest.apkUrl) : latest.apkUrl);
      toast('请在浏览器里下载 APK，再手动安装');
      return;
    }
    updateDownloading = true;
    const progressBox = $('#update-progress');
    if (progressBox) progressBox.classList.remove('hidden');
    let listener = null;
    try {
      listener = await plugin.addListener('downloadProgress', setUpdateProgress);
      const urls = update.mirror ? [mirrorUrl(latest.apkUrl), latest.apkUrl] : [latest.apkUrl];
      let result = null;
      let lastError = null;
      for (const url of urls) {
        try {
          result = await plugin.download({
            url,
            fileName: `xiaoman-${latest.versionName || latest.versionCode}.apk`,
            sha256: latest.sha256 || '',
          });
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!result) throw lastError || new Error('下载失败');
      downloadedApkPath = result.path;
      updateDownloading = false;
      showDownloadedState();
      await installDownloaded();
    } catch (error) {
      updateDownloading = false;
      toast(error && error.message ? error.message : '下载失败，请重试');
    } finally {
      if (listener && typeof listener.remove === 'function') listener.remove();
    }
  }

  async function installDownloaded() {
    if (!downloadedApkPath) return;
    const plugin = nativeUpdaterPlugin();
    if (!plugin) return;
    try {
      await plugin.install({ path: downloadedApkPath });
    } catch (error) {
      toast(error && error.message ? error.message : '无法打开系统安装器');
    }
  }

  function openExternal(url) {
    const plugin = browserPlugin();
    if (plugin && typeof plugin.open === 'function') {
      plugin.open({ url });
      return;
    }
    window.open(url, '_blank');
  }

  function openReleasePage() {
    if (!updateRepo()) {
      toast('先在设置里填 GitHub 仓库');
      return;
    }
    openExternal(githubReleasePageUrl());
  }

  function updateSettingsPanelHTML() {
    const config = update || defaultUpdate();
    return `<section class="settings-panel full" id="update-panel">
      <div class="sync-head">
        <div class="sync-orb">${icon('download')}</div>
        <div>
          <h3>软件更新</h3>
          <p>当前版本 <span id="update-current-version">v${currentVersionName}</span> · 通过 GitHub Releases 检查更新</p>
        </div>
      </div>
      <form id="update-form">
        <div class="form-grid">
          <div class="field">
            <label for="update-repo">GitHub 仓库 <span class="field-hint">owner/repo</span></label>
            <input class="input" id="update-repo" name="repo" value="${esc(config.repo)}" placeholder="${UPDATE_REPO_PLACEHOLDER}" autocomplete="off">
          </div>
          <div class="field">
            <label for="update-mirror">备用下载前缀 <span class="field-hint">可选，大陆网络用</span></label>
            <input class="input" id="update-mirror" name="mirror" value="${esc(config.mirror)}" placeholder="https://gh-proxy.com/" autocomplete="off">
          </div>
        </div>
        <label class="check-row">
          <input type="checkbox" id="update-auto" ${config.auto ? 'checked' : ''}>
          <span>每天自动检查一次更新</span>
        </label>
        <div class="sync-actions">
          <button class="btn btn-ghost" type="button" data-action="check-update">${icon('refresh')} 检查更新</button>
          <button class="btn btn-ghost" type="button" data-action="open-release-page">打开 GitHub 发布页</button>
          <button class="btn btn-primary" type="submit">保存更新设置</button>
        </div>
      </form>
      <div class="sync-status-box ${config.lastError ? 'is-error' : ''}" id="update-status-box">
        <span class="sync-dot"></span>
        <div><strong>更新检查</strong><span id="update-status">${esc(updateStatusText())}</span></div>
      </div>
      <p class="sync-note">GitHub 在中国大陆可能较慢或连不上。可以填一个可信的 GitHub 代理作为备用前缀；APK 会校验 SHA-256 和安卓签名。</p>
    </section>`;
  }

  function readUpdateForm() {
    const form = $('#update-form');
    if (!form) throw new Error('找不到更新设置');
    const repo = normalizeRepo(form.querySelector('#update-repo').value);
    const mirror = String(form.querySelector('#update-mirror').value || '').trim().replace(/\/+$/, '');
    if (!repo) throw new Error('先填 GitHub 仓库，例如 yourname/xiaoman');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GitHub 仓库格式应该像 yourname/xiaoman');
    if (mirror && !/^https:\/\//i.test(mirror) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(mirror)) {
      throw new Error('备用下载前缀要以 https:// 开头');
    }
    return { repo, mirror, auto: Boolean(form.querySelector('#update-auto').checked) };
  }

  function saveUpdateForm(form, options = {}) {
    let config;
    try {
      config = readUpdateForm();
    } catch (error) {
      toast(error.message);
      return false;
    }
    update = { ...(update || defaultUpdate()), ...config, lastError: '' };
    saveUpdate();
    if (!options.silent) {
      render();
      toast('更新设置保存好了');
    }
    return true;
  }

  function updateUpdateUI() {
    const status = $('#update-status');
    if (status) {
      status.textContent = updateStatusText();
      const box = $('#update-status-box');
      if (box) box.classList.toggle('is-error', Boolean(update && update.lastError));
    }
  }

  /* ------------------------------------------------------------------------
     Date / anniversary calculations
     ------------------------------------------------------------------------ */

  function daysTogether() {
    const start = parseLocalDate(state.togetherDate);
    if (Number.isNaN(start.getTime())) return { days: 0, future: false };
    const diff = dayDiff(start, todayStart());
    return diff >= 0
      ? { days: diff + 1, future: false }
      : { days: Math.abs(diff), future: true };
  }

  function nextAnniversary(anniversary) {
    const original = parseLocalDate(anniversary.date);
    const today = todayStart();
    if (Number.isNaN(original.getTime())) {
      return { next: today, days: 0, isToday: false, past: true };
    }

    if (anniversary.recurring) {
      let next = dateInYear(today.getFullYear(), original.getMonth(), original.getDate());
      if (dayDiff(today, next) < 0) {
        next = dateInYear(today.getFullYear() + 1, original.getMonth(), original.getDate());
      }
      const days = dayDiff(today, next);
      return { next, days, isToday: days === 0, past: false };
    }

    const days = dayDiff(today, original);
    return { next: original, days, isToday: days === 0, past: days < 0 };
  }

  function sortedAnniversaryItems() {
    return state.anniversaries
      .map((anniversary) => ({ anniversary, info: nextAnniversary(anniversary) }))
      .sort((a, b) => {
        if (a.info.past !== b.info.past) return a.info.past ? 1 : -1;
        if (a.info.past) return b.info.days - a.info.days;
        return a.info.days - b.info.days;
      });
  }

  function nextUpcomingAnniversary() {
    return sortedAnniversaryItems().find((item) => !item.info.past) || null;
  }

  function anniversaryProgress(anniversary) {
    if (!anniversary.recurring) return 0;
    const original = parseLocalDate(anniversary.date);
    const today = todayStart();
    if (Number.isNaN(original.getTime())) return 0;
    const next = dateInYear(today.getFullYear(), original.getMonth(), original.getDate());
    const adjustedNext = dayDiff(today, next) < 0
      ? dateInYear(today.getFullYear() + 1, original.getMonth(), original.getDate())
      : next;
    const last = dateInYear(adjustedNext.getFullYear() - 1, original.getMonth(), original.getDate());
    const total = Math.max(1, dayDiff(last, adjustedNext));
    const elapsed = Math.max(0, Math.min(total, dayDiff(last, today)));
    return Math.round((elapsed / total) * 100);
  }

  function hasAnniversaryToday() {
    const today = new Date();
    return state.anniversaries.some((anniversary) => {
      if (!anniversary.recurring) return false;
      const date = parseLocalDate(anniversary.date);
      return !Number.isNaN(date.getTime())
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    });
  }

  /* ------------------------------------------------------------------------
     Data helpers
     ------------------------------------------------------------------------ */

  function sortedMoments() {
    return [...state.moments].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function recipePalette(recipe) {
    const text = `${recipe.name}${recipe.emoji}`;
    const sum = Array.from(text).reduce((total, char) => total + (char.codePointAt(0) || 0), 0);
    return `palette-${sum % 6}`;
  }

  function dailyRecipe() {
    if (!state.recipes.length) return null;
    return state.recipes[dayOfYear() % state.recipes.length];
  }

  function currentDinner() {
    return state.recipes.find((recipe) => recipe.id === ui.dinnerId) || dailyRecipe();
  }

  function moodOf(moment) {
    return MOODS[moment.mood] || MOODS.happy;
  }

  function avatarFor(author, extra = '') {
    return `<span class="avatar ${author} ${extra}" aria-hidden="true">${esc(initialOf(nameOf(author)))}</span>`;
  }

  function moodChip(moment) {
    const mood = moodOf(moment);
    return `<span class="mood-chip"><span class="mood-dot" style="background:${mood.color}"></span>${mood.emoji} ${mood.label}</span>`;
  }

  /* ------------------------------------------------------------------------
     Layout chrome
     ------------------------------------------------------------------------ */

  function applyTheme() {
    document.documentElement.dataset.theme = THEMES.includes(state.theme) ? state.theme : 'coral';
  }

  function updateSidebar() {
    const days = daysTogether();
    const me = $('#side-avatar-me');
    const partner = $('#side-avatar-partner');
    const daysEl = $('#side-days');
    if (me) me.textContent = initialOf(state.names.me);
    if (partner) partner.textContent = initialOf(state.names.partner);
    if (daysEl) {
      daysEl.innerHTML = days.future
        ? `距离在一起还有 <strong>${days.days.toLocaleString('zh-CN')}</strong> 天`
        : `在一起的第 <strong>${days.days.toLocaleString('zh-CN')}</strong> 天`;
    }
  }

  function setActiveNav(route) {
    $$('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === route;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function updateFab(route) {
    const fab = $('#fab');
    if (fab) fab.classList.toggle('hidden', route !== 'home' || ui.space === 'personal');
  }

  function getRoute() {
    const hash = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ['home', 'moments', 'recipes', 'days', 'settings'].includes(hash) ? hash : 'home';
  }

  function updateTitle(route) {
    const titles = {
      home: '小满 · 两个人的小小宇宙',
      moments: '日常 · 小满',
      recipes: '菜谱 · 小满',
      days: '纪念日 · 小满',
      settings: '设置 · 小满',
    };
    document.title = titles[route] || titles.home;
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */

  function render() {
    const route = getRoute();
    applyTheme();
    updateSidebar();
    setActiveNav(route);
    updateFab(route);
    updateTitle(route);

    const views = {
      home: homeView,
      moments: momentsView,
      recipes: recipesView,
      days: daysView,
      settings: settingsView,
    };

    const view = $('#view');
    view.innerHTML = views[route]();
    if (route === 'moments') applyMomentFilter();
    if (route === 'recipes') applyRecipeFilters();
    if (route === 'home') {
      animateHeroDays();
      maybeCelebrate();
    }
  }

  function sectionHead(title, action = '') {
    return `<div class="section-head"><h2 class="section-title">${esc(title)}</h2>${action}</div>`;
  }

  function emptyState(emoji, title, text, action = '', small = false) {
    return `<div class="empty ${small ? 'small' : ''}">
      <span class="empty-emoji">${emoji}</span>
      <strong>${esc(title)}</strong>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
  }

  function welcomeBanner() {
    return `<div class="welcome-banner rise">
      ${icon('sparkles')}
      <p>这是给你们俩的小空间。先去 <a href="#settings">设置</a> 里换成你们的名字和在一起的日子吧。</p>
      <button class="icon-btn" type="button" data-action="dismiss-banner" aria-label="知道了">${icon('close')}</button>
    </div>`;
  }

  function heroArt() {
    return `<svg viewBox="0 0 280 230" role="presentation">
      <defs>
        <linearGradient id="beanCoral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f0a184"/>
          <stop offset="1" stop-color="#d76a4e"/>
        </linearGradient>
        <linearGradient id="beanSage" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#aec4a4"/>
          <stop offset="1" stop-color="#789273"/>
        </linearGradient>
        <filter id="heroBlur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
      </defs>
      <ellipse cx="140" cy="207" rx="78" ry="9" fill="#a87858" opacity=".18" filter="url(#heroBlur)"/>
      <path d="M128 43c-8-12-28-8-28 8 0 12 16 21 28 30 12-9 28-18 28-30 0-16-20-20-28-8Z" fill="var(--accent)" opacity=".94"/>
      <g transform="rotate(-7 102 124)">
        <ellipse cx="102" cy="124" rx="48" ry="60" fill="url(#beanCoral)"/>
        <ellipse cx="85" cy="101" rx="15" ry="22" fill="#fff" opacity=".2"/>
        <ellipse cx="88" cy="119" rx="4.3" ry="5.6" fill="#4b3a32"/>
        <ellipse cx="116" cy="119" rx="4.3" ry="5.6" fill="#4b3a32"/>
        <path d="M94 135c4.5 4.5 11 4.5 15.5 0" fill="none" stroke="#4b3a32" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="80" cy="132" rx="7.5" ry="4" fill="#f7b3a1" opacity=".85"/>
        <ellipse cx="124" cy="132" rx="7.5" ry="4" fill="#f7b3a1" opacity=".85"/>
      </g>
      <g transform="rotate(8 175 128)">
        <ellipse cx="175" cy="128" rx="44" ry="56" fill="url(#beanSage)"/>
        <ellipse cx="160" cy="106" rx="13" ry="20" fill="#fff" opacity=".18"/>
        <ellipse cx="162" cy="123" rx="4" ry="5.3" fill="#3f3b32"/>
        <ellipse cx="188" cy="123" rx="4" ry="5.3" fill="#3f3b32"/>
        <path d="M168 138c4 4 10 4 14 0" fill="none" stroke="#3f3b32" stroke-width="2.8" stroke-linecap="round"/>
        <ellipse cx="155" cy="136" rx="6.5" ry="3.6" fill="#e6a18f" opacity=".7"/>
        <ellipse cx="194" cy="136" rx="6.5" ry="3.6" fill="#e6a18f" opacity=".7"/>
      </g>
      <path d="M138 157c10 5 19 6 29 3" fill="none" stroke="#4b3a32" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M132 164c9 4 17 4 25 1" fill="none" stroke="#3f3b32" stroke-width="3" stroke-linecap="round"/>
      <path d="M84 185c3 4 8 5 12 2M179 187c4 3 9 2 12-1" fill="none" stroke="#4b3a32" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <path d="M214 62l2.5 7.5L224 72l-7.5 2.5L214 82l-2.5-7.5L204 72l7.5-2.5L214 62Z" fill="var(--accent)" opacity=".35"/>
      <circle cx="56" cy="78" r="4" fill="var(--accent)" opacity=".22"/>
      <circle cx="232" cy="119" r="3" fill="var(--partner)" opacity=".35"/>
      <path d="M49 126c5-5 11-5 16 0" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity=".32"/>
    </svg>`;
  }

  function heroNext(item) {
    if (!item) {
      return `<a class="hero-next" href="#days">
        <span class="hero-next-icon">🌱</span>
        <span class="hero-next-copy"><small>下一个纪念日</small><strong>还没有纪念日，去添加一个吧</strong></span>
        ${icon('chevron')}
      </a>`;
    }
    const { anniversary, info } = item;
    const label = info.isToday ? '就是今天' : `还有 ${info.days} 天`;
    return `<a class="hero-next" href="#days">
      <span class="hero-next-icon">${esc(anniversary.icon)}</span>
      <span class="hero-next-copy">
        <small>下一个纪念日</small>
        <strong>${esc(anniversary.title)} · <em>${label}</em></strong>
      </span>
      ${icon('chevron')}
    </a>`;
  }

  function miniMoment(moment) {
    const photo = safePhoto(moment.photo);
    const wish = moment.kind === 'wish';
    return `<article class="moment-mini">
      <div class="moment-mini-head">
        ${avatarFor(moment.author, 'tiny')}
        <span class="mini-name">${esc(nameOf(moment.author))}</span>
        <span class="mini-time">${esc(fmtMomentTime(moment.date))}</span>
      </div>
      <p>${wish ? `<span class="mini-wish">${esc(moment.foodEmoji || '🍲')} 想吃</span>` : ''}${esc(moment.text)}</p>
      ${photo ? `<img class="mini-photo" src="${photo}" alt="日常照片">` : ''}
      <div class="moment-mini-foot">${moodChip(moment)}</div>
    </article>`;
  }

  function dinnerPanel(recipe) {
    if (!recipe) {
      return `<section class="side-panel dinner-panel rise" style="--d:2">
        ${sectionHead('今晚吃什么', '<span class="mini-time">灵感</span>')}
        ${emptyState('🍳', '菜谱还是空的', '先收藏一道你们想一起做的菜吧。', `<button class="btn btn-primary btn-sm" data-action="add-recipe">${icon('plus')} 添加菜谱</button>`, true)}
      </section>`;
    }
    return `<section class="side-panel dinner-panel rise" style="--d:2">
      ${sectionHead('今晚吃什么', '<span class="mini-time">今日灵感</span>')}
      <div class="dinner-emoji">${esc(recipe.emoji || '🍳')}</div>
      <h3 class="dinner-name">${esc(recipe.name)}</h3>
      <p class="dinner-desc">${esc(recipe.desc || '一起做一顿好吃的。')}</p>
      <div class="dinner-meta">
        <span>${icon('clock')}${recipe.time} 分钟</span>
        <span>${esc(recipe.difficulty)}</span>
        ${recipe.favorite ? '<span>♥ 收藏</span>' : ''}
      </div>
      <div class="dinner-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="random-recipe">${icon('dice')} 换一道</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="open-recipe" data-id="${esc(recipe.id)}">看做法</button>
      </div>
    </section>`;
  }

  function promptPanel(prompt) {
    return `<section class="side-panel prompt-panel rise" style="--d:3">
      <div class="prompt-label">${icon('sparkles')} 今天可以一起</div>
      <p class="prompt-text">${esc(prompt)}</p>
      <button class="btn btn-sm" type="button" data-action="suggestion" data-prompt="${esc(prompt)}">记下这一刻 ${icon('arrow')}</button>
    </section>`;
  }

  function spaceBar() {
    const personal = ui.space === 'personal';
    return `<div class="space-bar">
      <div class="space-switch" role="group" aria-label="切换空间">
        <button class="${personal ? '' : 'active'}" type="button" data-action="set-space" data-space="shared">${icon('heart')} 我们的空间</button>
        <button class="${personal ? 'active' : ''}" type="button" data-action="set-space" data-space="personal">${icon('gift')} 我的小抽屉</button>
      </div>
      <span class="space-caption">${personal ? '只在这个身份下出现；换手机同步后还在' : '共享为主，两个人一起看'}</span>
    </div>`;
  }

  function homeView() {
    if (ui.space === 'personal') return drawerView('home');
    const days = daysTogether();
    const next = nextUpcomingAnniversary();
    const latest = sortedMoments().slice(0, 2);
    const dinner = currentDinner();
    const prompt = dailyItem(PROMPTS);
    const today = new Date();
    const subtitle = dailyItem(SUBTITLES);
    const greetingName = sync.identity ? nameOf(sync.identity) : state.names.me;

    return `<header class="page-head home-head">
      <div>
        <p class="eyebrow">${weekdayCN(today)} · ${fmtDateShort(localDateStr(today))} · ${days.future ? '期待中' : '我们的小日子'}</p>
        <h1>${greeting()}，${esc(greetingName)}<span class="hello-dot"></span></h1>
        <p class="page-sub">${esc(subtitle)}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="add-wish">${icon('bowl')}<span class="btn-label">想吃</span></button>
        <button class="btn btn-ghost" type="button" data-action="add-moment">${icon('edit')}<span class="btn-label">记录今天</span></button>
      </div>
    </header>
    ${state.onboarded ? '' : welcomeBanner()}
    ${identityBanner()}
    ${spaceBar()}
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-kicker">${days.future ? '距离在一起还有' : '我们在一起'}</div>
        <div class="hero-days">
          <span class="num" id="hero-days-num" data-target="${days.days}">${days.days.toLocaleString('zh-CN')}</span>
          <span class="unit">天</span>
        </div>
        <p class="hero-names"><strong>${esc(state.names.me)}</strong> &amp; <strong>${esc(state.names.partner)}</strong> · 从 ${fmtDateCN(state.togetherDate)} 开始</p>
        <div class="hero-chips">
          <span>日常 <strong>${state.moments.length}</strong></span>
          <span>菜谱 <strong>${state.recipes.length}</strong></span>
          <span>纪念日 <strong>${state.anniversaries.length}</strong></span>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${heroArt()}<span class="art-note">${esc(dailyItem(ART_NOTES))}</span></div>
      ${heroNext(next)}
    </section>
    <div class="home-grid">
      <section class="panel rise" style="--d:1">
        ${sectionHead('最近的小事', `<button class="text-link" type="button" data-action="go" data-route="moments">全部 ${icon('chevron')}</button>`)}
        ${latest.length ? latest.map(miniMoment).join('') : emptyState('🌱', '还没有日常', '今天发生的一件小事，就可以是第一条。')}
        <div style="display:flex;gap:7px;margin-top:14px">
          <button class="btn btn-soft" type="button" data-action="add-moment" style="flex:1">${icon('plus')} 写一条日常</button>
          <button class="btn btn-ghost" type="button" data-action="add-wish" style="flex:none">${icon('bowl')} 想吃</button>
        </div>
      </section>
      <aside class="home-side">
        ${dinnerPanel(dinner)}
        ${promptPanel(prompt)}
      </aside>
    </div>`;
  }

  function groupMoments(list) {
    const groups = new Map();
    list.forEach((moment) => {
      const date = new Date(moment.date);
      const key = Number.isNaN(date.getTime()) ? localDateStr() : localDateStr(date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(moment);
    });
    return Array.from(groups.entries()).map(([key, moments]) => {
      const date = parseLocalDate(key);
      const day = relDayLabel(key);
      const calendar = fmtDateShort(key);
      const small = day === calendar ? weekdayCN(date) : `${calendar} · ${weekdayCN(date)}`;
      return `<section class="timeline-group" data-day="${key}">
        <h3 class="timeline-date">${esc(day)} <small>${small}</small></h3>
        ${moments.map(momentCard).join('')}
      </section>`;
    }).join('');
  }

  function wishCard(moment) {
    const planned = moment.wishStatus === 'planned';
    return `<article class="wish-card ${planned ? 'planned' : ''}" data-author="${moment.author}">
      <span class="wish-stamp">${planned ? '已安排' : '想吃'}</span>
      <div class="wish-top">
        <div class="wish-emoji">${esc(moment.foodEmoji || '🍲')}</div>
        <div class="wish-content">
          <div class="wish-label">CRAVING · 想吃</div>
          <p class="wish-text">${esc(moment.text)}</p>
        </div>
      </div>
      ${moment.photo ? `<img class="moment-photo" src="${safePhoto(moment.photo)}" alt="想吃的照片">` : ''}
      <div class="wish-foot">
        ${avatarFor(moment.author, 'tiny')}
        <span class="wish-author">${esc(nameOf(moment.author))}</span>
        <span class="wish-time">${esc(fmtMomentTime(moment.date))}</span>
        <button class="icon-btn" type="button" data-action="edit-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="编辑想吃卡片">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="删除想吃卡片">${icon('trash')}</button>
        <button class="wish-plan-btn ${planned ? 'done' : ''}" type="button" data-action="plan-wish" data-id="${esc(moment.id)}" ${planned ? 'disabled' : ''}>
          ${icon(planned ? 'check' : 'sparkles')} ${planned ? '已安排' : '安排！'}
        </button>
      </div>
    </article>`;
  }

  function momentCard(moment) {
    if (moment.kind === 'wish') return wishCard(moment);
    const photo = safePhoto(moment.photo);
    return `<article class="moment-card" data-author="${moment.author}">
      <div class="moment-head">
        ${avatarFor(moment.author)}
        <div class="moment-author">
          <strong>${esc(nameOf(moment.author))}</strong>
          <span>${esc(fmtMomentTime(moment.date))}</span>
        </div>
        <div class="moment-tools">
          <button class="icon-btn" type="button" data-action="edit-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="编辑这条日常">${icon('edit')}</button>
          <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="删除这条日常">${icon('trash')}</button>
        </div>
      </div>
      <p class="moment-text">${esc(moment.text)}</p>
      ${photo ? `<img class="moment-photo" src="${photo}" alt="日常照片">` : ''}
      <div class="moment-foot">${moodChip(moment)}</div>
    </article>`;
  }

  function currentPersonal() {
    return sync.identity && state.personal[sync.identity]
      ? state.personal[sync.identity]
      : emptyPersonal();
  }

  function sortedPersonal() {
    return [...currentPersonal().moments].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function personalCard(moment) {
    const gift = moment.kind === 'gift';
    const photo = safePhoto(moment.photo);
    return `<article class="drawer-card ${gift ? 'kind-gift' : ''}">
      <div class="moment-tools" style="position:absolute;top:12px;right:12px;opacity:.55">
        <button class="icon-btn" type="button" data-action="edit-moment" data-space="personal" data-id="${esc(moment.id)}" aria-label="编辑这张小纸条">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="personal" data-id="${esc(moment.id)}" aria-label="删除这张小纸条">${icon('trash')}</button>
      </div>
      <div class="drawer-badge">${icon(gift ? 'gift' : 'sparkles')} ${gift ? '礼物计划' : '小纸条'}</div>
      <p class="moment-text">${esc(moment.text)}</p>
      ${photo ? `<img class="moment-photo" src="${photo}" alt="小抽屉照片">` : ''}
      <div class="drawer-date">${esc(fmtMomentTime(moment.date))}</div>
    </article>`;
  }

  function drawerView(route) {
    const identity = sync.identity;
    const items = sortedPersonal();
    const name = identity ? nameOf(identity) : '';
    const otherName = identity === 'partner' ? state.names.me : state.names.partner;
    const title = '我的小抽屉';
    return `<header class="page-head">
      <div>
        <p class="eyebrow">MY LITTLE DRAWER</p>
        <h1 class="page-title">${title}</h1>
        <p class="page-sub">给 ${esc(otherName)} 的惊喜、礼物计划，先放在这里。</p>
      </div>
      <div class="head-actions">
        ${identity ? `<button class="btn btn-primary" type="button" data-action="add-personal-note">${icon('plus')}<span class="btn-label">写张小纸条</span></button>` : ''}
      </div>
    </header>
    ${spaceBar()}
    ${!identity ? `<div class="identity-banner">
      ${icon('users')}
      <p>先选一下你是哪一位，小抽屉才知道该打开哪一个。</p>
      <div class="identity-picks">
        <button type="button" data-action="choose-identity" data-identity="me">我是 ${esc(state.names.me)}</button>
        <button type="button" data-action="choose-identity" data-identity="partner">我是 ${esc(state.names.partner)}</button>
      </div>
    </div>` : ''}
    <section class="drawer-hero rise">
      <div class="drawer-kicker">${icon('gift')} PRIVATE · 只给自己</div>
      <h1>${name ? `${esc(name)}的小抽屉` : '我的小抽屉'}</h1>
      <p>这里不会出现在共享空间。换手机后，用自己的身份同步，它还会回来。</p>
      <div class="drawer-actions">
        <button class="btn btn-primary" type="button" data-action="add-personal-note">${icon('edit')} 写张小纸条</button>
        <button class="btn btn-ghost" type="button" data-action="add-personal-gift">${icon('gift')} 记个礼物计划</button>
      </div>
    </section>
    ${items.length
      ? `<div class="drawer-timeline">${items.map(personalCard).join('')}</div>`
      : `<div class="drawer-empty">${emptyState('🎁', '抽屉还是空的', '可以藏一句想说的话，也可以记一个准备送出的礼物。', `<button class="btn btn-soft btn-sm" data-action="add-personal-note">${icon('plus')} 写第一张</button>`)}</div>`}
    `;
  }

  function momentsView() {
    if (ui.space === 'personal') return drawerView('moments');
    const list = sortedMoments();
    const mine = list.filter((moment) => moment.author === 'me').length;
    const partner = list.length - mine;
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR LITTLE THINGS</p>
        <h1 class="page-title">日常碎片</h1>
        <p class="page-sub">把普通的日子，过成值得收藏的故事。</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="add-wish">${icon('bowl')}<span class="btn-label">想吃</span></button>
        <button class="btn btn-primary" type="button" data-action="add-moment">${icon('plus')}<span class="btn-label">记录一件小事</span></button>
      </div>
    </header>
    ${spaceBar()}
    <div class="filter-bar">
      <div class="chips-row" id="moment-filters">
        <button class="chip ${ui.momentFilter === 'all' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="all">全部 · ${list.length}</button>
        <button class="chip ${ui.momentFilter === 'me' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="me">${esc(state.names.me)} · ${mine}</button>
        <button class="chip ${ui.momentFilter === 'partner' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="partner">${esc(state.names.partner)} · ${partner}</button>
      </div>
      <span class="count-note">${list.length ? '按时间倒序排列' : '还没有记录'}</span>
    </div>
    ${list.length
      ? `<div class="timeline">${groupMoments(list)}</div>
         <div class="empty small hidden" id="moment-filter-empty">
           <span class="empty-emoji">🫧</span>
           <strong>这一栏还没有内容</strong>
           <p>换个人看看，或者现在就补上一条。</p>
         </div>`
      : emptyState('🌱', '还没有日常', '今天发生的一件小事，就可以是第一条。', `<button class="btn btn-primary btn-sm" data-action="add-moment">${icon('plus')} 写下第一条</button>`)}
    `;
  }

  function recipeCard(recipe) {
    const palette = recipePalette(recipe);
    const tags = recipe.tags.slice(0, 2);
    const searchText = [recipe.name, recipe.desc, ...recipe.tags, ...recipe.ingredients.map((item) => item.name)].join(' ');
    return `<article class="recipe-card" tabindex="0" role="button" data-action="open-recipe" data-id="${esc(recipe.id)}" data-search="${esc(searchText)}" data-tags="${esc(recipe.tags.join(','))}" aria-label="查看菜谱：${esc(recipe.name)}">
      <div class="recipe-cover ${palette}">
        <span class="recipe-emoji">${esc(recipe.emoji || '🍳')}</span>
        <button class="recipe-fav ${recipe.favorite ? 'is-fav' : ''}" type="button" data-action="toggle-favorite" data-fav-id="${esc(recipe.id)}" aria-label="${recipe.favorite ? '取消收藏' : '收藏'}" aria-pressed="${recipe.favorite}">${icon('heart')}</button>
        <span class="recipe-time">${icon('clock')}${recipe.time} 分钟</span>
      </div>
      <div class="recipe-body">
        <h3 class="recipe-name">${esc(recipe.name)}</h3>
        <p class="recipe-desc">${esc(recipe.desc || '一道想和 TA 一起做的菜。')}</p>
        <div class="recipe-foot">
          ${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
          ${recipe.cookedAt ? `<span class="recipe-cooked">${icon('check')}做过</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  function recipesView() {
    const allTags = ['全部'];
    state.recipes.forEach((recipe) => {
      recipe.tags.forEach((tag) => {
        if (!allTags.includes(tag)) allTags.push(tag);
      });
    });
    if (!allTags.includes(ui.recipeTag)) ui.recipeTag = '全部';
    const favorites = state.recipes.filter((recipe) => recipe.favorite).length;

    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR RECIPE BOOK</p>
        <h1 class="page-title">我们的菜谱</h1>
        <p class="page-sub">一起研究，一起变胖。收录 ${state.recipes.length} 道，收藏 ${favorites} 道。</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="random-recipe">${icon('dice')}<span class="btn-label">随机一道</span></button>
        <button class="btn btn-primary" type="button" data-action="add-recipe">${icon('plus')}<span class="btn-label">新菜谱</span></button>
      </div>
    </header>
    <div class="recipe-toolbar">
      <div class="search-box">
        ${icon('search')}
        <input id="recipe-search" type="search" value="${esc(ui.recipeQuery)}" placeholder="搜菜名、食材或标签…" aria-label="搜索菜谱">
      </div>
      <div class="chips-row" id="recipe-tags">
        ${allTags.map((tag) => `<button class="chip ${ui.recipeTag === tag ? 'active' : ''}" type="button" data-action="filter-tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}
      </div>
    </div>
    <div class="recipe-grid" id="recipe-grid">
      ${state.recipes.length
        ? state.recipes.map(recipeCard).join('')
        : `<div class="recipe-empty">${emptyState('🍳', '菜谱还是空的', '把你们常做的那道菜写下来吧，以后就不怕忘。', `<button class="btn btn-primary btn-sm" data-action="add-recipe">${icon('plus')} 添加第一道菜</button>`)}</div>`}
    </div>
    <div class="empty small hidden" id="recipe-filter-empty">
      <span class="empty-emoji">🔍</span>
      <strong>没有找到这道菜</strong>
      <p>换个关键词，或者点「全部」看看。</p>
    </div>
    <p class="count-note" id="recipe-count" style="margin-top:14px">${state.recipes.length ? `共 ${state.recipes.length} 道菜` : ''}</p>
    `;
  }

  function annivFeature(item) {
    const { anniversary, info } = item;
    const isPast = info.past;
    const isToday = info.isToday;
    const number = isToday ? '今天' : Math.abs(info.days);
    const unit = isToday ? '纪念日' : (isPast ? '天前' : '天后');
    const progress = isPast ? 0 : anniversaryProgress(anniversary);
    return `<section class="anniv-feature rise">
      <div>
        <p class="eyebrow">${isPast ? '最近的重要日子' : '下一个纪念日'}</p>
        <h2 class="anniv-feature-title">${esc(anniversary.icon)} ${esc(anniversary.title)}</h2>
        <p class="anniv-feature-date">${anniversary.recurring ? `每年 ${fmtMonthDay(anniversary.date)}` : fmtDateCN(anniversary.date)}${anniversary.note ? ` · ${esc(anniversary.note)}` : ''}</p>
      </div>
      <div class="anniv-count ${isToday ? 'is-today' : ''}">
        <span class="num">${number}</span>
        <span class="unit">${unit}</span>
      </div>
      ${isPast ? '' : `<div class="anniv-progress">
        <div class="anniv-progress-bar"><span style="width:${progress}%"></span></div>
        <small>${isToday ? '就是今天' : `这一年已走过 ${progress}%`}</small>
      </div>`}
    </section>`;
  }

  function annivRow(item) {
    const { anniversary, info } = item;
    const isPast = info.past;
    const isToday = info.isToday;
    const number = isToday ? '今天' : Math.abs(info.days);
    const unit = isToday ? '纪念日' : (isPast ? '天前' : '天后');
    return `<article class="anniv-row">
      <span class="anniv-icon">${esc(anniversary.icon)}</span>
      <div class="anniv-row-main">
        <strong>${esc(anniversary.title)}${anniversary.recurring ? '<span class="recurring">每年</span>' : ''}</strong>
        <small>${anniversary.recurring ? '每年 ' : ''}${fmtMonthDay(anniversary.date)}${anniversary.note ? ` · ${esc(anniversary.note)}` : ''}</small>
      </div>
      <div class="anniv-days ${isPast ? 'past' : ''}">
        <strong>${number}</strong>
        <small>${unit}</small>
      </div>
      <div class="anniv-row-tools">
        <button class="icon-btn" type="button" data-action="edit-anniv" data-id="${esc(anniversary.id)}" aria-label="编辑纪念日">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-action="delete-anniv" data-id="${esc(anniversary.id)}" aria-label="删除纪念日">${icon('trash')}</button>
      </div>
    </article>`;
  }

  function daysView() {
    const items = sortedAnniversaryItems();
    const feature = items.find((item) => !item.info.past) || items[0];

    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR DAYS</p>
        <h1 class="page-title">重要的日子</h1>
        <p class="page-sub">值得倒数，也值得回头看。</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" type="button" data-action="add-anniv">${icon('plus')}<span class="btn-label">添加纪念日</span></button>
      </div>
    </header>
    ${feature
      ? annivFeature(feature)
      : emptyState('🌷', '还没有纪念日', '把在一起的日子、生日、第一次旅行放进来吧。', `<button class="btn btn-primary btn-sm" data-action="add-anniv">${icon('plus')} 添加第一个</button>`)}
    ${items.length ? `<div class="anniv-list">${items.map(annivRow).join('')}</div>` : ''}
    `;
  }

  function settingsView() {
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR LITTLE HOME</p>
        <h1 class="page-title">我们的小屋</h1>
        <p class="page-sub">名字、颜色、备份，都放在这里。</p>
      </div>
    </header>
    <div class="settings-grid">
      <form class="settings-panel" id="profile-form">
        <h2>我们是谁</h2>
        <p class="settings-note">换成你们自己的名字，首页就会叫对人了。</p>
        <div class="form-grid">
          <div class="field">
            <label for="profile-me">我的名字</label>
            <input class="input" id="profile-me" name="me" maxlength="12" value="${esc(state.names.me)}" autocomplete="off" required>
          </div>
          <div class="field">
            <label for="profile-partner">TA 的名字</label>
            <input class="input" id="profile-partner" name="partner" maxlength="12" value="${esc(state.names.partner)}" autocomplete="off" required>
          </div>
          <div class="field span-2">
            <label for="profile-date">在一起的日子 <span class="field-hint">首页会从这一天开始数</span></label>
            <input class="input" id="profile-date" name="togetherDate" type="date" value="${esc(state.togetherDate)}" required>
          </div>
        </div>
        <div class="form-actions">
          <span class="spacer"></span>
          <button class="btn btn-primary" type="submit">${icon('check')} 保存我们</button>
        </div>
      </form>

      <section class="settings-panel">
        <h2>换一个心情</h2>
        <p class="settings-note">整个小空间的颜色，会跟着一起变。</p>
        <div class="theme-grid">
          ${THEMES.map((theme) => `<button class="theme-option ${state.theme === theme ? 'active' : ''}" type="button" data-action="set-theme" data-theme="${theme}">
            <span class="theme-swatch ${theme}"></span>
            <span>${THEME_NAMES[theme]}</span>
            <span class="check">${icon('check')}</span>
          </button>`).join('')}
        </div>
        <div class="privacy-box" style="margin-top:18px">
          ${icon('sparkles')}
          <p>小提示：照片会先压缩再保存，所以不用心疼手机内存。</p>
        </div>
      </section>

      <section class="settings-panel full">
        <h2>我们的数据</h2>
        <p class="settings-note">导出一份备份，或者把整个小空间搬到另一台设备。</p>
        <div class="data-actions">
          <button class="btn btn-ghost" type="button" data-action="export-data">${icon('download')} 导出数据</button>
          <button class="btn btn-ghost" type="button" data-action="import-data">${icon('upload')} 导入数据</button>
        </div>
        <div class="privacy-box">
          ${icon('lock')}
          <p>默认只保存在本机。开启「两台手机同步」后，会通过你们自己的坚果云 WebDAV 同步，不经过第三方服务器。换设备时也可以先导出，再在新设备上导入。</p>
        </div>
      </section>

      ${syncSettingsPanelHTML()}

      ${updateSettingsPanelHTML()}

      <section class="settings-panel">
        <h2>一些说明</h2>
        <ul class="about-lines">
          <li>双击打开就能用，不需要联网，也没有账号。</li>
          <li>清理浏览器数据前，记得先导出备份。</li>
          <li>两个人共用一台设备时，切换「我 / TA」来记录。</li>
          <li>两台手机同步需要同一个坚果云账号的应用密码。</li>
        </ul>
      </section>

      <section class="settings-panel danger-zone">
        <h2>重新开始</h2>
        <p class="settings-note">清空现在的内容，回到最初的示例数据。</p>
        <button class="btn btn-ghost" type="button" data-action="reset-data" style="color:var(--danger);border-color:#ecd2cb">${icon('refresh')} 恢复示例数据</button>
      </section>
    </div>
    <p class="count-note" style="margin-top:22px;text-align:center">小满 · 为两个人手写 · <span id="app-version-label">v${currentVersionName}</span></p>
    `;
  }

  /* ------------------------------------------------------------------------
     Filters
     ------------------------------------------------------------------------ */

  function applyMomentFilter() {
    let visibleTotal = 0;
    $$('.timeline-group').forEach((group) => {
      let visible = 0;
      $$('.moment-card, .wish-card', group).forEach((card) => {
        const show = ui.momentFilter === 'all' || card.dataset.author === ui.momentFilter;
        card.classList.toggle('hidden', !show);
        if (show) visible += 1;
      });
      group.classList.toggle('hidden', visible === 0);
      visibleTotal += visible;
    });
    const empty = $('#moment-filter-empty');
    if (empty) empty.classList.toggle('hidden', visibleTotal !== 0);
  }

  function applyRecipeFilters() {
    const query = ui.recipeQuery.trim().toLowerCase();
    let visible = 0;
    $$('#recipe-grid .recipe-card').forEach((card) => {
      const tags = String(card.dataset.tags || '').split(',');
      const matchesQuery = !query || String(card.dataset.search || '').toLowerCase().includes(query);
      const matchesTag = ui.recipeTag === '全部' || tags.includes(ui.recipeTag);
      const show = matchesQuery && matchesTag;
      card.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });
    const empty = $('#recipe-filter-empty');
    if (empty) empty.classList.toggle('hidden', visible !== 0);
    const count = $('#recipe-count');
    if (count) {
      count.textContent = state.recipes.length
        ? (query || ui.recipeTag !== '全部' ? `找到 ${visible} 道菜` : `共 ${state.recipes.length} 道菜`)
        : '';
    }
  }

  /* ------------------------------------------------------------------------
     Hero animation + celebration
     ------------------------------------------------------------------------ */

  function animateHeroDays() {
    if (ui.heroAnimated) return;
    const element = $('#hero-days-num');
    if (!element) return;
    ui.heroAnimated = true;
    const target = Number(element.dataset.target || 0);
    if (!Number.isFinite(target) || target < 10 || prefersReducedMotion()) return;
    const start = performance.now();
    const duration = 900;
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(target * eased).toLocaleString('zh-CN');
      if (progress < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function maybeCelebrate() {
    if (!hasAnniversaryToday() || prefersReducedMotion()) return;
    let key = `xiaoman-celebrated-${localDateStr()}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch (error) {
      // sessionStorage can be unavailable in some local file contexts.
    }
    const container = $('#confetti');
    if (!container) return;
    const emojis = ['♥', '✿', '✦', '❀', '♡', '✧'];
    for (let index = 0; index < 18; index += 1) {
      const piece = document.createElement('span');
      piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.color = index % 2 ? 'var(--accent)' : 'var(--partner)';
      piece.style.fontSize = `${11 + Math.random() * 9}px`;
      piece.style.animationDuration = `${2.8 + Math.random() * 2}s`;
      piece.style.animationDelay = `${Math.random() * 0.7}s`;
      piece.style.setProperty('--drift', `${Math.random() * 180 - 90}px`);
      piece.style.setProperty('--spin', `${Math.random() * 540 - 270}deg`);
      container.appendChild(piece);
    }
    window.setTimeout(() => { container.innerHTML = ''; }, 5200);
  }

  /* ------------------------------------------------------------------------
     Modal + toast + confirm
     ------------------------------------------------------------------------ */

  function openModal({ eyebrow = '', title = '', subtitle = '', body = '', wide = false }) {
    lastFocused = document.activeElement;
    const toastEl = $('#toast');
    if (toastEl) toastEl.classList.remove('show');
    $('#modal-eyebrow').textContent = eyebrow;
    $('#modal-title').textContent = title;
    $('#modal-subtitle').textContent = subtitle;
    $('#modal-body').innerHTML = body;
    const sheet = $('.sheet');
    sheet.classList.toggle('wide', wide);
    sheet.scrollTop = 0;
    $('#modal').classList.add('open');
    $('#modal').setAttribute('aria-hidden', 'false');
    updateBodyLock();
    window.setTimeout(() => {
      const first = $('#modal-body').querySelector('textarea, input:not([type="hidden"]):not([type="file"]), select');
      if (first) first.focus({ preventScroll: true });
    }, 70);
  }

  function closeModal() {
    const modal = $('#modal');
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    $('#modal-body').innerHTML = '';
    updateBodyLock();
    if (lastFocused && document.contains(lastFocused)) {
      try { lastFocused.focus({ preventScroll: true }); } catch (error) { /* noop */ }
    }
  }

  function openConfirm({ title, message, confirmText = '确定', onConfirm, danger = true }) {
    confirmCallback = onConfirm;
    const toastEl = $('#toast');
    if (toastEl) toastEl.classList.remove('show');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const yes = $('#confirm-yes');
    yes.textContent = confirmText;
    yes.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    $('#confirm').classList.add('open');
    $('#confirm').setAttribute('aria-hidden', 'false');
    updateBodyLock();
    window.setTimeout(() => yes.focus({ preventScroll: true }), 30);
  }

  function closeConfirm() {
    const confirm = $('#confirm');
    if (!confirm || !confirm.classList.contains('open')) return;
    confirm.classList.remove('open');
    confirm.setAttribute('aria-hidden', 'true');
    updateBodyLock();
  }

  function updateBodyLock() {
    const open = $('#modal').classList.contains('open') || $('#confirm').classList.contains('open');
    document.body.classList.toggle('modal-open', open);
  }

  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove('show'), 2800);
  }

  /* ------------------------------------------------------------------------
     Forms
     ------------------------------------------------------------------------ */

  function authorSegmented(author) {
    return `<div class="segmented" role="group" aria-label="谁记录的">
      <button type="button" class="${author === 'me' ? 'active' : ''}" data-action="set-author" data-author="me">我 · ${esc(state.names.me)}</button>
      <button type="button" class="${author === 'partner' ? 'active' : ''}" data-action="set-author" data-author="partner">TA · ${esc(state.names.partner)}</button>
    </div>
    <input type="hidden" name="author" value="${author}">`;
  }

  function moodPicker(current) {
    return `<div class="mood-picker">
      ${Object.entries(MOODS).map(([key, mood]) => `<button type="button" class="mood-option ${current === key ? 'active' : ''}" data-action="pick-mood" data-mood="${key}">${mood.emoji} ${mood.label}</button>`).join('')}
    </div>
    <input type="hidden" name="mood" value="${esc(current)}">`;
  }

  function photoZoneInner(photo) {
    if (photo) {
      return `<img class="photo-preview" src="${photo}" alt="照片预览">
        <div class="photo-copy"><strong>照片已添加</strong><small>会压缩后保存在本机</small></div>
        <div class="photo-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="photo-trigger">换一张</button>
          <button class="icon-btn danger" type="button" data-action="remove-photo" aria-label="移除照片">${icon('trash')}</button>
        </div>`;
    }
    return `<span class="photo-placeholder">${icon('camera')}<span class="photo-copy"><strong>加一张照片</strong><small>可选 · 会压缩保存</small></span></span>
      <div class="photo-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="photo-trigger">选择</button></div>`;
  }

  function composeCopy(space, kind) {
    if (kind === 'wish') {
      return {
        label: '想吃什么',
        placeholder: '比如：突然好想吃火锅，要那种咕嘟咕嘟的。',
        hint: '会作为一张「想吃」卡片，出现在我们的空间。',
        icon: 'bowl',
      };
    }
    if (kind === 'gift') {
      return {
        label: '想送她什么',
        placeholder: '想送她什么？为什么想送？先偷偷记下来。',
        hint: '只会放进「我的小抽屉」，不会出现在共享空间。',
        icon: 'gift',
      };
    }
    if (space === 'personal') {
      return {
        label: '想对自己说点什么',
        placeholder: '一句话、一个秘密、一个还没说出口的念头…',
        hint: '只会放进「我的小抽屉」，换手机同步后还在。',
        icon: 'gift',
      };
    }
    return {
      label: '今天发生了什么',
      placeholder: '一句话、一个瞬间、一张照片都可以…',
      hint: '会发到「我们的空间」，两个人都能看。',
      icon: 'heart',
    };
  }

  function syncComposeUI(space, kind) {
    const form = $('#moment-form');
    if (!form) return;
    form.dataset.space = space;
    form.dataset.kind = kind;
    const spaceInput = $('#compose-space');
    const kindInput = $('#compose-kind');
    if (spaceInput) spaceInput.value = space;
    if (kindInput) kindInput.value = kind;
    $$('#compose-space-tabs .compose-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.space === space);
    });
    $$('#compose-kind-shared .compose-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.kind === kind);
    });
    $$('#compose-kind-personal .compose-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.kind === kind);
    });
    const sharedKinds = $('#compose-kind-shared');
    const personalKinds = $('#compose-kind-personal');
    if (sharedKinds) sharedKinds.classList.toggle('hidden', space !== 'shared');
    if (personalKinds) personalKinds.classList.toggle('hidden', space !== 'personal');
    const sharedAuthor = $('#compose-author-shared');
    const personalAuthor = $('#compose-author-personal');
    if (sharedAuthor) sharedAuthor.classList.toggle('hidden', space !== 'shared');
    if (personalAuthor) personalAuthor.classList.toggle('hidden', space !== 'personal');
    const wishFields = $('#wish-fields');
    if (wishFields) wishFields.classList.toggle('hidden', kind !== 'wish');
    const copy = composeCopy(space, kind);
    const label = $('#moment-text-label');
    if (label) label.innerHTML = `${copy.label} <span class="char-count" id="moment-text-count">${Array.from($('#moment-text')?.value || '').length}/800</span>`;
    const textarea = $('#moment-text');
    if (textarea) textarea.placeholder = copy.placeholder;
    const hint = $('#compose-hint');
    if (hint) hint.innerHTML = `${icon(copy.icon)}<span>${copy.hint}</span>`;
  }

  function momentForm(moment = null, prompt = '', options = {}) {
    const editing = Boolean(moment);
    const space = options.space || (moment && moment.space) || 'shared';
    const kind = options.kind || (moment && moment.kind) || (space === 'personal' ? 'note' : 'moment');
    const photo = moment ? safePhoto(moment.photo) : '';
    const author = moment ? moment.author : (sync.identity || 'me');
    const mood = moment ? moment.mood : 'happy';
    const date = moment ? toLocalInput(moment.date) : toLocalInput();
    const foodEmoji = moment ? (moment.foodEmoji || '🍲') : '🍲';
    const copy = composeCopy(space, kind);
    const wish = kind === 'wish';

    const spaceTabs = editing ? '' : `<div class="compose-tabs" id="compose-space-tabs">
      <button class="compose-tab ${space === 'shared' ? 'active' : ''}" type="button" data-action="set-compose-space" data-space="shared">
        ${icon('heart')}<span><strong>发给我们</strong><small>默认，两个人都能看</small></span>
      </button>
      <button class="compose-tab ${space === 'personal' ? 'active' : ''}" type="button" data-action="set-compose-space" data-space="personal">
        ${icon('gift')}<span><strong>我的小抽屉</strong><small>只给自己，藏惊喜</small></span>
      </button>
    </div>
    <p class="compose-hint" id="compose-hint">${icon(copy.icon)}<span>${copy.hint}</span></p>`;

    return `<form id="moment-form" data-id="${editing ? esc(moment.id) : ''}" data-space="${space}" data-kind="${kind}">
      <input type="hidden" name="space" id="compose-space" value="${space}">
      <input type="hidden" name="kind" id="compose-kind" value="${kind}">
      ${prompt ? `<div class="welcome-banner" style="margin:0 0 14px">${icon('sparkles')}<p>今天的灵感：${esc(prompt)}</p></div>` : ''}
      ${spaceTabs}
      <div class="compose-tabs ${space === 'shared' ? '' : 'hidden'}" id="compose-kind-shared">
        <button class="compose-tab ${kind === 'moment' ? 'active' : ''}" type="button" data-action="set-compose-kind" data-kind="moment">
          ${icon('edit')}<span><strong>日常</strong><small>记录今天的小事</small></span>
        </button>
        <button class="compose-tab ${kind === 'wish' ? 'active' : ''}" type="button" data-action="set-compose-kind" data-kind="wish">
          ${icon('bowl')}<span><strong>想吃</strong><small>一张想吃卡片</small></span>
        </button>
      </div>
      <div class="compose-tabs ${space === 'personal' ? '' : 'hidden'}" id="compose-kind-personal">
        <button class="compose-tab ${kind === 'note' ? 'active' : ''}" type="button" data-action="set-compose-kind" data-kind="note">
          ${icon('edit')}<span><strong>小纸条</strong><small>一句话、一个秘密</small></span>
        </button>
        <button class="compose-tab ${kind === 'gift' ? 'active' : ''}" type="button" data-action="set-compose-kind" data-kind="gift">
          ${icon('gift')}<span><strong>礼物计划</strong><small>先偷偷记下来</small></span>
        </button>
      </div>
      <div class="field ${wish ? '' : 'hidden'}" id="wish-fields" style="margin-bottom:13px">
        <span class="field-label">想吃什么 <span class="field-hint">选一个食物 emoji</span></span>
        ${emojiPicker(WISH_EMOJIS, foodEmoji, 'foodEmoji')}
      </div>
      <div class="field">
        <label for="moment-text" id="moment-text-label">${copy.label} <span class="char-count" id="moment-text-count">${moment ? Array.from(moment.text).length : 0}/800</span></label>
        <textarea class="textarea" id="moment-text" name="text" maxlength="800" placeholder="${esc(copy.placeholder)}">${editing ? esc(moment.text) : ''}</textarea>
      </div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field span-2 ${space === 'shared' ? '' : 'hidden'}" id="compose-author-shared">
          <span class="field-label">谁记录的</span>
          ${authorSegmented(author)}
        </div>
        <div class="field span-2 ${space === 'personal' ? '' : 'hidden'}" id="compose-author-personal">
          <div class="identity-card">
            <span class="avatar ${sync.identity || 'me'}">${esc(initialOf(sync.identity ? nameOf(sync.identity) : state.names.me))}</span>
            <div class="identity-card-copy"><strong>只放进我的小抽屉</strong><small>${esc(sync.identity ? nameOf(sync.identity) : '先选择身份')} · 不会出现在共享空间</small></div>
          </div>
        </div>
        <div class="field span-2">
          <span class="field-label">当时的心情</span>
          ${moodPicker(mood)}
        </div>
        <div class="field span-2">
          <label for="moment-date">时间 <span class="field-hint">可以补记以前的日子</span></label>
          <input class="input" id="moment-date" name="date" type="datetime-local" value="${esc(date)}">
        </div>
        <div class="field span-2">
          <span class="field-label">照片 <span class="field-hint">比文字更会记得</span></span>
          <input class="photo-input" id="moment-photo" type="file" accept="image/*">
          <input type="hidden" name="photo" id="moment-photo-data" value="${photo}">
          <div class="photo-zone ${photo ? 'has-photo' : ''}" id="photo-zone">${photoZoneInner(photo)}</div>
        </div>
      </div>
      <div class="form-actions">
        ${editing ? `<button class="btn btn-ghost" type="button" data-action="delete-moment" data-space="${space}" data-id="${esc(moment.id)}">${icon('trash')} 删除</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存修改' : (kind === 'wish' ? '记下想吃' : (space === 'personal' ? '放进小抽屉' : '记下来'))}</button>
      </div>
      <p class="required-hint">文字和照片至少留一样 · ⌘/Ctrl + Enter 快速保存</p>
    </form>`;
  }

  function ingredientRow(item = {}) {
    return `<div class="ingredient-row">
      <input class="input ing-amount" name="amount" placeholder="分量" value="${esc(item.amount || '')}" maxlength="24" aria-label="食材分量">
      <input class="input ing-name" name="ingredient" placeholder="食材，比如番茄" value="${esc(item.name || '')}" maxlength="40" aria-label="食材名称">
      <button class="row-remove" type="button" data-action="remove-row" aria-label="删除这一行">${icon('close')}</button>
    </div>`;
  }

  function stepRow(text = '') {
    return `<div class="step-row">
      <span class="step-index">1</span>
      <textarea class="textarea" name="step" rows="2" placeholder="这一步要做什么…" maxlength="300">${esc(text)}</textarea>
      <button class="row-remove" type="button" data-action="remove-row" aria-label="删除这一步">${icon('close')}</button>
    </div>`;
  }

  function renumberSteps() {
    $$('#step-list .step-index').forEach((element, index) => {
      element.textContent = String(index + 1);
    });
  }

  function emojiPicker(items, current, name) {
    const options = items.includes(current) ? items : [current, ...items];
    return `<div class="emoji-picker">
      ${options.map((emoji) => `<button class="emoji-option ${emoji === current ? 'active' : ''}" type="button" data-action="pick-emoji" data-emoji="${esc(emoji)}" aria-label="选择 ${esc(emoji)}">${esc(emoji)}</button>`).join('')}
    </div>
    <input type="hidden" class="emoji-value" name="${name}" value="${esc(current)}">`;
  }

  function recipeForm(recipe = null) {
    const editing = Boolean(recipe);
    const data = recipe || {
      emoji: '🍳',
      desc: '',
      time: 30,
      difficulty: '简单',
      tags: [],
      ingredients: [],
      steps: [],
      favorite: false,
    };
    const ingredients = data.ingredients.length ? data.ingredients : [{ amount: '', name: '' }];
    const steps = data.steps.length ? data.steps : [''];
    return `<form id="recipe-form" data-id="${editing ? esc(recipe.id) : ''}">
      <div class="form-grid">
        <div class="field span-2">
          <label for="recipe-name">菜名 <em>*</em></label>
          <input class="input" id="recipe-name" name="name" maxlength="40" value="${esc(data.name || '')}" placeholder="比如：番茄牛腩" required>
        </div>
        <div class="field">
          <span class="field-label">给它一个 emoji</span>
          ${emojiPicker(RECIPE_EMOJIS, data.emoji || '🍳', 'emoji')}
        </div>
        <div class="field">
          <label for="recipe-time">大概要多久 <span class="field-hint">分钟</span></label>
          <input class="input" id="recipe-time" name="time" type="number" min="1" max="999" value="${esc(data.time || 30)}">
        </div>
        <div class="field">
          <label for="recipe-difficulty">难度</label>
          <select class="select" id="recipe-difficulty" name="difficulty">
            ${DIFFICULTIES.map((level) => `<option value="${level}" ${data.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="recipe-tags-input">标签 <span class="field-hint">用逗号隔开</span></label>
          <input class="input" id="recipe-tags-input" name="tags" maxlength="60" value="${esc((data.tags || []).join('，'))}" placeholder="快手，下饭，甜点">
        </div>
        <div class="field span-2">
          <label for="recipe-desc">一句话介绍</label>
          <textarea class="textarea" id="recipe-desc" name="desc" maxlength="140" rows="2" placeholder="为什么想做这道菜？">${esc(data.desc || '')}</textarea>
        </div>
      </div>

      <div class="form-section" style="margin-top:16px">
        <div class="form-section-title">食材 <small>写清楚分量，下次不翻车</small></div>
        <div class="dynamic-list" id="ingredient-list">
          ${ingredients.map(ingredientRow).join('')}
        </div>
        <button class="add-row-btn" type="button" data-action="add-ingredient" style="margin-top:7px">${icon('plus')} 再加一样食材</button>
      </div>

      <div class="form-section" style="margin-top:16px">
        <div class="form-section-title">做法 <small>按顺序写下来</small></div>
        <div class="dynamic-list" id="step-list">
          ${steps.map(stepRow).join('')}
        </div>
        <button class="add-row-btn" type="button" data-action="add-step" style="margin-top:7px">${icon('plus')} 再加一步</button>
      </div>

      <label class="check-row">
        <input type="checkbox" name="favorite" ${data.favorite ? 'checked' : ''}>
        <span>放进我们的收藏</span>
      </label>

      <div class="form-actions">
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存菜谱' : '收进菜谱'}</button>
      </div>
    </form>`;
  }

  function annivForm(anniversary = null) {
    const editing = Boolean(anniversary);
    const data = anniversary || {
      title: '',
      date: localDateStr(),
      recurring: true,
      icon: '🌷',
      note: '',
    };
    return `<form id="anniv-form" data-id="${editing ? esc(anniversary.id) : ''}">
      <div class="form-grid">
        <div class="field span-2">
          <label for="anniv-title">这是什么日子 <em>*</em></label>
          <input class="input" id="anniv-title" name="title" maxlength="40" value="${esc(data.title)}" placeholder="比如：恋爱纪念日" required>
        </div>
        <div class="field">
          <label for="anniv-date">日期 <em>*</em></label>
          <input class="input" id="anniv-date" name="date" type="date" value="${esc(data.date)}" required>
        </div>
        <div class="field">
          <span class="field-label">选一个图标</span>
          ${emojiPicker(ANNIV_EMOJIS, data.icon, 'icon')}
        </div>
        <div class="field span-2">
          <label for="anniv-note">备注 <span class="field-hint">可选</span></label>
          <input class="input" id="anniv-note" name="note" maxlength="100" value="${esc(data.note || '')}" placeholder="想写点什么？">
        </div>
        <div class="field span-2">
          <label class="check-row" style="padding:2px 0">
            <input type="checkbox" name="recurring" ${data.recurring ? 'checked' : ''}>
            <span>每年都过（生日、纪念日）</span>
          </label>
        </div>
      </div>
      <div class="form-actions">
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存纪念日' : '记下这个日子'}</button>
      </div>
    </form>`;
  }

  /* ------------------------------------------------------------------------
     Modal openers
     ------------------------------------------------------------------------ */

  function openMomentModal(moment = null, prompt = '', options = {}) {
    const editing = Boolean(moment);
    const space = options.space || (moment && moment.space) || 'shared';
    const kind = options.kind || (moment && moment.kind) || (space === 'personal' ? 'note' : 'moment');
    if (space === 'personal' && !sync.identity) {
      toast('先选一下你是哪一位，再打开小抽屉');
      openIdentityModal();
      return;
    }
    const title = editing
      ? (kind === 'wish' ? '编辑这张想吃卡片' : (space === 'personal' ? '编辑这张小纸条' : '编辑这条日常'))
      : (kind === 'wish' ? '记下想吃的' : (space === 'personal' ? (kind === 'gift' ? '记个礼物计划' : '写张小纸条') : '记录一件小事'));
    openModal({
      eyebrow: editing ? 'EDIT' : (kind === 'wish' ? 'CRAVING' : (space === 'personal' ? 'MY DRAWER' : 'NEW MOMENT')),
      title,
      subtitle: kind === 'wish'
        ? '把它放进我们的空间，等一个“安排”。'
        : (space === 'personal' ? '先放在这里，等一个合适的时机。' : '普通的一天，也值得被记住。'),
      body: momentForm(moment, prompt, { space, kind }),
    });
  }

  function openRecipeModal(recipe = null) {
    const editing = Boolean(recipe);
    openModal({
      eyebrow: editing ? 'EDIT RECIPE' : 'NEW RECIPE',
      title: editing ? '编辑菜谱' : '收一道新菜',
      subtitle: editing ? '把步骤改得更像你们家的做法。' : '下次不知道吃什么的时候，就来这里翻。',
      body: recipeForm(recipe),
    });
  }

  function openAnnivModal(anniversary = null) {
    const editing = Boolean(anniversary);
    openModal({
      eyebrow: editing ? 'EDIT DAY' : 'NEW DAY',
      title: editing ? '编辑这个日子' : '记下一个重要的日子',
      subtitle: editing ? '日子会变，但一起过的心意不变。' : '可以每年重复，也可以只倒数一次。',
      body: annivForm(anniversary),
    });
  }

  function openRecipeDetail(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    const palette = recipePalette(recipe);
    const cookedToday = Boolean(recipe.cookedAt)
      && localDateStr(new Date(recipe.cookedAt)) === localDateStr();
    const ingredients = recipe.ingredients.length
      ? `<ul class="ingredient-list">${recipe.ingredients.map((item, index) => `<li>
          <input type="checkbox" id="ing-${index}-${esc(recipe.id)}">
          <label for="ing-${index}-${esc(recipe.id)}"><span>${esc(item.name)}</span><span>${esc(item.amount || '')}</span></label>
        </li>`).join('')}</ul>`
      : '<p class="settings-note">这道菜还没写食材。</p>';
    const steps = recipe.steps.length
      ? `<ol class="step-list">${recipe.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>`
      : '<p class="settings-note">还没有写做法，下次一起补上吧。</p>';
    const body = `<div class="recipe-detail-cover ${palette}">
        <span class="emoji">${esc(recipe.emoji || '🍳')}</span>
        <div>
          <h3>${esc(recipe.name)}</h3>
          <p>${esc(recipe.desc || '一道想和 TA 一起做的菜。')}</p>
        </div>
      </div>
      <div class="detail-meta">
        <span>${icon('clock')} ${recipe.time} 分钟</span>
        <span>${esc(recipe.difficulty)}</span>
        <span>${recipe.ingredients.length} 样食材</span>
        <span>${recipe.steps.length} 个步骤</span>
        ${recipe.favorite ? `<span>${icon('heart', 'fill')} 已收藏</span>` : ''}
      </div>
      <div class="detail-section"><h4>食材</h4>${ingredients}</div>
      <div class="detail-section"><h4>做法</h4>${steps}</div>
      <div class="detail-actions">
        <button class="btn ${recipe.favorite ? 'btn-soft' : 'btn-ghost'}" type="button" data-action="toggle-favorite" data-fav-id="${esc(recipe.id)}">
          ${icon('heart', recipe.favorite ? 'fill' : '')}<span class="fav-label">${recipe.favorite ? '已收藏' : '收藏'}</span>
        </button>
        <button class="btn ${cookedToday ? 'is-done' : 'btn-ghost'}" type="button" data-action="mark-cooked" data-cooked-id="${esc(recipe.id)}">${icon('check')} 今天做过啦</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="edit-recipe" data-id="${esc(recipe.id)}">${icon('edit')} 编辑</button>
        <button class="btn btn-ghost" type="button" data-action="delete-recipe" data-id="${esc(recipe.id)}" style="color:var(--danger)">${icon('trash')} 删除</button>
      </div>`;
    openModal({
      eyebrow: 'RECIPE',
      title: '菜谱详情',
      subtitle: '一起做，一起吃，一起把日子过香。',
      body,
      wide: true,
    });
  }

  /* ------------------------------------------------------------------------
     Photo compression
     ------------------------------------------------------------------------ */

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('image failed'));
        image.onload = () => {
          const maxSide = 1000;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#fffdf8';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          let quality = 0.76;
          let data = canvas.toDataURL('image/jpeg', quality);
          while (data.length > 600000 && quality > 0.4) {
            quality -= 0.08;
            data = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(data);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('只能选图片哦');
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast('这张照片太大了，换一张小于 15MB 的吧');
      input.value = '';
      return;
    }
    try {
      const data = await compressImage(file);
      const hidden = $('#moment-photo-data');
      const zone = $('#photo-zone');
      if (hidden) hidden.value = data;
      if (zone) {
        zone.innerHTML = photoZoneInner(data);
        zone.classList.add('has-photo');
      }
      toast('照片加好啦');
    } catch (error) {
      toast('照片读取失败，换一张试试');
    }
    input.value = '';
  }

  function updatePhotoZone(photo) {
    const hidden = $('#moment-photo-data');
    const zone = $('#photo-zone');
    if (hidden) hidden.value = photo;
    if (zone) {
      zone.innerHTML = photoZoneInner(photo);
      zone.classList.toggle('has-photo', Boolean(photo));
    }
  }

  /* ------------------------------------------------------------------------
     Saving
     ------------------------------------------------------------------------ */

  function saveMoment(form) {
    const formData = new FormData(form);
    const space = formData.get('space') === 'personal' ? 'personal' : 'shared';
    const rawKind = String(formData.get('kind') || '');
    const kind = space === 'personal'
      ? (rawKind === 'gift' ? 'gift' : 'note')
      : (rawKind === 'wish' ? 'wish' : 'moment');
    const text = String(formData.get('text') || '').trim();
    const photo = safePhoto(formData.get('photo'));
    if (!text && !photo) {
      toast('写点什么，或者放一张照片吧');
      return;
    }
    if (kind === 'wish' && !text) {
      toast('写一下想吃什么，这样才像一张想吃卡片');
      return;
    }
    if (space === 'personal' && !sync.identity) {
      toast('先选一下你是哪一位');
      return;
    }

    const id = form.dataset.id;
    const list = space === 'personal' ? state.personal[sync.identity].moments : state.moments;
    const existing = id ? list.find((moment) => moment.id === id) : null;
    const dateValue = String(formData.get('date') || '');
    const parsedDate = new Date(dateValue);
    const date = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    const next = {
      id: existing ? existing.id : uid(),
      author: space === 'personal'
        ? sync.identity
        : (formData.get('author') === 'partner' ? 'partner' : 'me'),
      kind,
      text,
      mood: MOODS[formData.get('mood')] ? String(formData.get('mood')) : 'happy',
      date,
      photo,
      foodEmoji: kind === 'wish' ? String(formData.get('foodEmoji') || '🍲').slice(0, 8) : '',
      wishStatus: kind === 'wish' ? (existing && existing.wishStatus === 'planned' ? 'planned' : 'wanted') : '',
      updatedAt: isoNow(),
    };
    if (existing) Object.assign(existing, next);
    else list.push(next);
    if (space === 'personal') state.personal[sync.identity].updatedAt = isoNow();
    if (!saveState()) return;
    closeModal();
    render();
    if (kind === 'wish') toast('记下啦，等一个“安排”');
    else if (space === 'personal') toast(existing ? '小纸条改好啦' : '放进小抽屉啦，只有你能看到');
    else toast(existing ? '改好啦，还是你们的故事' : '记下啦，这一天有你们');
  }

  function saveRecipe(form) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    if (!name) {
      toast('先给这道菜起个名字吧');
      return;
    }
    const ingredients = $$('.ingredient-row', form)
      .map((row) => ({
        amount: String(row.querySelector('.ing-amount').value || '').trim(),
        name: String(row.querySelector('.ing-name').value || '').trim(),
      }))
      .filter((item) => item.name);
    if (!ingredients.length) {
      toast('至少写一样食材，不然做不出来呀');
      return;
    }
    const steps = $$('#step-list textarea', form)
      .map((textarea) => String(textarea.value || '').trim())
      .filter(Boolean);
    if (!steps.length) {
      toast('至少写一个步骤，下次才不会忘');
      return;
    }
    const tags = [...new Set(String(formData.get('tags') || '')
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean))].slice(0, 8);
    const id = form.dataset.id;
    const existing = id ? state.recipes.find((recipe) => recipe.id === id) : null;
    const next = {
      id: existing ? existing.id : uid(),
      name,
      emoji: String(formData.get('emoji') || '🍳').slice(0, 8),
      desc: String(formData.get('desc') || '').trim(),
      time: Math.min(999, Math.max(1, Number(formData.get('time')) || 30)),
      difficulty: DIFFICULTIES.includes(formData.get('difficulty')) ? String(formData.get('difficulty')) : '简单',
      tags,
      ingredients,
      steps,
      favorite: Boolean(formData.get('favorite')),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      cookedAt: existing ? existing.cookedAt : '',
      updatedAt: isoNow(),
    };
    if (existing) Object.assign(existing, next);
    else state.recipes.unshift(next);
    if (!saveState()) return;
    closeModal();
    render();
    toast(existing ? '菜谱更新好啦' : '收进菜谱啦，改天一起做');
  }

  function saveAnniversary(form) {
    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    const date = String(formData.get('date') || '');
    if (!title) {
      toast('先写下这是什么日子');
      return;
    }
    if (!isValidDateStr(date)) {
      toast('日期好像不太对，再选一次吧');
      return;
    }
    const id = form.dataset.id;
    const existing = id ? state.anniversaries.find((anniversary) => anniversary.id === id) : null;
    const next = {
      id: existing ? existing.id : uid(),
      title,
      date,
      recurring: Boolean(formData.get('recurring')),
      icon: String(formData.get('icon') || '🌷').slice(0, 8),
      note: String(formData.get('note') || '').trim(),
      updatedAt: isoNow(),
    };
    if (existing) Object.assign(existing, next);
    else state.anniversaries.push(next);
    if (!saveState()) return;
    closeModal();
    render();
    toast(existing ? '这个日子改好啦' : '记下啦，到时候一起过');
  }

  function saveProfile(form) {
    const formData = new FormData(form);
    const me = String(formData.get('me') || '').trim();
    const partner = String(formData.get('partner') || '').trim();
    const date = String(formData.get('togetherDate') || '');
    if (!me || !partner) {
      toast('两个名字都要写哦');
      return;
    }
    if (!isValidDateStr(date)) {
      toast('在一起的日子好像不太对');
      return;
    }
    state.names = { me, partner };
    state.togetherDate = date;
    state.profileUpdatedAt = isoNow();
    state.onboarded = true;
    if (!saveState()) return;
    render();
    toast('好，这里就是你们的小空间啦');
  }

  /* ------------------------------------------------------------------------
     Data import / export
     ------------------------------------------------------------------------ */

  function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `小满-我们的数据-${localDateStr()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('备份导出好啦，收好它');
  }

  function handleImport(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast('文件读取失败，再试一次吧');
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (!data || typeof data !== 'object'
          || !Array.isArray(data.moments)
          || !Array.isArray(data.recipes)
          || !Array.isArray(data.anniversaries)) {
          throw new Error('shape');
        }
        openConfirm({
          title: '导入这份备份？',
          message: '现在的内容会被这份备份替换。如果现在也有重要的记录，先导出一份再继续。',
          confirmText: '导入',
          danger: false,
          onConfirm: () => {
            state = normalizeState(data);
            state.onboarded = true;
            saveState();
            applyTheme();
            render();
            toast('导入成功，你们的小空间回来啦');
          },
        });
      } catch (error) {
        toast('这个文件不像是小满的备份');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  /* ------------------------------------------------------------------------
     Delete flows
     ------------------------------------------------------------------------ */

  function addTombstone(type, id) {
    if (!state.tombstones || !state.tombstones[type]) {
      state.tombstones = { moments: {}, recipes: {}, anniversaries: {}, ...(state.tombstones || {}) };
    }
    state.tombstones[type][id] = isoNow();
  }

  function requestDeleteMoment(id, space = 'shared') {
    if (space === 'personal') {
      if (!sync.identity) return;
      const personal = state.personal[sync.identity];
      const moment = personal.moments.find((item) => item.id === id);
      if (!moment) return;
      closeModal();
      openConfirm({
        title: '删掉这张小纸条？',
        message: '它会从我的小抽屉里消失，删掉就找不回来了。',
        confirmText: '删掉',
        onConfirm: () => {
          personal.tombstones[id] = isoNow();
          personal.moments = personal.moments.filter((item) => item.id !== id);
          personal.updatedAt = isoNow();
          saveState();
          render();
          toast('已经从小抽屉里删掉了');
        },
      });
      return;
    }
    const moment = state.moments.find((item) => item.id === id);
    if (!moment) return;
    closeModal();
    openConfirm({
      title: moment.kind === 'wish' ? '删掉这张想吃卡片？' : '删掉这条日常？',
      message: '这段小记录会从你们的时间线里消失，删掉就找不回来了。',
      confirmText: '删掉',
      onConfirm: () => {
        addTombstone('moments', id);
        state.moments = state.moments.filter((item) => item.id !== id);
        saveState();
        render();
        toast('已经删掉了');
      },
    });
  }

  function requestDeleteRecipe(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    closeModal();
    openConfirm({
      title: `删掉「${recipe.name}」？`,
      message: '这道菜的做法会从菜谱里消失，之后就不能再翻到了。',
      confirmText: '删掉',
      onConfirm: () => {
        addTombstone('recipes', id);
        state.recipes = state.recipes.filter((item) => item.id !== id);
        saveState();
        render();
        toast('菜谱已经删掉了');
      },
    });
  }

  function requestDeleteAnniversary(id) {
    const anniversary = state.anniversaries.find((item) => item.id === id);
    if (!anniversary) return;
    closeModal();
    openConfirm({
      title: `删掉「${anniversary.title}」？`,
      message: '这个日子会从纪念日列表里消失，删掉就找不回来了。',
      confirmText: '删掉',
      onConfirm: () => {
        addTombstone('anniversaries', id);
        state.anniversaries = state.anniversaries.filter((item) => item.id !== id);
        saveState();
        render();
        toast('纪念日已经删掉了');
      },
    });
  }

  /* ------------------------------------------------------------------------
     Actions
     ------------------------------------------------------------------------ */

  function planWish(id) {
    const wish = state.moments.find((item) => item.id === id && item.kind === 'wish');
    if (!wish || wish.wishStatus === 'planned') return;
    wish.wishStatus = 'planned';
    wish.updatedAt = isoNow();
    if (!saveState()) return;
    render();
    toast('安排上啦，等一个一起吃的时间');
  }

  function toggleFavorite(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    recipe.favorite = !recipe.favorite;
    recipe.updatedAt = isoNow();
    if (!saveState()) return;
    $$('[data-fav-id]').forEach((button) => {
      if (button.dataset.favId !== id) return;
      button.classList.toggle('is-fav', recipe.favorite);
      button.setAttribute('aria-pressed', String(recipe.favorite));
      button.setAttribute('aria-label', recipe.favorite ? '取消收藏' : '收藏');
      const label = button.querySelector('.fav-label');
      if (label) {
        label.textContent = recipe.favorite ? '已收藏' : '收藏';
        button.classList.toggle('btn-soft', recipe.favorite);
        button.classList.toggle('btn-ghost', !recipe.favorite);
        const heart = button.querySelector('svg.icon');
        if (heart) heart.classList.toggle('fill', recipe.favorite);
      }
    });
    toast(recipe.favorite ? '已放进收藏' : '已取消收藏');
  }

  function markCooked(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    recipe.cookedAt = new Date().toISOString();
    recipe.updatedAt = isoNow();
    if (!saveState()) return;
    $$('[data-cooked-id]').forEach((button) => {
      if (button.dataset.cookedId === id) {
        button.classList.add('is-done');
        button.innerHTML = `${icon('check')} 今天做过啦`;
      }
    });
    render();
    toast(`记下啦，今天做了 ${recipe.name}`);
  }

  function randomRecipe() {
    if (!state.recipes.length) {
      openRecipeModal();
      return;
    }
    let pool = state.recipes;
    if (pool.length > 1) {
      const current = currentDinner();
      pool = pool.filter((recipe) => !current || recipe.id !== current.id);
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (getRoute() === 'home') {
      ui.dinnerId = picked.id;
      render();
      toast('换好啦，今晚吃这个？');
    } else {
      openRecipeDetail(picked.id);
    }
  }

  function quickAdd() {
    const route = getRoute();
    if (route === 'recipes') openRecipeModal();
    else if (route === 'days') openAnnivModal();
    else if (ui.space === 'personal') openMomentModal(null, '', { space: 'personal', kind: 'note' });
    else openMomentModal();
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  function handleClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement || actionElement.hasAttribute('disabled')) return;
    const action = actionElement.dataset.action;

    if (action === 'go') {
      const route = actionElement.dataset.route || 'home';
      window.location.hash = route;
      return;
    }

    if (action === 'close-modal') {
      closeModal();
      return;
    }

    if (action === 'confirm-no') {
      closeConfirm();
      confirmCallback = null;
      return;
    }

    if (action === 'confirm-yes') {
      const callback = confirmCallback;
      confirmCallback = null;
      closeConfirm();
      if (typeof callback === 'function') callback();
      return;
    }

    if (action === 'quick-add') {
      quickAdd();
      return;
    }

    if (action === 'open-sync') {
      openSyncModal();
      return;
    }

    if (action === 'open-identity') {
      openIdentityModal();
      return;
    }

    if (action === 'choose-identity') {
      chooseIdentity(actionElement.dataset.identity);
      return;
    }

    if (action === 'open-sync-settings') {
      openSyncSettings();
      return;
    }

    if (action === 'sync-now') {
      if (syncing) return;
      syncNow();
      return;
    }

    if (action === 'test-sync') {
      testSyncFromForm();
      return;
    }

    if (action === 'check-update') {
      const form = $('#update-form');
      if (form && !saveUpdateForm(form, { silent: true })) return;
      checkForUpdates();
      return;
    }

    if (action === 'open-release-page') {
      openReleasePage();
      return;
    }

    if (action === 'download-update') {
      downloadUpdate();
      return;
    }

    if (action === 'install-downloaded') {
      installDownloaded();
      return;
    }

    if (action === 'add-moment') {
      openMomentModal(null, '', { space: ui.space === 'personal' ? 'personal' : 'shared', kind: ui.space === 'personal' ? 'note' : 'moment' });
      return;
    }

    if (action === 'add-wish') {
      openMomentModal(null, '', { space: 'shared', kind: 'wish' });
      return;
    }

    if (action === 'add-personal-note') {
      openMomentModal(null, '', { space: 'personal', kind: 'note' });
      return;
    }

    if (action === 'add-personal-gift') {
      openMomentModal(null, '', { space: 'personal', kind: 'gift' });
      return;
    }

    if (action === 'set-space') {
      const space = actionElement.dataset.space === 'personal' ? 'personal' : 'shared';
      ui.space = space;
      render();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    if (action === 'set-compose-space') {
      const space = actionElement.dataset.space === 'personal' ? 'personal' : 'shared';
      if (space === 'personal' && !sync.identity) {
        toast('先选一下你是哪一位');
        openIdentityModal();
        return;
      }
      const kindInput = $('#compose-kind');
      let kind = kindInput ? kindInput.value : 'moment';
      if (space === 'personal' && !['note', 'gift'].includes(kind)) kind = 'note';
      if (space === 'shared' && !['moment', 'wish'].includes(kind)) kind = 'moment';
      syncComposeUI(space, kind);
      return;
    }

    if (action === 'set-compose-kind') {
      const kind = actionElement.dataset.kind || 'moment';
      const space = $('#compose-space') ? $('#compose-space').value : 'shared';
      syncComposeUI(space, kind);
      return;
    }

    if (action === 'plan-wish') {
      planWish(actionElement.dataset.id);
      return;
    }

    if (action === 'add-recipe') {
      openRecipeModal();
      return;
    }

    if (action === 'add-anniv') {
      openAnnivModal();
      return;
    }

    if (action === 'edit-moment') {
      const space = actionElement.dataset.space === 'personal' ? 'personal' : 'shared';
      const list = space === 'personal'
        ? (sync.identity ? state.personal[sync.identity].moments : [])
        : state.moments;
      const moment = list.find((item) => item.id === actionElement.dataset.id);
      if (moment) openMomentModal(moment, '', { space });
      return;
    }

    if (action === 'delete-moment') {
      requestDeleteMoment(actionElement.dataset.id, actionElement.dataset.space);
      return;
    }

    if (action === 'filter-moments') {
      ui.momentFilter = ['all', 'me', 'partner'].includes(actionElement.dataset.filter)
        ? actionElement.dataset.filter
        : 'all';
      $$('#moment-filters .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.filter === ui.momentFilter);
      });
      applyMomentFilter();
      return;
    }

    if (action === 'open-recipe') {
      openRecipeDetail(actionElement.dataset.id);
      return;
    }

    if (action === 'edit-recipe') {
      const recipe = state.recipes.find((item) => item.id === actionElement.dataset.id);
      if (!recipe) return;
      closeModal();
      window.setTimeout(() => openRecipeModal(recipe), 40);
      return;
    }

    if (action === 'delete-recipe') {
      requestDeleteRecipe(actionElement.dataset.id);
      return;
    }

    if (action === 'toggle-favorite') {
      toggleFavorite(actionElement.dataset.favId);
      return;
    }

    if (action === 'mark-cooked') {
      markCooked(actionElement.dataset.cookedId);
      return;
    }

    if (action === 'random-recipe') {
      randomRecipe();
      return;
    }

    if (action === 'filter-tag') {
      ui.recipeTag = actionElement.dataset.tag || '全部';
      $$('#recipe-tags .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.tag === ui.recipeTag);
      });
      applyRecipeFilters();
      return;
    }

    if (action === 'set-theme') {
      const theme = actionElement.dataset.theme;
      if (!THEMES.includes(theme)) return;
      state.theme = theme;
      state.themeUpdatedAt = isoNow();
      saveState();
      applyTheme();
      $$('.theme-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.theme === theme);
      });
      toast(`换成了${THEME_NAMES[theme]}`);
      return;
    }

    if (action === 'dismiss-banner') {
      state.onboarded = true;
      saveState();
      render();
      toast('好，这里就是你们的啦');
      return;
    }

    if (action === 'export-data') {
      exportData();
      return;
    }

    if (action === 'import-data') {
      const input = $('#import-file');
      if (input) input.click();
      return;
    }

    if (action === 'reset-data') {
      openConfirm({
        title: '回到示例数据？',
        message: '你们记录的所有日常、菜谱和纪念日都会被清空，并换回最初的示例。这个操作不能撤销，建议先导出备份。',
        confirmText: '清空并恢复',
        onConfirm: () => {
          try { window.localStorage.removeItem(STORAGE_KEY); } catch (error) { /* noop */ }
          state = seedState();
          saveState();
          applyTheme();
          render();
          toast('已经恢复成示例数据');
        },
      });
      return;
    }

    if (action === 'edit-anniv') {
      const anniversary = state.anniversaries.find((item) => item.id === actionElement.dataset.id);
      if (anniversary) openAnnivModal(anniversary);
      return;
    }

    if (action === 'delete-anniv') {
      requestDeleteAnniversary(actionElement.dataset.id);
      return;
    }

    if (action === 'suggestion') {
      openMomentModal(null, actionElement.dataset.prompt || '');
      return;
    }

    if (action === 'set-author') {
      const group = actionElement.closest('.segmented');
      const form = actionElement.closest('form');
      if (!group || !form) return;
      $$('button', group).forEach((button) => button.classList.toggle('active', button === actionElement));
      const hidden = form.querySelector('input[name="author"]');
      if (hidden) hidden.value = actionElement.dataset.author === 'partner' ? 'partner' : 'me';
      return;
    }

    if (action === 'pick-mood') {
      const picker = actionElement.closest('.mood-picker');
      const form = actionElement.closest('form');
      if (!picker || !form) return;
      $$('.mood-option', picker).forEach((button) => button.classList.toggle('active', button === actionElement));
      const hidden = form.querySelector('input[name="mood"]');
      if (hidden) hidden.value = actionElement.dataset.mood || 'happy';
      return;
    }

    if (action === 'pick-emoji') {
      const picker = actionElement.closest('.emoji-picker');
      const form = actionElement.closest('form');
      if (!picker || !form) return;
      $$('.emoji-option', picker).forEach((button) => button.classList.toggle('active', button === actionElement));
      const hidden = form.querySelector('input.emoji-value');
      if (hidden) hidden.value = actionElement.dataset.emoji || '🍳';
      return;
    }

    if (action === 'photo-trigger') {
      const input = $('#moment-photo');
      if (input) input.click();
      return;
    }

    if (action === 'remove-photo') {
      updatePhotoZone('');
      toast('照片已移除');
      return;
    }

    if (action === 'add-ingredient') {
      const list = $('#ingredient-list');
      if (!list) return;
      list.insertAdjacentHTML('beforeend', ingredientRow());
      const input = list.lastElementChild && list.lastElementChild.querySelector('.ing-name');
      if (input) input.focus();
      return;
    }

    if (action === 'add-step') {
      const list = $('#step-list');
      if (!list) return;
      list.insertAdjacentHTML('beforeend', stepRow(''));
      renumberSteps();
      const input = list.lastElementChild && list.lastElementChild.querySelector('textarea');
      if (input) input.focus();
      return;
    }

    if (action === 'remove-row') {
      const row = actionElement.closest('.ingredient-row, .step-row');
      if (!row) return;
      const list = row.parentElement;
      row.remove();
      if (list && !list.children.length) {
        const isStep = list.id === 'step-list';
        list.insertAdjacentHTML('beforeend', isStep ? stepRow('') : ingredientRow());
      }
      renumberSteps();
    }
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!['moment-form', 'recipe-form', 'anniv-form', 'profile-form', 'sync-form', 'update-form'].includes(form.id)) return;
    event.preventDefault();
    if (form.id === 'moment-form') saveMoment(form);
    else if (form.id === 'recipe-form') saveRecipe(form);
    else if (form.id === 'anniv-form') saveAnniversary(form);
    else if (form.id === 'profile-form') saveProfile(form);
    else if (form.id === 'sync-form') saveSyncForm(form);
    else if (form.id === 'update-form') saveUpdateForm(form);
  }

  function handleInput(event) {
    if (event.target.id === 'recipe-search') {
      ui.recipeQuery = event.target.value;
      applyRecipeFilters();
      return;
    }
    if (event.target.id === 'moment-text') {
      const count = $('#moment-text-count');
      if (count) count.textContent = `${Array.from(event.target.value).length}/800`;
    }
  }

  function handleChange(event) {
    if (event.target.id === 'moment-photo') {
      handlePhoto(event.target);
      return;
    }
    if (event.target.id === 'import-file') {
      handleImport(event.target);
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if ($('#confirm').classList.contains('open')) {
        closeConfirm();
        confirmCallback = null;
      } else if ($('#modal').classList.contains('open')) {
        closeModal();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && $('#modal').classList.contains('open')) {
      const form = $('#modal-body form');
      if (form) {
        event.preventDefault();
        form.requestSubmit();
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const focused = document.activeElement;
      if (focused && focused.matches('[data-action]')
        && !['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName)) {
        event.preventDefault();
        focused.click();
      }
    }
  }

  function handleHashChange() {
    closeModal();
    closeConfirm();
    confirmCallback = null;
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  function init() {
    state = loadState();
    sync = loadSync();
    update = loadUpdate();
    saveSync();
    applyTheme();
    if (!window.location.hash) {
      try {
        window.history.replaceState(null, '', '#home');
      } catch (error) {
        // file:// in some browsers can reject replaceState; the default route is home.
      }
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('hashchange', handleHashChange);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && sync && sync.auto && isSyncConfigured()) {
        syncNow({ silent: true });
      }
    });
    render();
    updateSyncUI();
    updateUpdateUI();
    refreshCurrentVersion();
    if (sync.auto && isSyncConfigured()) {
      window.setTimeout(() => syncNow({ silent: true }), 1200);
    }
    if (isNativeApp() && update.auto && updateRepo()) {
      const lastCheck = new Date(update.lastCheckAt).getTime();
      if (!lastCheck || Number.isNaN(lastCheck) || Date.now() - lastCheck > UPDATE_CHECK_INTERVAL) {
        window.setTimeout(() => checkForUpdates({ silent: true }), 3000);
      }
    }
    window.setInterval(() => {
      if (!document.hidden && sync && sync.auto && isSyncConfigured()) {
        syncNow({ silent: true });
      }
    }, SYNC_POLL_MS);
  }

  init();
})();
