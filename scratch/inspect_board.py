with open('js/i18n.js', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'durationText' in line or 'periodText' in line:
        print(f"Line {idx+1}: {line.strip()}")
