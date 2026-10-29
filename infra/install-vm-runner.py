# Manual root installer for the verified, isolated VM payload.
# Transfer a runner credential only with owner approval; never upload Codex auth.json.
import os,json,hashlib,tarfile,subprocess,time,re,shutil,argparse
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

def validate_worker_origin(value):
    message='Worker URL must be an HTTPS origin without credentials, query, fragment or a non-root path'
    if not isinstance(value,str) or not value or not value.isascii() or any(c.isspace() or ord(c)<32 or ord(c)==127 for c in value) or any(c in value for c in ['\\','?','#']):raise ValueError(message)
    try:
        parsed=urlsplit(value)
        hostname,port=parsed.hostname,parsed.port
    except ValueError:raise ValueError(message) from None
    if parsed.scheme!='https' or not hostname or parsed.username is not None or parsed.password is not None or parsed.path not in ['', '/'] or parsed.query or parsed.fragment or '%' in parsed.netloc or (parsed.netloc.startswith('[') and ':' not in hostname) or parsed.netloc.endswith(':') or port==0:raise ValueError(message)
    if ':' in hostname or re.search(r'(?:^|\.)(?:\d+|0[xX][0-9a-fA-F]+)$',hostname):
        try:address=ip_address(hostname)
        except ValueError:raise ValueError(message) from None
        hostname=f'[{address.compressed}]' if address.version==6 else str(address)
    elif not re.fullmatch(r'(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',hostname):raise ValueError(message)
    return 'https://'+hostname+(f':{port}' if port not in [None,443] else '')

def worker_origin_argument(value):
    try:return validate_worker_origin(value)
    except ValueError as error:raise argparse.ArgumentTypeError(str(error)) from None

def run(args,timeout=45):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if result.returncode:raise RuntimeError(args[0]+' failed: '+result.stderr.strip()[:800])
    return result.stdout.strip()
def health():
    if not shutil.which('docker'):return {}
    names=run(['docker','ps','--all','--format','{{.Names}}']).splitlines()
    return {name:run(['docker','inspect','--format','{{.State.Pid}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}}',name]) for name in names}
def digest(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(512*1024),b''):result.update(chunk)
    return result.hexdigest()
