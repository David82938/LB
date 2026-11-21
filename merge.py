import re
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
src_dir = root / 'src'

def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def split_app_sections() -> None:
    app_path = src_dir / 'app.js'
    content = read(app_path)
    section_pattern = re.compile(r'/\* ={20,} ([A-Z ]+) \*/')
    matches = list(section_pattern.finditer(content))
    if not matches:
        return

    sections_dir = src_dir / 'sections'
    sections_dir.mkdir(exist_ok=True)
    placeholders = []

    for i, match in enumerate(matches):
        title = match.group(1).strip()
        filename_title = re.sub(r'[^A-Za-z0-9]+', '_', title.lower()).strip('_')
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        section_body = content[start:end].strip()

        if i == 0:
            prefix = content[:match.start()].strip()
            section_body = prefix + ("\n\n" if prefix else '') + match.group(0) + '\n' + section_body
        else:
            section_body = match.group(0) + '\n' + section_body

        section_path = sections_dir / f'{filename_title}.js'
        section_path.write_text(section_body + '\n', encoding='utf-8')
        placeholders.append(f'{{{{sections/{filename_title}.js}}}}')

    app_path.write_text('\n'.join(placeholders) + '\n', encoding='utf-8')


split_app_sections()


def replace_placeholders(template: str, base_dir: Path = src_dir, seen: set[Path] | None = None) -> str:
    pattern = re.compile(r'(?P<indent>[ \t]*)\{\{\s*(?P<filename>[A-Za-z0-9_./-]+)\s*\}\}')
    seen = seen or set()

    def repl(match: re.Match[str]) -> str:
        filename = match.group('filename')
        indent = match.group('indent')
        target = (base_dir / filename).resolve()
        if target.exists() is False:
            target = (src_dir / filename).resolve()
        if target.exists() is False:
            raise FileNotFoundError(f'Missing file for placeholder {{ {{ {filename} }} }}: {target}')

        if target in seen:
            raise RecursionError(f'Circular placeholder dependency detected for {filename}')

        seen.add(target)
        content = read(target).rstrip('\n')
        content = replace_placeholders(content, target.parent, seen)
        seen.remove(target)

        if not content:
            return indent

        lines = content.splitlines()
        return '\n'.join(f'{indent}{line}' if line else indent for line in lines)

    return pattern.sub(repl, template)


template = read(root / 'template.txt')
rendered = replace_placeholders(template)

out_dir = root / 'docs'
out_dir.mkdir(exist_ok=True)
out_dir.joinpath('index.html').write_text(rendered, encoding='utf-8')
shutil.copy2(src_dir / 'puzzles.json', out_dir / 'puzzles.json')
print(f'Wrote {out_dir / "index.html"}')
