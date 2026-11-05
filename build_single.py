#!/usr/bin/env python3
"""把三个源码文件打包成一个可以直接双击打开的 HTML。

用法：
    python build_single.py

生成：小满.html
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")

    css_tag = '<link rel="stylesheet" href="styles.css">'
    js_tag = '<script src="app.js"></script>'
    if css_tag not in html or js_tag not in html:
        raise SystemExit("index.html 里找不到 styles.css 或 app.js 的引用，先检查源码。")

    html = html.replace(css_tag, "<style>\n" + css + "\n</style>")
    html = html.replace(js_tag, "<script>\n" + js + "\n</script>")

    output = ROOT / "小满.html"
    output.write_text(html, encoding="utf-8")
    print(f"已生成：{output}（{output.stat().st_size / 1024:.1f} KB）")


if __name__ == "__main__":
    main()