def main(argv=None):
    parser=argparse.ArgumentParser(description='Install the isolated VM runner payload')
    parser.add_argument('release')
    parser.add_argument('sha256')
    parser.add_argument('--worker-url',required=True,type=worker_origin_argument,help='Approved HTTPS Worker origin; must match any private runner configuration')
    parser.add_argument('--staging-root',type=Path,default=Path('/home/ubuntu/codex-prewarmer-staging'),help='Absolute directory containing RELEASE/RELEASE.tgz')
    parser.add_argument('--stage-only',action='store_true',help='Install and verify without enabling or starting the service; a credential is optional')
    args=parser.parse_args(argv)
    if os.geteuid()!=0:raise RuntimeError('Root required for the dedicated system service')
    if not args.staging_root.is_absolute():raise RuntimeError('The staging root must be an absolute path')
    release,expected=args.release,args.sha256
    if not re.fullmatch(r'vm-\d{8}T\d{6}Z',release):raise RuntimeError('Invalid release ID')
    if args.stage_only:
        probe=subprocess.run(['systemctl','show','codex-prewarmer.service','--property=LoadState,ActiveState,UnitFileState'],capture_output=True,text=True,timeout=45)
        existing=dict(line.split('=',1) for line in probe.stdout.splitlines() if '=' in line)
        if (probe.returncode and existing.get('LoadState')!='not-found') or not existing.get('LoadState'):raise RuntimeError('Unable to verify the existing runner service state')
        if existing.get('LoadState')!='not-found' and (existing.get('ActiveState') not in ['inactive','failed'] or existing.get('UnitFileState','').startswith('enabled')):raise RuntimeError('Stage-only requires the existing runner to be stopped and disabled')
    stage=args.staging_root/release
    archive=stage/(release+'.tgz')
    if digest(archive)!=expected:raise RuntimeError('Uploaded release checksum mismatch')
    config_source=stage/'runner.json'
    if not config_source.exists():config_source=Path('/etc/codex-prewarmer/runner.json')
    config=None
    if config_source.exists():
        if config_source.stat().st_mode&0o077:raise RuntimeError('Runner configuration must be private')
        config=json.loads(config_source.read_text())
        if validate_worker_origin(config.get('WORKER_URL'))!=args.worker_url or not isinstance(config.get('RUNNER_TOKEN'),str) or len(config['RUNNER_TOKEN'])<32:raise RuntimeError('Invalid private runner configuration')
        config['WORKER_URL']=args.worker_url
    elif not args.stage_only:raise RuntimeError('A private runner configuration is required to start the service')
    before=health()
    if any(value.split()[1]=='running' and value.split()[-1] in ['unhealthy','starting'] for value in before.values()):raise RuntimeError('An existing running container is not healthy')
    base=Path('/opt/codex-prewarmer')
    if base.exists() and not (base/'managed-by-prewarmer').is_file():raise RuntimeError('Unrecognized existing installation')
    base.mkdir(mode=0o755,exist_ok=True)
    (base/'managed-by-prewarmer').write_text('Dedicated isolated VM runner\n')
    releases=base/'releases';releases.mkdir(mode=0o755,exist_ok=True)
    destination=releases/release
    if destination.exists():raise RuntimeError('Release already exists; refusing overwrite')
    destination.mkdir(mode=0o755)
    with tarfile.open(archive) as tar:
        manifest=json.load(tar.extractfile('manifest.json'))
        if manifest.get('application')!='codex-prewarmer-vm-runner' or manifest.get('release')!=release:raise RuntimeError('Unrecognized payload')
        files=manifest['files']
        members=tar.getmembers()
        if set(m.name for m in members)!=set(files)|{'manifest.json'}:raise RuntimeError('Unexpected archive files')
        for member in members:
            rel=Path(member.name)
            if not member.isfile() or rel.is_absolute() or '..' in rel.parts:raise RuntimeError('Unsafe archive entry')
            target=destination/rel;target.parent.mkdir(parents=True,exist_ok=True)
            with tar.extractfile(member) as source,target.open('wb') as output:shutil.copyfileobj(source,output,512*1024)
            target.chmod(0o755 if member.name in ['runtime/bin/node','vendor/bin/codex','vendor/bin/codex-code-mode-host','vendor/codex-resources/bwrap','vendor/codex-path/rg'] else 0o644)
            if member.name!='manifest.json' and digest(target)!=files[member.name]:raise RuntimeError('Payload file checksum mismatch')
    if config is not None:
        private=Path('/etc/codex-prewarmer')
        if private.is_symlink():raise RuntimeError('Unexpected config symlink')
        private.mkdir(mode=0o700,exist_ok=True);private.chmod(0o700)
        temporary=private/'runner.json.new';temporary.write_text(json.dumps(config));temporary.chmod(0o600);os.replace(temporary,private/'runner.json')
    current=base/'current'
    if current.exists() or current.is_symlink():
        if not current.is_symlink() or current.resolve().parent!=releases:raise RuntimeError('Unexpected current release path')
    temporary=base/'current.new'
    temporary.symlink_to(destination);os.replace(temporary,current)
    unit=Path('/etc/systemd/system/codex-prewarmer.service')
    if unit.exists() and 'Codex Prewarmer isolated VM runner' not in unit.read_text():raise RuntimeError('Unrecognized existing system unit')
    shutil.copyfile(destination/'infra/codex-prewarmer.service',unit);unit.chmod(0o644)
    run(['systemd-analyze','verify',str(unit)])
    node_version=run([str(current/'runtime/bin/node'),'--version'])
    codex_version=run([str(current/'vendor/bin/codex'),'--version'])
    run(['systemctl','daemon-reload'])
    if not args.stage_only:
        run(['systemctl','enable','--now','codex-prewarmer.service'])
        time.sleep(2)
    properties=run(['systemctl','show','codex-prewarmer.service','--property=ActiveState,SubState,MainPID,MemoryCurrent,MemoryPeak,MemoryMax,MemorySwapMax,CPUQuotaPerSecUSec,NRestarts,DynamicUser,NoNewPrivileges,PrivateTmp,ProtectHome,ProtectSystem,LimitCORE'])
    after=health()
    report={'installedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'release':release,'releaseSha256':expected,'installationState':'staged' if args.stage_only else 'started','credentialProvisioned':config is not None,'serviceStartRequested':not args.stage_only,'nodeVersion':node_version,'codexVersion':codex_version,'serviceProperties':dict(line.split('=',1) for line in properties.splitlines()),'containersBefore':before,'containersAfter':after,'existingContainerProcessesUnchanged':before==after,'accountRequestSent':None}
    (base/'installation.json').write_text(json.dumps(report,indent=2)+'\n')
    if (stage/'runner.json').exists():(stage/'runner.json').unlink()
    print(json.dumps(report))

if __name__=='__main__':main()
