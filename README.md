# 小满 · 两个人的小小宇宙

> 一个给两个人用的安卓 App：**共享为主，各有一个云端小抽屉**。  
> 记录日常、收藏菜谱、倒数纪念日，也可以把“突然想吃什么”做成一张卡片发给对方。

![共享空间的想吃卡片](preview-android.png)

![我的小抽屉](preview-drawer.png)

## 它是什么

小满不是普通的共享账本，而是三个空间：

| 空间 | 用途 | 谁能看到 |
| --- | --- | --- |
| 我们的空间 | 日常、菜谱、纪念日、想吃卡片 | 两个人都能看 |
| 我的小抽屉 | 给 TA 的惊喜、礼物计划、只想自己记的事 | 只在“我”的身份下出现 |
| TA 的小抽屉 | 对方自己的小空间 | 只在“TA”的身份下出现 |

两个身份是 App 内的身份，不需要注册两套账号。两台手机仍然共用**一个坚果云账号**同步。

> 小抽屉没有加密，只是和共享空间分开存放、默认不在对方界面显示。  
> 这相当于“分抽屉，不上锁”：平时不会混，但同一个坚果云账号的人理论上还是能打开文件。

## 功能

- **我们的空间**：日常、照片、心情、菜谱、纪念日
- **想吃卡片**：食物 emoji、想吃印章、共享时间线、点「安排！」变成「已安排」
- **我的小抽屉**：小纸条、礼物计划，换手机后可以恢复
- **双身份**：第一台手机选「我」，第二台选「TA」
- **坚果云同步**：共享空间 + 各自的小抽屉分开同步
- **应用内更新**：检查 GitHub Releases，下载 APK，调用系统安装器
- **主题**：珊瑚橘、鼠尾草、雾霾蓝、香芋紫

## 安装

从本仓库的 **Releases** 页面下载最新的 `xiaoman-*.apk`，传到安卓手机安装。

- v3.2.0、v3.1、v3.0 使用同一个发布签名，**可以直接覆盖安装，数据保留**。
- 更早的 v2.0 是 debug 签名，不能覆盖，需要先同步/导出，再卸载旧版安装。
- 第一次安装如果提示「未知来源」，允许当前文件管理器安装即可。

更细的安卓说明在 [android-app/README.md](android-app/README.md)。

## 第一次使用

默认值已经写好：

```text
我的名字：小鸡毛
TA 的名字：小白
在一起：2024-01-22
更新仓库：Duefor/xiaoman
备用下载：https://gh-proxy.com
```

1. 打开 App，选择你是哪一位：**我** 或 **TA**。
2. 点右上角头像 → **设置**，只改你自己的名字和在一起的日子。TA 的名字由对方自己改。
3. 设置 → 两台手机同步，填坚果云。

### 设置入口

设置不再占底部导航。点右上角头像，菜单里可以进设置、同步、检查更新。  
设置 → 动画强度：标准 / 轻微 / 关闭。

![头像菜单](preview-avatar-menu.png)

### 坚果云准备

