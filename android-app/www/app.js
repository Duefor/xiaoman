/* ==========================================================================
   小满 · 两个人的小小宇宙
   Local-first couple space: moments, cravings (dishes + places), anniversaries.
   Optional end-to-end sync through the couple's own Nutstore WebDAV.
   ========================================================================== */

'use strict';

(() => {
  const STORAGE_KEY = 'xiaoman.couple.v1';
  const SYNC_KEY = 'xiaoman.sync.v1';
  const UPDATE_KEY = 'xiaoman.update.v1';
  const NOTIFY_KEY = 'xiaoman.notify.v1';
  const APP_VERSION_NAME = '3.4.0';
  const APP_VERSION_CODE = 30400;
  const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
  const UPDATE_REPO_PLACEHOLDER = 'Duefor/xiaoman';
  const SCHEMA_VERSION = 5;
  const DEFAULT_SYNC_FOLDER = 'xiaoman';
  const SYNC_POLL_MS = 120000;
  const THEMES = ['coral', 'sage', 'sky', 'taro'];
  const THEME_NAMES = { coral: '珊瑚橘', sage: '鼠尾草', sky: '雾霾蓝', taro: '香芋紫' };
  const DIFFICULTIES = ['简单', '适中', '挑战'];
  const PLACE_SCENES = {
    home: { label: '家附近', emoji: '🏠', hint: '下楼就能去' },
    city: { label: '城里逛逛', emoji: '🌆', hint: '周末去' },
    trip: { label: '出去玩', emoji: '🧳', hint: '旅行时收藏的' },
    other: { label: '其他', emoji: '✨', hint: '先收着' },
  };
  const PLACE_STATUS = { wanted: '想去', visited: '已去过' };
  const NOTIFY_INTERVALS = [15, 30, 60, 120, 360];
  const DEFAULT_NAMES = { me: '小鸡毛', partner: '小白' };
  const DEFAULT_TOGETHER_DATE = '2024-01-22';
  const PROFILE_DEFAULTS_VERSION = 320;
  const UI_KEY = 'xiaoman.ui.v1';
  const MOTION_LEVELS = ['full', 'subtle', 'off'];
  const MOTION_NAMES = { full: '标准', subtle: '轻微', off: '关闭' };

  const MOODS = {
    happy: { label: '开心', emoji: '😊', color: '#e8b75e' },
    love: { label: '超爱你', emoji: '🥰', color: '#e2948a' },
    miss: { label: '想你', emoji: '🥺', color: '#a99bd0' },
    tired: { label: '有点累', emoji: '😮‍💨', color: '#91b3ad' },
    calm: { label: '平静', emoji: '🌿', color: '#93ad83' },
  };

  const REACTIONS = {
    hug: { emoji: '🤗', label: '抱抱' },
    miss: { emoji: '🥺', label: '想你' },
    laugh: { emoji: '😂', label: '笑了' },
  };

  const READ_KEY = 'xiaoman.read.v1';

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
  const ui = {
    momentFilter: 'all',
    momentQuery: '',
    wishTab: 'dishes',
    dishTag: '全部',
    dishQuery: '',
    placeScene: 'all',
    placeWho: 'all',
    placeQuery: '',
    dinnerId: null,
    heroAnimated: false,
    motion: 'subtle',
    lastRoute: '',
    lastSpace: '',
    returnRoute: 'home',
    settingsTab: 'basic',
    lastShared: 'home',
    historyMonth: '',
  };
  let lastFocused = null;
  let confirmCallback = null;
  let toastTimer = null;
  const read = { momentsAt: '', wishesAt: '', nudgesAt: '' };

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
      togetherDate: DEFAULT_TOGETHER_DATE,
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
          date: DEFAULT_TOGETHER_DATE,
          recurring: true,
          icon: '🌷',
          note: '从这一天开始，有了我们。',
        },
        {
          id: uid(),
          title: '小白的生日',
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
      nudges: [],
    };
    const now = isoNow();
    seeded.moments.forEach((item, index) => {
      item.id = `seed-moment-${index + 1}`;
      item.updatedAt = isoOr(item.date, now);
    });
    seeded.wishes = {
      dishes: seeded.recipes.map((item, index) => ({
        ...item,
        id: `seed-dish-${index + 1}`,
        wantedBy: ['me', 'partner'],
        updatedAt: isoOr(item.createdAt, now),
      })),
      places: [
        {
          id: 'seed-place-1',
          name: '楼下那家小面馆',
          scene: 'home',
          city: '',
          address: '小区北门对面，红招牌那家',
          mapUrl: '',
          dishes: ['牛肉面', '葱油饼'],
          tags: ['面食', '夜宵'],
          note: '下雨天不想做饭就来这儿。',
          photos: [],
          wantedBy: ['me', 'partner'],
          status: 'wanted',
          favorite: true,
          createdAt: isoDaysAgo(26, 19, 30),
          visitedAt: '',
          updatedAt: isoDaysAgo(26, 19, 30),
        },
        {
          id: 'seed-place-2',
          name: '老王烧烤',
          scene: 'city',
          city: '杭州',
          address: '胜利河美食街 18 号',
          mapUrl: '',
          dishes: ['烤茄子', '蒜蓉生蚝'],
          tags: ['烧烤', '夜宵'],
          note: '据说要排很久，得早点去。',
          photos: [],
          wantedBy: ['me'],
          status: 'wanted',
          favorite: false,
          createdAt: isoDaysAgo(12, 21, 10),
          visitedAt: '',
          updatedAt: isoDaysAgo(12, 21, 10),
        },
        {
          id: 'seed-place-3',
          name: '海边那家咖啡馆',
          scene: 'trip',
          city: '厦门',
          address: '环岛南路 2 号，二楼能看海',
          mapUrl: '',
          dishes: ['海盐拿铁', '柠檬塔'],
          tags: ['咖啡', '看海'],
          note: '去厦门的时候一定要再去一次。',
          photos: [],
          wantedBy: ['partner'],
          status: 'visited',
          favorite: true,
          createdAt: isoDaysAgo(72, 15, 20),
          visitedAt: isoDaysAgo(70, 16, 0),
          updatedAt: isoDaysAgo(70, 16, 0),
        },
      ],
    };
    delete seeded.recipes;
    seeded.anniversaries.forEach((item, index) => {
      item.id = `seed-anniv-${index + 1}`;
      item.updatedAt = isoOr(`${item.date}T00:00:00`, now);
    });
    seeded.profileUpdatedAt = '1970-01-01T00:00:00.000Z';
    seeded.namesUpdatedAt = { me: '1970-01-01T00:00:00.000Z', partner: '1970-01-01T00:00:00.000Z' };
    seeded.togetherDateUpdatedAt = '1970-01-01T00:00:00.000Z';
    seeded.profileDefaultsVersion = PROFILE_DEFAULTS_VERSION;
    seeded.themeUpdatedAt = '1970-01-01T00:00:00.000Z';
    seeded.updatedAt = now;
    seeded.tombstones = { moments: {}, dishes: {}, places: {}, anniversaries: {} };
    return seeded;
  }

  function normalizeComment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = String(raw.text || '').trim().slice(0, 200);
    if (!text) return null;
    return {
      id: String(raw.id || uid()),
      author: raw.author === 'partner' ? 'partner' : 'me',
      text,
      at: isoOr(raw.at, isoNow()),
    };
  }

  function normalizeComments(raw) {
    return Array.isArray(raw) ? raw.map(normalizeComment).filter(Boolean).slice(-50) : [];
  }

  function normalizeReactions(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    for (const role of ['me', 'partner']) {
      if (REACTIONS[source[role]]) result[role] = source[role];
    }
    return result;
  }

  function normalizeMoment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = String(raw.text || '').slice(0, 800);
    const photo = normalizePhoto(raw.photo);
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
      reactions: normalizeReactions(raw.reactions),
      comments: normalizeComments(raw.comments),
      lastActor: raw.lastActor === 'partner' ? 'partner' : (raw.lastActor === 'me' ? 'me' : ''),
      lastAction: ['post', 'edit', 'react', 'comment'].includes(raw.lastAction) ? raw.lastAction : '',
      updatedAt: isoOr(raw.updatedAt, isoOr(raw.date, isoNow())),
    };
  }

  function normalizeWantedBy(raw, fallback = []) {
    const source = Array.isArray(raw) ? raw : fallback;
    const result = [...new Set(source.filter((item) => item === 'me' || item === 'partner'))];
    return result.length ? result : ['me'];
  }

  function normalizePhoto(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') {
      return /^data:image\//i.test(raw) ? raw : '';
    }
    if (typeof raw === 'object' && raw.id) {
      return {
        id: String(raw.id),
        w: Math.max(0, Number(raw.w) || 0),
        h: Math.max(0, Number(raw.h) || 0),
      };
    }
    return '';
  }

  function normalizeDish(raw) {
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
      wantedBy: normalizeWantedBy(raw.wantedBy, ['me']),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      cookedAt: Number.isNaN(cookedAt.getTime()) ? '' : cookedAt.toISOString(),
      updatedAt: isoOr(raw.updatedAt, Number.isNaN(createdAt.getTime()) ? isoNow() : createdAt.toISOString()),
    };
  }

  function normalizePlace(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 40);
    if (!name) return null;
    const createdAt = new Date(raw.createdAt);
    const visitedAt = new Date(raw.visitedAt);
    const dishes = Array.isArray(raw.dishes)
      ? [...new Set(raw.dishes.map((item) => String(item || '').trim().slice(0, 24)).filter(Boolean))].slice(0, 12)
      : [];
    const tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map((tag) => String(tag || '').trim().slice(0, 12)).filter(Boolean))].slice(0, 6)
      : [];
    const photos = Array.isArray(raw.photos)
      ? raw.photos.map(normalizePhoto).filter((photo) => photo && typeof photo === 'object').slice(0, 3)
      : [];
    return {
      id: String(raw.id || uid()),
      name,
      scene: PLACE_SCENES[raw.scene] ? raw.scene : 'other',
      city: String(raw.city || '').trim().slice(0, 20),
      address: String(raw.address || '').trim().slice(0, 120),
      mapUrl: String(raw.mapUrl || '').trim().slice(0, 400),
      dishes,
      tags,
      note: String(raw.note || '').slice(0, 200),
      photos,
      wantedBy: normalizeWantedBy(raw.wantedBy, ['me']),
      status: raw.status === 'visited' ? 'visited' : 'wanted',
      favorite: Boolean(raw.favorite),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      visitedAt: Number.isNaN(visitedAt.getTime()) ? '' : visitedAt.toISOString(),
      updatedAt: isoOr(raw.updatedAt, Number.isNaN(createdAt.getTime()) ? isoNow() : createdAt.toISOString()),
    };
  }

  function normalizeNudge(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const at = new Date(raw.at || raw.createdAt);
    if (Number.isNaN(at.getTime())) return null;
    return {
      id: String(raw.id || uid()),
      from: raw.from === 'partner' ? 'partner' : 'me',
      at: at.toISOString(),
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
    const result = { moments: {}, dishes: {}, places: {}, anniversaries: {} };
    if (!raw || typeof raw !== 'object') return result;
    for (const type of Object.keys(result)) {
      const source = raw[type] || (type === 'dishes' ? raw.recipes : null);
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
    const profileUpdatedAt = isoOr(src.profileUpdatedAt, '1970-01-01T00:00:00.000Z');
    const namesUpdatedAtRaw = src.namesUpdatedAt && typeof src.namesUpdatedAt === 'object'
      ? src.namesUpdatedAt
      : {};
    const wishSrc = src.wishes && typeof src.wishes === 'object' ? src.wishes : {};
    const dishSource = Array.isArray(wishSrc.dishes)
      ? wishSrc.dishes
      : (Array.isArray(src.recipes) ? src.recipes : []);
    const placeSource = Array.isArray(wishSrc.places) ? wishSrc.places : [];
    return {
      version: SCHEMA_VERSION,
      onboarded: Boolean(src.onboarded),
      names: {
        me: String(names.me || base.names.me).trim().slice(0, 12) || base.names.me,
        partner: String(names.partner || base.names.partner).trim().slice(0, 12) || base.names.partner,
      },
      namesUpdatedAt: {
        me: isoOr(namesUpdatedAtRaw.me, profileUpdatedAt),
        partner: isoOr(namesUpdatedAtRaw.partner, profileUpdatedAt),
      },
      togetherDate: isValidDateStr(src.togetherDate) ? String(src.togetherDate) : base.togetherDate,
      togetherDateUpdatedAt: isoOr(src.togetherDateUpdatedAt, profileUpdatedAt),
      profileDefaultsVersion: Number(src.profileDefaultsVersion) || 0,
      theme: THEMES.includes(src.theme) ? src.theme : 'coral',
      profileUpdatedAt,
      themeUpdatedAt: isoOr(src.themeUpdatedAt, '1970-01-01T00:00:00.000Z'),
      moments: Array.isArray(src.moments) ? src.moments.map(normalizeMoment).filter(Boolean) : [],
      wishes: {
        dishes: dishSource.map(normalizeDish).filter(Boolean),
        places: placeSource.map(normalizePlace).filter(Boolean),
      },
      anniversaries: Array.isArray(src.anniversaries)
        ? src.anniversaries.map(normalizeAnniversary).filter(Boolean)
        : [],
      personal: {
        me: normalizePersonal(src.personal && src.personal.me),
        partner: normalizePersonal(src.personal && src.personal.partner),
      },
      nudges: Array.isArray(src.nudges) ? src.nudges.map(normalizeNudge).filter(Boolean).slice(0, 60) : [],
      tombstones: normalizeTombstones(src.tombstones),
      updatedAt: isoOr(src.updatedAt, isoNow()),
    };
  }

  function applyProfileDefaults(nextState) {
    if (Number(nextState.profileDefaultsVersion) >= PROFILE_DEFAULTS_VERSION) return nextState;
    const now = isoNow();
    nextState.names = { ...DEFAULT_NAMES };
    nextState.togetherDate = DEFAULT_TOGETHER_DATE;
    nextState.namesUpdatedAt = { me: now, partner: now };
    nextState.togetherDateUpdatedAt = now;
    nextState.profileUpdatedAt = now;
    nextState.profileDefaultsVersion = PROFILE_DEFAULTS_VERSION;
    nextState.updatedAt = now;
    return nextState;
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
      return applyProfileDefaults(normalizeState(JSON.parse(raw)));
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
      repo: 'Duefor/xiaoman',
      mirror: 'https://gh-proxy.com',
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
        repo: String(saved.repo || base.repo).trim(),
        mirror: String(saved.mirror || base.mirror).trim().replace(/\/+$/, ''),
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

  function mergeCollection(localList, remoteList, deletedMap) {
    const map = new Map();
    for (const item of [...remoteList, ...localList]) {
      const previous = map.get(item.id);
      if (!previous || recordTime(item) >= recordTime(previous)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values()).filter((item) => {
      const deletedAt = deletedMap[item.id];
      return !deletedAt || new Date(deletedAt).getTime() < recordTime(item);
    });
  }

  function mergeStates(localRaw, remoteRaw) {
    const local = normalizeState(localRaw);
    const remote = normalizeState(remoteRaw);
    const merged = normalizeState(local);
    const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
    merged.tombstones = tombstones;

    merged.moments = mergeCollection(local.moments, remote.moments, tombstones.moments);
    const localMomentMap = new Map(local.moments.map((moment) => [moment.id, moment]));
    const remoteMomentMap = new Map(remote.moments.map((moment) => [moment.id, moment]));
    merged.moments.forEach((moment) => {
      const localMoment = localMomentMap.get(moment.id);
      const remoteMoment = remoteMomentMap.get(moment.id);
      const commentMap = new Map();
      [...((localMoment && localMoment.comments) || []), ...((remoteMoment && remoteMoment.comments) || [])]
        .forEach((comment) => commentMap.set(comment.id, comment));
      moment.comments = [...commentMap.values()]
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .slice(-50);
    });
    merged.anniversaries = mergeCollection(local.anniversaries, remote.anniversaries, tombstones.anniversaries);
    merged.wishes = {
      dishes: mergeCollection(local.wishes.dishes, remote.wishes.dishes, tombstones.dishes),
      places: mergeCollection(local.wishes.places, remote.wishes.places, tombstones.places),
    };
    const nudgeMap = new Map();
    [...local.nudges, ...remote.nudges].forEach((nudge) => nudgeMap.set(nudge.id, nudge));
    merged.nudges = [...nudgeMap.values()]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 60);

    for (const role of ['me', 'partner']) {
      if (new Date(remote.namesUpdatedAt[role]) > new Date(local.namesUpdatedAt[role])) {
        merged.names[role] = remote.names[role];
        merged.namesUpdatedAt[role] = remote.namesUpdatedAt[role];
      }
    }
    if (new Date(remote.togetherDateUpdatedAt) > new Date(local.togetherDateUpdatedAt)) {
      merged.togetherDate = remote.togetherDate;
      merged.togetherDateUpdatedAt = remote.togetherDateUpdatedAt;
    }
    merged.profileUpdatedAt = new Date(remote.profileUpdatedAt) > new Date(local.profileUpdatedAt)
      ? remote.profileUpdatedAt
      : local.profileUpdatedAt;
    merged.profileDefaultsVersion = Math.max(
      Number(local.profileDefaultsVersion) || 0,
      Number(remote.profileDefaultsVersion) || 0
    );
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
      { moments: local.tombstones },
      { moments: remote.tombstones },
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
      tombstones: pruneTombstones({ moments: tombstones }).moments,
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
        namesUpdatedAt: state.namesUpdatedAt,
        togetherDate: state.togetherDate,
        togetherDateUpdatedAt: state.togetherDateUpdatedAt,
        profileDefaultsVersion: state.profileDefaultsVersion,
        theme: state.theme,
        profileUpdatedAt: state.profileUpdatedAt,
        themeUpdatedAt: state.themeUpdatedAt,
        moments: state.moments,
        wishes: state.wishes,
        anniversaries: state.anniversaries,
        nudges: state.nudges,
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
      throw new Error(`读取我的小岛失败（HTTP ${download.status}）`);
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
        throw new Error('我的小岛上传失败：先在坚果云新建 xiaoman 文件夹');
      }
      throw new Error(`我的小岛上传失败（HTTP ${upload.status}）`);
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
      await uploadQueuedPhotos();

      sync.lastSyncAt = isoNow();
      sync.lastError = '';
      saveSync();
      updateSyncUI();
      syncNotifyConfig();
      syncReminderConfig();
      maybeAskNotifyPermission();
      if (!options.silent) {
        toast(sync.identity ? '同步完成，共享空间和小岛都合在一起了' : '共享空间已同步；选择身份后才会同步小岛');
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
    if (!sync.identity) return '共享空间已开启；选择身份后同步小岛';
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
    const blocking = !active;
    openModal({
      eyebrow: 'WHO ARE YOU',
      title: blocking ? '先选一下，你是哪一位？' : '你是哪一位？',
      subtitle: blocking
        ? '选好之后，这台手机就记住你了。之后记录小事不用再选，随时可以在「我的小岛」里切换。'
        : '身份只影响「我的小岛」；共享空间两边完全一样。',
      body: `<div class="identity-choice-grid">
        ${['me', 'partner'].map((identity) => `<button class="identity-choice ${active === identity ? 'active' : ''}" type="button" data-action="choose-identity" data-identity="${identity}">
          ${avatarFor(identity)}
          <span class="identity-choice-copy"><strong>我是 ${esc(nameOf(identity))}</strong><small>${identity === 'me' ? '我的小岛' : 'TA 的小岛'}只在这个身份下出现</small></span>
          ${active === identity ? icon('check') : icon('chevron')}
        </button>`).join('')}
      </div>
      <p class="sync-note">${blocking ? '这一步只需要一次。选好之后，加号记录会自动用你的身份。' : '切换身份后，小岛上的内容会跟着换；共享空间不受影响。'}</p>`,
    });
    const modal = $('#modal');
    if (modal) {
      modal.classList.toggle('blocking', blocking);
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) closeBtn.classList.toggle('hidden', blocking);
    }
  }

  function identityBanner() {
    if (sync && sync.identity) return '';
    return `<div class="identity-banner">
      ${icon('users')}
      <p>先告诉小满，你是哪一位？这样「我的小岛」才不会和 TA 的混在一起。</p>
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
    syncNotifyConfig();
    toast(`好，你是 ${nameOf(identity)}；小岛只会在你这边出现`);
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
      <p>${esc(sync.folder)} 文件夹 · 共享空间和各自的小岛分开同步。</p>
      <div class="sync-status-line ${sync.lastError ? 'is-error' : ''}" id="sync-modal-status">${esc(syncStatusText())}</div>
    </div>
    <div class="sync-modal-actions">
      <button class="btn btn-primary" type="button" data-action="sync-now" ${syncing ? 'disabled' : ''}>${icon('refresh')} 立即同步</button>
      <button class="btn btn-ghost" type="button" data-action="open-sync-settings">同步设置</button>
    </div>
    <p class="sync-note">共享空间是 ${esc(sync.folder)}/shared.json，小岛是 ${esc(sync.folder)}/me.json 或 her.json；照片在 ${esc(sync.folder)}/photos/。</p>`;
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
    openSettings('sync');
  }

  function syncHealthHTML() {
    const configured = isSyncConfigured();
    const pending = photoQueue().length;
    const status = syncing
      ? '正在同步'
      : (sync.lastError ? '同步异常' : (configured ? (sync.lastSyncAt ? '正常' : '等待第一次同步') : '未开启'));
    const tone = sync.lastError ? 'is-bad' : (configured && sync.lastSyncAt ? 'is-good' : '');
    return `<div class="sync-health ${tone}">
      <div class="health-item"><span>同步状态</span><strong>${esc(status)}</strong></div>
      <div class="health-item"><span>上次同步</span><strong>${esc(sync.lastSyncAt ? formatSyncTime(sync.lastSyncAt) : '还没同步过')}</strong></div>
      <div class="health-item ${pending ? 'is-warn' : ''}"><span>待上传照片</span><strong>${pending} 张</strong></div>
      <div class="health-item"><span>云端文件夹</span><strong>${esc(sync.folder || '未填写')}</strong></div>
    </div>
    ${sync.lastError ? `<p class="sync-error-note">${icon('cloud')} ${esc(sync.lastError)}</p>` : ''}`;
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
          <small>身份只影响「我的小岛」；共享空间两边一样</small>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="switch-identity">${sync && sync.identity ? '切换' : '选择'}</button>
      </div>
      ${syncHealthHTML()}
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
      <p class="sync-note">云端文件夹里会自动放 shared.json、me.json、her.json；照片单独放在 photos/ 里，都不用手动改。</p>
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
    const footer = $('#app-version-label');
    if (footer) footer.textContent = `v${currentVersionName}`;
    const settingsLabel = $('#update-current-version');
    if (settingsLabel) settingsLabel.textContent = `v${currentVersionName}`;
    const menuVersion = $('#avatar-menu-version');
    if (menuVersion) menuVersion.textContent = `v${currentVersionName}`;
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
     Notifications (local notifications driven by background WebDAV checks)
     ------------------------------------------------------------------------ */

  let notify = null;

  function defaultNotify() {
    return { enabled: true, interval: 30, quietStart: '23:00', quietEnd: '08:00', prompted: false, reminders: true };
  }

  function loadNotify() {
    const base = defaultNotify();
    try {
      const raw = window.localStorage.getItem(NOTIFY_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      const legacy = !('prompted' in saved);
      return {
        ...base,
        ...saved,
        enabled: legacy ? true : Boolean(saved.enabled),
        prompted: legacy ? false : Boolean(saved.prompted),
        reminders: saved.reminders === undefined ? true : Boolean(saved.reminders),
        interval: NOTIFY_INTERVALS.includes(Number(saved.interval)) ? Number(saved.interval) : 30,
      };
    } catch (error) {
      return base;
    }
  }

  function saveNotify() {
    try {
      window.localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify));
    } catch (error) {
      // notifications settings are best effort
    }
    syncNotifyConfig();
    syncReminderConfig();
  }

  function notifyPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.XiaomanNotify;
    } catch (error) {
      return null;
    }
  }

  async function syncNotifyConfig() {
    if (!isNativeApp()) return;
    const plugin = notifyPlugin();
    if (!plugin || !notify) return;
    const configured = isSyncConfigured();
    try {
      await plugin.configure({
        enabled: Boolean(notify.enabled && configured),
        sharedUrl: configured ? remoteFileUrl('shared') : '',
        auth: configured ? basicAuth(sync.username, sync.password) : '',
        interval: notify.interval,
        quietStart: notify.quietStart,
        quietEnd: notify.quietEnd,
        baseline: state.updatedAt || '',
        identity: sync.identity || 'me',
      });
    } catch (error) {
      // Native scheduling is best effort.
    }
  }

  async function syncReminderConfig() {
    if (!isNativeApp()) return;
    const plugin = notifyPlugin();
    if (!plugin || typeof plugin.configureReminders !== 'function' || !notify) return;
    const items = state.anniversaries.map((item) => ({
      title: item.title,
      date: item.date,
      recurring: Boolean(item.recurring),
    }));
    try {
      await plugin.configureReminders({
        enabled: Boolean(notify.enabled && notify.reminders !== false),
        items,
      });
    } catch (error) {
      // 提醒调度是尽力而为
    }
  }

  async function refreshNotifyPermission() {
    const label = $('#notify-permission');
    if (!label) return;
    const plugin = notifyPlugin();
    if (!isNativeApp() || !plugin) {
      label.textContent = '网页版不支持系统通知；装到手机上才会生效';
      return;
    }
    try {
      const result = await plugin.checkPermission();
      const granted = Boolean(result && result.granted);
      label.textContent = granted ? '通知权限已开启' : '还没有通知权限，点下面的按钮开启';
      label.classList.toggle('is-error', !granted);
    } catch (error) {
      label.textContent = '无法读取通知权限';
    }
  }

  async function requestNotifyPermission() {
    const plugin = notifyPlugin();
    if (!isNativeApp() || !plugin) {
      toast('网页版不支持系统通知，装到手机上试试');
      return;
    }
    try {
      const result = await plugin.requestPermission();
      if (result && result.granted) toast('通知权限开好啦');
      else toast('没有拿到通知权限，可以去系统设置里手动打开');
    } catch (error) {
      toast('申请通知权限失败');
    }
    refreshNotifyPermission();
  }

  async function testNotification() {
    const plugin = notifyPlugin();
    if (!isNativeApp() || !plugin) {
      toast('装到手机上才能发系统通知');
      return;
    }
    try {
      await plugin.notify({ title: '小满', body: '这是一条测试通知，看到就说明能用了。', route: 'home' });
      toast('发出去啦，看看通知栏');
    } catch (error) {
      toast('发通知失败，先检查权限');
    }
  }

  async function maybeAskNotifyPermission() {
    if (!isNativeApp() || !notify || !notify.enabled || !isSyncConfigured()) return;
    const plugin = notifyPlugin();
    if (!plugin || notify.prompted) return;
    let granted = false;
    try {
      const result = await plugin.checkPermission();
      granted = Boolean(result && result.granted);
    } catch (error) {
      return;
    }
    notify.prompted = true;
    saveNotify();
    if (granted) return;
    openConfirm({
      title: '开启通知提醒？',
      message: 'TA 有新动态时，手机会在通知栏提醒你。需要允许一次通知权限，之后就能在设置里随时关掉。',
      confirmText: '去开启',
      danger: false,
      onConfirm: () => { requestNotifyPermission(); },
    });
  }

  function settingsNotifyHTML() {
    const config = notify || defaultNotify();
    return `<section class="settings-panel">
      <h2>手机通知</h2>
      <p class="settings-note">TA 那边有新动态时，让手机在通知栏轻轻提醒你一下。</p>
      <form id="notify-form">
        <label class="check-row">
          <input type="checkbox" id="notify-enabled" ${config.enabled ? 'checked' : ''}>
          <span>有新动态时通知我</span>
        </label>
        <label class="check-row" style="margin-top:8px">
          <input type="checkbox" id="notify-reminders" ${config.reminders !== false ? 'checked' : ''}>
          <span>纪念日提前提醒（7 / 3 / 1 天和当天早上）</span>
        </label>
        <div class="form-grid" style="margin-top:14px">
          <div class="field">
            <label for="notify-interval">后台检查间隔</label>
            <select class="select" id="notify-interval">
              ${NOTIFY_INTERVALS.map((minutes) => `<option value="${minutes}" ${config.interval === minutes ? 'selected' : ''}>${minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>免打扰</label>
            <div class="quiet-row">
              <input class="input" id="notify-quiet-start" type="time" value="${esc(config.quietStart)}">
              <span>到</span>
              <input class="input" id="notify-quiet-end" type="time" value="${esc(config.quietEnd)}">
            </div>
          </div>
        </div>
        <div class="sync-status-box" id="notify-permission-box">
          <span class="sync-dot"></span>
          <div><strong>系统通知权限</strong><span id="notify-permission">检测中…</span></div>
        </div>
        <div class="sync-actions">
          <button class="btn btn-ghost" type="button" data-action="request-notify-permission">开启通知权限</button>
          <button class="btn btn-ghost" type="button" data-action="test-notify">发一条测试通知</button>
          <button class="btn btn-primary" type="submit">保存通知设置</button>
        </div>
      </form>
      <p class="sync-note">没有服务器，所以是「定期去坚果云看一眼」：最快 15 分钟一次，系统省电时可能更晚。只在发现 TA 的新内容时提醒。</p>
      <p class="sync-note">纪念日提醒会在每天早 9 点检查一次，提前 7 / 3 / 1 天和当天提醒；关掉上面的通知总开关，提醒也会一起停。</p>
      <p class="sync-note">先在同步设置里填好坚果云，通知才有内容可看。</p>
    </section>`;
  }

  function saveNotifyForm(form) {
    notify.enabled = Boolean(form.querySelector('#notify-enabled').checked);
    notify.reminders = Boolean(form.querySelector('#notify-reminders').checked);
    const interval = Number(form.querySelector('#notify-interval').value);
    notify.interval = NOTIFY_INTERVALS.includes(interval) ? interval : 30;
    notify.quietStart = String(form.querySelector('#notify-quiet-start').value || '23:00');
    notify.quietEnd = String(form.querySelector('#notify-quiet-end').value || '08:00');
    saveNotify();
    toast(notify.enabled ? '通知开好啦，有新动态会提醒你' : '通知已关闭');
    if (notify.enabled && isNativeApp()) {
      const plugin = notifyPlugin();
      if (plugin && typeof plugin.checkPermission === 'function') {
        plugin.checkPermission().then((result) => {
          if (!result || !result.granted) requestNotifyPermission();
        }).catch(() => {});
      }
    }
  }

  function confirmSwitchIdentity() {
    if (!sync.identity) {
      openIdentityModal();
      return;
    }
    const other = sync.identity === 'me' ? 'partner' : 'me';
    openConfirm({
      title: `切换到「${nameOf(other)}」？`,
      message: `切换后，这台手机会变成 ${nameOf(other)} 的身份，小岛上的内容也会换成 TA 的。共享空间不受影响，随时可以再切回来。`,
      confirmText: '确认切换',
      danger: false,
      onConfirm: async () => {
        sync.identity = other;
        saveSync();
        closeModal();
        render();
        updateSyncUI();
        syncNotifyConfig();
        toast(`好，现在你是 ${nameOf(other)}`);
        if (isSyncConfigured()) await syncNow({ silent: true });
      },
    });
  }

  async function openPlaceMap(id) {
    const place = state.wishes.places.find((item) => item.id === id);
    if (!place) return;
    const query = encodeURIComponent([place.name, place.city, place.address].filter(Boolean).join(' '));
    const url = place.mapUrl || `geo:0,0?q=${query}`;
    const plugin = notifyPlugin();
    if (isNativeApp() && plugin) {
      try {
        await plugin.openExternal({ url });
        return;
      } catch (error) {
        toast('没有找到能打开这个链接的应用');
        return;
      }
    }
    if (/^https?:/i.test(url)) openExternal(url);
    else toast('装到手机上就可以直接跳地图了');
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

  const RECENT_DAYS = 3;

  function recentCutoff() {
    const start = todayStart();
    start.setDate(start.getDate() - (RECENT_DAYS - 1));
    return start;
  }

  function recentMoments() {
    const cutoff = recentCutoff().getTime();
    return sortedMoments().filter((moment) => {
      const time = new Date(moment.date).getTime();
      return !Number.isNaN(time) && time >= cutoff;
    });
  }

  function olderMoments() {
    const cutoff = recentCutoff().getTime();
    return sortedMoments().filter((moment) => {
      const time = new Date(moment.date).getTime();
      return Number.isNaN(time) || time < cutoff;
    });
  }

  function dishPalette(dish) {
    const text = `${dish.name}${dish.emoji}`;
    const sum = Array.from(text).reduce((total, char) => total + (char.codePointAt(0) || 0), 0);
    return `palette-${sum % 6}`;
  }

  function dailyDish() {
    const dishes = state.wishes.dishes;
    if (!dishes.length) return null;
    return dishes[dayOfYear() % dishes.length];
  }

  function currentDinner() {
    return state.wishes.dishes.find((dish) => dish.id === ui.dinnerId) || dailyDish();
  }

  function sortedPlaces() {
    return [...state.wishes.places].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'wanted' ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function placeScene(scene) {
    return PLACE_SCENES[scene] || PLACE_SCENES.other;
  }

  function wantedByLabel(place) {
    const names = (place.wantedBy || []).map((role) => nameOf(role));
    if (names.length >= 2) return '都想吃';
    return names.length ? `${names[0]}想吃` : '还没人选';
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

  function loadUiPrefs() {
    try {
      const raw = window.localStorage.getItem(UI_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (MOTION_LEVELS.includes(saved.motion)) ui.motion = saved.motion;
    } catch (error) {
      // keep defaults
    }
  }

  function loadRead() {
    try {
      const raw = window.localStorage.getItem(READ_KEY);
      if (!raw) {
        const now = isoNow();
        read.momentsAt = now;
        read.wishesAt = now;
        read.nudgesAt = now;
        saveRead();
        return;
      }
      const saved = JSON.parse(raw);
      read.momentsAt = isoOr(saved.momentsAt, '1970-01-01T00:00:00.000Z');
      read.wishesAt = isoOr(saved.wishesAt, '1970-01-01T00:00:00.000Z');
      read.nudgesAt = isoOr(saved.nudgesAt, '1970-01-01T00:00:00.000Z');
    } catch (error) {
      // keep defaults
    }
  }

  function saveRead() {
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify(read));
    } catch (error) {
      // read markers are best effort
    }
  }

  function markRead(section) {
    if (!['moments', 'wishes', 'nudges'].includes(section)) return;
    read[`${section}At`] = isoNow();
    saveRead();
  }

  function unreadState() {
    const me = sync.identity || 'me';
    const other = me === 'me' ? 'partner' : 'me';
    const since = (value) => new Date(value || '1970-01-01T00:00:00.000Z').getTime();
    const momentsAt = since(read.momentsAt);
    const wishesAt = since(read.wishesAt);
    const nudgesAt = since(read.nudgesAt);
    const moments = state.moments.some((moment) => {
      if (since(moment.updatedAt || moment.date) <= momentsAt) return false;
      if (moment.author !== me) return true;
      return (moment.comments || []).some((comment) => comment.author !== me && since(comment.at) > momentsAt);
    });
    const dishes = state.wishes.dishes.some((dish) => (dish.wantedBy || []).includes(other)
      && since(dish.updatedAt) > wishesAt);
    const places = state.wishes.places.some((place) => (place.wantedBy || []).includes(other)
      && since(place.updatedAt) > wishesAt);
    const nudges = state.nudges.some((nudge) => nudge.from !== me && since(nudge.at) > nudgesAt);
    return { moments, wishes: dishes || places, nudges };
  }

  function updateBadges() {
    if (!state) return;
    const unread = unreadState();
    $$('[data-nav="moments"]').forEach((link) => link.classList.toggle('has-unread', unread.moments));
    $$('[data-nav="wishes"]').forEach((link) => link.classList.toggle('has-unread', unread.wishes));
    $$('[data-nav="home"]').forEach((link) => link.classList.toggle('has-unread', unread.nudges));
  }

  function saveUiPrefs() {
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify({ motion: ui.motion }));
    } catch (error) {
      // UI preferences are best-effort.
    }
  }

  function applyMotion() {
    document.documentElement.dataset.motion = MOTION_LEVELS.includes(ui.motion) ? ui.motion : 'subtle';
  }

  function updateAvatar() {
    const identity = sync && sync.identity;
    const ownName = identity ? nameOf(identity) : state.names.me;
    const letter = initialOf(ownName) || '小';
    const topbar = $('#topbar-avatar-letter');
    const sidebar = $('#sidebar-avatar-letter');
    const menuAvatar = $('#avatar-menu-avatar');
    if (topbar) topbar.textContent = letter;
    if (sidebar) sidebar.textContent = letter;
    if (menuAvatar) {
      menuAvatar.textContent = letter;
      menuAvatar.className = `avatar ${identity || 'me'}`;
    }
    const menuName = $('#avatar-menu-name');
    if (menuName) menuName.textContent = ownName;
    const menuSub = $('#avatar-menu-sub');
    if (menuSub) menuSub.textContent = identity ? `我是 ${ownName}` : '还没选择身份';
    const version = $('#avatar-menu-version');
    if (version) version.textContent = `v${currentVersionName}`;
    const spaceLabel = $('#avatar-space-label');
    if (spaceLabel) spaceLabel.textContent = getRoute() === 'me' ? '回到我们的空间' : '我的小岛';
    const spaceIcon = $('#avatar-space-icon');
    if (spaceIcon) spaceIcon.setAttribute('href', getRoute() === 'me' ? '#i-heart' : '#i-island');
    $$('.avatar-btn').forEach((button) => {
      button.classList.toggle('active', isSettingsOpen());
    });
  }

  function updateSpaceToggle() {
    const personal = getRoute() === 'me';
    $$('.space-toggle').forEach((button) => {
      button.classList.toggle('is-personal', personal);
      button.setAttribute('aria-label', personal ? '切换到我们的空间' : '切换到我的小岛');
      button.setAttribute('title', personal ? '回到我们的空间' : '去我的小岛');
      const label = button.querySelector('.space-toggle-label');
      if (label) label.textContent = personal ? '我的小岛' : '我们的空间';
      const use = button.querySelector('use');
      if (use) use.setAttribute('href', personal ? '#i-island' : '#i-heart');
    });
  }

  function switchSpace() {
    if (getRoute() === 'me') {
      window.location.hash = ui.lastShared && ui.lastShared !== 'me' ? ui.lastShared : 'home';
    } else {
      ui.lastShared = getRoute() === 'history' ? 'moments' : getRoute();
      window.location.hash = 'me';
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toggleAvatarMenu(force) {
    const menu = $('#avatar-menu');
    if (!menu) return;
    const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    if (open) updateAvatar();
    menu.classList.toggle('hidden', !open);
    $$('#topbar-avatar-btn, #sidebar-avatar-btn').forEach((button) => {
      button.setAttribute('aria-expanded', String(open));
    });
    if (open) {
      const first = menu.querySelector('button');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function closeAvatarMenu() {
    toggleAvatarMenu(false);
  }

  function backFromSettings() {
    closeAvatarMenu();
    if (ui.returnRoute && ui.returnRoute !== 'settings' && ui.returnRoute !== getRoute()) {
      window.location.hash = ui.returnRoute;
    } else {
      window.location.hash = 'home';
    }
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
    const navRoute = route === 'history' ? 'moments' : route;
    $$('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === navRoute;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function updateFab(route) {
    const fab = $('#fab');
    if (fab) fab.classList.toggle('hidden', route !== 'home');
  }

  function getRoute() {
    const hash = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (hash === 'recipes') return 'wishes';
    return ['home', 'moments', 'wishes', 'days', 'me', 'history', 'album'].includes(hash) ? hash : 'home';
  }

  function updateTitle(route) {
    const titles = {
      home: '小满 · 两个人的小小宇宙',
      moments: '日常 · 小满',
      history: '历史记录 · 小满',
      wishes: '想吃 · 小满',
      days: '纪念日 · 小满',
      me: '我的小岛 · 小满',
      album: '我们的相册 · 小满',
    };
    document.title = titles[route] || titles.home;
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */

  function render() {
    const route = getRoute();
    const routeChanged = Boolean(ui.lastRoute && ui.lastRoute !== route);
    applyTheme();
    updateSidebar();
    updateAvatar();
    updateSpaceToggle();
    document.body.classList.toggle('island-mode', route === 'me');
    setActiveNav(route);
    if (route === 'moments') markRead('moments');
    if (route === 'wishes') markRead('wishes');
    updateBadges();
    updateFab(route);
    updateTitle(route);

    const views = {
      home: homeView,
      moments: momentsView,
      history: historyView,
      wishes: wishesView,
      days: daysView,
      me: meView,
      album: albumView,
    };

    const view = $('#view');
    view.innerHTML = (views[route] || homeView)();
    if (routeChanged) {
      view.classList.remove('view-enter');
      void view.offsetWidth;
      view.classList.add('view-enter');
    }
    ui.lastRoute = route;
    if (route === 'moments' || route === 'history') applyMomentFilter();
    if (route === 'wishes') applyWishFilters();
    if (route === 'home') {
      animateHeroDays();
      maybeCelebrate();
    }
    hydratePhotos();
    if (isSettingsOpen()) renderSettingsContent();
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
      <p>这是给你们俩的小空间。先去 <button class="text-link" type="button" data-action="open-settings">设置</button> 里换成你们的名字和在一起的日子吧。</p>
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
    const wish = moment.kind === 'wish';
    return `<article class="moment-mini">
      <div class="moment-mini-head">
        ${avatarFor(moment.author, 'tiny')}
        <span class="mini-name">${esc(nameOf(moment.author))}</span>
        <span class="mini-time">${esc(fmtMomentTime(moment.date))}</span>
      </div>
      <p>${wish ? `<span class="mini-wish">${esc(moment.foodEmoji || '🍲')} 想吃</span>` : ''}${esc(moment.text)}</p>
      ${photoImg(moment.photo, 'mini-photo')}
      <div class="moment-mini-foot">${moodChip(moment)}</div>
    </article>`;
  }

  function dinnerPanel(dish) {
    if (!dish) {
      return `<section class="side-panel dinner-panel rise" style="--d:2">
        ${sectionHead('今晚吃什么', '<span class="mini-time">灵感</span>')}
        ${emptyState('🍳', '还没有想吃的菜', '先收藏一道你们想一起做的菜吧。', `<button class="btn btn-primary btn-sm" data-action="add-dish">${icon('plus')} 加一道想吃的</button>`, true)}
      </section>`;
    }
    return `<section class="side-panel dinner-panel rise" style="--d:2">
      ${sectionHead('今晚吃什么', '<span class="mini-time">今日灵感</span>')}
      <div class="dinner-emoji">${esc(dish.emoji || '🍳')}</div>
      <h3 class="dinner-name">${esc(dish.name)}</h3>
      <p class="dinner-desc">${esc(dish.desc || '一起做一顿好吃的。')}</p>
      <div class="dinner-meta">
        <span>${icon('clock')}${dish.time} 分钟</span>
        <span>${esc(dish.difficulty)}</span>
        ${dish.favorite ? '<span>♥ 收藏</span>' : ''}
      </div>
      <div class="dinner-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="random-dish">${icon('dice')} 换一道</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="open-dish" data-id="${esc(dish.id)}">看做法</button>
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

  function photoImg(photo, className, alt = '照片') {
    if (!photo) return '';
    if (typeof photo === 'string') {
      return `<img class="${className}" src="${photo}" alt="${esc(alt)}">`;
    }
    return `<img class="${className} photo-pending" data-photo-id="${esc(photo.id)}" alt="${esc(alt)}">`;
  }

  function reactionRow(moment) {
    const me = sync.identity || 'me';
    const other = me === 'me' ? 'partner' : 'me';
    const reactions = moment.reactions || {};
    const mine = reactions[me];
    const theirs = reactions[other];
    return `<div class="reaction-row">
      ${Object.entries(REACTIONS).map(([key, item]) => `<button class="reaction-btn ${mine === key ? 'active' : ''}" type="button" data-action="react-moment" data-id="${esc(moment.id)}" data-react="${key}" aria-label="${item.label}" aria-pressed="${mine === key}">
        <span>${item.emoji}</span><small>${item.label}</small>
      </button>`).join('')}
      ${theirs ? `<span class="reaction-partner" title="${esc(nameOf(other))} 回应了">${avatarFor(other, 'tiny')} ${REACTIONS[theirs].emoji}</span>` : ''}
    </div>`;
  }

  function latestPartnerNudge() {
    const me = sync.identity || 'me';
    const since = new Date(read.nudgesAt || '1970-01-01T00:00:00.000Z').getTime();
    return state.nudges
      .filter((nudge) => nudge.from !== me && new Date(nudge.at).getTime() > since)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
  }

  function nudgeBanner() {
    const nudge = latestPartnerNudge();
    if (!nudge) return '';
    return `<div class="nudge-banner">
      <span class="nudge-heart">💗</span>
      <div class="nudge-copy">
        <strong>${esc(nameOf(nudge.from))} 想你了一下</strong>
        <small>${esc(fmtMomentTime(nudge.at))}</small>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" data-action="reply-nudge">回一个</button>
      <button class="icon-btn" type="button" data-action="dismiss-nudge" aria-label="知道了">${icon('close')}</button>
    </div>`;
  }

  function nudgeBar() {
    return `<div class="nudge-bar">
      <button class="nudge-send" type="button" data-action="send-nudge">💗 想你一下</button>
      <span>不用等回复，TA 下次同步会看到</span>
    </div>`;
  }

  function onThisDayMoments() {
    const today = new Date();
    return sortedMoments().filter((moment) => {
      const date = new Date(moment.date);
      return !Number.isNaN(date.getTime())
        && date.getFullYear() < today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    }).slice(0, 2);
  }

  function onThisDaySection() {
    const items = onThisDayMoments();
    if (!items.length) return '';
    return `<section class="onthisday rise">
      <div class="onthisday-head">${icon('sparkles')} 那年今天 <span>${items.length} 条回忆</span></div>
      ${items.map((moment) => `<button class="onthisday-card" type="button" data-action="open-memory" data-id="${esc(moment.id)}">
        ${photoImg(moment.photo, 'onthisday-photo', '那年的照片')}
        <span class="onthisday-copy">
          <small>${new Date(moment.date).getFullYear()} 年 · ${esc(nameOf(moment.author))}</small>
          <strong>${esc(moment.text || '一张照片')}</strong>
        </span>
        ${icon('chevron')}
      </button>`).join('')}
    </section>`;
  }

  function albumMonthLabel(key) {
    if (key === 'unknown') return '更早';
    const parts = String(key).split('-');
    return `${parts[0]}年${Number(parts[1])}月`;
  }

  function albumView() {
    const items = sortedMoments().filter((moment) => Boolean(normalizePhoto(moment.photo)));
    const groups = new Map();
    items.forEach((moment) => {
      const date = new Date(moment.date);
      const key = Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(moment);
    });
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR PHOTO ALBUM</p>
        <h1 class="page-title">我们的相册</h1>
        <p class="page-sub">${items.length ? `${items.length} 张照片，按月份收好。` : '记录时加一张照片，就会出现在这里。'}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="go" data-route="home">${icon('home')}<span class="btn-label">回首页</span></button>
        <button class="btn btn-primary" type="button" data-action="add-moment">${icon('plus')}<span class="btn-label">加一张</span></button>
      </div>
    </header>
    ${items.length
      ? [...groups.entries()].map(([key, list]) => `<section class="album-group">
          <h3 class="album-month">${albumMonthLabel(key)} <small>${list.length} 张</small></h3>
          <div class="album-grid">
            ${list.map((moment) => `<button class="album-item" type="button" data-action="open-memory" data-id="${esc(moment.id)}" aria-label="查看照片">
              ${photoImg(moment.photo, 'album-photo', '照片')}
              <span class="album-date">${new Date(moment.date).getDate()} 日</span>
            </button>`).join('')}
          </div>
        </section>`).join('')
      : emptyState('📷', '相册还是空的', '记录小事时加一张照片，就会自动收进这里。', `<button class="btn btn-primary btn-sm" data-action="add-moment">${icon('plus')} 加一张</button>`)}
    `;
  }

  function openMemory(id) {
    const moment = state.moments.find((item) => item.id === id);
    if (!moment) return;
    const date = new Date(moment.date);
    const label = Number.isNaN(date.getTime())
      ? '一条回忆'
      : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    openModal({
      eyebrow: 'MEMORY',
      title: label,
      subtitle: `${nameOf(moment.author)} 留下的${moment.photo ? '照片' : '一句话'}`,
      body: `${moment.photo ? `<div class="photo-viewer">${photoImg(moment.photo, 'photo-viewer-img', '照片')}</div>` : ''}
        ${moment.text ? `<p class="photo-viewer-text">${esc(moment.text)}</p>` : ''}
        <div class="photo-viewer-foot">${moodChip(moment)}</div>`,
      wide: true,
    });
    hydratePhotos();
  }

  function homeView() {
    const days = daysTogether();
    const next = nextUpcomingAnniversary();
    const latest = recentMoments().slice(0, 2);
    const dinner = currentDinner();
    const prompt = dailyItem(PROMPTS);
    const today = new Date();
    const subtitle = dailyItem(SUBTITLES);
    const greetingName = sync.identity ? nameOf(sync.identity) : state.names.me;
    const dishCount = state.wishes.dishes.length;
    const placeCount = state.wishes.places.length;
    const photoCount = state.moments.filter((moment) => Boolean(normalizePhoto(moment.photo))).length;

    return `<header class="page-head home-head">
      <div>
        <p class="eyebrow">${weekdayCN(today)} · ${fmtDateShort(localDateStr(today))} · ${days.future ? '期待中' : '我们的小日子'}</p>
        <h1>${greeting()}，${esc(greetingName)}<span class="hello-dot"></span></h1>
        <p class="page-sub">${esc(subtitle)}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="go" data-route="wishes">${icon('bowl')}<span class="btn-label">想吃</span></button>
        <button class="btn btn-ghost" type="button" data-action="add-moment">${icon('edit')}<span class="btn-label">记录今天</span></button>
      </div>
    </header>
    ${state.onboarded ? '' : welcomeBanner()}
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-kicker">${days.future ? '距离在一起还有' : '我们在一起'}</div>
        <div class="hero-days">
          <span class="num" id="hero-days-num" data-target="${days.days}">${days.days.toLocaleString('zh-CN')}</span>
          <span class="unit">天</span>
        </div>
        <p class="hero-names"><strong>${esc(state.names.me)}</strong> &amp; <strong>${esc(state.names.partner)}</strong> · 从 ${fmtDateCN(state.togetherDate)} 开始</p>
        <div class="hero-chips">
          <a href="#moments">日常 <strong>${state.moments.length}</strong></a>
          <a href="#wishes">想吃 <strong>${dishCount + placeCount}</strong></a>
          <a href="#album">相册 <strong>${photoCount}</strong></a>
          <a href="#days">纪念日 <strong>${state.anniversaries.length}</strong></a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${heroArt()}<span class="art-note">${esc(dailyItem(ART_NOTES))}</span></div>
      ${heroNext(next)}
    </section>
    ${nudgeBanner()}
    ${nudgeBar()}
    ${onThisDaySection()}
    <div class="home-grid">
      <section class="panel rise" style="--d:1">
        ${sectionHead('最近的小事', `<div class="section-links"><button class="text-link" type="button" data-action="go" data-route="album">${icon('image')} 相册</button><button class="text-link" type="button" data-action="go" data-route="moments">全部 ${icon('chevron')}</button></div>`)}
        ${latest.length ? latest.map(miniMoment).join('') : emptyState('🌱', '最近三天还没有新记录', '写下一件小事，或者去历史里翻翻以前的日子。', `<button class="btn btn-soft btn-sm" data-action="add-moment">${icon('plus')} 写一条</button>`)}
        <div style="display:flex;gap:7px;margin-top:14px">
          <button class="btn btn-soft" type="button" data-action="add-moment" style="flex:1">${icon('plus')} 写一条日常</button>
          <button class="btn btn-ghost" type="button" data-action="go" data-route="history" style="flex:none">翻历史</button>
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

  function canManageMoment(moment) {
    return moment.author === (sync.identity || 'me');
  }

  function commentBlock(moment) {
    const comments = moment.comments || [];
    const shown = comments.slice(-3);
    return `<div class="comment-block">
      ${shown.length ? `<div class="comment-list">${shown.map((comment) => `<div class="comment-item">
        ${avatarFor(comment.author, 'tiny')}
        <span class="comment-name">${esc(nameOf(comment.author))}</span>
        <span class="comment-text">${esc(comment.text)}</span>
      </div>`).join('')}</div>` : ''}
      <details class="comment-write">
        <summary>${comments.length ? `继续评论${comments.length > 3 ? `（共 ${comments.length} 条）` : ''}` : '写评论'}</summary>
        <form class="comment-form" data-comment-id="${esc(moment.id)}">
          <input class="comment-input" name="comment" maxlength="200" placeholder="回复一句…" autocomplete="off" aria-label="写评论">
          <button class="comment-send" type="submit" aria-label="发送评论">${icon('arrow')}</button>
        </form>
      </details>
    </div>`;
  }

  function wishCard(moment) {
    const planned = moment.wishStatus === 'planned';
    return `<article class="wish-card ${planned ? 'planned' : ''}" data-author="${moment.author}" data-search="${esc(`${moment.text} ${nameOf(moment.author)}`)}">
      <span class="wish-stamp">${planned ? '已安排' : '想吃'}</span>
      <div class="wish-top">
        <div class="wish-emoji">${esc(moment.foodEmoji || '🍲')}</div>
        <div class="wish-content">
          <div class="wish-label">CRAVING · 想吃</div>
          <p class="wish-text">${esc(moment.text)}</p>
        </div>
      </div>
      ${photoImg(moment.photo, 'moment-photo', '想吃的照片')}
      <div class="wish-foot">
        ${avatarFor(moment.author, 'tiny')}
        <span class="wish-author">${esc(nameOf(moment.author))}</span>
        <span class="wish-time">${esc(fmtMomentTime(moment.date))}</span>
        ${canManageMoment(moment) ? `<button class="icon-btn" type="button" data-action="edit-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="编辑想吃卡片">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="删除想吃卡片">${icon('trash')}</button>` : ''}
        <button class="wish-plan-btn ${planned ? 'done' : ''}" type="button" data-action="plan-wish" data-id="${esc(moment.id)}" ${planned ? 'disabled' : ''}>
          ${icon(planned ? 'check' : 'sparkles')} ${planned ? '已安排' : '安排！'}
        </button>
      </div>
      ${commentBlock(moment)}
    </article>`;
  }

  function momentCard(moment) {
    if (moment.kind === 'wish') return wishCard(moment);
    return `<article class="moment-card" data-author="${moment.author}" data-search="${esc(`${moment.text} ${nameOf(moment.author)}`)}">
      <div class="moment-head">
        ${avatarFor(moment.author)}
        <div class="moment-author">
          <strong>${esc(nameOf(moment.author))}</strong>
          <span>${esc(fmtMomentTime(moment.date))}</span>
        </div>
        <div class="moment-tools">
          ${canManageMoment(moment) ? `<button class="icon-btn" type="button" data-action="edit-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="编辑这条日常">${icon('edit')}</button>
          <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="shared" data-id="${esc(moment.id)}" aria-label="删除这条日常">${icon('trash')}</button>` : ''}
        </div>
      </div>
      <p class="moment-text">${esc(moment.text)}</p>
      ${photoImg(moment.photo, 'moment-photo', '日常照片')}
      <div class="moment-foot">${moodChip(moment)}</div>
      ${reactionRow(moment)}
      ${commentBlock(moment)}
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
    return `<article class="drawer-card ${gift ? 'kind-gift' : ''}" data-kind="${gift ? 'gift' : 'note'}" data-search="${esc(moment.text)}">
      <div class="moment-tools" style="position:absolute;top:12px;right:12px;opacity:.55">
        <button class="icon-btn" type="button" data-action="edit-moment" data-space="personal" data-id="${esc(moment.id)}" aria-label="编辑这张小纸条">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-action="delete-moment" data-space="personal" data-id="${esc(moment.id)}" aria-label="删除这张小纸条">${icon('trash')}</button>
      </div>
      <div class="drawer-badge">${icon(gift ? 'gift' : 'sparkles')} ${gift ? '礼物计划' : '小纸条'}</div>
      <p class="moment-text">${esc(moment.text)}</p>
      ${photoImg(moment.photo, 'moment-photo', '小岛照片')}
      <div class="drawer-date">${esc(fmtMomentTime(moment.date))}</div>
    </article>`;
  }

  function meView() {
    const identity = sync.identity;
    const items = sortedPersonal();
    const name = identity ? nameOf(identity) : state.names.me;
    const otherName = identity === 'partner' ? state.names.me : state.names.partner;
    const noteCount = items.filter((item) => item.kind !== 'gift').length;
    const giftCount = items.length - noteCount;
    const filter = ui.drawerFilter || 'all';
    const syncText = sync.lastSyncAt ? formatSyncTime(sync.lastSyncAt) : '还没';
    const visible = items.filter((item) => {
      if (filter === 'note') return item.kind !== 'gift';
      if (filter === 'gift') return item.kind === 'gift';
      return true;
    });
    return `<button class="island-back" type="button" data-action="toggle-space">${icon('chevron')} 回到我们的空间</button>
    <header class="page-head island-head">
      <div>
        <p class="eyebrow">MY LITTLE ISLAND · 只给自己</p>
        <h1 class="page-title">${esc(name)}的小岛</h1>
        <p class="page-sub">写给 ${esc(otherName)} 的惊喜、想记下来的念头，都先放在岛上。</p>
      </div>
    </header>
    <section class="island-hero rise">
      <div class="island-top">
        <span class="avatar ${identity || 'me'}">${esc(initialOf(name))}</span>
        <div class="island-copy">
          <strong>我是 ${esc(name)}</strong>
          <small>身份已锁定 · 小岛跟着这台手机走</small>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="switch-identity">切换身份</button>
      </div>
      <div class="island-stats-grid">
        <div><strong>${noteCount}</strong><span>张小纸条</span></div>
        <div><strong>${giftCount}</strong><span>个礼物计划</span></div>
        <div><strong>${esc(syncText)}</strong><span>上次同步</span></div>
      </div>
      <div class="island-actions">
        <button class="btn btn-primary" type="button" data-action="add-personal-note">${icon('edit')} 写张小纸条</button>
        <button class="btn btn-ghost" type="button" data-action="add-personal-gift">${icon('gift')} 记个礼物计划</button>
      </div>
    </section>
    ${items.length
      ? `<div class="filter-bar island-filters">
          <div class="chips-row" id="drawer-filters">
            <button class="chip ${filter === 'all' ? 'active' : ''}" type="button" data-action="filter-drawer" data-filter="all">全部 · ${items.length}</button>
            <button class="chip ${filter === 'note' ? 'active' : ''}" type="button" data-action="filter-drawer" data-filter="note">小纸条 · ${noteCount}</button>
            <button class="chip ${filter === 'gift' ? 'active' : ''}" type="button" data-action="filter-drawer" data-filter="gift">礼物计划 · ${giftCount}</button>
          </div>
        </div>
        <div class="drawer-timeline">${visible.map(personalCard).join('')}</div>`
      : `<div class="drawer-empty island-empty">${emptyState('🎁', '小岛还是空的', '可以藏一句想说的话，也可以记一个准备送出的礼物。', `<button class="btn btn-soft btn-sm" data-action="add-personal-note">${icon('plus')} 写第一张</button>`)}</div>`}
    <p class="count-note" style="margin-top:18px;text-align:center">小岛上的内容会跟着你的身份同步到坚果云 · 对方看不到</p>
    `;
  }

  function historyLink(label = '翻翻更早的日常') {
    return `<a class="history-link" href="#history">${icon('clock')}<span>${label}</span>${icon('chevron')}</a>`;
  }

  function groupMomentsByMonth(list) {
    const groups = new Map();
    list.forEach((moment) => {
      const date = new Date(moment.date);
      const key = Number.isNaN(date.getTime())
        ? 'unknown'
        : `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(moment);
    });
    return Array.from(groups.entries()).map(([key, moments]) => {
      const label = key === 'unknown'
        ? '更早'
        : `${key.split('-')[0]}年${Number(key.split('-')[1])}月`;
      return `<section class="timeline-group month-group" data-month="${key}">
        <h3 class="timeline-date">${label} <small>共 ${moments.length} 条</small></h3>
        ${moments.map(momentCard).join('')}
      </section>`;
    }).join('');
  }

  function momentsView() {
    const list = recentMoments();
    const mine = list.filter((moment) => moment.author === 'me').length;
    const partner = list.length - mine;
    const older = olderMoments().length;
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR LITTLE THINGS · 最近三天</p>
        <h1 class="page-title">日常碎片</h1>
        <p class="page-sub">只留下最近三天的热闹；更早的日子，去历史里慢慢翻。</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="go" data-route="album">${icon('image')}<span class="btn-label">相册</span></button>
        <button class="btn btn-ghost" type="button" data-action="go" data-route="history">${icon('clock')}<span class="btn-label">历史记录</span></button>
        <button class="btn btn-primary" type="button" data-action="add-moment">${icon('plus')}<span class="btn-label">记录一件小事</span></button>
      </div>
    </header>
    <div class="filter-bar">
      <div class="chips-row" id="moment-filters">
        <button class="chip ${ui.momentFilter === 'all' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="all">全部 · ${list.length}</button>
        <button class="chip ${ui.momentFilter === 'me' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="me">${esc(state.names.me)} · ${mine}</button>
        <button class="chip ${ui.momentFilter === 'partner' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="partner">${esc(state.names.partner)} · ${partner}</button>
      </div>
      <span class="count-note">最近 3 天 · 按时间倒序</span>
    </div>
    ${list.length
      ? `<div class="timeline">${groupMoments(list)}</div>
         <div class="empty small hidden" id="moment-filter-empty">
           <span class="empty-emoji">🫧</span>
           <strong>这一栏最近还没有内容</strong>
           <p>换个人看看，或者现在就补上一条。</p>
         </div>`
      : emptyState('🌱', '最近三天还没有日常', '今天发生的一件小事，就可以是第一条。', `<button class="btn btn-primary btn-sm" data-action="add-moment">${icon('plus')} 写下第一条</button>`)}
    ${older ? historyLink(`翻翻更早的 ${older} 条日常`) : ''}
    `;
  }

  function monthKeyOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function currentMonthKey() {
    return monthKeyOf(new Date());
  }

  function parseMonthKey(key) {
    const parts = String(key || '').split('-').map((item) => Number(item));
    if (parts.length < 2 || !parts[0] || !parts[1]) return new Date();
    return new Date(parts[0], parts[1] - 1, 1);
  }

  function shiftMonthKey(key, delta) {
    const date = parseMonthKey(key);
    date.setMonth(date.getMonth() + delta);
    return monthKeyOf(date);
  }

  function monthLabelCN(key) {
    const date = parseMonthKey(key);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  function momentsInMonth(key) {
    return sortedMoments().filter((moment) => {
      const date = new Date(moment.date);
      return !Number.isNaN(date.getTime()) && monthKeyOf(date) === key;
    });
  }

  function latestRecordedMonth() {
    const list = sortedMoments();
    for (const moment of list) {
      const date = new Date(moment.date);
      if (!Number.isNaN(date.getTime())) return monthKeyOf(date);
    }
    return currentMonthKey();
  }

  function historyView() {
    const all = sortedMoments();
    if (!ui.historyMonth) ui.historyMonth = currentMonthKey();
    const key = ui.historyMonth;
    const monthList = momentsInMonth(key);
    const label = monthLabelCN(key);
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR ARCHIVE · 按月份翻</p>
        <h1 class="page-title">历史记录</h1>
        <p class="page-sub">先选一个月份，再看那个月发生的事。全部 ${all.length} 条。</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" type="button" data-action="go" data-route="moments">${icon('arrow')}<span class="btn-label">回到最近</span></button>
      </div>
    </header>
    <div class="month-bar">
      <button class="month-step prev" type="button" data-action="history-prev" aria-label="上个月">${icon('chevron')}</button>
      <label class="month-pick">
        <input type="month" id="history-month" value="${esc(key)}" aria-label="选择月份">
      </label>
      <button class="month-step" type="button" data-action="history-next" aria-label="下个月">${icon('chevron')}</button>
      <span class="month-total">${monthList.length} 条</span>
    </div>
    <div class="recipe-toolbar">
      <div class="search-box">
        ${icon('search')}
        <input id="history-search" type="search" value="${esc(ui.momentQuery || '')}" placeholder="搜这个月的一句话、一个人…" aria-label="搜索这个月的日常">
      </div>
      <div class="chips-row" id="history-filters">
        <button class="chip ${ui.momentFilter === 'all' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="all">全部</button>
        <button class="chip ${ui.momentFilter === 'me' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="me">${esc(state.names.me)}</button>
        <button class="chip ${ui.momentFilter === 'partner' ? 'active' : ''}" type="button" data-action="filter-moments" data-filter="partner">${esc(state.names.partner)}</button>
      </div>
    </div>
    ${monthList.length
      ? `<div class="timeline" id="history-timeline">${groupMoments(monthList)}</div>
         <div class="empty small hidden" id="moment-filter-empty">
           <span class="empty-emoji">🔍</span>
           <strong>这个月没有找到</strong>
           <p>换个关键词，或者点「全部」。</p>
         </div>`
      : `${emptyState('🗓️', `${label}还没有记录`, '换一个月份看看，或者回到最近三天。', `<button class="btn btn-soft btn-sm" data-action="history-latest">${icon('clock')} 看最近有记录的月份</button>`)}
         <div class="month-jump"><button type="button" data-action="history-latest">跳到最近有记录的月份</button></div>`}
    `;
  }

  function dishCard(dish) {
    const palette = dishPalette(dish);
    const tags = dish.tags.slice(0, 2);
    const searchText = [dish.name, dish.desc, ...dish.tags, ...dish.ingredients.map((item) => item.name)].join(' ');
    return `<article class="recipe-card dish-card" tabindex="0" role="button" data-action="open-dish" data-id="${esc(dish.id)}" data-search="${esc(searchText)}" data-tags="${esc(dish.tags.join(','))}" data-who="${esc((dish.wantedBy || []).join(','))}" aria-label="查看想吃的菜：${esc(dish.name)}">
      <div class="recipe-cover ${palette}">
        <span class="recipe-emoji">${esc(dish.emoji || '🍳')}</span>
        <button class="recipe-fav ${dish.favorite ? 'is-fav' : ''}" type="button" data-action="toggle-favorite" data-fav-id="${esc(dish.id)}" aria-label="${dish.favorite ? '取消收藏' : '收藏'}" aria-pressed="${dish.favorite}">${icon('heart')}</button>
        <span class="recipe-time">${icon('clock')}${dish.time} 分钟</span>
      </div>
      <div class="recipe-body">
        <h3 class="recipe-name">${esc(dish.name)}</h3>
        <p class="recipe-desc">${esc(dish.desc || '一道想和 TA 一起做的菜。')}</p>
        <div class="recipe-foot">
          ${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
          ${dish.cookedAt ? `<span class="recipe-cooked">${icon('check')}做过</span>` : ''}
          <span class="wanted-avatars">${(dish.wantedBy || []).map((role) => avatarFor(role, 'tiny')).join('')}</span>
        </div>
      </div>
    </article>`;
  }

  function placeCard(place) {
    const scene = placeScene(place.scene);
    const covered = place.status === 'visited';
    const searchText = [place.name, place.city, place.address, place.note, ...place.dishes, ...place.tags].join(' ');
    return `<article class="place-card ${covered ? 'is-visited' : ''}" tabindex="0" role="button" data-action="open-place" data-id="${esc(place.id)}" data-scene="${esc(place.scene)}" data-who="${esc((place.wantedBy || []).join(','))}" data-search="${esc(searchText)}" aria-label="查看想吃的店：${esc(place.name)}">
      <div class="place-cover scene-${esc(place.scene)}">
        ${place.photos && place.photos[0]
          ? photoImg(place.photos[0], 'place-photo', place.name)
          : `<span class="place-emoji">${scene.emoji}</span>`}
        <span class="place-scene">${scene.emoji} ${scene.label}</span>
        <button class="recipe-fav ${place.favorite ? 'is-fav' : ''}" type="button" data-action="toggle-place-favorite" data-fav-id="${esc(place.id)}" aria-label="${place.favorite ? '取消收藏' : '收藏'}" aria-pressed="${place.favorite}">${icon('heart')}</button>
        ${covered ? '<span class="place-visited">已去过</span>' : ''}
      </div>
      <div class="place-body">
        <h3 class="place-name">${esc(place.name)}</h3>
        <p class="place-address">${place.city ? `${esc(place.city)} · ` : ''}${esc(place.address || '还没写地址')}</p>
        ${place.dishes.length ? `<div class="place-dishes">${place.dishes.slice(0, 4).map((dish) => `<span class="tag">${esc(dish)}</span>`).join('')}</div>` : ''}
        <div class="place-foot">
          <span class="place-who">${(place.wantedBy || []).map((role) => avatarFor(role, 'tiny')).join('')} ${esc(wantedByLabel(place))}</span>
          <span class="place-status">${covered ? '记一笔' : '想去'}</span>
        </div>
      </div>
    </article>`;
  }

  function dishesPanel() {
    const dishes = state.wishes.dishes;
    const allTags = ['全部'];
    dishes.forEach((dish) => {
      dish.tags.forEach((tag) => {
        if (!allTags.includes(tag)) allTags.push(tag);
      });
    });
    if (!allTags.includes(ui.dishTag)) ui.dishTag = '全部';
    return `<div class="recipe-toolbar">
      <div class="search-box">
        ${icon('search')}
        <input id="dish-search" type="search" value="${esc(ui.dishQuery)}" placeholder="搜菜名、食材或标签…" aria-label="搜索想吃的菜">
      </div>
      <div class="chips-row" id="dish-tags">
        ${allTags.map((tag) => `<button class="chip ${ui.dishTag === tag ? 'active' : ''}" type="button" data-action="filter-dish-tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}
      </div>
    </div>
    <div class="recipe-grid" id="dish-grid">
      ${dishes.length
        ? dishes.map(dishCard).join('')
        : `<div class="recipe-empty">${emptyState('🍜', '还没有想吃的菜', '把你们馋的那道菜写下来，下次就不用想半天。', `<button class="btn btn-primary btn-sm" data-action="add-dish">${icon('plus')} 加第一道</button>`)}</div>`}
    </div>
    <div class="empty small hidden" id="dish-filter-empty">
      <span class="empty-emoji">🔍</span>
      <strong>没有找到这道菜</strong>
      <p>换个关键词，或者点「全部」看看。</p>
    </div>
    <p class="count-note" id="dish-count" style="margin-top:14px">${dishes.length ? `共 ${dishes.length} 道想吃的菜` : ''}</p>`;
  }

  function placesPanel() {
    const places = sortedPlaces();
    const sceneTabs = [['all', '全部'], ...Object.entries(PLACE_SCENES).map(([key, value]) => [key, `${value.emoji} ${value.label}`])];
    return `<div class="recipe-toolbar">
      <div class="search-box">
        ${icon('search')}
        <input id="place-search" type="search" value="${esc(ui.placeQuery)}" placeholder="搜店名、城市、想吃的菜…" aria-label="搜索想吃的店">
      </div>
      <div class="chips-row" id="place-scenes">
        ${sceneTabs.map(([key, label]) => `<button class="chip ${ui.placeScene === key ? 'active' : ''}" type="button" data-action="filter-place-scene" data-scene="${key}">${esc(label)}</button>`).join('')}
      </div>
      <div class="chips-row" id="place-who">
        ${[['all', '谁想吃都行'], ['me', `${esc(state.names.me)}想吃`], ['partner', `${esc(state.names.partner)}想吃`], ['both', '都想吃']].map(([key, label]) => `<button class="chip ${ui.placeWho === key ? 'active' : ''}" type="button" data-action="filter-place-who" data-who="${key}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="place-grid" id="place-grid">
      ${places.length
        ? places.map(placeCard).join('')
        : `<div class="recipe-empty">${emptyState('🏮', '还没有想吃的店', '把路边看到的小店、旅行里想再去的馆子收藏进来吧。', `<button class="btn btn-primary btn-sm" data-action="add-place">${icon('plus')} 收藏第一家</button>`)}</div>`}
    </div>
    <div class="empty small hidden" id="place-filter-empty">
      <span class="empty-emoji">🗺️</span>
      <strong>这一栏还没有店</strong>
      <p>换个分类，或者再收藏一家。</p>
    </div>
    <p class="count-note" id="place-count" style="margin-top:14px">${places.length ? `共 ${places.length} 家想吃的店` : ''}</p>`;
  }

  function wishesView() {
    const tab = ui.wishTab === 'places' ? 'places' : 'dishes';
    const dishes = state.wishes.dishes;
    const places = state.wishes.places;
    return `<header class="page-head">
      <div>
        <p class="eyebrow">OUR CRAVING LIST</p>
        <h1 class="page-title">想吃</h1>
        <p class="page-sub">想吃的菜、想去的店，都先收在这里，等一个一起去的时间。</p>
      </div>
      <div class="head-actions">
        ${tab === 'dishes'
          ? `<button class="btn btn-ghost" type="button" data-action="random-dish">${icon('dice')}<span class="btn-label">随机一道</span></button>
             <button class="btn btn-primary" type="button" data-action="add-dish">${icon('plus')}<span class="btn-label">加一道菜</span></button>`
          : `<button class="btn btn-ghost" type="button" data-action="random-place">${icon('dice')}<span class="btn-label">随便去一家</span></button>
             <button class="btn btn-primary" type="button" data-action="add-place">${icon('plus')}<span class="btn-label">收藏一家店</span></button>`}
      </div>
    </header>
    <div class="wish-tabs" role="tablist">
      <button class="wish-tab ${tab === 'dishes' ? 'active' : ''}" type="button" role="tab" aria-selected="${tab === 'dishes'}" data-action="wish-tab" data-tab="dishes">
        ${icon('bowl')}<span>想吃的菜</span><small>${dishes.length}</small>
      </button>
      <button class="wish-tab ${tab === 'places' ? 'active' : ''}" type="button" role="tab" aria-selected="${tab === 'places'}" data-action="wish-tab" data-tab="places">
        ${icon('home')}<span>想吃的店</span><small>${places.length}</small>
      </button>
    </div>
    ${tab === 'dishes' ? dishesPanel() : placesPanel()}`;
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

  const SETTINGS_TITLES = {
    basic: '基础设置',
    sync: '同步设置',
    update: '更新设置',
    notify: '通知设置',
    data: '数据与备份',
    about: '关于小满',
  };

  function isSettingsOpen() {
    const layer = $('#settings-layer');
    return Boolean(layer && layer.classList.contains('open'));
  }

  function openSettings(tab = 'basic') {
    ui.settingsTab = SETTINGS_TITLES[tab] ? tab : 'basic';
    const layer = $('#settings-layer');
    if (!layer) return;
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-open');
    updateBodyLock();
    updateAvatar();
    renderSettingsContent();
  }

  function closeSettings() {
    const layer = $('#settings-layer');
    if (!layer || !layer.classList.contains('open')) return;
    layer.classList.remove('open');
    layer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-open');
    updateBodyLock();
    updateAvatar();
  }

  function switchSettingsTab(tab) {
    if (!SETTINGS_TITLES[tab]) return;
    ui.settingsTab = tab;
    renderSettingsContent();
  }

  function renderSettingsContent() {
    const content = $('#settings-content');
    if (!content) return;
    const tab = SETTINGS_TITLES[ui.settingsTab] ? ui.settingsTab : 'basic';
    $$('#settings-nav button').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const map = {
      basic: settingsBasicHTML,
      sync: syncSettingsPanelHTML,
      update: updateSettingsPanelHTML,
      notify: settingsNotifyHTML,
      data: settingsDataHTML,
      about: settingsAboutHTML,
    };
    content.innerHTML = (map[tab] || settingsBasicHTML)();
    const title = $('#settings-title');
    if (title) title.textContent = SETTINGS_TITLES[tab];
    updateSyncUI();
    updateUpdateUI();
    if (typeof refreshCurrentVersion === 'function') refreshCurrentVersion();
    if (tab === 'notify') refreshNotifyPermission();
  }

  function settingsBasicHTML() {
    const identity = sync.identity;
    const myName = identity ? nameOf(identity) : '';
    const otherName = identity ? nameOf(identity === 'me' ? 'partner' : 'me') : '';
    return `<section class="settings-panel">
        <h2>我们是谁</h2>
        <p class="settings-note">只改你自己的名字；TA 的名字会从对方手机同步过来。</p>
        ${identity ? `<form id="profile-form">
          <div class="form-grid">
            <div class="field">
              <label>我的名字</label>
              <div class="name-display" id="name-display">
                <strong id="profile-name-text">${esc(myName)}</strong>
                <button class="btn btn-ghost btn-sm" type="button" data-action="edit-name">更改名字</button>
              </div>
              <div class="name-editor hidden" id="name-editor">
                <input class="input" id="profile-me" name="myName" maxlength="12" value="${esc(myName)}" autocomplete="off" required>
                <button class="btn btn-ghost btn-sm" type="button" data-action="cancel-name">取消</button>
              </div>
            </div>
            <div class="field">
              <label>TA 的名字</label>
              <div class="readonly-name"><strong>${esc(otherName)}</strong><span>由 TA 自己改</span></div>
            </div>
            <div class="field span-2">
              <label for="profile-date">在一起的日子 <span class="field-hint">首页会从这一天开始数</span></label>
              <input class="input" id="profile-date" name="togetherDate" type="date" value="${esc(state.togetherDate)}" required>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-ghost" type="button" data-action="switch-identity">切换身份</button>
            <span class="spacer"></span>
            <button class="btn btn-primary" type="submit">${icon('check')} 保存修改</button>
          </div>
        </form>` : `<div class="identity-required">
          <p>先选择你是哪一位，再写名字。</p>
          <button class="btn btn-soft" type="button" data-action="open-identity">选择身份</button>
        </div>`}
      </section>

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
        <div class="motion-setting">
          <div class="motion-copy"><strong>动画强度</strong><span>标准最活泼，轻微更安静</span></div>
          <div class="motion-options">
            ${MOTION_LEVELS.map((level) => `<button type="button" class="${ui.motion === level ? 'active' : ''}" data-action="set-motion" data-motion="${level}">${MOTION_NAMES[level]}</button>`).join('')}
          </div>
        </div>
        <div class="privacy-box" style="margin-top:18px">
          ${icon('sparkles')}
          <p>小提示：照片会自动压缩，并单独放进坚果云的 photos 文件夹，不占手机空间。</p>
        </div>
      </section>`;
  }

  function settingsDataHTML() {
    return `<section class="settings-panel">
        <h2>备份与恢复</h2>
        <p class="settings-note">导出一份完整备份（含照片），或者把整个小空间搬到另一台设备。</p>
        <div class="data-actions">
          <button class="btn btn-ghost" type="button" data-action="export-data">${icon('download')} 导出数据</button>
          <button class="btn btn-ghost" type="button" data-action="import-data">${icon('upload')} 导入数据</button>
        </div>
        <div class="privacy-box">
          ${icon('lock')}
          <p>默认只保存在本机。开启同步后，文字通过你们自己的坚果云 WebDAV 同步，照片放在同一个文件夹的 photos 子目录里，不经过第三方服务器。</p>
        </div>
      </section>
      <section class="settings-panel danger-zone">
        <h2>重新开始</h2>
        <p class="settings-note">清空现在的内容，回到最初的示例数据。</p>
        <button class="btn btn-ghost" type="button" data-action="reset-data" style="color:var(--danger);border-color:#ecd2cb">${icon('refresh')} 恢复示例数据</button>
      </section>`;
  }

  function settingsAboutHTML() {
    return `<section class="settings-panel">
        <div class="about-hero">
          <span class="brand-mark small"><svg viewBox="0 0 48 48" aria-hidden="true">
            <ellipse cx="18" cy="27" rx="10" ry="13" fill="currentColor" transform="rotate(-8 18 27)"/>
            <ellipse cx="31" cy="28" rx="9" ry="12" fill="#7f9b7a" transform="rotate(8 31 28)"/>
            <circle cx="15" cy="25" r="1.15" fill="#fff8ee"/><circle cx="21" cy="25" r="1.15" fill="#fff8ee"/>
            <circle cx="28" cy="26" r="1.15" fill="#fff8ee"/><circle cx="34" cy="26" r="1.15" fill="#fff8ee"/>
          </svg></span>
          <div><strong>小满</strong><small>两个人的小小宇宙 · v${esc(currentVersionName)}</small></div>
        </div>
        <ul class="about-lines">
          <li>双击打开就能用，不需要联网，也没有账号。</li>
          <li>两个人的小空间通过自己的坚果云同步，不经过第三方服务器。</li>
          <li>照片单独存放在坚果云 ${esc(sync.folder || DEFAULT_SYNC_FOLDER)}/photos/，换手机同步后会按需下载。</li>
          <li>清理浏览器或应用数据前，记得先导出一份备份。</li>
        </ul>
        <div class="data-actions" style="margin-top:16px">
          <button class="btn btn-ghost" type="button" data-action="check-update">${icon('download')} 检查更新</button>
          <button class="btn btn-ghost" type="button" data-action="open-release-page">打开发布页</button>
        </div>
      </section>`;
  }

  /* ------------------------------------------------------------------------
     Filters
     ------------------------------------------------------------------------ */

  function applyMomentFilter() {
    const query = String(ui.momentQuery || '').trim().toLowerCase();
    let visibleTotal = 0;
    $$('.timeline-group').forEach((group) => {
      let visible = 0;
      $$('.moment-card, .wish-card', group).forEach((card) => {
        const authored = ui.momentFilter === 'all' || card.dataset.author === ui.momentFilter;
        const matched = !query || String(card.dataset.search || '').toLowerCase().includes(query);
        const show = authored && matched;
        card.classList.toggle('hidden', !show);
        if (show) visible += 1;
      });
      group.classList.toggle('hidden', visible === 0);
      visibleTotal += visible;
    });
    const empty = $('#moment-filter-empty');
    if (empty) empty.classList.toggle('hidden', visibleTotal !== 0);
  }

  function applyWishFilters() {
    if (ui.wishTab === 'places') {
      const query = ui.placeQuery.trim().toLowerCase();
      let visible = 0;
      $$('#place-grid .place-card').forEach((card) => {
        const who = String(card.dataset.who || '').split(',').filter(Boolean);
        const matchesScene = ui.placeScene === 'all' || card.dataset.scene === ui.placeScene;
        const matchesWho = ui.placeWho === 'all'
          || (ui.placeWho === 'both' ? who.length >= 2 : who.includes(ui.placeWho));
        const matchesQuery = !query || String(card.dataset.search || '').toLowerCase().includes(query);
        const show = matchesScene && matchesWho && matchesQuery;
        card.classList.toggle('hidden', !show);
        if (show) visible += 1;
      });
      const empty = $('#place-filter-empty');
      if (empty) empty.classList.toggle('hidden', visible !== 0);
      const count = $('#place-count');
      if (count) {
        const total = state.wishes.places.length;
        count.textContent = total
          ? (query || ui.placeScene !== 'all' || ui.placeWho !== 'all' ? `找到 ${visible} 家店` : `共 ${total} 家想吃的店`)
          : '';
      }
      return;
    }
    const query = ui.dishQuery.trim().toLowerCase();
    let visible = 0;
    $$('#dish-grid .recipe-card').forEach((card) => {
      const tags = String(card.dataset.tags || '').split(',');
      const matchesQuery = !query || String(card.dataset.search || '').toLowerCase().includes(query);
      const matchesTag = ui.dishTag === '全部' || tags.includes(ui.dishTag);
      const show = matchesQuery && matchesTag;
      card.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });
    const empty = $('#dish-filter-empty');
    if (empty) empty.classList.toggle('hidden', visible !== 0);
    const count = $('#dish-count');
    if (count) {
      const total = state.wishes.dishes.length;
      count.textContent = total
        ? (query || ui.dishTag !== '全部' ? `找到 ${visible} 道菜` : `共 ${total} 道想吃的菜`)
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
    if (modal.classList.contains('blocking') && !(sync && sync.identity)) {
      toast('先选一下你是哪一位，之后就不问了');
      return;
    }
    modal.classList.remove('blocking');
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
    const open = $('#modal').classList.contains('open')
      || $('#confirm').classList.contains('open')
      || isSettingsOpen();
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

  function authorNote() {
    const identity = sync.identity || 'me';
    return `<div class="compose-author">
      ${avatarFor(identity, 'tiny')}
      <span>以 <strong>${esc(nameOf(identity))}</strong> 的身份记录</span>
      <button class="text-link" type="button" data-action="switch-identity">不是本人？</button>
    </div>`;
  }

  function moodPicker(current) {
    return `<div class="mood-picker">
      ${Object.entries(MOODS).map(([key, mood]) => `<button type="button" class="mood-option ${current === key ? 'active' : ''}" data-action="pick-mood" data-mood="${key}">${mood.emoji} ${mood.label}</button>`).join('')}
    </div>
    <input type="hidden" name="mood" value="${esc(current)}">`;
  }

  function photoZoneInner(photo) {
    if (photo) {
      return `${photoImg(photo, 'photo-preview', '照片预览')}
        <div class="photo-copy"><strong>照片已添加</strong><small>会压缩后放进坚果云的 photos 文件夹</small></div>
        <div class="photo-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="photo-camera">${icon('camera')} 重拍</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="photo-trigger">换一张</button>
          <button class="icon-btn danger" type="button" data-action="remove-photo" aria-label="移除照片">${icon('trash')}</button>
        </div>`;
    }
    return `<span class="photo-placeholder">${icon('camera')}<span class="photo-copy"><strong>拍照或选一张</strong><small>可选 · 自动压缩，不占太多空间</small></span></span>
      <div class="photo-actions">
        <button class="btn btn-primary btn-sm" type="button" data-action="photo-camera">${icon('camera')} 拍照</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="photo-trigger">从相册选</button>
      </div>`;
  }

  function composeCopy(space, kind) {
    if (kind === 'gift') {
      return {
        label: '想送 TA 什么',
        placeholder: '想送 TA 什么？为什么想送？先偷偷记下来。',
        hint: '只会放进「我的小岛」，不会出现在我们的空间。',
        icon: 'gift',
      };
    }
    if (space === 'personal') {
      return {
        label: '想对自己说点什么',
        placeholder: '一句话、一个秘密、一个还没说出口的念头…',
        hint: '只会放进「我的小岛」，换手机同步后还在。',
        icon: 'sparkles',
      };
    }
    return {
      label: '今天发生了什么',
      placeholder: '一句话、一个瞬间、一张照片都可以…',
      hint: '会发到「我们的空间」，两个人都能看。',
      icon: 'heart',
    };
  }

  function photoJson(photo) {
    if (!photo) return '';
    return typeof photo === 'string' ? photo : JSON.stringify(photo);
  }

  function momentForm(moment = null, prompt = '', options = {}) {
    const editing = Boolean(moment);
    const space = options.space === 'personal' ? 'personal' : 'shared';
    const kind = space === 'personal'
      ? (options.kind === 'gift' || (moment && moment.kind === 'gift') ? 'gift' : 'note')
      : 'moment';
    const photo = moment ? normalizePhoto(moment.photo) : '';
    const mood = moment ? moment.mood : 'happy';
    const date = moment ? toLocalInput(moment.date) : toLocalInput();
    const copy = composeCopy(space, kind);

    return `<form id="moment-form" data-id="${editing ? esc(moment.id) : ''}" data-space="${space}" data-kind="${kind}">
      <input type="hidden" name="space" value="${space}">
      <input type="hidden" name="kind" value="${kind}">
      ${prompt ? `<div class="welcome-banner" style="margin:0 0 14px">${icon('sparkles')}<p>今天的灵感：${esc(prompt)}</p></div>` : ''}
      ${space === 'shared' ? authorNote() : ''}
      <div class="field">
        <label for="moment-text" id="moment-text-label">${copy.label} <span class="char-count" id="moment-text-count">${moment ? Array.from(moment.text).length : 0}/800</span></label>
        <textarea class="textarea" id="moment-text" name="text" maxlength="800" placeholder="${esc(copy.placeholder)}">${editing ? esc(moment.text) : ''}</textarea>
      </div>
      <p class="compose-hint" id="compose-hint">${icon(copy.icon)}<span>${copy.hint}</span></p>
      <div class="form-grid" style="margin-top:14px">
        <div class="field span-2">
          <span class="field-label">当时的心情</span>
          ${moodPicker(mood)}
        </div>
        <div class="field span-2">
          <label for="moment-date">时间 <span class="field-hint">可以补记以前的日子</span></label>
          <input class="input" id="moment-date" name="date" type="datetime-local" value="${esc(date)}">
        </div>
        <div class="field span-2">
          <span class="field-label">照片 <span class="field-hint">可以直接拍一张</span></span>
          <input class="photo-input" id="moment-photo" type="file" accept="image/*">
          <input class="photo-input" id="moment-camera" type="file" accept="image/*" capture="environment">
          <input type="hidden" name="photo" id="moment-photo-data" value="${esc(photoJson(photo))}">
          <div class="photo-zone ${photo ? 'has-photo' : ''}" id="photo-zone">${photoZoneInner(photo)}</div>
        </div>
      </div>
      <div class="form-actions">
        ${editing ? `<button class="btn btn-ghost" type="button" data-action="delete-moment" data-space="${space}" data-id="${esc(moment.id)}">${icon('trash')} 删除</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存修改' : (space === 'personal' ? (kind === 'gift' ? '放进小岛' : '放进小岛') : '记下来')}</button>
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

  function wantedByPicker(current = ['me']) {
    const set = new Set(current);
    return `<div class="who-picker">
      ${['me', 'partner'].map((role) => `<button type="button" class="who-option ${set.has(role) ? 'active' : ''}" data-action="pick-who" data-who="${role}">
        ${avatarFor(role, 'tiny')} <span>${esc(nameOf(role))}</span>
      </button>`).join('')}
    </div>
    <input type="hidden" class="who-value" name="wantedBy" value="${esc([...set].join(','))}">`;
  }

  function photoField(photo, prefix = 'moment') {
    return `<input class="photo-input" id="${prefix}-photo" type="file" accept="image/*">
      <input class="photo-input" id="${prefix}-camera" type="file" accept="image/*" capture="environment">
      <input type="hidden" name="photo" id="${prefix}-photo-data" value="${esc(photoJson(photo))}">
      <div class="photo-zone ${photo ? 'has-photo' : ''}" id="${prefix}-photo-zone">${photoZoneInner(photo)}</div>`;
  }

  function dishForm(dish = null) {
    const editing = Boolean(dish);
    const data = dish || {
      emoji: '🍳',
      desc: '',
      time: 30,
      difficulty: '简单',
      tags: [],
      ingredients: [],
      steps: [],
      favorite: false,
      wantedBy: sync.identity ? [sync.identity] : ['me'],
    };
    const ingredients = data.ingredients.length ? data.ingredients : [{ amount: '', name: '' }];
    const steps = data.steps.length ? data.steps : [''];
    return `<form id="dish-form" data-id="${editing ? esc(dish.id) : ''}">
      <div class="form-grid">
        <div class="field span-2">
          <label for="dish-name">想吃什么 <em>*</em></label>
          <input class="input" id="dish-name" name="name" maxlength="40" value="${esc(data.name || '')}" placeholder="比如：番茄牛腩" required>
        </div>
        <div class="field">
          <span class="field-label">给它一个 emoji</span>
          ${emojiPicker(RECIPE_EMOJIS, data.emoji || '🍳', 'emoji')}
        </div>
        <div class="field">
          <label for="dish-time">大概要多久 <span class="field-hint">分钟</span></label>
          <input class="input" id="dish-time" name="time" type="number" min="1" max="999" value="${esc(data.time || 30)}">
        </div>
        <div class="field">
          <label for="dish-difficulty">难度</label>
          <select class="select" id="dish-difficulty" name="difficulty">
            ${DIFFICULTIES.map((level) => `<option value="${level}" ${data.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="dish-tags-input">标签 <span class="field-hint">用逗号隔开</span></label>
          <input class="input" id="dish-tags-input" name="tags" maxlength="60" value="${esc((data.tags || []).join('，'))}" placeholder="快手，下饭，甜点">
        </div>
        <div class="field span-2">
          <span class="field-label">谁想吃 <span class="field-hint">可以都选</span></span>
          ${wantedByPicker(data.wantedBy)}
        </div>
        <div class="field span-2">
          <label for="dish-desc">一句话介绍</label>
          <textarea class="textarea" id="dish-desc" name="desc" maxlength="140" rows="2" placeholder="为什么想吃这道菜？">${esc(data.desc || '')}</textarea>
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
        <button class="btn btn-primary" type="submit">${editing ? '保存' : '收进想吃清单'}</button>
      </div>
    </form>`;
  }

  function decodeLoose(value) {
    let text = String(value || '');
    for (let index = 0; index < 2; index += 1) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded === text) break;
        text = decoded;
      } catch (error) {
        break;
      }
    }
    return text.replace(/\+/g, ' ');
  }

  const PLACE_PLATFORMS = {
    amap: '高德地图',
    baidu: '百度地图',
    tencent: '腾讯地图',
    dianping: '大众点评',
    meituan: '美团',
    other: '分享链接',
  };

  function placePlatformLabel(place) {
    return PLACE_PLATFORMS[detectPlacePlatform(place && place.mapUrl)] || PLACE_PLATFORMS.other;
  }

  function isNavigationLink(url) {
    const value = String(url || '');
    return /^(geo:|amapuri:|baidumap:|qqmap:)/i.test(value)
      || /uri\.amap\.com|map\.baidu\.com\/poi|apis\.map\.qq\.com|map\.qq\.com/i.test(value);
  }

  function placeMapActionLabel(place) {
    if (!place || !place.mapUrl) return '按地址找';
    return isNavigationLink(place.mapUrl) ? '导航去这里' : `打开${placePlatformLabel(place)}`;
  }

  function cleanPlaceText(value, limit = 60) {
    let text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/^[\s"'“”‘’【】\[\]]+|[\s"'“”‘’【】\[\]]+$/g, '');
    text = text.replace(/^店名[:：]\s*/, '');
    text = text.replace(/\s*[-|｜]\s*(大众点评|美团|高德地图|百度地图|腾讯地图).*$/, '');
    return text.slice(0, limit);
  }

  function extractFirstUrl(source) {
    const text = String(source || '');
    const match = text.match(/https?:\/\/[^\s"'<>]+/i);
    if (match) return match[0].replace(/[，。；、）)】]+$/, '');
    const scheme = text.trim().match(/^(geo|amapuri|baidumap|qqmap):\S+/i);
    return scheme ? scheme[0] : '';
  }

  function guessNameFromShareText(source, url) {
    let text = String(source || '').replace(url || '____', ' ');
    text = text.replace(/https?:\/\/\S+/g, ' ');
    text = text.replace(/^(这家店不错|推荐给你|分享给你|复制|打开)[，,。:：\s]*/, ' ');
    const bracket = text.match(/【(.+?)】/);
    if (bracket) return cleanPlaceText(bracket[1], 40);

    const head = text.split(/(?:人均|地址|位置|地点|电话|营业|评分|距离|推荐|团购|优惠|高德地图|百度地图|腾讯地图|大众点评|美团)/)[0].trim();
    if (head.length >= 2 && head.length <= 40 && !/[，。；]/.test(head)) {
      return cleanPlaceText(head, 40);
    }

    const lines = text.split(/[\n\r]+/)
      .map((line) => line.replace(/https?:\/\/\S+/g, ' ').trim())
      .filter(Boolean);
    const skip = /^(地址|位置|地点|人均|电话|营业|评分|距离|推荐|复制|打开|分享|来自|时间|这家|一家)/;
    for (const line of lines) {
      const named = line.match(/(?:店名|名称|商家|餐厅)[:：]\s*(.+)/);
      if (named) return cleanPlaceText(named[1], 40);
      const split = line.match(/^(.+?)\s*[-|｜]\s*(?:大众点评|美团|高德地图|百度地图|腾讯地图)/);
      if (split) return cleanPlaceText(split[1], 40);
    }
    for (const line of lines) {
      if (skip.test(line)) continue;
      if (/[，。；]/.test(line)) continue;
      if (line.length < 2 || line.length > 40) continue;
      return cleanPlaceText(line, 40);
    }
    return '';
  }

  function guessAddressFromShareText(source) {
    const match = String(source || '').match(/(?:地址|位置|地点)[:：]\s*([^\n\r]*?)(?=\s*https?:\/\/|$)/);
    return match ? cleanPlaceText(match[1], 120) : '';
  }

  function detectPlacePlatform(url) {
    const value = String(url || '').toLowerCase();
    if (/amap|gaode/.test(value)) return 'amap';
    if (/baidu|bdimg/.test(value)) return 'baidu';
    if (/qq\.com|tencent|qqmap/.test(value)) return 'tencent';
    if (/dianping/.test(value)) return 'dianping';
    if (/meituan|nuomi/.test(value)) return 'meituan';
    return 'other';
  }

  function parsePlaceLink(raw) {
    const source = String(raw || '').trim();
    if (!source) return null;
    const url = extractFirstUrl(source);
    const decoded = decodeLoose(source);
    const result = {
      name: '',
      city: '',
      address: '',
      mapUrl: url,
      lat: '',
      lng: '',
      platform: detectPlacePlatform(url),
    };

    // 腾讯地图 URI：marker=coord:lat,lng;title:店名;addr:地址
    let match = decoded.match(/marker=coord:([\d.]+),([\d.]+)[^#]*?title:([^;&]+)/i);
    if (match) {
      result.lat = match[1];
      result.lng = match[2];
      result.name = cleanPlaceText(match[3], 40);
    }
    if (!result.name) {
      match = decoded.match(/[?&](?:name|poiname|dname|sname|title|what|q|query)=([^&]+)/i);
      if (match) result.name = cleanPlaceText(match[1], 40);
    }
    if (!result.name) {
      match = decoded.match(/\/poi\/([^/@?]+)\/@/);
      if (match) result.name = cleanPlaceText(match[1], 40);
    }

    if (!result.lat || !result.lng) {
      match = decoded.match(/[?&](?:position|location)=([\d.]+),([\d.]+)/i);
      if (match) {
        result.lng = match[1];
        result.lat = match[2];
      }
    }
    if (!result.lat || !result.lng) {
      match = decoded.match(/[?&]dlat=([\d.]+)[^&]*&(?:[^&]*&)*?dlon=([\d.]+)/i);
      if (match) {
        result.lat = match[1];
        result.lng = match[2];
      }
    }
    if (!result.lat || !result.lng) {
      match = decoded.match(/coord:([\d.]+),([\d.]+)/i);
      if (match) {
        result.lat = match[1];
        result.lng = match[2];
      }
    }

    match = decoded.match(/[?&](?:address|addr|adname|daddr)=([^&]+)/i);
    if (match) result.address = cleanPlaceText(match[1], 120);
    if (!result.address) {
      match = decoded.match(/addr:([^;&]+)/i);
      if (match) result.address = cleanPlaceText(match[1], 120);
    }
    if (!result.address) result.address = guessAddressFromShareText(decoded);

    match = decoded.match(/[?&](?:city|cityname)=([^&]+)/i);
    if (match) result.city = cleanPlaceText(match[1], 20);
    if (!result.city) {
      const cityMatch = decoded.match(/([\u4e00-\u9fa5]{2,6}市)/);
      if (cityMatch) result.city = cityMatch[1].replace(/市$/, '');
    }

    if (!result.name) result.name = guessNameFromShareText(source, url);
    if (!result.name) {
      const title = decoded.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (title) result.name = cleanPlaceText(title[1], 40);
    }

    if (!result.mapUrl && result.lat && result.lng) {
      const label = encodeURIComponent(result.name || '想去的店');
      result.mapUrl = `geo:${result.lat},${result.lng}?q=${result.lat},${result.lng}(${label})`;
    }
    return result;
  }

  function fillPlaceForm(form, parsed) {
    if (!form || !parsed) return;
    if (parsed.name) {
      ['#place-name', '#place-city', '#place-address', '#place-map'].forEach((selector) => {
        const input = form.querySelector(selector);
        if (input) input.value = '';
      });
    }
    const setValue = (selector, value) => {
      const input = form.querySelector(selector);
      if (input && value) input.value = value;
    };
    setValue('#place-name', parsed.name);
    setValue('#place-city', parsed.city);
    setValue('#place-address', parsed.address);
    setValue('#place-map', parsed.mapUrl);
    const more = form.querySelector('.form-more');
    if (more && (parsed.city || parsed.address || parsed.mapUrl)) more.open = true;
  }

  function placeForm(place = null) {
    const editing = Boolean(place);
    const data = place || {
      scene: 'other',
      city: '',
      address: '',
      mapUrl: '',
      dishes: [],
      tags: [],
      note: '',
      photos: [],
      wantedBy: sync.identity ? [sync.identity] : ['me'],
      status: 'wanted',
      favorite: false,
    };
    const hasMore = Boolean(
      data.city || data.address || data.mapUrl
      || (data.dishes && data.dishes.length)
      || (data.tags && data.tags.length)
      || data.note
      || (data.photos && data.photos.length)
      || data.status === 'visited'
    );
    return `<form id="place-form" data-id="${editing ? esc(place.id) : ''}">
      <div class="field">
        <label for="place-name">店名 <em>*</em></label>
        <input class="input" id="place-name" name="name" maxlength="40" value="${esc(data.name || '')}" placeholder="比如：楼下那家小面馆" required>
      </div>
      <div class="link-assist">
        <textarea class="input link-input" id="place-link" rows="2" placeholder="粘贴分享链接或整段分享文字，自动识别" aria-label="粘贴分享链接自动识别"></textarea>
        <button class="btn btn-ghost btn-sm" type="button" data-action="parse-place-link">识别</button>
      </div>
      <p class="link-assist-hint">支持高德 / 百度 / 腾讯地图、美团、大众点评的分享链接或整段分享文字；认不出来也没关系，只填店名就能收藏。</p>

      <div class="field" style="margin-top:15px">
        <span class="field-label">归到哪一栏 <span class="field-hint">决定什么时候方便去</span></span>
        <div class="scene-chips">
          ${Object.entries(PLACE_SCENES).map(([key, scene]) => `<button class="scene-chip ${data.scene === key ? 'active' : ''}" type="button" data-action="pick-scene" data-scene="${key}">${scene.emoji} ${scene.label}</button>`).join('')}
        </div>
        <input type="hidden" class="scene-value" name="scene" value="${esc(data.scene)}">
      </div>

      <div class="field" style="margin-top:15px">
        <span class="field-label">谁想吃 <span class="field-hint">可以都选</span></span>
        ${wantedByPicker(data.wantedBy)}
      </div>

      <details class="form-more" ${hasMore ? 'open' : ''}>
        <summary>补充信息（可选）<small>位置、想吃的菜、备注、照片</small></summary>
        <div class="form-grid">
          <div class="field">
            <label for="place-city">城市 <span class="field-hint">出去玩时填</span></label>
            <input class="input" id="place-city" name="city" maxlength="20" value="${esc(data.city || '')}" placeholder="比如：厦门">
          </div>
          <div class="field">
            <span class="field-label">状态</span>
            <select class="select" id="place-status" name="status">
              <option value="wanted" ${data.status !== 'visited' ? 'selected' : ''}>还没去过</option>
              <option value="visited" ${data.status === 'visited' ? 'selected' : ''}>已经去过</option>
            </select>
          </div>
          <div class="field span-2">
            <label for="place-address">位置 <span class="field-hint">地址或“怎么走”</span></label>
            <input class="input" id="place-address" name="address" maxlength="120" value="${esc(data.address || '')}" placeholder="街道、门牌，或者“地铁口出来右转”">
          </div>
          <div class="field span-2">
            <label for="place-map">地图链接 <span class="field-hint">不填就按店名和地址搜</span></label>
            <input class="input" id="place-map" name="mapUrl" maxlength="400" value="${esc(data.mapUrl || '')}" placeholder="粘贴高德/百度地图链接，或识别后自动填入">
          </div>
          <div class="field span-2">
            <label for="place-dishes">想吃的菜 <span class="field-hint">用逗号隔开</span></label>
            <input class="input" id="place-dishes" name="dishes" maxlength="200" value="${esc((data.dishes || []).join('，'))}" placeholder="招牌面，葱油饼，冰豆浆">
          </div>
          <div class="field span-2">
            <label for="place-tags">标签 <span class="field-hint">可选，用逗号隔开</span></label>
            <input class="input" id="place-tags" name="tags" maxlength="80" value="${esc((data.tags || []).join('，'))}" placeholder="面食，夜宵，适合下雨天">
          </div>
          <div class="field span-2">
            <label for="place-note">备注</label>
            <textarea class="textarea" id="place-note" name="note" maxlength="200" rows="2" placeholder="为什么想去？有什么要记住的？">${esc(data.note || '')}</textarea>
          </div>
          <div class="field span-2">
            <span class="field-label">门头/菜品照片 <span class="field-hint">可选</span></span>
            ${photoField(data.photos && data.photos[0] ? data.photos[0] : '', 'place')}
          </div>
        </div>
      </details>

      <label class="check-row" style="margin-top:15px">
        <input type="checkbox" name="favorite" ${data.favorite ? 'checked' : ''}>
        <span>放进我们的收藏</span>
      </label>
      <div class="form-actions">
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${editing ? '保存' : '收进想吃清单'}</button>
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
      toast('先选一下你是哪一位，再打开小岛');
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

  function openDishModal(dish = null) {
    const editing = Boolean(dish);
    openModal({
      eyebrow: editing ? 'EDIT CRAVING' : 'NEW CRAVING',
      title: editing ? '编辑这道想吃的菜' : '记下一道想吃的',
      subtitle: editing ? '把步骤改得更像你们家的做法。' : '下次不知道吃什么的时候，就来这里翻。',
      body: dishForm(dish),
    });
  }

  function openPlaceModal(place = null) {
    const editing = Boolean(place);
    openModal({
      eyebrow: editing ? 'EDIT PLACE' : 'NEW PLACE',
      title: editing ? '编辑这家店' : '收藏一家想吃的店',
      subtitle: editing ? '地址、想吃的菜，都可以慢慢补。' : '路边看到的、旅行里想再去的，都可以先收进来。',
      body: placeForm(place),
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

  function openDishDetail(id) {
    const dish = state.wishes.dishes.find((item) => item.id === id);
    if (!dish) return;
    const palette = dishPalette(dish);
    const cookedToday = Boolean(dish.cookedAt)
      && localDateStr(new Date(dish.cookedAt)) === localDateStr();
    const ingredients = dish.ingredients.length
      ? `<ul class="ingredient-list">${dish.ingredients.map((item, index) => `<li>
          <input type="checkbox" id="ing-${index}-${esc(dish.id)}">
          <label for="ing-${index}-${esc(dish.id)}"><span>${esc(item.name)}</span><span>${esc(item.amount || '')}</span></label>
        </li>`).join('')}</ul>`
      : '<p class="settings-note">这道菜还没写食材。</p>';
    const steps = dish.steps.length
      ? `<ol class="step-list">${dish.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>`
      : '<p class="settings-note">还没有写做法，下次一起补上吧。</p>';
    const body = `<div class="recipe-detail-cover ${palette}">
        <span class="emoji">${esc(dish.emoji || '🍳')}</span>
        <div>
          <h3>${esc(dish.name)}</h3>
          <p>${esc(dish.desc || '一道想和 TA 一起做的菜。')}</p>
        </div>
      </div>
      <div class="detail-meta">
        <span>${icon('clock')} ${dish.time} 分钟</span>
        <span>${esc(dish.difficulty)}</span>
        <span>${dish.ingredients.length} 样食材</span>
        <span>${dish.steps.length} 个步骤</span>
        ${dish.favorite ? `<span>${icon('heart', 'fill')} 已收藏</span>` : ''}
        <span>${(dish.wantedBy || []).map((role) => esc(nameOf(role))).join(' / ')} 想吃</span>
      </div>
      <div class="detail-section"><h4>食材</h4>${ingredients}</div>
      <div class="detail-section"><h4>做法</h4>${steps}</div>
      <div class="detail-actions">
        <button class="btn ${dish.favorite ? 'btn-soft' : 'btn-ghost'}" type="button" data-action="toggle-favorite" data-fav-id="${esc(dish.id)}">
          ${icon('heart', dish.favorite ? 'fill' : '')}<span class="fav-label">${dish.favorite ? '已收藏' : '收藏'}</span>
        </button>
        <button class="btn ${cookedToday ? 'is-done' : 'btn-ghost'}" type="button" data-action="mark-cooked" data-cooked-id="${esc(dish.id)}">${icon('check')} 今天做过啦</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="edit-dish" data-id="${esc(dish.id)}">${icon('edit')} 编辑</button>
        <button class="btn btn-ghost" type="button" data-action="delete-dish" data-id="${esc(dish.id)}" style="color:var(--danger)">${icon('trash')} 删除</button>
      </div>`;
    openModal({
      eyebrow: 'CRAVING',
      title: '想吃的菜',
      subtitle: '一起做，一起吃，一起把日子过香。',
      body,
      wide: true,
    });
  }

  function openPlaceDetail(id) {
    const place = state.wishes.places.find((item) => item.id === id);
    if (!place) return;
    const scene = placeScene(place.scene);
    const covered = place.status === 'visited';
    const photo = place.photos && place.photos[0] ? place.photos[0] : '';
    const body = `<div class="place-detail-hero scene-${esc(place.scene)}">
        ${photo ? photoImg(photo, 'place-detail-photo', place.name) : `<span class="place-detail-emoji">${scene.emoji}</span>`}
        <span class="place-scene">${scene.emoji} ${scene.label}</span>
      </div>
      <div class="detail-meta">
        <span>${icon('home')} ${esc(place.city || '没写城市')}</span>
        <span>${esc(place.address || '还没写位置')}</span>
        <span>${covered ? '已去过' : '想去'}</span>
        ${place.mapUrl ? `<span>${icon('arrow')} ${esc(placePlatformLabel(place))}</span>` : ''}
      </div>
      ${place.dishes.length ? `<div class="detail-section"><h4>想吃的菜</h4><div class="chips-row">${place.dishes.map((dish) => `<span class="tag">${esc(dish)}</span>`).join('')}</div></div>` : ''}
      ${place.tags.length ? `<div class="detail-section"><h4>标签</h4><div class="chips-row">${place.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div></div>` : ''}
      ${place.note ? `<div class="detail-section"><h4>备注</h4><p class="settings-note">${esc(place.note)}</p></div>` : ''}
      <div class="place-who-line">
        <span>谁想吃</span>
        <div>${(place.wantedBy || []).map((role) => `${avatarFor(role, 'tiny')} ${esc(nameOf(role))}`).join('　')}</div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary" type="button" data-action="open-map" data-id="${esc(place.id)}">${icon('cloud')} ${esc(placeMapActionLabel(place))}</button>
        <button class="btn ${covered ? 'is-done' : 'btn-ghost'}" type="button" data-action="mark-visited" data-id="${esc(place.id)}">${icon('check')} ${covered ? '再去一次' : '我去过啦'}</button>
        <button class="btn ${place.favorite ? 'btn-soft' : 'btn-ghost'}" type="button" data-action="toggle-place-favorite" data-fav-id="${esc(place.id)}">
          ${icon('heart', place.favorite ? 'fill' : '')}<span class="fav-label">${place.favorite ? '已收藏' : '收藏'}</span>
        </button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" type="button" data-action="edit-place" data-id="${esc(place.id)}">${icon('edit')} 编辑</button>
        <button class="btn btn-ghost" type="button" data-action="delete-place" data-id="${esc(place.id)}" style="color:var(--danger)">${icon('trash')} 删除</button>
      </div>`;
    openModal({
      eyebrow: 'PLACE',
      title: '想吃的店',
      subtitle: '记下来，总有一天会去。',
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
        compressImageDataUrl(String(reader.result || '')).then(resolve).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  function compressImageDataUrl(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('image failed'));
      image.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fffdf8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 420000 && quality > 0.4) {
          quality -= 0.08;
          data = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ dataUrl: data, w: canvas.width, h: canvas.height });
      };
      image.src = source;
    });
  }

  /* ------------------------------------------------------------------------
     Photo store: bytes live outside the JSON (Nutstore photos/ folder)
     ------------------------------------------------------------------------ */

  const PHOTO_DB_NAME = 'xiaoman.photos.v1';
  const PENDING_PHOTOS_KEY = 'xiaoman.photoQueue.v1';
  let photoDbPromise = null;
  const photoObjectUrls = new Map();
  let photoObserver = null;

  function mediaPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.XiaomanMedia;
    } catch (error) {
      return null;
    }
  }

  function cameraPlugin() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.XiaomanCamera;
    } catch (error) {
      return null;
    }
  }

  function openPhotoDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('no idb'));
    if (!photoDbPromise) {
      photoDbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(PHOTO_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('idb failed'));
      });
    }
    return photoDbPromise;
  }

  function idbGet(key) {
    return openPhotoDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const request = tx.objectStore('photos').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    }));
  }

  function idbPut(key, value) {
    return openPhotoDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function idbDelete(key) {
    return openPhotoDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    })).catch(() => false);
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(',');
    const header = parts[0] || '';
    const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const binary = window.atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  async function savePhotoFromDataUrl(dataUrl, width = 0, height = 0, forcedId = '') {
    const plugin = mediaPlugin();
    if (isNativeApp() && plugin) {
      const result = await plugin.savePhoto({ dataUrl, id: forcedId || undefined });
      return {
        id: String(result.id || forcedId || uid()),
        w: Number(result.width) || width || 0,
        h: Number(result.height) || height || 0,
      };
    }
    const id = forcedId || uid();
    await idbPut(id, dataUrlToBlob(dataUrl));
    return { id, w: width || 0, h: height || 0 };
  }

  async function photoSource(photo) {
    if (!photo || typeof photo !== 'object' || !photo.id) return '';
    if (photoObjectUrls.has(photo.id)) return photoObjectUrls.get(photo.id);
    const plugin = mediaPlugin();
    if (isNativeApp() && plugin) {
      try {
        const result = await plugin.photoPath({ id: photo.id });
        if (result && result.path && result.exists !== false) {
          const url = window.Capacitor.convertFileSrc(result.path);
          photoObjectUrls.set(photo.id, url);
          return url;
        }
      } catch (error) {
        return '';
      }
      return '';
    }
    try {
      const blob = await idbGet(photo.id);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      photoObjectUrls.set(photo.id, url);
      return url;
    } catch (error) {
      return '';
    }
  }

  function hydratePhotos(root = document) {
    $$('img[data-photo-id]', root).forEach(async (img) => {
      if (img.dataset.hydrated === '1') return;
      img.dataset.hydrated = '1';
      const id = img.dataset.photoId;
      const src = await photoSource({ id });
      if (src) {
        img.onerror = async () => {
          img.onerror = null;
          const dataUrl = await readPhotoDataUrl(id);
          if (dataUrl) img.src = dataUrl;
        };
        img.src = src;
        img.classList.remove('photo-pending');
      } else {
        img.classList.add('photo-missing');
        watchPhotoDownload(img);
      }
    });
  }

  function watchPhotoDownload(img) {
    if (!('IntersectionObserver' in window)) {
      loadRemotePhoto(img.dataset.photoId);
      return;
    }
    if (!photoObserver) {
      photoObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          photoObserver.unobserve(entry.target);
          loadRemotePhoto(entry.target.dataset.photoId);
        });
      }, { rootMargin: '240px' });
    }
    photoObserver.observe(img);
  }

  async function loadRemotePhoto(id) {
    if (!id || !isSyncConfigured()) return;
    const plugin = mediaPlugin();
    if (!plugin) return;
    const key = `photos/${id}.jpg`;
    try {
      await plugin.downloadPhoto({
        id,
        key,
        url: `${remoteFolderUrl()}${key}`,
        auth: basicAuth(sync.username, sync.password),
      });
      const src = await photoSource({ id });
      if (!src) return;
      const bust = `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`;
      $$(`img[data-photo-id="${id}"]`).forEach((img) => {
        img.src = bust;
        img.classList.remove('photo-missing', 'photo-pending');
      });
    } catch (error) {
      // Offline or not uploaded yet; keep the placeholder.
    }
  }

  function photoQueue() {
    try {
      const raw = window.localStorage.getItem(PENDING_PHOTOS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function savePhotoQueue(list) {
    try {
      window.localStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify([...new Set(list)].slice(0, 500)));
    } catch (error) {
      // best effort
    }
  }

  function queuePhotoUpload(id) {
    if (!id) return;
    const list = photoQueue();
    if (!list.includes(id)) {
      list.push(id);
      savePhotoQueue(list);
    }
    if (isSyncConfigured()) {
      window.setTimeout(() => { uploadQueuedPhotos(); }, 700);
    }
  }

  let photosDirReady = false;

  async function ensurePhotosDir() {
    if (photosDirReady || !isSyncConfigured()) return photosDirReady;
    const url = `${remoteFolderUrl()}photos/`;
    const plugin = mediaPlugin();
    if (isNativeApp() && plugin) {
      try {
        const result = await plugin.ensureFolder({
          url,
          auth: basicAuth(sync.username, sync.password),
        });
        photosDirReady = [200, 201, 204, 301, 302, 405].includes(Number(result && result.status));
      } catch (error) {
        photosDirReady = false;
      }
      return photosDirReady;
    }
    try {
      const result = await davRequest('MKCOL', url, undefined, {}, sync);
      photosDirReady = [200, 201, 204, 301, 302, 405].includes(result.status);
    } catch (error) {
      photosDirReady = false;
    }
    return photosDirReady;
  }

  let uploadingPhotos = false;

  async function uploadQueuedPhotos() {
    const plugin = mediaPlugin();
    if (!isNativeApp() || !plugin || !isSyncConfigured()) return;
    if (uploadingPhotos) return;
    const list = photoQueue();
    if (!list.length) return;
    uploadingPhotos = true;
    try {
      await ensurePhotosDir();
      const remaining = [];
      for (const id of list) {
        try {
          await plugin.uploadPhoto({
            id,
            key: `photos/${id}.jpg`,
            url: `${remoteFolderUrl()}photos/${id}.jpg`,
            auth: basicAuth(sync.username, sync.password),
          });
        } catch (error) {
          remaining.push(id);
        }
      }
      savePhotoQueue(remaining);
    } finally {
      uploadingPhotos = false;
    }
  }

  async function removePhotoBytes(id) {
    if (!id) return;
    photoObjectUrls.delete(id);
    const plugin = mediaPlugin();
    if (isNativeApp() && plugin) {
      try { await plugin.deletePhoto({ id }); } catch (error) { /* noop */ }
      return;
    }
    await idbDelete(id);
  }

  async function readPhotoDataUrl(id) {
    const plugin = mediaPlugin();
    if (isNativeApp() && plugin) {
      try {
        const result = await plugin.readPhoto({ id });
        return result && result.dataUrl ? result.dataUrl : '';
      } catch (error) {
        return '';
      }
    }
    try {
      const blob = await idbGet(id);
      if (!blob) return '';
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      return '';
    }
  }

  async function applyPhotoRef(ref, form) {
    const target = form || $('#moment-form') || $('#place-form');
    if (!target) return;
    const hidden = target.querySelector('input[name="photo"]');
    if (hidden) hidden.value = photoJson(ref);
    const zone = target.querySelector('.photo-zone');
    if (zone) {
      zone.innerHTML = photoZoneInner(ref);
      zone.classList.add('has-photo');
      hydratePhotos(zone);
    }
  }

  async function applyPhotoDataUrl(dataUrl, form) {
    const compressed = await compressImageDataUrl(dataUrl);
    const ref = await savePhotoFromDataUrl(compressed.dataUrl, compressed.w, compressed.h);
    queuePhotoUpload(ref.id);
    await applyPhotoRef(ref, form);
    toast('照片加好啦');
  }

  async function startCamera(button) {
    const form = button ? button.closest('form') : null;
    const plugin = cameraPlugin();
    if (isNativeApp() && plugin) {
      try {
        const result = await plugin.takePicture({ quality: 92 });
        if (result && result.dataUrl) {
          await applyPhotoDataUrl(result.dataUrl, form);
        }
      } catch (error) {
        const message = String((error && error.message) || '');
        if (/cancel/i.test(message)) return;
        toast(message && !/cancel/i.test(message) ? message : '没能打开相机，试试从相册选');
      }
      return;
    }
    const scope = form || document;
    const input = scope.querySelector('.photo-input[capture]');
    if (input) input.click();
    else toast('这台设备不支持直接调用相机');
  }

  async function handlePhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('只能选图片哦');
      input.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast('这张照片太大了，换一张小于 20MB 的吧');
      input.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      const ref = await savePhotoFromDataUrl(compressed.dataUrl, compressed.w, compressed.h);
      queuePhotoUpload(ref.id);
      await applyPhotoRef(ref, input.closest('form'));
      toast('照片加好啦');
    } catch (error) {
      toast('照片读取失败，换一张试试');
    }
    input.value = '';
  }

  function updatePhotoZone(photo) {
    const form = $('#moment-form') || $('#place-form');
    if (!form) return;
    const hidden = form.querySelector('input[name="photo"]');
    if (hidden) hidden.value = photoJson(photo);
    const zone = form.querySelector('.photo-zone');
    if (zone) {
      zone.innerHTML = photoZoneInner(photo);
      zone.classList.toggle('has-photo', Boolean(photo));
      hydratePhotos(zone);
    }
  }

  async function migrateInlinePhotos() {
    const collections = [state.moments, state.personal.me.moments, state.personal.partner.moments];
    let changed = false;
    for (const list of collections) {
      for (const moment of list) {
        if (typeof moment.photo !== 'string' || !/^data:image\//i.test(moment.photo)) continue;
        try {
          const compressed = await compressImageDataUrl(moment.photo);
          const ref = await savePhotoFromDataUrl(compressed.dataUrl, compressed.w, compressed.h);
          moment.photo = ref;
          queuePhotoUpload(ref.id);
          changed = true;
        } catch (error) {
          // Leave the inline photo untouched when it cannot be decoded.
        }
      }
    }
    if (changed) {
      saveState({ skipSync: true });
      render();
      toast('旧照片已经搬到本地相册，之后会同步到坚果云');
    }
  }

  /* ------------------------------------------------------------------------
     Saving
     ------------------------------------------------------------------------ */

  function parsePhotoField(raw) {
    const value = String(raw || '');
    if (!value) return '';
    if (/^data:image\//i.test(value)) return value;
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.id) {
        return { id: String(parsed.id), w: Math.max(0, Number(parsed.w) || 0), h: Math.max(0, Number(parsed.h) || 0) };
      }
    } catch (error) {
      // ignore malformed photo payload
    }
    return '';
  }

  function saveMoment(form) {
    const formData = new FormData(form);
    const space = formData.get('space') === 'personal' ? 'personal' : 'shared';
    const rawKind = String(formData.get('kind') || '');
    const editingId = form.dataset.id;
    const editingMoment = editingId
      ? (space === 'personal'
        ? (sync.identity ? state.personal[sync.identity].moments.find((item) => item.id === editingId) : null)
        : state.moments.find((item) => item.id === editingId))
      : null;
    let kind = 'moment';
    if (space === 'personal') kind = rawKind === 'gift' ? 'gift' : 'note';
    else if (editingMoment && editingMoment.kind === 'wish') kind = 'wish';
    const text = String(formData.get('text') || '').trim();
    const photo = parsePhotoField(formData.get('photo'));
    if (!text && !photo) {
      toast('写点什么，或者放一张照片吧');
      return;
    }
    if (space === 'personal' && !sync.identity) {
      toast('先选一下你是哪一位');
      return;
    }

    const list = space === 'personal' ? state.personal[sync.identity].moments : state.moments;
    const existing = editingMoment || null;
    if (existing && space === 'shared' && existing.author !== (sync.identity || 'me')) {
      toast('只能编辑自己发的动态');
      return;
    }
    const dateValue = String(formData.get('date') || '');
    const parsedDate = new Date(dateValue);
    const date = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    const next = {
      id: existing ? existing.id : uid(),
      author: space === 'personal' ? sync.identity : (sync.identity || 'me'),
      kind,
      text,
      mood: MOODS[formData.get('mood')] ? String(formData.get('mood')) : 'happy',
      date,
      photo,
      foodEmoji: kind === 'wish' ? (existing && existing.foodEmoji) || '🍲' : '',
      wishStatus: kind === 'wish' ? ((existing && existing.wishStatus) || 'wanted') : '',
      lastActor: space === 'personal' ? sync.identity : (sync.identity || 'me'),
      lastAction: existing ? 'edit' : 'post',
      updatedAt: isoNow(),
    };
    if (existing) Object.assign(existing, next);
    else list.push(next);
    if (space === 'personal') state.personal[sync.identity].updatedAt = isoNow();
    if (!saveState()) return;
    closeModal();
    render();
    if (space === 'personal') toast(existing ? '小纸条改好啦' : '放进小岛啦，只有你能看到');
    else toast(existing ? '改好啦，还是你们的故事' : '记下啦，这一天有你们');
  }

  function splitList(value, limit = 8) {
    return [...new Set(String(value || '')
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean))].slice(0, limit);
  }

  function saveDish(form) {
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
    const tags = splitList(formData.get('tags'), 8);
    const wantedBy = splitList(formData.get('wantedBy'), 2).filter((role) => role === 'me' || role === 'partner');
    const id = form.dataset.id;
    const existing = id ? state.wishes.dishes.find((dish) => dish.id === id) : null;
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
      wantedBy: wantedBy.length ? wantedBy : (sync.identity ? [sync.identity] : ['me']),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      cookedAt: existing ? existing.cookedAt : '',
      updatedAt: isoNow(),
    };
    if (existing) Object.assign(existing, next);
    else state.wishes.dishes.unshift(next);
    if (!saveState()) return;
    closeModal();
    render();
    toast(existing ? '改好啦' : '收进想吃清单啦，改天一起做');
  }

  function savePlace(form) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    if (!name) {
      toast('先写一下店名吧');
      return;
    }
    const mapUrl = String(formData.get('mapUrl') || '').trim();
    if (mapUrl && !/^(https?:\/\/|geo:|amapuri:|baidumap:|qqmap:)/i.test(mapUrl)) {
      toast('地图链接看起来不对，可以直接留空');
      return;
    }
    const wantedBy = splitList(formData.get('wantedBy'), 2).filter((role) => role === 'me' || role === 'partner');
    const photo = parsePhotoField(formData.get('photo'));
    const id = form.dataset.id;
    const existing = id ? state.wishes.places.find((place) => place.id === id) : null;
    const status = formData.get('status') === 'visited' ? 'visited' : 'wanted';
    const next = {
      id: existing ? existing.id : uid(),
      name,
      scene: PLACE_SCENES[formData.get('scene')] ? String(formData.get('scene')) : 'other',
      city: String(formData.get('city') || '').trim(),
      address: String(formData.get('address') || '').trim(),
      mapUrl,
      dishes: splitList(formData.get('dishes'), 12),
      tags: splitList(formData.get('tags'), 6),
      note: String(formData.get('note') || '').trim(),
      photos: photo
        ? [photo]
        : (existing && existing.photos ? existing.photos : []),
      wantedBy: wantedBy.length ? wantedBy : (sync.identity ? [sync.identity] : ['me']),
      status,
      favorite: Boolean(formData.get('favorite')),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      visitedAt: existing ? existing.visitedAt : '',
      updatedAt: isoNow(),
    };
    if (status === 'visited' && !next.visitedAt) next.visitedAt = isoNow();
    if (status === 'wanted') next.visitedAt = '';
    if (existing) Object.assign(existing, next);
    else state.wishes.places.unshift(next);
    if (!saveState()) return;
    closeModal();
    render();
    toast(existing ? '这家店改好啦' : '收藏好啦，等一个去吃的日子');
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
    syncReminderConfig();
    closeModal();
    render();
    toast(existing ? '这个日子改好啦' : '记下啦，到时候一起过');
  }

  function saveProfile(form) {
    if (!sync.identity) {
      toast('先选你是哪一位，再改名字');
      openIdentityModal();
      return;
    }
    const formData = new FormData(form);
    const myName = String(formData.get('myName') || '').trim();
    const role = sync.identity;
    const date = String(formData.get('togetherDate') || '');
    if (!myName) {
      toast('先写下你的名字');
      return;
    }
    if (!isValidDateStr(date)) {
      toast('在一起的日子好像不太对');
      return;
    }
    const now = isoNow();
    if (state.names[role] !== myName) {
      state.names[role] = myName;
      state.namesUpdatedAt[role] = now;
      state.profileUpdatedAt = now;
    }
    if (state.togetherDate !== date) {
      state.togetherDate = date;
      state.togetherDateUpdatedAt = now;
      state.profileUpdatedAt = now;
    }
    state.profileDefaultsVersion = PROFILE_DEFAULTS_VERSION;
    state.onboarded = true;
    if (!saveState()) return;
    render();
    toast('好，你的名字改好了');
  }

  /* ------------------------------------------------------------------------
     Data import / export
     ------------------------------------------------------------------------ */

  function collectPhotoIds(rootState) {
    const ids = new Set();
    const add = (photo) => {
      if (photo && typeof photo === 'object' && photo.id) ids.add(photo.id);
    };
    (rootState.moments || []).forEach((moment) => add(moment.photo));
    ['me', 'partner'].forEach((role) => {
      const personal = rootState.personal && rootState.personal[role];
      ((personal && personal.moments) || []).forEach((moment) => add(moment.photo));
    });
    (((rootState.wishes || {}).places) || []).forEach((place) => {
      (place.photos || []).forEach(add);
    });
    return [...ids];
  }

  async function exportData() {
    toast('正在打包备份，照片多的话要等一下…');
    const snapshot = JSON.parse(JSON.stringify(state));
    const photos = {};
    for (const id of collectPhotoIds(snapshot)) {
      const dataUrl = await readPhotoDataUrl(id);
      if (dataUrl) photos[id] = dataUrl;
    }
    const payload = {
      app: 'xiaoman',
      kind: 'backup',
      version: SCHEMA_VERSION,
      exportedAt: isoNow(),
      data: snapshot,
      photos,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `小满-完整备份-${localDateStr()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`备份导出好啦，含 ${Object.keys(photos).length} 张照片`);
  }

  function handleImport(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast('文件读取失败，再试一次吧');
    reader.onload = () => {
      let payload;
      try {
        payload = JSON.parse(String(reader.result || ''));
      } catch (error) {
        toast('这个文件不像是小满的备份');
        input.value = '';
        return;
      }
      const data = payload && payload.data ? payload.data : payload;
      const photos = payload && payload.photos && typeof payload.photos === 'object' ? payload.photos : {};
      if (!data || typeof data !== 'object'
        || !Array.isArray(data.moments)
        || (!Array.isArray(data.anniversaries) && !Array.isArray(data.recipes) && !data.wishes)) {
        toast('这个文件不像是小满的备份');
        input.value = '';
        return;
      }
      openConfirm({
        title: '导入这份备份？',
        message: `现在的内容会被这份备份替换${Object.keys(photos).length ? `，并写入 ${Object.keys(photos).length} 张照片` : ''}。如果现在也有重要的记录，先导出一份再继续。`,
        confirmText: '导入',
        danger: false,
        onConfirm: async () => {
          state = normalizeState(data);
          state.profileDefaultsVersion = PROFILE_DEFAULTS_VERSION;
          state.onboarded = true;
          saveState();
          applyTheme();
          render();
          for (const [id, dataUrl] of Object.entries(photos)) {
            try {
              await savePhotoFromDataUrl(String(dataUrl), 0, 0, id);
              queuePhotoUpload(id);
            } catch (error) {
              // Skip unreadable photos.
            }
          }
          await migrateInlinePhotos();
          syncReminderConfig();
          render();
          toast('导入成功，你们的小世界回来啦');
        },
      });
    };
    reader.readAsText(file);
    input.value = '';
  }

  /* ------------------------------------------------------------------------
     Delete flows
     ------------------------------------------------------------------------ */

  function addTombstone(type, id) {
    if (!state.tombstones || !state.tombstones[type]) {
      state.tombstones = { moments: {}, dishes: {}, places: {}, anniversaries: {}, ...(state.tombstones || {}) };
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
        message: '它会从我的小岛里消失，删掉就找不回来了。',
        confirmText: '删掉',
        onConfirm: () => {
          personal.tombstones[id] = isoNow();
          personal.moments = personal.moments.filter((item) => item.id !== id);
          personal.updatedAt = isoNow();
          saveState();
          render();
          toast('已经从小岛里删掉了');
        },
      });
      return;
    }
    const moment = state.moments.find((item) => item.id === id);
    if (!moment) return;
    if (!canManageMoment(moment)) {
      toast('只能删除自己发的动态');
      return;
    }
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

  function requestDeleteDish(id) {
    const dish = state.wishes.dishes.find((item) => item.id === id);
    if (!dish) return;
    closeModal();
    openConfirm({
      title: `删掉「${dish.name}」？`,
      message: '这道菜会从想吃清单里消失，之后就不能再翻到了。',
      confirmText: '删掉',
      onConfirm: () => {
        addTombstone('dishes', id);
        state.wishes.dishes = state.wishes.dishes.filter((item) => item.id !== id);
        saveState();
        render();
        toast('已经删掉了');
      },
    });
  }

  function requestDeletePlace(id) {
    const place = state.wishes.places.find((item) => item.id === id);
    if (!place) return;
    closeModal();
    openConfirm({
      title: `删掉「${place.name}」？`,
      message: '这家店会从想吃清单里消失，想再找回来就麻烦了。',
      confirmText: '删掉',
      onConfirm: () => {
        (place.photos || []).forEach((photo) => { if (photo && photo.id) removePhotoBytes(photo.id); });
        addTombstone('places', id);
        state.wishes.places = state.wishes.places.filter((item) => item.id !== id);
        saveState();
        render();
        toast('已经删掉了');
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
        syncReminderConfig();
        render();
        toast('纪念日已经删掉了');
      },
    });
  }

  /* ------------------------------------------------------------------------
     Actions
     ------------------------------------------------------------------------ */

  function reactMoment(id, key) {
    if (!REACTIONS[key]) return;
    const me = sync.identity || 'me';
    const moment = state.moments.find((item) => item.id === id);
    if (!moment) return;
    const reactions = { ...(moment.reactions || {}) };
    if (reactions[me] === key) delete reactions[me];
    else reactions[me] = key;
    moment.reactions = reactions;
    moment.lastActor = me;
    moment.lastAction = 'react';
    moment.updatedAt = isoNow();
    if (!saveState()) return;
    render();
    toast(reactions[me] ? `回应了「${REACTIONS[key].label}」` : '取消回应');
  }

  function commentMoment(id, rawText) {
    const text = String(rawText || '').trim().slice(0, 200);
    if (!text) return false;
    const me = sync.identity || 'me';
    const moment = state.moments.find((item) => item.id === id);
    if (!moment) return false;
    const comments = [...(moment.comments || []), { id: uid(), author: me, text, at: isoNow() }].slice(-50);
    moment.comments = comments;
    moment.lastActor = me;
    moment.lastAction = 'comment';
    moment.updatedAt = isoNow();
    if (!saveState()) return false;
    render();
    return true;
  }

  function sendNudge() {
    if (!sync.identity) {
      openIdentityModal();
      return;
    }
    const recent = state.nudges.some((nudge) => nudge.from === sync.identity
      && Date.now() - new Date(nudge.at).getTime() < 10 * 60 * 1000);
    if (recent) {
      toast('刚刚已经想过了，等 TA 看到吧');
      return;
    }
    state.nudges = [{ id: uid(), from: sync.identity, at: isoNow() }, ...state.nudges].slice(0, 60);
    if (!saveState()) return;
    markRead('nudges');
    render();
    toast('想你一下，放进口袋了；TA 下次同步会看到');
  }

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
    const dish = state.wishes.dishes.find((item) => item.id === id);
    if (!dish) return;
    dish.favorite = !dish.favorite;
    dish.updatedAt = isoNow();
    if (!saveState()) return;
    $$('[data-fav-id]').forEach((button) => {
      if (button.dataset.favId !== id) return;
      button.classList.toggle('is-fav', dish.favorite);
      button.setAttribute('aria-pressed', String(dish.favorite));
      button.setAttribute('aria-label', dish.favorite ? '取消收藏' : '收藏');
      const label = button.querySelector('.fav-label');
      if (label) {
        label.textContent = dish.favorite ? '已收藏' : '收藏';
        button.classList.toggle('btn-soft', dish.favorite);
        button.classList.toggle('btn-ghost', !dish.favorite);
        const heart = button.querySelector('svg.icon');
        if (heart) heart.classList.toggle('fill', dish.favorite);
      }
    });
    toast(dish.favorite ? '已放进收藏' : '已取消收藏');
  }

  function togglePlaceFavorite(id) {
    const place = state.wishes.places.find((item) => item.id === id);
    if (!place) return;
    place.favorite = !place.favorite;
    place.updatedAt = isoNow();
    if (!saveState()) return;
    $$('[data-fav-id]').forEach((button) => {
      if (button.dataset.favId !== id) return;
      button.classList.toggle('is-fav', place.favorite);
      button.setAttribute('aria-pressed', String(place.favorite));
      button.setAttribute('aria-label', place.favorite ? '取消收藏' : '收藏');
      const label = button.querySelector('.fav-label');
      if (label) {
        label.textContent = place.favorite ? '已收藏' : '收藏';
        button.classList.toggle('btn-soft', place.favorite);
        button.classList.toggle('btn-ghost', !place.favorite);
        const heart = button.querySelector('svg.icon');
        if (heart) heart.classList.toggle('fill', place.favorite);
      }
    });
    toast(place.favorite ? '已放进收藏' : '已取消收藏');
  }

  function markCooked(id) {
    const dish = state.wishes.dishes.find((item) => item.id === id);
    if (!dish) return;
    dish.cookedAt = new Date().toISOString();
    dish.updatedAt = isoNow();
    if (!saveState()) return;
    $$('[data-cooked-id]').forEach((button) => {
      if (button.dataset.cookedId === id) {
        button.classList.add('is-done');
        button.innerHTML = `${icon('check')} 今天做过啦`;
      }
    });
    render();
    toast(`记下啦，今天做了 ${dish.name}`);
  }

  function markVisited(id) {
    const place = state.wishes.places.find((item) => item.id === id);
    if (!place) return;
    place.status = place.status === 'visited' ? 'wanted' : 'visited';
    place.visitedAt = place.status === 'visited' ? isoNow() : '';
    place.updatedAt = isoNow();
    if (!saveState()) return;
    closeModal();
    render();
    toast(place.status === 'visited' ? '记下啦，这家店去过了' : '又放回想去的清单啦');
  }

  function randomDish() {
    const dishes = state.wishes.dishes;
    if (!dishes.length) {
      openDishModal();
      return;
    }
    let pool = dishes;
    if (pool.length > 1) {
      const current = currentDinner();
      pool = pool.filter((dish) => !current || dish.id !== current.id);
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (getRoute() === 'home') {
      ui.dinnerId = picked.id;
      render();
      toast('换好啦，今晚吃这个？');
    } else {
      openDishDetail(picked.id);
    }
  }

  function randomPlace() {
    const pool = state.wishes.places.filter((place) => place.status === 'wanted');
    if (!pool.length) {
      if (!state.wishes.places.length) openPlaceModal();
      else toast('想去的店都去过啦，再加一家吧');
      return;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    openPlaceDetail(picked.id);
  }

  function quickAdd() {
    const route = getRoute();
    if (route === 'wishes') {
      if (ui.wishTab === 'places') openPlaceModal();
      else openDishModal();
    } else if (route === 'days') openAnnivModal();
    else if (route === 'me') openMomentModal(null, '', { space: 'personal', kind: 'note' });
    else openMomentModal();
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  function handleClick(event) {
    if (!event.target.closest('#avatar-menu')
      && !event.target.closest('#topbar-avatar-btn')
      && !event.target.closest('#sidebar-avatar-btn')) {
      closeAvatarMenu();
    }
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement || actionElement.hasAttribute('disabled')) return;
    const action = actionElement.dataset.action;
    if (action !== 'toggle-avatar-menu') closeAvatarMenu();

    if (action === 'toggle-avatar-menu') {
      toggleAvatarMenu();
      return;
    }

    if (action === 'open-settings') {
      openSettings(actionElement.dataset.tab || 'basic');
      return;
    }

    if (action === 'close-settings') {
      closeSettings();
      return;
    }

    if (action === 'settings-tab') {
      switchSettingsTab(actionElement.dataset.tab || 'basic');
      return;
    }

    if (action === 'request-notify-permission') {
      requestNotifyPermission();
      return;
    }

    if (action === 'test-notify') {
      testNotification();
      return;
    }

    if (action === 'toggle-space') {
      switchSpace();
      return;
    }

    if (action === 'history-prev') {
      ui.historyMonth = shiftMonthKey(ui.historyMonth || currentMonthKey(), -1);
      render();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    if (action === 'history-next') {
      const next = shiftMonthKey(ui.historyMonth || currentMonthKey(), 1);
      if (next > currentMonthKey()) {
        toast('已经是最新的月份啦');
        return;
      }
      ui.historyMonth = next;
      render();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    if (action === 'history-latest') {
      ui.historyMonth = latestRecordedMonth();
      render();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    if (action === 'edit-name') {
      const display = $('#name-display');
      const editor = $('#name-editor');
      if (!display || !editor) return;
      display.classList.add('hidden');
      editor.classList.remove('hidden');
      const input = $('#profile-me');
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
      }
      return;
    }

    if (action === 'cancel-name') {
      const display = $('#name-display');
      const editor = $('#name-editor');
      if (!display || !editor) return;
      editor.classList.add('hidden');
      display.classList.remove('hidden');
      const input = $('#profile-me');
      if (input) input.value = sync.identity ? nameOf(sync.identity) : state.names.me;
      return;
    }

    if (action === 'switch-identity') {
      confirmSwitchIdentity();
      return;
    }

    if (action === 'back') {
      if (isSettingsOpen()) closeSettings();
      else if (getRoute() === 'history') window.location.hash = 'moments';
      else window.location.hash = 'home';
      return;
    }

    if (action === 'set-motion') {
      const level = actionElement.dataset.motion;
      if (!MOTION_LEVELS.includes(level)) return;
      ui.motion = level;
      applyMotion();
      saveUiPrefs();
      $$('.motion-options button').forEach((button) => {
        button.classList.toggle('active', button.dataset.motion === level);
      });
      toast(`动画已切换为${MOTION_NAMES[level]}`);
      return;
    }

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
      openMomentModal();
      return;
    }

    if (action === 'react-moment') {
      reactMoment(actionElement.dataset.id, actionElement.dataset.react);
      return;
    }

    if (action === 'send-nudge') {
      sendNudge();
      return;
    }

    if (action === 'reply-nudge') {
      markRead('nudges');
      sendNudge();
      return;
    }

    if (action === 'dismiss-nudge') {
      markRead('nudges');
      render();
      return;
    }

    if (action === 'open-memory') {
      openMemory(actionElement.dataset.id);
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

    if (action === 'add-dish') {
      openDishModal();
      return;
    }

    if (action === 'add-place') {
      openPlaceModal();
      return;
    }

    if (action === 'parse-place-link') {
      const form = actionElement.closest('form');
      if (!form) return;
      const input = form.querySelector('#place-link');
      const parsed = parsePlaceLink(input ? input.value : '');
      if (!parsed || (!parsed.name && !parsed.mapUrl)) {
        toast('没认出这个链接，直接填店名也行');
        return;
      }
      fillPlaceForm(form, parsed);
      const platform = PLACE_PLATFORMS[parsed.platform] || '分享链接';
      if (parsed.name && parsed.address) toast(`从${platform}认出「${parsed.name}」，地址也填好了`);
      else if (parsed.name) toast(`从${platform}认出「${parsed.name}」`);
      else toast('链接记下了，店名补一下');
      return;
    }

    if (action === 'wish-tab') {
      ui.wishTab = actionElement.dataset.tab === 'places' ? 'places' : 'dishes';
      render();
      return;
    }

    if (action === 'filter-drawer') {
      ui.drawerFilter = ['all', 'note', 'gift'].includes(actionElement.dataset.filter)
        ? actionElement.dataset.filter
        : 'all';
      render();
      return;
    }

    if (action === 'plan-wish') {
      planWish(actionElement.dataset.id);
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
      if (moment) {
        if (space === 'shared' && !canManageMoment(moment)) {
          toast('只能编辑自己发的动态');
          return;
        }
        openMomentModal(moment, '', { space });
      }
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
      $$('#moment-filters .chip, #history-filters .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.filter === ui.momentFilter);
      });
      applyMomentFilter();
      return;
    }

    if (action === 'open-dish') {
      openDishDetail(actionElement.dataset.id);
      return;
    }

    if (action === 'edit-dish') {
      const dish = state.wishes.dishes.find((item) => item.id === actionElement.dataset.id);
      if (!dish) return;
      closeModal();
      window.setTimeout(() => openDishModal(dish), 40);
      return;
    }

    if (action === 'delete-dish') {
      requestDeleteDish(actionElement.dataset.id);
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

    if (action === 'random-dish') {
      randomDish();
      return;
    }

    if (action === 'open-place') {
      openPlaceDetail(actionElement.dataset.id);
      return;
    }

    if (action === 'edit-place') {
      const place = state.wishes.places.find((item) => item.id === actionElement.dataset.id);
      if (!place) return;
      closeModal();
      window.setTimeout(() => openPlaceModal(place), 40);
      return;
    }

    if (action === 'delete-place') {
      requestDeletePlace(actionElement.dataset.id);
      return;
    }

    if (action === 'toggle-place-favorite') {
      togglePlaceFavorite(actionElement.dataset.favId);
      return;
    }

    if (action === 'mark-visited') {
      markVisited(actionElement.dataset.id);
      return;
    }

    if (action === 'open-map') {
      openPlaceMap(actionElement.dataset.id);
      return;
    }

    if (action === 'random-place') {
      randomPlace();
      return;
    }

    if (action === 'filter-dish-tag') {
      ui.dishTag = actionElement.dataset.tag || '全部';
      $$('#dish-tags .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.tag === ui.dishTag);
      });
      applyWishFilters();
      return;
    }

    if (action === 'filter-place-scene') {
      ui.placeScene = actionElement.dataset.scene || 'all';
      $$('#place-scenes .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.scene === ui.placeScene);
      });
      applyWishFilters();
      return;
    }

    if (action === 'filter-place-who') {
      ui.placeWho = actionElement.dataset.who || 'all';
      $$('#place-who .chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.who === ui.placeWho);
      });
      applyWishFilters();
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
          syncReminderConfig();
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

    if (action === 'pick-who') {
      const picker = actionElement.closest('.who-picker');
      const form = actionElement.closest('form');
      if (!picker || !form) return;
      actionElement.classList.toggle('active');
      const active = $$('.who-option.active', picker).map((button) => button.dataset.who);
      if (!active.length) actionElement.classList.add('active');
      const hidden = form.querySelector('.who-value');
      if (hidden) hidden.value = $$('.who-option.active', picker).map((button) => button.dataset.who).join(',');
      return;
    }

    if (action === 'pick-scene') {
      const picker = actionElement.closest('.scene-picker, .scene-chips');
      const form = actionElement.closest('form');
      if (!picker || !form) return;
      $$('.scene-option, .scene-chip', picker).forEach((button) => button.classList.toggle('active', button === actionElement));
      const hidden = form.querySelector('.scene-value');
      if (hidden) hidden.value = actionElement.dataset.scene || 'other';
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
      const form = actionElement.closest('form');
      const scope = form || document;
      const input = scope.querySelector('.photo-input:not([capture])');
      if (input) input.click();
      return;
    }

    if (action === 'photo-camera') {
      startCamera(actionElement);
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
    if (form.dataset && form.dataset.commentId) {
      event.preventDefault();
      const input = form.querySelector('input[name="comment"]');
      const id = form.dataset.commentId;
      if (input && commentMoment(id, input.value)) {
        const forms = $$('.comment-form');
        const target = forms.find((item) => item.dataset.commentId === id);
        if (target) {
          target.closest('.comment-write').open = true;
          const nextInput = target.querySelector('input[name="comment"]');
          if (nextInput) nextInput.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (!['moment-form', 'dish-form', 'place-form', 'anniv-form', 'profile-form', 'sync-form', 'update-form', 'notify-form'].includes(form.id)) return;
    event.preventDefault();
    if (form.id === 'moment-form') saveMoment(form);
    else if (form.id === 'dish-form') saveDish(form);
    else if (form.id === 'place-form') savePlace(form);
    else if (form.id === 'anniv-form') saveAnniversary(form);
    else if (form.id === 'profile-form') saveProfile(form);
    else if (form.id === 'sync-form') saveSyncForm(form);
    else if (form.id === 'update-form') saveUpdateForm(form);
    else if (form.id === 'notify-form') saveNotifyForm(form);
  }

  function handleInput(event) {
    if (event.target.id === 'dish-search') {
      ui.dishQuery = event.target.value;
      applyWishFilters();
      return;
    }
    if (event.target.id === 'place-search') {
      ui.placeQuery = event.target.value;
      applyWishFilters();
      return;
    }
    if (event.target.id === 'history-search') {
      ui.momentQuery = event.target.value;
      applyMomentFilter();
      return;
    }
    if (event.target.id === 'moment-text') {
      const count = $('#moment-text-count');
      if (count) count.textContent = `${Array.from(event.target.value).length}/800`;
    }
  }

  function handleChange(event) {
    if (event.target.id === 'history-month') {
      const value = String(event.target.value || '');
      if (/^\d{4}-\d{2}$/.test(value)) {
        ui.historyMonth = value;
        render();
      }
      return;
    }
    if (event.target.classList && event.target.classList.contains('photo-input')) {
      handlePhoto(event.target);
      return;
    }
    if (event.target.id === 'import-file') {
      handleImport(event.target);
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (!$('#avatar-menu')?.classList.contains('hidden')) {
        closeAvatarMenu();
      } else if ($('#confirm').classList.contains('open')) {
        closeConfirm();
        confirmCallback = null;
      } else if ($('#modal').classList.contains('open')) {
        closeModal();
      } else if (isSettingsOpen()) {
        closeSettings();
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
    notify = loadNotify();
    saveSync();
    saveState({ skipSync: true });
    loadUiPrefs();
    loadRead();
    applyMotion();
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
    syncNotifyConfig();
    syncReminderConfig();
    consumeLaunchRoute();
    refreshCurrentVersion();
    if (!sync.identity) {
      window.setTimeout(() => openIdentityModal(), 420);
    } else {
      window.setTimeout(() => { migrateInlinePhotos(); }, 900);
    }
    if (sync.auto && isSyncConfigured()) {
      window.setTimeout(() => syncNow({ silent: true }), 1400);
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

  async function consumeLaunchRoute() {
    const plugin = notifyPlugin();
    if (!isNativeApp() || !plugin) return;
    try {
      const result = await plugin.getLaunchRoute();
      const route = result && result.route;
      if (route && ['home', 'moments', 'wishes', 'days', 'me'].includes(route)) {
        window.location.hash = route;
      }
    } catch (error) {
      // No pending route.
    }
  }

  init();
})();
