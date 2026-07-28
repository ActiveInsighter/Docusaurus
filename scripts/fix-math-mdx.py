from pathlib import Path
import re

root = Path('docs/数学真题')


def unescaped_dollars(line: str):
    result = []
    i = 0
    while i < len(line):
        if line[i] == '$' and (i == 0 or line[i - 1] != '\\'):
            if i + 1 < len(line) and line[i + 1] == '$':
                result.append((i, 2))
                i += 2
                continue
            result.append((i, 1))
        i += 1
    return result


def brace_balance(source: str):
    balance = 0
    escaped = False
    for char in source:
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if char == '{':
            balance += 1
        elif char == '}':
            balance -= 1
    return balance


def fix_inline_math(line: str):
    if line.strip() != '$$':
        line = re.sub(r'\$\$([^\n$]+?)\$\$', lambda match: '$' + match.group(1) + '$', line)

    output = []
    i = 0
    while i < len(line):
        if (
            line[i] == '$'
            and (i == 0 or line[i - 1] != '\\')
            and not (i + 1 < len(line) and line[i + 1] == '$')
        ):
            j = i + 1
            while j < len(line):
                if line[j] == '$' and line[j - 1] != '\\':
                    break
                j += 1
            if j >= len(line):
                output.append(line[i:])
                break
            body = line[i + 1:j]
            balance = brace_balance(body)
            if balance > 0:
                body += '}' * balance
            output.append('$' + body + '$')
            i = j + 1
        else:
            output.append(line[i])
            i += 1
    return ''.join(output)


changed_files = 0
changed_lines = 0

for path in sorted(root.rglob('*.mdx')):
    original = path.read_text(encoding='utf-8')
    lines = original.splitlines()

    lines = [fix_inline_math(line) for line in lines]

    in_block = False
    block_lines = set()
    start = None
    for index, line in enumerate(lines):
        for _, width in [item for item in unescaped_dollars(line) if item[1] == 2]:
            if not in_block:
                in_block = True
                start = index
            else:
                for block_index in range(start, index + 1):
                    block_lines.add(block_index)
                in_block = False
                start = None

    output = []
    for index, line in enumerate(lines):
        if index in block_lines:
            stripped = line.lstrip()
            indent = line[: len(line) - len(stripped)]
            if stripped and not stripped.startswith('$$'):
                if stripped.startswith('{') and output:
                    output[-1] = output[-1].rstrip() + stripped
                    changed_lines += 1
                    continue
                if stripped.startswith('<') or stripped.startswith('>'):
                    line = indent + r'\displaystyle {}' + stripped
                    changed_lines += 1
        output.append(line)
    lines = output

    in_block = False
    ranges = []
    start = None
    for index, line in enumerate(lines):
        for _, width in [item for item in unescaped_dollars(line) if item[1] == 2]:
            if not in_block:
                in_block = True
                start = index
            else:
                ranges.append((start, index))
                in_block = False
                start = None

    for start, end in ranges:
        previous = start - 1
        while previous >= 0 and not lines[previous].strip():
            previous -= 1
        if previous >= 0 and re.match(r'^\s*[-*+]\s+', lines[previous]):
            for index in range(start, end + 1):
                if not lines[index].startswith('  '):
                    lines[index] = '  ' + lines[index]
                    changed_lines += 1

    updated = '\n'.join(lines) + '\n'
    if updated != original:
        path.write_text(updated, encoding='utf-8')
        changed_files += 1

print(f'MDX_FIX changed_files={changed_files} changed_lines={changed_lines}')
