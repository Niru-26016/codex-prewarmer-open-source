"""Create an allowlisted VM release; credentials are never included in its archive."""
from pathlib import Path
import argparse, hashlib, json, tarfile, time, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--vendor', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
vendor = args.vendor or repo / '.build/vm-vendor'
output = args.output or repo / '.build/vm-packages'
vendor.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
lock = json.loads((repo / 'runner/vendor-lock.json').read_text())

def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(512 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()

for entry in lock.values():
    archive = vendor / entry['filename']
    if not archive.exists():
        temporary = archive.with_suffix(archive.suffix + '.partial')
        with urllib.request.urlopen(entry['url'], timeout=90) as response, temporary.open('wb') as target:
            while chunk := response.read(512 * 1024):
                target.write(chunk)
        temporary.replace(archive)
    if sha(archive) != entry['sha256']:
        raise RuntimeError('Vendor archive checksum mismatch: ' + entry['filename'])

release = 'vm-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
payload = output / release
payload.mkdir(mode=0o700)

def put(relative, stream, executable=False):
    target = payload / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('wb') as out:
        for chunk in iter(lambda: stream.read(512 * 1024), b''):
            out.write(chunk)
    target.chmod(0o755 if executable else 0o644)

with tarfile.open(vendor / lock['node']['filename']) as archive:
    put('runtime/bin/node', archive.extractfile('node-v22.23.2-linux-x64/bin/node'), True)
with tarfile.open(vendor / lock['codex']['filename']) as archive:
    for name in ['bin/codex', 'bin/codex-code-mode-host', 'codex-resources/bwrap', 'codex-path/rg']:
        put('vendor/' + name, archive.extractfile('package/vendor/x86_64-unknown-linux-musl/' + name), True)
for name in ['scripts/runner.mjs', 'scripts/vm-runner.mjs', 'scripts/private-config.mjs', 'src/security.js', 'infra/codex-prewarmer.service']:
    with (repo / name).open('rb') as source:
        put(name, source)
(payload / 'package.json').write_text('{"name":"codex-prewarmer-vm-runner","private":true,"type":"module"}\n')
files = {str(path.relative_to(payload)): sha(path) for path in payload.rglob('*') if path.is_file()}
(payload / 'manifest.json').write_text(json.dumps({'application': 'codex-prewarmer-vm-runner', 'release': release, 'files': files}, indent=2) + '\n')
archive = output / (release + '.tgz')
with tarfile.open(archive, 'w:gz', compresslevel=1) as tar:
    for path in payload.rglob('*'):
        if path.is_file():
            tar.add(path, arcname=str(path.relative_to(payload)), recursive=False)
archive.chmod(0o600)
print(json.dumps({'release': release, 'archive': str(archive), 'sha256': sha(archive), 'credentialFilesIncluded': False}))
