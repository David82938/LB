import re
from pathlib import Path

root = Path(__file__).resolve().parent
src_dir = root / 'src'

def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def replace_placeholders(template: str, base_dir: Path = src_dir, seen: set[Path] | None = None) -> str:
    pattern = re.compile(r'(?P<indent>[ \t]*)\{\{\s*(?P<filename>[A-Za-z0-9_./-]+)\s*\}\}')
    seen = seen or set()

    def repl(match: re.Match[str]) -> str:
        filename = match.group('filename')
        indent = match.group('indent')
        target = (base_dir / filename).resolve()
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
print(f'Wrote {out_dir / "index.html"}')