1. 登录 [坚果云网页版](https://www.jianguoyun.com/)。
2. 右上角头像 → **设置** → **安全**。
3. 添加一个第三方应用，生成**应用密码**（不是登录密码）。
4. 在坚果云「我的文件」根目录新建文件夹 `xiaoman`。

### App 里填

- WebDAV 地址：`https://dav.jianguoyun.com/dav`
- 坚果云账号：登录邮箱
- 应用密码：上一步生成的应用密码
- 云端文件夹：`xiaoman`

点「测试连接」→「保存并同步」。

第二台手机填同一套配置，但选择另一个身份。

## 云端文件

```text
xiaoman/
  shared.json     我们的空间
  me.json         我的小抽屉
  her.json        TA 的小抽屉
  sync.json       旧版文件（保留作备份）
```

- 两台手机都同步 `shared.json`
- 每台手机只同步自己身份的 `me.json` 或 `her.json`
- 旧版 `sync.json` 会合并进 `shared.json`
- 删除会留下标记，另一台同步后也会删除

## 应用内更新

![应用内更新](preview-update.png)

更新流程：

```text
启动 App / 点「检查更新」
        ↓
请求 GitHub Release 的 latest.json
        ↓
发现 versionCode 更大
        ↓
弹窗显示版本说明
        ↓
下载 APK 并校验 SHA-256
        ↓
打开 Android 系统安装器
        ↓
覆盖安装，数据保留
```

说明：

- Android 普通 App **不能静默安装**，最后一定会弹系统安装确认；点一下确认即可。
- 第一次使用会跳「安装未知应用」权限，允许后回来再点一次安装。
- 更新必须使用同一个签名文件；当前签名在 `android-app/keystore/xiaoman-release.jks`，不要丢。
- `versionCode` 必须递增；仓库的 tag 使用 `v3.2.0` 这种格式，Actions 会自动算。

### 在中国大陆使用 GitHub

GitHub 有时会慢或连不上。App 的设置里有一个「备用下载前缀」：

```text
https://gh-proxy.com/
```

这是第三方 GitHub 代理，只作为备用；APK 会校验 SHA-256，Android 还会校验签名。  
如果你有自己稳定的代理/镜像，也可以填自己的。

不填备用前缀时，App 直接访问 GitHub；检查失败会提示，不会影响坚果云同步。

## 把代码放到 GitHub

### 1. 创建公开仓库

新建一个 **public** 仓库，比如 `xiaoman`，然后把当前目录推上去。

不要提交：

- `android-app/keystore/` 里的签名文件
- `node_modules`
- 构建目录
- APK

仓库里的 `.gitignore` 已经处理了这些。

### 2. 添加 GitHub Actions Secrets

在仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `xiaoman-release.jks` 的 base64 |
| `XIAOMAN_STORE_PASSWORD` | keystore 密码 |
| `XIAOMAN_KEY_ALIAS` | `xiaoman` |
| `XIAOMAN_KEY_PASSWORD` | key 密码 |

PowerShell 生成 base64：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("android-app/keystore/xiaoman-release.jks")
) | Set-Clipboard
```

### 3. 发布一个版本

```bash
git tag v3.2.0
git push origin v3.2.0
```

GitHub Actions 会：

1. 安装依赖
2. 同步 Capacitor 资源
3. 用 Secrets 里的 keystore 签名
4. 生成 `xiaoman-v3.2.0.apk`
5. 生成 `latest.json`（包含版本号、APK 地址、SHA-256）
6. 创建 GitHub Release

### 4. 让 App 知道仓库

打开 App →「设置 → 软件更新」：

- GitHub 仓库：`你的用户名/xiaoman`
- 备用下载前缀：可选

保存后点「检查更新」。以后每次启动，App 最多每天自动检查一次。

## 项目结构

```text
.
├── android-app/
│   ├── www/                 # H5 源码：index.html / styles.css / app.js
│   ├── android/             # Capacitor 安卓工程
│   ├── assets/              # 图标源文件
│   ├── keystore/            # 本地签名文件（不提交）
│   └── README.md            # 安卓版详细说明
├── .github/workflows/
│   └── release.yml          # tag 自动打包 + 发布
├── .gitignore
├── RELEASE_NOTES.md         # 每次发版前改这里
└── preview-*.png            # 界面预览
```

## 本地构建

需要 JDK 21、Android SDK 35、Node.js 和 pnpm。

```powershell
cd android-app
pnpm install
pnpm exec cap sync android
cd android
.\gradlew.bat assembleRelease
```

首次构建前创建 `android/local.properties`：

```properties
sdk.dir=C:/Android/Sdk
```

APK 在：

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 隐私与边界

- 日常数据默认在本机；开启同步后写到你们自己的坚果云。
- 同步使用一个坚果云账号 + 应用密码；应用密码只保存在本机。
- 小抽屉不加密，只做界面和文件隔离。
- 没有实时推送；打开 App 或自动同步时才会看到对方的新内容。
- 换手机/卸载前，建议在「设置 → 导出数据」备份。

## 之后可以继续加

- 小抽屉加密
- 纪念日系统通知
- 真正的实时同步
- 更完整的 Release 说明和自动版本号
