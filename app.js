(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const scriptUrl = new URL(document.currentScript?.src || 'app.js', location.href);
  const basePath = scriptUrl.pathname.replace(/\/app\.js$/, '').replace(/\/$/, '');
  const routePath = location.pathname.startsWith(`${basePath}/`)
    ? location.pathname.slice(basePath.length)
    : location.pathname;
  const routeParts = routePath.split('/').filter(Boolean).map(decodeURIComponent);
  const requestedMode = new URLSearchParams(location.search).get('mode');
  const viewMode = requestedMode === 'simple' || requestedMode === 'full'
    ? requestedMode
    : routeParts[0] === 'full' || !routeParts.length
      ? 'full'
      : 'simple';
  document.body.classList.add(`mode-${viewMode}`);
  const state = {
    owner: '', repo: '', ref: '', path: '', currentDir: '',
    branches: [], items: [], currentFile: null, kind: 'repo', gistId: '', gistUpdatedAt: '', cleanup: null,
    treeKey: '', treeCache: new Map(), treeLoads: new Map(), treeErrors: new Map(), treeGeneration: 0,
    expandedDirs: new Set(), modifiedCache: new Map(), aceEditor: null
  };

  const els = {
    welcome: $('#welcome'), workspace: $('#workspace'), viewer: $('#viewer'),
    urlForm: $('#url-form'), urlInput: $('#github-url'), welcomeForm: $('#welcome-form'), welcomeUrl: $('#welcome-url'),
    repoName: $('#repo-name'), branchSelect: $('#branch-select'),
    breadcrumbs: $('#breadcrumbs'), fileList: $('#file-list'), status: $('#status-bar'),
    toolbar: $('#file-toolbar'), fileTitle: $('#file-title'), fileMeta: $('#file-meta'),
    rawLink: $('#raw-link'), githubLink: $('#github-link'), copyLink: $('#copy-link'), themeToggle: $('#theme-toggle'),
    sidebar: $('#sidebar'), sidebarToggle: $('#sidebar-toggle'), historyButton: $('#history-button'),
    modeToggle: $('#mode-toggle'), shortcutsButton: $('#shortcuts-button'), shortcutsDialog: $('#shortcuts-dialog'), shortcutsClose: $('#shortcuts-close')
  };

  $$('[data-home]').forEach(link => { link.href = `${basePath}/`; });

  const EXT = {
    table: ['csv', 'tsv'],
    json: ['json', 'jsonl', 'ndjson', 'geojson'],
    markdown: ['md', 'markdown', 'mdown', 'mkd'],
    mermaid: ['mmd', 'mermaid'],
    office: ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlm', 'xlt', 'xltx', 'xltm', 'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'pot', 'potx', 'potm', 'one', 'onepkg', 'vsd', 'vsdx', 'vsdm', 'vdx', 'vss', 'vssx', 'vst', 'vstx', 'pub', 'pubx', 'mpp', 'mpt', 'mpd', 'accdb', 'accde', 'accdr', 'accdt', 'mdb', 'mde', 'msg', 'eml', 'rtf'],
    parquet: ['parquet', 'pq'],
    sqlite: ['sqlite', 'sqlite3', 'db', 'db3', 'sdb'],
    pdf: ['pdf'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'],
    svg: ['svg']
  };

  function ext(path = '') { return path.includes('.') ? path.split('.').pop().toLowerCase() : ''; }
  function viewerType(path) {
    const e = ext(path);
    for (const [k, list] of Object.entries(EXT)) if (list.includes(e)) return k;
    return 'text';
  }
  function fmtBytes(n = 0) {
    if (!Number.isFinite(n)) return '';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
  }
  function shortSha(sha='') { return sha.slice(0, 7); }
  function fmtDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(date);
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function githubWeb(owner, repo, ref = '', path = '') {
    if (!ref) return `https://github.com/${owner}/${repo}`;
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref).replace(/%2F/g,'/')}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  function githubTree(owner, repo, ref, path = '') {
    return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(ref).replace(/%2F/g,'/')}/${path.split('/').map(encodeURIComponent).join('/')}`.replace(/\/$/, '');
  }
  function rawUrl(owner, repo, ref, path) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref).replace(/%2F/g,'/')}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  function fileRawUrl(file) { return state.kind === 'gist' ? file.raw_url : rawUrl(state.owner, state.repo, state.ref, file.path || file); }
  function apiUrl(path) { return `https://api.github.com${path}`; }

  async function ghFetch(url, accept = 'application/vnd.github+json') {
    const r = await fetch(url, { headers: { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.json()).message || ''; } catch {}
      throw new Error(`GitHub request failed (${r.status})${detail ? `: ${detail}` : ''}`);
    }
    return r;
  }

  function parseGithubUrl(input) {
    let u;
    try { u = new URL(input); } catch { throw new Error('Enter a valid GitHub URL.'); }
    if (!/(^|\.)github\.com$/i.test(u.hostname)) throw new Error('The URL must be on github.com.');
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (/^gist\.github\.com$/i.test(u.hostname)) {
      if (parts.length < 2) throw new Error('Gist URL must include an owner and Gist ID.');
      return { kind:'gist', owner:parts[0], gistId:parts[1].replace(/\.git$/,''), path:'' };
    }
    if (parts.length < 2) throw new Error('GitHub URL must include an owner and repository.');
    const [owner, repo] = parts;
    let ref = '', path = '';
    if (['blob', 'tree'].includes(parts[2])) {
      ref = parts[3] || '';
      path = parts.slice(4).join('/');
    }
    return { kind:'repo', owner, repo: repo.replace(/\.git$/,''), ref, path };
  }

  function routeString(target) {
    if (target.kind === 'gist') return '#/' + ['gist', target.owner, target.gistId, target.path].filter(Boolean).map(encodeURIComponent).join('/');
    const { owner, repo, ref, path } = target;
    const bits = [owner, repo];
    if (ref) bits.push('blob', ref);
    if (path) bits.push(...path.split('/'));
    return '#/' + bits.map(x => encodeURIComponent(x)).join('/');
  }

  function publicRoute(target) {
    const prefix = `${basePath}${viewMode === 'full' ? '/full' : ''}`;
    if (target.kind === 'gist') return `${prefix}/${['gist', target.owner, target.gistId, target.path].filter(Boolean).map(encodeURIComponent).join('/')}`;
    const { owner, repo, ref, path } = target;
    const bits = [owner, repo];
    if (ref) bits.push('blob', ref);
    if (path) bits.push(...path.split('/'));
    return `${prefix}/${bits.map(encodeURIComponent).join('/')}`;
  }

  function routeForMode(target, mode) {
    const route = publicRoute(target)
      .slice(basePath.length)
      .replace(/^\/full(?=\/)/, '');
    return `${basePath}${mode === 'full' ? '/full' : ''}${route}`;
  }

  function currentTarget() {
    return { kind:state.kind, owner:state.owner, repo:state.repo, ref:state.ref, gistId:state.gistId, path:state.path || state.currentFile?.path || '' };
  }

  function githubRootUrl() {
    if (!state.owner) return '';
    return state.kind === 'gist' ? `https://gist.github.com/${state.owner}/${state.gistId}` : `https://github.com/${state.owner}/${state.repo}`;
  }

  function appendMinimalActions(container) {
    if (viewMode !== 'simple' || !container || $('.minimal-inline-actions', container)) return;
    const actions = document.createElement('div'); actions.className = 'minimal-inline-actions';
    const repo = document.createElement('a'); repo.className = 'button-link'; repo.target = '_blank'; repo.rel = 'noopener'; repo.href = githubRootUrl();
    repo.textContent = state.kind === 'gist' ? 'View Gist on GitHub ↗' : 'View repository on GitHub ↗';
    const full = document.createElement('button'); full.type = 'button'; full.textContent = 'Open full view'; full.onclick = () => switchViewMode('full');
    actions.append(repo, full); container.append(actions);
  }

  function addMinimalViewbar() {
    if (viewMode !== 'simple') return;
    const bar = document.createElement('div'); bar.className = 'minimal-viewbar'; appendMinimalActions(bar); els.viewer.prepend(bar);
  }

  function switchViewMode(mode = viewMode === 'full' ? 'simple' : 'full') {
    const target = currentTarget();
    if (!target.owner) return;
    location.assign(routeForMode(target, mode));
  }

  function syncPublicRoute(target, replace=false) {
    try {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method](null, '', publicRoute(target));
    } catch {}
  }

  function parseRoute() {
    const query = new URLSearchParams(location.search);
    if (query.get('url')) return parseGithubUrl(query.get('url'));
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash) {
      const p = hash.split('/').filter(Boolean).map(decodeURIComponent);
      if (p[0] === 'gist' && p.length >= 3) return { kind:'gist', owner:p[1], gistId:p[2], path:p.slice(3).join('/') };
      if (p.length >= 2) {
        const out = { kind:'repo', owner: p[0], repo: p[1], ref: '', path: '' };
        if (['blob','tree'].includes(p[2])) { out.ref = p[3] || ''; out.path = p.slice(4).join('/'); }
        return out;
      }
    }
    // custom-domain /owner/repo/blob/ref/path support (and GitHub Pages 404 fallback)
    const base = routeParts[0] === 'full' ? routeParts.slice(1) : routeParts;
    const i = base.indexOf('blob') >= 2 ? base.indexOf('blob') : base.indexOf('tree');
    if (base[0] === 'gist' && base.length >= 3) return { kind:'gist', owner:base[1], gistId:base[2], path:base.slice(3).join('/') };
    if (i >= 2) return { kind:'repo', owner: base[i-2], repo: base[i-1], ref: base[i+1] || '', path: base.slice(i+2).join('/') };
    return null;
  }

  function navigate(target, replace = false) {
    const h = routeString(target);
    syncPublicRoute(target, replace);
    if (replace) history.replaceState(null, '', h); else if (location.hash !== h) location.hash = h; else loadRoute();
  }

  async function resolveDefaultBranch(owner, repo) {
    const data = await (await ghFetch(apiUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`))).json();
    return data.default_branch || 'main';
  }

  async function loadBranches() {
    try {
      const data = await (await ghFetch(apiUrl(`/repos/${state.owner}/${state.repo}/branches?per_page=100`))).json();
      state.branches = data.map(x => x.name);
    } catch { state.branches = [state.ref]; }
    els.branchSelect.innerHTML = state.branches.map(b => `<option value="${escapeHtml(b)}" ${b===state.ref?'selected':''}>${escapeHtml(b)}</option>`).join('');
    if (!state.branches.includes(state.ref)) els.branchSelect.insertAdjacentHTML('afterbegin', `<option selected value="${escapeHtml(state.ref)}">${escapeHtml(state.ref)}</option>`);
  }

  async function loadRoute() {
    const target = parseRoute();
    if (!target) return showWelcome();
    try {
      if (state.cleanup) { state.cleanup(); state.cleanup = null; }
      showWorkspace(); setStatus('Loading repository…');
      if (target.kind === 'gist') return await loadGist(target);
      state.kind = 'repo'; state.gistId = ''; state.gistUpdatedAt='';
      state.owner = target.owner; state.repo = target.repo;
      state.ref = target.ref || await resolveDefaultBranch(state.owner, state.repo);
      const nextTreeKey = `${state.owner}/${state.repo}@${state.ref}`;
      if (state.treeKey !== nextTreeKey) resetRepoTree(nextTreeKey);
      state.path = target.path || '';
      state.currentDir = '';
      els.repoName.innerHTML = `<span class="repo-owner">${escapeHtml(state.owner)}</span><span class="repo-slash">/</span>${escapeHtml(state.repo)}`;
      if (viewMode === 'full') await loadBranches();
      else { state.branches = [state.ref]; els.branchSelect.innerHTML = `<option>${escapeHtml(state.ref)}</option>`; }
      if (!target.ref) { history.replaceState(null, '', routeString({...target, ref: state.ref})); syncPublicRoute({...target, ref:state.ref}, true); }
      await openPath(state.path);
    } catch (err) {
      setStatus(err.message || String(err), true);
      els.viewer.innerHTML = `<div class="empty-state"><h3>Could not open repository</h3><p>${escapeHtml(err.message || err)}</p></div>`;
    }
  }

  async function loadGist(target) {
    setStatus('Loading Gist…');
    const gist = await (await ghFetch(apiUrl(`/gists/${encodeURIComponent(target.gistId)}`))).json();
    const files = Object.values(gist.files || {}).map(file => ({
      ...file, name:file.filename, path:file.filename, type:'file', size:file.size || 0
    }));
    if (!files.length) throw new Error('This Gist does not contain any files.');
    resetRepoTree('');
    state.kind = 'gist'; state.owner = gist.owner?.login || target.owner; state.repo = ''; state.ref = gist.history?.[0]?.version || ''; state.gistUpdatedAt=gist.updated_at||'';
    state.gistId = target.gistId; state.path = target.path || files[0].path; state.currentDir = ''; state.items = files;
    els.repoName.innerHTML = `<span class="repo-owner">${escapeHtml(state.owner)}</span><span class="repo-slash">/</span>Gist`;
    els.branchSelect.closest('.branch-control').classList.add('hidden');
    els.breadcrumbs.innerHTML = '<span class="current-path">Gist files</span>';
    renderGistFileList(files);
    const selected = files.find(file => file.path === state.path) || files[0];
    if (!target.path) { history.replaceState(null, '', routeString({...target,path:selected.path})); syncPublicRoute({...target,path:selected.path}, true); }
    await openFile(selected, false);
    clearStatus();
  }

  function showWelcome() { document.body.classList.remove('workspace-active'); els.welcome.classList.remove('hidden'); els.workspace.classList.add('hidden'); els.toolbar.classList.add('hidden'); clearStatus(); }
  function showWorkspace() { document.body.classList.add('workspace-active'); els.welcome.classList.add('hidden'); els.workspace.classList.remove('hidden'); }
  function setStatus(msg, error=false) { els.status.textContent = msg; els.status.classList.remove('hidden'); els.status.classList.toggle('error', error); }
  function clearStatus() { els.status.classList.add('hidden'); els.status.classList.remove('error'); els.status.textContent = ''; }
  function loading(msg='Loading…') { els.viewer.innerHTML = `<div class="loading">${escapeHtml(msg)}</div>`; }

  async function openPath(path) {
    els.branchSelect.closest('.branch-control').classList.remove('hidden');
    state.path = path || '';
    loading(); clearStatus();
    const contentPath = state.path ? `/contents/${state.path.split('/').map(encodeURIComponent).join('/')}` : '/contents';
    const url = apiUrl(`/repos/${state.owner}/${state.repo}${contentPath}?ref=${encodeURIComponent(state.ref)}`);
    const data = await (await ghFetch(url)).json();
    if (Array.isArray(data)) {
      state.currentDir = state.path; state.currentFile = null;
      renderBreadcrumbs(state.currentDir);
      if (viewMode === 'full') {
        await cacheTreeDirectory(state.currentDir, data);
        try { await revealTreePath(state.currentDir, true); }
        catch (error) { setStatus(`Directory opened, but the repository tree could not be fully loaded: ${error.message || error}`, true); }
      }
      els.toolbar.classList.add('hidden');
      const readme = data.find(x => x.type === 'file' && /^readme\.md$/i.test(x.name));
      if (readme) await openFile(readme, false); else els.viewer.innerHTML = `<div class="empty-state"><h3>${state.currentDir ? escapeHtml(state.currentDir) : 'Repository files'}</h3><p>Select a supported file from the sidebar.</p></div>`;
    } else if (data.type === 'file') {
      state.currentDir = data.path.split('/').slice(0,-1).join('/');
      if (viewMode === 'full') {
        renderBreadcrumbs(state.currentDir);
        try { await revealTreePath(data.path, false); }
        catch (error) { setStatus(`File opened, but the repository tree could not be fully loaded: ${error.message || error}`, true); }
      } else { state.items = []; }
      await openFile(data, true);
    }
  }

  function resetRepoTree(key) {
    state.treeKey = key; state.treeCache.clear(); state.treeLoads.clear(); state.treeErrors.clear(); state.expandedDirs.clear(); state.treeGeneration++;
  }

  function sortTreeItems(items) {
    return [...items].sort((a,b) => (a.type===b.type ? a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}) : a.type==='dir' ? -1 : 1));
  }

  function treeContentsUrl(path='') {
    const contentPath = path ? `/contents/${path.split('/').map(encodeURIComponent).join('/')}` : '/contents';
    return apiUrl(`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}${contentPath}?ref=${encodeURIComponent(state.ref)}`);
  }

  async function cacheTreeDirectory(path='', suppliedItems=null) {
    if (state.treeCache.has(path)) return state.treeCache.get(path);
    if (state.treeLoads.has(path)) return state.treeLoads.get(path);
    const generation=state.treeGeneration, key=state.treeKey;
    const request=(async()=>{
      const data=suppliedItems || await (await ghFetch(treeContentsUrl(path))).json();
      if (!Array.isArray(data)) throw new Error(`${path || 'Repository root'} is not a directory.`);
      const items=sortTreeItems(data);
      if (generation===state.treeGeneration && key===state.treeKey) { state.treeCache.set(path,items); state.treeErrors.delete(path); }
      return items;
    })();
    state.treeLoads.set(path,request);
    try { return await request; }
    catch(error) { if(generation===state.treeGeneration && key===state.treeKey) state.treeErrors.set(path,error); throw error; }
    finally { if(state.treeLoads.get(path)===request) state.treeLoads.delete(path); }
  }

  function ancestorDirectories(path, includeSelf=false) {
    const parts=String(path||'').split('/').filter(Boolean); if(!includeSelf) parts.pop();
    const dirs=['']; let current='';
    for(const part of parts){current=current?`${current}/${part}`:part;dirs.push(current);}
    return dirs;
  }

  async function revealTreePath(path, includeSelf=false) {
    const dirs=ancestorDirectories(path,includeSelf);
    for(const dir of dirs){await cacheTreeDirectory(dir);if(dir)state.expandedDirs.add(dir);}
    renderRepositoryTree();
  }

  async function toggleTreeDirectory(item) {
    if(state.expandedDirs.has(item.path)){state.expandedDirs.delete(item.path);renderRepositoryTree();return;}
    state.expandedDirs.add(item.path);state.treeErrors.delete(item.path);const load=cacheTreeDirectory(item.path);renderRepositoryTree();
    try{await load;}catch{}
    renderRepositoryTree();
  }

  function renderBreadcrumbs(dir) {
    const parts = dir ? dir.split('/') : [];
    els.breadcrumbs.innerHTML = '';
    const root = document.createElement('button'); root.textContent = '⌂'; root.title = 'Repository root'; root.setAttribute('aria-label','Repository root'); root.onclick = () => navigate({...state, path:''}); els.breadcrumbs.append(root);
    if (!parts.length) els.breadcrumbs.insertAdjacentHTML('beforeend','<span class="current-path">Root</span>');
    let acc = '';
    parts.forEach(p => {
      els.breadcrumbs.insertAdjacentHTML('beforeend','<span class="sep">/</span>');
      acc = acc ? `${acc}/${p}` : p;
      const b = document.createElement('button'); b.textContent = p; const to = acc; b.onclick = () => navigate({...state,path:to}); els.breadcrumbs.append(b);
    });
  }

  function iconFor(item) {
    if (item.type === 'dir') return '📁';
    return ({table:'▦',json:'{ }',markdown:'¶',mermaid:'◇',text:'≡',svg:'◇',office:'▤',parquet:'▦',sqlite:'▦',pdf:'▧',image:'▧'})[viewerType(item.path)] || '·';
  }

  function renderGistFileList(items) {
    state.items = sortTreeItems(items);
    els.fileList.removeAttribute('role');
    els.fileList.innerHTML = '';
    for (const item of state.items) {
      const b = document.createElement('button'); b.className = 'file-entry' + (item.path===state.currentFile?.path ? ' active':'');
      b.innerHTML = `<span>${iconFor(item)}</span><span class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
      b.onclick = () => navigate({kind:state.kind, owner:state.owner, repo:state.repo, ref:state.ref, gistId:state.gistId, path:item.path}); els.fileList.append(b);
    }
  }

  function renderRepositoryTree() {
    els.fileList.innerHTML='';
    const rootItems=state.treeCache.get('');
    if(!rootItems){els.fileList.innerHTML='<div class="tree-message">Loading repository…</div>';return;}
    appendTreeItems(els.fileList,rootItems,0);requestAnimationFrame(()=>$('.file-entry.active',els.fileList)?.scrollIntoView({block:'nearest'}));
  }

  function appendTreeItems(mount,items,depth){
    for(const item of items){
      const isDir=item.type==='dir',expanded=isDir&&state.expandedDirs.has(item.path),active=item.path===state.currentFile?.path,contains=isDir&&Boolean(state.currentFile?.path?.startsWith(`${item.path}/`));
      const row=document.createElement('button');row.type='button';row.className=`file-entry tree-entry${active?' active':''}${contains?' contains-active':''}`;row.style.setProperty('--tree-depth',depth);
      if(isDir)row.setAttribute('aria-expanded',String(expanded));
      row.innerHTML=`<span class="tree-disclosure" aria-hidden="true">${isDir?(expanded?'⌄':'›'):''}</span><span class="file-icon" aria-hidden="true">${iconFor(item)}</span><span class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
      row.onclick=()=>isDir?toggleTreeDirectory(item):navigate({kind:'repo',owner:state.owner,repo:state.repo,ref:state.ref,path:item.path});mount.append(row);
      if(!expanded)continue;
      const group=document.createElement('div');group.className='tree-group';mount.append(group);
      if(state.treeLoads.has(item.path)) group.innerHTML=`<div class="tree-message" style="--tree-depth:${depth+1}">Loading…</div>`;
      else if(state.treeErrors.has(item.path)){
        group.innerHTML=`<div class="tree-error" style="--tree-depth:${depth+1}"><span>${escapeHtml(state.treeErrors.get(item.path)?.message||'Could not load directory.')}</span><button type="button">Retry</button></div>`;
        $('button',group).onclick=e=>{e.stopPropagation();state.treeCache.delete(item.path);state.expandedDirs.delete(item.path);toggleTreeDirectory(item);};
      }else appendTreeItems(group,state.treeCache.get(item.path)||[],depth+1);
    }
  }

  function renderNavigation(){if(viewMode!=='full')return;if(state.kind==='gist')renderGistFileList(state.items);else renderRepositoryTree();}

  async function fetchFileText(file, ref = state.ref) {
    const url = fileRawUrl(file);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Could not fetch raw file (${r.status}).`);
    return r.text();
  }

  async function openFile(file, updateRoute=true) {
    destroyCodeViewer();
    if (state.cleanup) { state.cleanup(); state.cleanup = null; }
    state.currentFile = file;
    if (updateRoute) state.path = file.path;
    renderNavigation();
    loading(`Loading ${file.name}…`);
    els.toolbar.classList.remove('hidden');
    els.fileTitle.innerHTML = `<span class="file-kind">${iconFor(file)}</span>${escapeHtml(file.name)}`;
    const type = viewerType(file.path);
    const metaParts=[fmtBytes(file.size),type.toUpperCase(),state.kind==='gist'?'Gist':state.ref].filter(Boolean);
    els.fileMeta.textContent=metaParts.join(' · ');
    updateFileModified(file,metaParts);
    els.rawLink.href = fileRawUrl(file);
    els.githubLink.href = state.kind === 'gist' ? `https://gist.github.com/${state.owner}/${state.gistId}` : githubWeb(state.owner,state.repo,state.ref,file.path);
    els.historyButton.classList.toggle('hidden', state.kind === 'gist');
    try {
      if (type === 'office') return renderOffice(file);
      if (type === 'parquet') return await renderParquet(file);
      if (type === 'sqlite') return await renderSqlite(file);
      if (type === 'pdf') return renderPdf(file);
      if (type === 'image') return renderImage(file);
      const text = await fetchFileText(file);
      if (type === 'table') renderDelimited(text, ext(file.path)==='tsv' ? '\t' : ',');
      else if (type === 'json') renderJson(text, ext(file.path));
      else if (type === 'markdown') renderMarkdown(text, file.path);
      else if (type === 'mermaid') renderMermaid(text);
      else if (type === 'text') renderText(text,file.path);
      else if (type === 'svg') renderSvg(text);
      else renderText(text,file.path);
    } catch (err) { els.viewer.innerHTML = `<div class="empty-state"><h3>Could not render file</h3><p>${escapeHtml(err.message||err)}</p></div>`; addMinimalViewbar(); }
  }

  async function getFileModified(file){
    if(state.kind==='gist')return state.gistUpdatedAt;
    const key=`${state.owner}/${state.repo}@${state.ref}:${file.path}`;
    if(state.modifiedCache.has(key))return state.modifiedCache.get(key);
    const url=apiUrl(`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/commits?sha=${encodeURIComponent(state.ref)}&path=${encodeURIComponent(file.path)}&per_page=1`);
    const commits=await (await ghFetch(url)).json();
    const date=commits?.[0]?.commit?.committer?.date||commits?.[0]?.commit?.author?.date||'';
    state.modifiedCache.set(key,date);return date;
  }

  async function updateFileModified(file,metaParts){
    const expectedKind=state.kind;
    try{
      const modified=await getFileModified(file);if(!modified||state.currentFile?.path!==file.path||state.kind!==expectedKind)return;
      const label=expectedKind==='gist'?'Gist updated':'Modified';
      els.fileMeta.innerHTML=`${escapeHtml(metaParts.join(' · '))} · <time datetime="${escapeHtml(modified)}">${label} ${escapeHtml(fmtDate(modified))}</time>`;
    }catch{}
  }

  function renderOffice(file) {
    const source = fileRawUrl(file);
    const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`;
    els.viewer.innerHTML = `<section class="document-view"><div class="viewer-notice"><div><strong>Microsoft Office viewer</strong><span>Rendered by Microsoft from this public file URL.</span></div><a class="button-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Download original</a></div><iframe class="office-frame" src="${escapeHtml(viewer)}" title="${escapeHtml(file.name)} preview" allowfullscreen></iframe></section>`;
    appendMinimalActions($('.viewer-notice', els.viewer));
  }

  function renderPdf(file) {
    els.viewer.innerHTML = `<iframe class="native-frame" src="${escapeHtml(fileRawUrl(file))}" title="${escapeHtml(file.name)} preview"></iframe>`;
    addMinimalViewbar();
  }

  function renderImage(file) {
    els.viewer.innerHTML = `<div class="image-view"><img src="${escapeHtml(fileRawUrl(file))}" alt="${escapeHtml(file.name)}"></div>`;
    addMinimalViewbar();
  }

  function tableValue(value) {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`;
    if (value && typeof value === 'object') { try { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v); } catch { return String(value); } }
    return value;
  }

  async function renderParquet(file) {
    loading(`Reading ${file.name}…`);
    const [{ asyncBufferFromUrl, parquetMetadataAsync, parquetSchema, parquetReadObjects }, compressors] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/hyparquet@1.28.2/+esm'),
      import('https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm')
    ]);
    const fileBuffer = await asyncBufferFromUrl({ url:fileRawUrl(file) });
    const metadata = await parquetMetadataAsync(fileBuffer);
    const schema = parquetSchema(metadata);
    const limit = Math.min(Number(metadata.num_rows || 0), 5000);
    const records = await parquetReadObjects({ file:fileBuffer, metadata, compressors, rowEnd:limit });
    const rows = records.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,tableValue(value)])));
    const columns = schema.children?.map(column => column.element?.name || column.name).filter(Boolean) || [];
    const mount = document.createElement('div');
    els.viewer.replaceChildren(mount);
    const banner = document.createElement('div'); banner.className = 'data-file-banner';
    banner.innerHTML = `<strong>Parquet preview</strong><span>${Number(metadata.num_rows || rows.length).toLocaleString()} rows${Number(metadata.num_rows || 0) > limit ? ` · first ${limit.toLocaleString()} loaded` : ''}</span>`;
    appendMinimalActions(banner);
    mount.append(banner);
    const tableMount = document.createElement('div'); mount.append(tableMount);
    renderTable(rows, columns, tableMount);
  }

  async function renderSqlite(file) {
    if (!window.initSqlJs) throw new Error('The SQLite viewer library did not load.');
    loading(`Opening ${file.name}…`);
    const response = await fetch(fileRawUrl(file));
    if (!response.ok) throw new Error(`Could not fetch database (${response.status}).`);
    const SQL = await initSqlJs({ locateFile:name => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${name}` });
    const db = new SQL.Database(new Uint8Array(await response.arrayBuffer()));
    state.cleanup = () => db.close();
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.flat().map(String) || [];
    if (!tables.length) throw new Error('No tables or views were found in this SQLite database.');
    const shell = document.createElement('section'); shell.className = 'sqlite-view';
    shell.innerHTML = `<div class="sqlite-toolbar"><label><span>Table or view</span><select class="sqlite-table">${tables.map(name => `<option>${escapeHtml(name)}</option>`).join('')}</select></label><label><span>Read-only SQL</span><textarea class="sql-query" rows="2" spellcheck="false"></textarea></label><button class="primary run-sql" type="button">Run query</button></div><div class="sqlite-meta"></div><div class="sqlite-results"></div>`;
    els.viewer.replaceChildren(shell);
    addMinimalViewbar();
    const tableSelect = $('.sqlite-table', shell), query = $('.sql-query', shell), results = $('.sqlite-results', shell), meta = $('.sqlite-meta', shell);
    const quoteName = name => `"${String(name).replaceAll('"','""')}"`;
    const setDefault = () => { query.value = `SELECT * FROM ${quoteName(tableSelect.value)} LIMIT 1000`; };
    const run = () => {
      const sql = query.value.trim();
      if (!/^(select|with|pragma|explain)\b/i.test(sql)) { meta.textContent = 'Only read-only SELECT, WITH, PRAGMA, or EXPLAIN queries are allowed.'; meta.classList.add('error'); return; }
      try {
        const result = db.exec(sql, { useBigInt:true })[0]; meta.classList.remove('error');
        if (!result) { meta.textContent = 'Query returned no rows.'; results.innerHTML = ''; return; }
        const rows = result.values.map(values => Object.fromEntries(result.columns.map((column,index) => [column,tableValue(values[index])])));
        meta.textContent = `${rows.length.toLocaleString()} rows shown`;
        renderTable(rows, result.columns, results);
      } catch (error) { meta.textContent = error.message || String(error); meta.classList.add('error'); results.innerHTML = ''; }
    };
    tableSelect.onchange = () => { setDefault(); run(); }; $('.run-sql',shell).onclick = run; query.onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run(); };
    setDefault(); run();
  }

  function flattenObject(obj, prefix='', out={}) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) { out[prefix || 'value'] = Array.isArray(obj) ? JSON.stringify(obj) : obj; return out; }
    for (const [k,v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flattenObject(v,key,out); else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
    return out;
  }

  function renderDelimited(text, delimiter) {
    if (!window.Papa) return renderText(text);
    const result = Papa.parse(text, { header:true, delimiter, skipEmptyLines:'greedy', dynamicTyping:false });
    if (result.errors.length && !result.data.length) throw new Error(result.errors[0].message);
    renderTable(result.data, result.meta.fields || []);
  }

  function renderJson(text, extension) {
    let data;
    try {
      if (['jsonl','ndjson'].includes(extension)) data = text.split(/\r?\n/).filter(Boolean).map((line,i) => { try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${i+1}`); } });
      else data = JSON.parse(text);
    } catch (e) { throw new Error(`JSON parse error: ${e.message}`); }
    const wrapper = document.createElement('div');
    const bar = document.createElement('div'); bar.className='json-mode-bar';
    const tableBtn = document.createElement('button'), rawBtn=document.createElement('button'), tabs=document.createElement('div'); tabs.className='json-tabs';
    tableBtn.textContent='Table'; rawBtn.textContent='JSON tree'; tabs.append(tableBtn,rawBtn); bar.append(tabs); appendMinimalActions(bar); wrapper.append(bar);
    const body=document.createElement('div'); wrapper.append(body); els.viewer.replaceChildren(wrapper);
    const records = Array.isArray(data) ? data : (data && typeof data==='object' ? findBestArray(data) : []);
    const tableable = Array.isArray(records) && records.length && records.every(x => x && typeof x==='object' && !Array.isArray(x));
    const showRaw = () => { body.className='json-tree'; renderCode(JSON.stringify(data,null,2),state.currentFile?.path||'data.json',body,'ace/mode/json'); tableBtn.classList.remove('active'); rawBtn.classList.add('active'); };
    const showTable = () => {
      destroyCodeViewer();
      if (!tableable) return showRaw();
      const flat=records.map(x=>flattenObject(x)); const cols=[...new Set(flat.flatMap(Object.keys))];
      body.className=''; body.innerHTML=''; renderTable(flat,cols,body); tableBtn.classList.add('active'); rawBtn.classList.remove('active');
    };
    tableBtn.onclick=showTable; rawBtn.onclick=showRaw; tableable ? showTable() : showRaw();
  }

  function findBestArray(obj) {
    const arrays = Object.values(obj || {}).filter(Array.isArray);
    return arrays.sort((a,b)=>b.length-a.length)[0] || [];
  }

  function inferType(values) {
    const v=values.filter(x=>x!=='' && x!==null && x!==undefined).slice(0,100);
    if (!v.length) return 'empty';
    if (v.every(x=>/^[-+]?\d+(\.\d+)?$/.test(String(x).trim()))) return 'number';
    if (v.every(x=>!isNaN(Date.parse(String(x))) && /[-/:T]/.test(String(x)))) return 'date';
    if (v.every(x=>/^(true|false)$/i.test(String(x)))) return 'boolean';
    if (v.every(x=>/^https?:\/\//i.test(String(x)))) return 'url';
    return 'text';
  }

  function renderTable(rows, columns, mount=els.viewer) {
    const frag = $('#table-template').content.cloneNode(true); const root = $('.table-view',frag); mount.replaceChildren(frag);
    const search=$('.table-search',root), count=$('.result-count',root), thead=$('thead',root), tbody=$('tbody',root),
      prev=$('.prev-page',root), next=$('.next-page',root), pageLabel=$('.page-label',root), pageSize=$('.page-size',root),
      colPanel=$('.column-panel',root), columnsBtn=$('.columns-button',root), downloadBtn=$('.download-button',root);
    if (mount === els.viewer) appendMinimalActions($('.table-control-actions', root));
    if (!columns?.length) columns=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];
    let page=1, size=+pageSize.value, sortCol='', sortDir=1, query='', visible=new Set(columns), filters=new Map(), dragCol='';
    const widths = new Map();
    const lowerCache = new WeakMap();
    function filtered() {
      let out=rows;
      if (query) {
        const q=query.toLowerCase(); out=out.filter(r=>{
          if (!lowerCache.has(r)) lowerCache.set(r, columns.map(c=>String(r?.[c]??'').toLowerCase()).join('\u0000'));
          return lowerCache.get(r).includes(q);
        });
      }
      for (const [column, term] of filters) {
        const q=term.toLowerCase();
        if (q) out=out.filter(r=>String(r?.[column]??'').toLowerCase().includes(q));
      }
      if (sortCol) out=[...out].sort((a,b)=>{
        const av=a?.[sortCol]??'', bv=b?.[sortCol]??''; const an=Number(av),bn=Number(bv);
        const cmp = av!=='' && bv!=='' && Number.isFinite(an)&&Number.isFinite(bn) ? an-bn : String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
        return cmp*sortDir;
      });
      return out;
    }
    function cell(v) {
      if (v===null || v===undefined || v==='') return '<span class="cell-null">—</span>';
      const s=String(v); if (/^https?:\/\//i.test(s)) return `<a class="cell-url" href="${escapeHtml(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a>`;
      return escapeHtml(s);
    }
    function renderHeader(){
      thead.innerHTML='<tr>'+columns.filter(c=>visible.has(c)).map(c=>`<th draggable="true" data-col="${escapeHtml(c)}" style="${widths.has(c)?`width:${widths.get(c)}px;min-width:${widths.get(c)}px`:''}"><div class="th-content"><button class="sort-button" type="button" title="Sort by ${escapeHtml(c)}"><span>${escapeHtml(c)}</span><span class="sort-indicator">${sortCol===c?(sortDir>0?'▲':'▼'):''}</span></button><button class="filter-button${filters.get(c)?' active':''}" type="button" title="Filter ${escapeHtml(c)}" aria-label="Filter ${escapeHtml(c)}">⌕</button></div><div class="column-filter-menu hidden"><input type="search" value="${escapeHtml(filters.get(c)||'')}" placeholder="Filter values…" aria-label="Filter ${escapeHtml(c)} values"><div><button class="apply-filter" type="button">Apply</button><button class="clear-filter" type="button">Clear</button></div></div><span class="column-resizer" title="Resize column"></span></th>`).join('')+'</tr>';
      $$('th',thead).forEach(th=>{
        const c=th.dataset.col;
        $('.sort-button',th).onclick=()=>{if(sortCol===c)sortDir*=-1;else{sortCol=c;sortDir=1;}page=1;render();};
        $('.filter-button',th).onclick=e=>{e.stopPropagation();$$('.column-filter-menu',thead).forEach(m=>{if(m!==$('.column-filter-menu',th))m.classList.add('hidden');});$('.column-filter-menu',th).classList.toggle('hidden');$('.column-filter-menu input',th).focus();};
        $('.apply-filter',th).onclick=()=>{filters.set(c,$('.column-filter-menu input',th).value.trim());page=1;render();};
        $('.clear-filter',th).onclick=()=>{filters.delete(c);page=1;render();};
        $('.column-filter-menu input',th).onkeydown=e=>{if(e.key==='Enter')$('.apply-filter',th).click();if(e.key==='Escape')$('.column-filter-menu',th).classList.add('hidden');};
        th.ondragstart=()=>{dragCol=c;th.classList.add('dragging');}; th.ondragend=()=>th.classList.remove('dragging');
        th.ondragover=e=>e.preventDefault(); th.ondrop=e=>{e.preventDefault();if(!dragCol||dragCol===c)return;const from=columns.indexOf(dragCol),to=columns.indexOf(c);columns.splice(to,0,columns.splice(from,1)[0]);dragCol='';render();};
        $('.column-resizer',th).onpointerdown=e=>{e.preventDefault();e.stopPropagation();const startX=e.clientX,startW=th.getBoundingClientRect().width;const move=ev=>{widths.set(c,Math.max(90,Math.round(startW+ev.clientX-startX)));renderHeader();};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);render();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);};
      });
    }
    function render(){ const data=filtered(), pages=Math.max(1,Math.ceil(data.length/size)); page=Math.min(page,pages); const start=(page-1)*size, slice=data.slice(start,start+size); renderHeader(); tbody.innerHTML=slice.map(r=>'<tr>'+columns.filter(c=>visible.has(c)).map(c=>`<td>${cell(r?.[c])}</td>`).join('')+'</tr>').join(''); count.textContent=`${data.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`;pageLabel.textContent=`Page ${page.toLocaleString()} of ${pages.toLocaleString()}`;prev.disabled=page<=1;next.disabled=page>=pages; }
    colPanel.innerHTML=columns.map(c=>`<label class="column-toggle"><input type="checkbox" checked data-col="${escapeHtml(c)}">${escapeHtml(c)}</label>`).join('');
    $$('input[type=checkbox]',colPanel).forEach(cb=>cb.onchange=()=>{cb.checked?visible.add(cb.dataset.col):visible.delete(cb.dataset.col);render();});
    columnsBtn.onclick=()=>colPanel.classList.toggle('hidden'); search.oninput=()=>{query=search.value.trim();page=1;render();}; prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};pageSize.onchange=()=>{size=+pageSize.value;page=1;render();};
    downloadBtn.onclick=()=>downloadCsv(filtered(),columns.filter(c=>visible.has(c)), state.currentFile?.name?.replace(/\.[^.]+$/,'')+'-filtered.csv');
    render();
  }

  function downloadCsv(rows, cols, name='flatgit-export.csv') {
    const csv = window.Papa ? Papa.unparse(rows,{columns:cols}) : [cols.join(','),...rows.map(r=>cols.map(c=>JSON.stringify(r?.[c]??'')).join(','))].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function resolveRepoPath(currentPath, target) {
    const clean = target.split('#')[0].split('?')[0];
    const base = currentPath.split('/').slice(0,-1);
    for (const part of clean.split('/')) { if (!part || part==='.') continue; if(part==='..') base.pop(); else base.push(part); }
    return base.join('/');
  }

  function rewriteMarkdownLinks(container, currentPath) {
    $$('img[src]',container).forEach(img=>{const src=img.getAttribute('src');if(!src||/^(https?:|data:|blob:|\/\/)/i.test(src)||state.kind==='gist')return;img.src=rawUrl(state.owner,state.repo,state.ref,resolveRepoPath(currentPath,src));});
    $$('a[href]',container).forEach(a=>{const href=a.getAttribute('href');if(!href)return;if(href.startsWith('#'))return;if(/^(https?:|mailto:|tel:|\/\/)/i.test(href)){a.target='_blank';a.rel='noopener';return;}if(state.kind==='gist')return;const target=resolveRepoPath(currentPath,href);a.href=routeString({...state,path:target});});
  }

  function markdownHtml(text, path) {
    if (!window.marked || !window.DOMPurify) return `<pre>${escapeHtml(text)}</pre>`;
    marked.setOptions({gfm:true,breaks:false});
    const dirty=marked.parse(text); return DOMPurify.sanitize(dirty,{USE_PROFILES:{html:true}});
  }

  function renderMarkdown(text,path) {
    const shell=document.createElement('div');shell.className='markdown-shell';const tabs=document.createElement('div');tabs.className='view-tabs';
    const renderedBtn=document.createElement('button'),sourceBtn=document.createElement('button'),splitBtn=document.createElement('button'),tabGroup=document.createElement('div');tabGroup.className='json-tabs';renderedBtn.textContent='Rendered';sourceBtn.textContent='Source';splitBtn.textContent='Split';tabGroup.append(renderedBtn,sourceBtn,splitBtn);tabs.append(tabGroup);appendMinimalActions(tabs);const body=document.createElement('div');shell.append(tabs,body);els.viewer.replaceChildren(shell);
    const makeRendered=()=>{const d=document.createElement('article');d.className='markdown-rendered';d.innerHTML=markdownHtml(text,path);rewriteMarkdownLinks(d,path);runMermaid(d);return d;};
    const setActive=b=>[renderedBtn,sourceBtn,splitBtn].forEach(x=>x.classList.toggle('active',x===b));
    renderedBtn.onclick=()=>{body.replaceChildren(makeRendered());setActive(renderedBtn);};
    sourceBtn.onclick=()=>{body.innerHTML=`<div class="source-view"><pre><code>${escapeHtml(text)}</code></pre></div>`;setActive(sourceBtn);};
    splitBtn.onclick=()=>{const split=document.createElement('div');split.className='split-view';split.innerHTML=`<div class="source-view"><pre><code>${escapeHtml(text)}</code></pre></div>`;split.append(makeRendered());body.replaceChildren(split);setActive(splitBtn);};
    renderedBtn.click();
  }

  async function runMermaid(container) {
    if (!window.mermaid) return;
    $$('pre code.language-mermaid, pre code.lang-mermaid', container).forEach(code => {
      const diagram = document.createElement('div'); diagram.className = 'mermaid'; diagram.textContent = code.textContent; code.closest('pre').replaceWith(diagram);
    });
    const diagrams = $$('.mermaid', container);
    if (!diagrams.length) return;
    try {
      mermaid.initialize({ startOnLoad:false, securityLevel:'strict', theme:document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
      await mermaid.run({ nodes:diagrams });
    } catch (error) {
      diagrams.filter(node => !node.querySelector('svg')).forEach(node => { node.classList.add('mermaid-error'); node.textContent = `Could not render Mermaid diagram: ${error.message || error}`; });
    }
  }

  function renderMermaid(text) {
    const article = document.createElement('article'); article.className = 'mermaid-document';
    const diagram = document.createElement('div'); diagram.className = 'mermaid'; diagram.textContent = text; article.append(diagram);
    els.viewer.replaceChildren(article); runMermaid(article); addMinimalViewbar();
  }

  function destroyCodeViewer(){if(!state.aceEditor)return;try{state.aceEditor.destroy();}catch{}state.aceEditor=null;}

  function renderCode(text,path,mount=els.viewer,forcedMode=''){
    destroyCodeViewer();
    if(!window.ace){mount.innerHTML=`<div class="text-view"><pre><code>${escapeHtml(text)}</code></pre></div>`;if(mount===els.viewer)addMinimalViewbar();return;}
    ace.config.set('basePath','https://cdn.jsdelivr.net/npm/ace-builds@1.44.0/src-min-noconflict');
    const shell=document.createElement('section');shell.className=`code-view${mount===els.viewer?'':' embedded'}`;
    shell.innerHTML='<div class="code-toolbar"><span class="code-language"></span><div><button class="collapse-code" type="button">Collapse all</button><button class="expand-code" type="button">Expand all</button></div></div><div class="code-editor"></div>';
    mount.replaceChildren(shell);
    if (mount === els.viewer) appendMinimalActions($('.code-toolbar', shell));
    const modelist=ace.require('ace/ext/modelist'),detected=forcedMode?{mode:forcedMode,name:forcedMode.split('/').pop()}:modelist.getModeForPath(path||'');
    $('.code-language',shell).textContent=detected?.name||ext(path)||'Plain text';
    const editor=ace.edit($('.code-editor',shell));state.aceEditor=editor;
    editor.setValue(text,-1);editor.session.setMode(detected?.mode||'ace/mode/text');editor.setReadOnly(true);
    editor.setOptions({showPrintMargin:false,highlightActiveLine:false,highlightGutterLine:false,showFoldWidgets:true,displayIndentGuides:true,useWorker:false,fontSize:'13px',wrap:false,scrollPastEnd:.05,textInputAriaLabel:`${path||'File'} source code`});
    editor.setTheme(document.documentElement.dataset.theme==='dark'?'ace/theme/github_dark':'ace/theme/github');
    $('.collapse-code',shell).onclick=()=>editor.session.foldAll();$('.expand-code',shell).onclick=()=>editor.session.unfold();
    requestAnimationFrame(()=>editor.resize());
  }

  function renderText(text,path){renderCode(text,path);}
  function renderSvg(text){const safe=window.DOMPurify?DOMPurify.sanitize(text,{USE_PROFILES:{svg:true,svgFilters:true}}):'';els.viewer.innerHTML=`<div class="markdown-shell"><div class="markdown-rendered">${safe||'<p>SVG preview unavailable.</p>'}</div><div class="source-view"><pre><code>${escapeHtml(text)}</code></pre></div></div>`;addMinimalViewbar();}
  function renderUnsupported(file){els.viewer.innerHTML=`<div class="empty-state"><h3>No built-in preview for .${escapeHtml(ext(file.path)||'this file')}</h3><p>Use Raw or GitHub above to open it.</p></div>`;addMinimalViewbar();}

  function historyOption(commit, index) {
    const author = commit.commit?.author || {};
    const message = (commit.commit?.message || 'Untitled commit').split('\n')[0];
    const label = `${fmtDate(author.date)} · ${shortSha(commit.sha)} · ${message}`;
    return `<option value="${escapeHtml(commit.sha)}" data-index="${index}">${escapeHtml(label)}</option>`;
  }

  function renderPatch(patch='') {
    if (!patch) return '<div class="diff-empty"><strong>No text patch is available.</strong><span>The file may be binary, unchanged, renamed, or too large for GitHub to include inline.</span></div>';
    const lines=patch.split('\n');
    let oldLine=0,newLine=0;
    return `<div class="diff-table" role="table" aria-label="File changes">${lines.map(line=>{
      if (line.startsWith('@@')) {
        const m=line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);if(m){oldLine=+m[1];newLine=+m[2];}
        return `<div class="diff-row hunk"><span></span><span></span><code>${escapeHtml(line)}</code></div>`;
      }
      const added=line.startsWith('+')&&!line.startsWith('+++'), removed=line.startsWith('-')&&!line.startsWith('---');
      const oldNo=added?'':oldLine++, newNo=removed?'':newLine++;
      return `<div class="diff-row ${added?'added':removed?'removed':'context'}"><span>${oldNo}</span><span>${newNo}</span><code>${escapeHtml(line||' ')}</code></div>`;
    }).join('')}</div>`;
  }

  async function loadHistoryDiff(commits, fromSha, toSha, mount) {
    if (fromSha===toSha) { mount.innerHTML='<div class="diff-empty"><strong>Select two different commits.</strong><span>Choose an older and newer file version to compare.</span></div>';return; }
    mount.innerHTML='<div class="loading compact">Loading comparison…</div>';
    try {
      const url=apiUrl(`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/compare/${encodeURIComponent(fromSha)}...${encodeURIComponent(toSha)}`);
      const data=await (await ghFetch(url)).json();
      const changed=(data.files||[]).find(f=>f.filename===state.currentFile.path||f.previous_filename===state.currentFile.path);
      const fromCommit=commits.find(c=>c.sha===fromSha),toCommit=commits.find(c=>c.sha===toSha);
      mount.innerHTML=`<div class="diff-summary"><div><span class="diff-label">From</span><strong>${shortSha(fromSha)}</strong><span>${escapeHtml((fromCommit?.commit?.message||'').split('\n')[0])}</span></div><span class="diff-arrow">→</span><div><span class="diff-label">To</span><strong>${shortSha(toSha)}</strong><span>${escapeHtml((toCommit?.commit?.message||'').split('\n')[0])}</span></div>${changed?`<div class="diff-stats"><span class="additions">+${changed.additions||0}</span><span class="deletions">−${changed.deletions||0}</span></div>`:''}</div>${renderPatch(changed?.patch||'')}`;
    } catch(err) { mount.innerHTML=`<div class="diff-empty error"><strong>Could not load this comparison.</strong><span>${escapeHtml(err.message||err)}</span></div>`; }
  }

  async function renderHistory() {
    if (state.kind !== 'repo' || !state.currentFile?.path) return;
    els.historyButton.disabled=true; els.historyButton.textContent='Loading…'; loading('Loading file history…');
    try {
      const path=encodeURIComponent(state.currentFile.path);
      const url=apiUrl(`/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/commits?sha=${encodeURIComponent(state.ref)}&path=${path}&per_page=100`);
      const commits=await (await ghFetch(url)).json();
      if (!Array.isArray(commits)||!commits.length) throw new Error('No commits were found for this file.');
      const shell=document.createElement('section');shell.className='history-view';
      shell.innerHTML=`<div class="history-heading"><div><p class="eyebrow">Version history</p><h3>Compare ${escapeHtml(state.currentFile.name)}</h3><p>Select any two commits that changed this file.</p></div><button class="close-history" type="button">← Back to file</button></div><div class="compare-controls"><label><span>Older version</span><select class="from-commit">${commits.map(historyOption).join('')}</select></label><span class="compare-arrow">→</span><label><span>Newer version</span><select class="to-commit">${commits.map(historyOption).join('')}</select></label><button class="compare-button primary" type="button">Compare</button></div><div class="diff-mount"></div>`;
      els.viewer.replaceChildren(shell);
      const from=$('.from-commit',shell),to=$('.to-commit',shell),mount=$('.diff-mount',shell);
      from.selectedIndex=Math.min(1,commits.length-1);to.selectedIndex=0;
      const compare=()=>loadHistoryDiff(commits,from.value,to.value,mount);
      $('.compare-button',shell).onclick=compare;from.onchange=compare;to.onchange=compare;
      $('.close-history',shell).onclick=()=>openFile(state.currentFile,false);
      compare();
    } catch(err) { els.viewer.innerHTML=`<div class="diff-empty error"><strong>Could not load file history.</strong><span>${escapeHtml(err.message||err)}</span><button type="button" class="back-file">Back to file</button></div>`;$('.back-file',els.viewer)?.addEventListener('click',()=>openFile(state.currentFile,false)); }
    finally { els.historyButton.disabled=false;els.historyButton.textContent='◷ History'; }
  }

  function openInput(value){try{navigate(parseGithubUrl(value));}catch(e){alert(e.message);}}
  els.urlForm.addEventListener('submit',e=>{e.preventDefault();openInput(els.urlInput.value);});
  els.welcomeForm.addEventListener('submit',e=>{e.preventDefault();openInput(els.welcomeUrl.value);});
  $$('.example-link').forEach(b=>b.onclick=()=>openInput(b.dataset.example));
  els.branchSelect.addEventListener('change',()=>navigate({...state,ref:els.branchSelect.value,path:state.path}));
  els.copyLink.addEventListener('click',async()=>{await navigator.clipboard.writeText(location.href);const old=els.copyLink.textContent;els.copyLink.textContent='Copied!';setTimeout(()=>els.copyLink.textContent=old,1200);});
  els.historyButton.addEventListener('click',renderHistory);
  function toggleTheme(){const dark=document.documentElement.dataset.theme==='dark';const theme=dark?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('flatgit-theme',theme);state.aceEditor?.setTheme(theme==='dark'?'ace/theme/github_dark':'ace/theme/github');}
  els.themeToggle.onclick=toggleTheme;

  function setSidebarCollapsed(collapsed,persist=true){
    if(!els.sidebar||!els.sidebarToggle)return;
    els.sidebar.classList.toggle('collapsed',collapsed);document.body.classList.toggle('sidebar-collapsed',collapsed);
    els.sidebarToggle.setAttribute('aria-expanded',String(!collapsed));els.sidebarToggle.title=collapsed?'Expand repository sidebar':'Collapse repository sidebar';
    els.sidebarToggle.setAttribute('aria-label',collapsed?'Expand repository sidebar':'Collapse repository navigation');
    if(persist)localStorage.setItem('flatgit-sidebar-collapsed',collapsed?'1':'0');
  }

  if (els.sidebarToggle && els.sidebar) {
    setSidebarCollapsed(localStorage.getItem('flatgit-sidebar-collapsed')==='1',false);
    els.sidebarToggle.addEventListener('click',()=>setSidebarCollapsed(!els.sidebar.classList.contains('collapsed')));
  }

  function openShortcuts(){if(!els.shortcutsDialog.open)els.shortcutsDialog.showModal();}
  els.shortcutsButton.onclick=openShortcuts;els.shortcutsClose.onclick=()=>els.shortcutsDialog.close();
  els.modeToggle.onclick=()=>switchViewMode();

  function typingTarget(target){return target?.matches?.('input,textarea,select,[contenteditable="true"],.ace_text-input')||target?.closest?.('.ace_editor');}
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&els.shortcutsDialog.open){els.shortcutsDialog.close();return;}
    if(event.key==='Escape'&&viewMode==='full'&&matchMedia('(max-width: 850px)').matches&&!els.sidebar.classList.contains('collapsed')){setSidebarCollapsed(true);return;}
    if(els.shortcutsDialog.open)return;
    if(typingTarget(event.target)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='?' ){event.preventDefault();openShortcuts();return;}
    if(event.shiftKey&&event.key.toLowerCase()==='m'){event.preventDefault();switchViewMode();return;}
    if(event.shiftKey)return;
    const key=event.key.toLowerCase();
    if(key==='b'&&viewMode==='full'){event.preventDefault();setSidebarCollapsed(!els.sidebar.classList.contains('collapsed'));}
    else if(key==='/'&&viewMode==='full'){event.preventDefault();els.urlInput.focus();els.urlInput.select();}
    else if(key==='h'&&viewMode==='full'&&state.kind==='repo'&&state.currentFile){event.preventDefault();renderHistory();}
    else if(key==='g'&&githubRootUrl()){event.preventDefault();window.open(githubRootUrl(),'_blank','noopener');}
    else if(key==='t'){event.preventDefault();toggleTheme();}
  });

  const stored=localStorage.getItem('flatgit-theme');if(stored)document.documentElement.dataset.theme=stored;else if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark';
  window.addEventListener('hashchange',loadRoute);
  window.addEventListener('DOMContentLoaded',loadRoute);
})();
