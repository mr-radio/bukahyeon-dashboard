#!/usr/bin/env python3
"""Regenerate share landing pages whenever CHAT_POSTS changes. No dependencies."""
from pathlib import Path
import re, json, html

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mr-radio.github.io/bukahyeon-dashboard/'
source = (ROOT / 'index.html').read_text(encoding='utf-8')
match = re.search(r'const CHAT_POSTS=(\[[\s\S]*?\]); // Date-based briefings', source)
if not match:
    raise SystemExit('CHAT_POSTS not found')
posts = json.loads(match.group(1))
out = ROOT / 'briefing'
out.mkdir(exist_ok=True)
for p in posts:
    date = p['date']
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError(date)
    lines = p['summary'].split('\n')
    if lines[0].strip() == '주요사항':
        points = [re.sub(r'^\s*[•·\-]\s+', '', x) for x in lines if re.match(r'^\s*[•·\-]\s+', x)][:3]
    else:
        points = [re.sub(r'^\d+\.\s*', '', x) for x in lines if re.match(r'^\d+\.\s', x)][:3]
    title = '아현뚜방 브리핑 · ' + date + ' | ' + re.sub(r'^.*?·\s*', '', p['title'])
    desc = ' / '.join(points)
    url = BASE + 'briefing/' + date + '.html'
    target = BASE + '#chat/' + date
    e = html.escape
    page = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="북아현3구역 브리핑"><meta property="og:locale" content="ko_KR">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}assets/pwa/icon-512.png"><meta property="og:image:width" content="512"><meta property="og:image:height" content="512">
<style>body{{font:16px/1.7 system-ui,sans-serif;margin:24px auto;padding:0 18px;max-width:650px;color:#174a3c}}a{{color:#174a3c}}h1{{font-size:1.35rem}}</style>
</head><body><h1>{e(title)}</h1><h2>주요 내용</h2><ul>{''.join('<li>'+e(x)+'</li>' for x in points)}</ul><p><a href="{target}">전체 브리핑 보기</a></p><p><a href="{BASE}">전체 대시보드 보기</a></p><script>location.replace({json.dumps(target)});</script></body></html>
'''
    (out / (date + '.html')).write_text(page, encoding='utf-8')
print(f'Generated {len(posts)} briefing preview pages. Commit briefing/ with index.html.')
