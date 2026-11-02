"""Gộp docs/index.html và các file js/data thành một file HTML duy nhất để đăng artifact claude.ai.

Chạy: python3 warranty/tools/build_artifact.py [đường_dẫn_ra]
Mặc định ghi ra warranty/build/artifact.html (không commit).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs'

# Font Awesome không tải được trong artifact: thay bằng ký tự đơn giản
ICON_CSS = """
    /* Icon thay thế (Font Awesome không tải được trong artifact) */
    .fa-solid, .fa-regular { display: inline-block; width: 1.1em; text-align: center; font-style: normal; font-weight: 800; line-height: 1; }
    .fa-circle-check::before { content: "\\2713"; }
    .fa-circle-xmark::before { content: "\\2715"; }
    .fa-circle-question::before { content: "?"; }
    .fa-triangle-exclamation::before { content: "!"; }
    .fa-circle-info::before { content: "i"; }
    .fa-clock::before { content: "\\2022"; }
    .fa-envelope::before { content: "\\2709"; }
    .fa-rotate-left::before { content: "\\21BA"; }
    .fa-calendar::before { content: "\\25F7"; }
    .fa-shield-halved::before { content: "\\25C6"; }
    .fa-chart-bar::before { content: "\\25AE"; }
    .fa-ticket::before { content: "\\25A4"; }
    .fa-paper-plane::before { content: "\\27A4"; }
    .fa-file-circle-plus::before { content: "+"; }
"""


def build() -> str:
    html = (DOCS / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'\s*<link[^>]*font-awesome[^>]*>', '', html)
    html = html.replace('<title>Bảo hành cửa hàng · WinCommerce</title>', '<title>Bảo hành cửa hàng</title>')
    html = html.replace('  </style>\n</head>', ICON_CSS + '  </style>\n</head>', 1)

    def inline(m):
        src = m.group(1)
        if src.startswith('http'):
            return m.group(0)
        code = (DOCS / src).read_text(encoding='utf-8').replace('</script', '<\\/script')
        return f'<script>\n{code}\n</script>'

    html, n = re.subn(r'<script src="([^"]+)"></script>', inline, html)
    if 'src="js/' in html or 'src="data/' in html:
        raise SystemExit('Còn script cục bộ chưa gộp')
    return html


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'warranty' / 'build' / 'artifact.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(), encoding='utf-8')
    print(f'Đã ghi {out} ({out.stat().st_size // 1024} KB)')
