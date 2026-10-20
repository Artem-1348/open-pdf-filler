import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PasswordDialog } from './components/PasswordDialog';
import { SearchBar } from './components/SearchBar';
import { Thumbnails } from './components/Thumbnails';
import { Toolbar } from './components/Toolbar';
import { Viewer, type ViewerHandle } from './components/Viewer';
import { FileIcon } from './components/icons';
import {
  closePdf,
  openPdf,
  readForm,
  searchPdf,
  warmUpEngine,
  type FormInfo,
  type PdfDocumentObject,
  type SearchResult,
} from './engine/engine';
import { OpenError, openErrorMessage } from './lib/errors';
import { wrapIndex } from './lib/search';
import { fitWidthZoom, nextZoomStep, prevZoomStep, type ZoomMode } from './lib/zoom';
import { listenForLaunchedFiles, takeSharedFile } from './openWith';
import { EditorContext, groupFieldsByPage, type EditorApi } from './editor/EditorContext';
import { FillBar } from './editor/FillBar';
import { SaveDialog, type SaveChoice } from './editor/SaveDialog';
import { SignatureDialog } from './editor/SignatureDialog';
import { savedFileName } from './editor/fileName';
import { downloadBytes, isSaveError, loadFieldExtras, saveCopy } from './editor/saving';
import { changedValues, editorReducer, emptyEditor, hasUnsavedChanges, meaningfulItems } from './editor/state';
import type { SignatureContent } from './pdf/model';

interface OpenDoc {
  doc: PdfDocumentObject;
  fileName: string;
  // Kept in memory to build saved copies from; never written back.
  file: File;
  password?: string;
  form: FormInfo;
}

const NO_PAGES: ReadonlySet<number> = new Set();

interface SearchResults {
  query: string;
  matches: SearchResult[];
  active: number;
}

const NO_MATCHES: SearchResult[] = [];
const NO_RESULTS: SearchResults = { query: '', matches: NO_MATCHES, active: -1 };

interface PasswordRequest {
  file: File;
  failedAttempts: number;
}

const NARROW_QUERY = '(max-width: 720px)';
const SEARCH_DEBOUNCE_MS = 250;

export default function App() {
  const [current, setCurrent] = useState<OpenDoc | null>(null);
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [status, setStatus] = useState('');

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [availableWidth, setAvailableWidth] = useState(800);
  const [currentPage, setCurrentPage] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(() => !window.matchMedia(NARROW_QUERY).matches);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [query, setQuery] = useState('');
  // Results belong to the query that produced them, so stale results are
  // never shown for a newer query.
  const [results, setResults] = useState<SearchResults>(NO_RESULTS);
  const keyword = query.trim();
  const resultsCurrent = keyword !== '' && results.query === keyword;
  const matches = resultsCurrent ? results.matches : NO_MATCHES;
  const activeMatchIndex = resultsCurrent ? results.active : -1;
  const searching = keyword !== '' && !resultsCurrent;

  const [editor, dispatch] = useReducer(editorReducer, emptyEditor);
  const [signatureRequest, setSignatureRequest] = useState<((s: SignatureContent | null) => void) | null>(null);
  const [lastSignature, setLastSignature] = useState<SignatureContent | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // An action waiting for "discard unsaved changes?" to be confirmed.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<ViewerHandle>(null);
  const openSeq = useRef(0);
  const currentRef = useRef<OpenDoc | null>(null);
  const currentPageRef = useRef(0);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const doc = current?.doc ?? null;
  const dirty = current !== null && hasUnsavedChanges(editor);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Runs `action` now, or after the user agrees to drop unsaved changes.
  const guardUnsaved = useCallback((action: () => void) => {
    if (dirtyRef.current) setPendingDiscard(() => action);
    else action();
  }, []);

  // Browsers show their own "leave site?" prompt for this.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const zoomPercent = useMemo(() => {
    if (zoomMode !== 'fit-width') return zoomMode;
    const widest = doc ? Math.max(...doc.pages.map((p) => p.size.width)) : 612;
    return fitWidthZoom(widest, availableWidth);
  }, [zoomMode, doc, availableWidth]);

  const resetSearch = () => {
    setQuery('');
    setResults(NO_RESULTS);
    setSearchOpen(false);
  };

  const showDocument = useCallback((next: OpenDoc) => {
    const previous = currentRef.current;
    if (previous) void closePdf(previous.doc);
    const { doc: nextDoc, fileName, form } = next;
    setCurrent(next);
    dispatch({ type: 'reset', fields: form.fields, canEdit: form.canEdit });
    if (form.fields.some((f) => f.kind === 'text')) {
      void loadFieldExtras(next.file, next.password)
        .then((extras) => {
          if (currentRef.current?.doc === nextDoc) dispatch({ type: 'enrich-fields', maxLen: extras });
        })
        .catch(() => undefined);
    }
    setCurrentPage(0);
    setZoomMode('fit-width');
    setError(null);
    resetSearch();
    const pages = nextDoc.pageCount === 1 ? '1 page' : `${nextDoc.pageCount} pages`;
    const fields = form.fields.length ? `, ${form.fields.length} form field${form.fields.length === 1 ? '' : 's'}` : '';
    setStatus(`Opened ${fileName}, ${pages}${fields}.`);
  }, []);

  // Closing frees the document in the worker; the app keeps no copy of it.
  const closeDocument = () => {
    const previous = currentRef.current;
    if (!previous) return;
    openSeq.current++;
    setLoadingName(null);
    void closePdf(previous.doc);
    setCurrent(null);
    dispatch({ type: 'reset', fields: [], canEdit: true });
    setCurrentPage(0);
    setError(null);
    resetSearch();
    setStatus(`Closed ${previous.fileName}.`);
  };

  const openFile = useCallback(
    async (file: File, password?: string) => {
      const seq = ++openSeq.current;
      setLoadingName(file.name);
      setError(null);
      try {
        const opened = await openPdf(file, password);
        const form = await readForm(opened);
        if (seq !== openSeq.current) {
          void closePdf(opened);
          return;
        }
        setPasswordRequest(null);
        showDocument({ doc: opened, fileName: file.name, file, password, form });
      } catch (e) {
        if (seq !== openSeq.current) return;
        const kind = e instanceof OpenError ? e.kind : 'unknown';
        if (kind === 'password-required') {
          setPasswordRequest((prev) => ({
            file,
            failedAttempts: password !== undefined ? (prev?.failedAttempts ?? 0) + 1 : 0,
          }));
        } else {
          setPasswordRequest(null);
          const message = openErrorMessage(kind, file.name);
          setError(message);
          setStatus(message);
        }
      } finally {
        if (seq === openSeq.current) setLoadingName(null);
      }
    },
    [showDocument],
  );

  // Engine warm-up and "Open with" entry points.
  useEffect(() => {
    warmUpEngine();
    listenForLaunchedFiles((file) => guardUnsaved(() => void openFile(file)));
    void takeSharedFile().then((file) => {
      if (file) guardUnsaved(() => void openFile(file));
    });
  }, [openFile, guardUnsaved]);

  // Drag and drop anywhere on the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) guardUnsaved(() => void openFile(file));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFile, guardUnsaved]);

  // Search runs in the worker; debounce so typing stays smooth.
  useEffect(() => {
    const keyword = query.trim();
    if (!doc || !searchOpen || !keyword) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchPdf(doc, keyword)
        .catch(() => [] as SearchResult[])
        .then((found) => {
          if (cancelled) return;
          // Start from the first match at or after the page being read.
          const first = found.findIndex((r) => r.pageIndex >= currentPageRef.current);
          setResults({ query: keyword, matches: found, active: found.length ? Math.max(0, first) : -1 });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc, query, searchOpen]);

  const activeMatch = activeMatchIndex >= 0 ? (matches[activeMatchIndex] ?? null) : null;
  useEffect(() => {
    if (activeMatch) viewerRef.current?.scrollToMatch(activeMatch);
  }, [activeMatch]);

  const stepMatch = (delta: number) => {
    if (matches.length) setResults((r) => ({ ...r, active: wrapIndex(r.active + delta, r.matches.length) }));
  };

  const goToPage = useCallback((index: number) => {
    viewerRef.current?.scrollToPage(index);
    setCurrentPage(index);
  }, []);

  const zoomIn = () => setZoomMode(nextZoomStep(zoomPercent));
  const zoomOut = () => setZoomMode(prevZoomStep(zoomPercent));

  const openSearch = () => {
    setSearchOpen(true);
    setSearchFocus((n) => n + 1);
  };

  // Keyboard shortcuts: Ctrl/Cmd + O, F, =, -, 0.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (!doc) {
        return;
      } else if (key === 'f') {
        e.preventDefault();
        openSearch();
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        setZoomMode(nextZoomStep(zoomPercent));
      } else if (key === '-') {
        e.preventDefault();
        setZoomMode(prevZoomStep(zoomPercent));
      } else if (key === '0') {
        e.preventDefault();
        setZoomMode('fit-width');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, zoomPercent]);

  // ---- Fill & sign

  const requestSignature = useCallback(
    () =>
      new Promise<SignatureContent | null>((resolve) => {
        setSignatureRequest(() => (sig: SignatureContent | null) => {
          setSignatureRequest(null);
          if (sig) setLastSignature(sig);
          resolve(sig);
        });
      }),
    [],
  );

  const fieldsByPage = useMemo(() => groupFieldsByPage(editor.fields), [editor.fields]);
  const editorApi = useMemo<EditorApi>(
    () => ({ state: editor, dispatch, fieldsByPage, requestSignature }),
    [editor, fieldsByPage, requestSignature],
  );

  const pickSignatureTool = async () => {
    const signature = await requestSignature();
    if (signature) dispatch({ type: 'set-tool', tool: { kind: 'signature', signature } });
  };

  const save = async ({ flatten }: SaveChoice) => {
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const bytes = await saveCopy({
        file: current.file,
        password: current.password,
        permissions: current.form.permissions,
        fields: editor.fields,
        values: changedValues(editor),
        items: meaningfulItems(editor.items),
        flatten,
      });
      const name = savedFileName(current.fileName, flatten);
      downloadBytes(bytes, name);
      dispatch({ type: 'saved' });
      setSaveOpen(false);
      setStatus(`Saved ${name}.`);
    } catch (e) {
      const unsupported = await isSaveError(e);
      setSaveError(
        unsupported
          ? `These characters can't be saved yet: ${unsupported.characters.join(' ')}. Remove them and try again.`
          : 'Something went wrong while saving. Your changes are still here; try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  // Delete removes the selected item; Escape drops the tool or selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (e.key === 'Escape' && !typing) {
        if (editor.tool) dispatch({ type: 'set-tool', tool: null });
        else if (editor.selectedId) dispatch({ type: 'select', id: null });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && editor.selectedId) {
        e.preventDefault();
        dispatch({ type: 'remove-item', id: editor.selectedId });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor.tool, editor.selectedId]);

  const onBackgroundPointerDown = useCallback(() => {
    if (editor.selectedId && !editor.editingId) dispatch({ type: 'select', id: null });
  }, [editor.selectedId, editor.editingId]);

  const onNarrowSelect = (index: number) => {
    goToPage(index);
    if (window.matchMedia(NARROW_QUERY).matches) setThumbnailsOpen(false);
  };

  return (
    <div className="app" data-testid="app" data-doc-pages={doc?.pageCount ?? 0}>
      <Toolbar
        fileName={current?.fileName ?? null}
        pageCount={doc?.pageCount ?? 0}
        currentPage={currentPage}
        zoomPercent={zoomPercent}
        zoomMode={zoomMode}
        thumbnailsOpen={thumbnailsOpen}
        searchOpen={searchOpen}
        onOpenClick={() => guardUnsaved(() => fileInputRef.current?.click())}
        onClose={() => guardUnsaved(closeDocument)}
        onToggleThumbnails={() => setThumbnailsOpen((v) => !v)}
        onToggleSearch={() => (searchOpen ? resetSearch() : openSearch())}
        onGoToPage={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomMode={setZoomMode}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openFile(file);
        }}
      />

      {doc && (
        <EditorContext.Provider value={editorApi}>
          <FillBar dirty={dirty} onSignature={() => void pickSignatureTool()} onSave={() => setSaveOpen(true)} />
        </EditorContext.Provider>
      )}

      {searchOpen && doc && (
        <SearchBar
          query={query}
          total={matches.length}
          activeIndex={activeMatchIndex}
          searching={searching}
          focusSignal={searchFocus}
          onQueryChange={setQuery}
          onNext={() => stepMatch(1)}
          onPrev={() => stepMatch(-1)}
          onClose={resetSearch}
        />
      )}

      {error && (
        <div className="banner error" role="alert" data-testid="error">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main className={editor.tool ? 'workspace placing' : 'workspace'}>
        {doc ? (
          <EditorContext.Provider value={editorApi}>
            {thumbnailsOpen && (
              <Thumbnails doc={doc} currentPage={currentPage} onSelect={onNarrowSelect} />
            )}
            <Viewer
              ref={viewerRef}
              doc={doc}
              zoomPercent={zoomPercent}
              matches={matches}
              activeMatch={activeMatch}
              onCurrentPageChange={setCurrentPage}
              onAvailableWidthChange={setAvailableWidth}
              pagesWithFields={current?.form.pagesWithFields ?? NO_PAGES}
              onBackgroundPointerDown={onBackgroundPointerDown}
            />
          </EditorContext.Provider>
        ) : (
          <EmptyState onOpen={() => fileInputRef.current?.click()} />
        )}
      </main>

      {loadingName && (
        <div className="loading" role="status" data-testid="loading">
          <span className="spinner" aria-hidden="true" />
          Opening “{loadingName}”…
        </div>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <FileIcon />
            Drop to open
          </div>
        </div>
      )}

      {passwordRequest && (
        <PasswordDialog
          fileName={passwordRequest.file.name}
          failedAttempts={passwordRequest.failedAttempts}
          busy={loadingName !== null}
          onSubmit={(pw) => void openFile(passwordRequest.file, pw)}
          onCancel={() => {
            openSeq.current++;
            setLoadingName(null);
            setPasswordRequest(null);
          }}
        />
      )}

      {signatureRequest && <SignatureDialog previous={lastSignature} onDone={signatureRequest} />}

      {saveOpen && current && (
        <SaveDialog
          fileNameFor={(flatten) => savedFileName(current.fileName, flatten)}
          hasFields={editor.fields.length > 0}
          passwordProtected={!!current.password}
          busy={saving}
          error={saveError}
          onSave={(choice) => void save(choice)}
          onCancel={() => {
            setSaveOpen(false);
            setSaveError(null);
          }}
        />
      )}

      {pendingDiscard && (
        <ConfirmDialog
          title="Discard your changes?"
          message="You have changes that aren't saved. If you continue, they'll be lost."
          confirmLabel="Discard changes"
          onConfirm={() => {
            const action = pendingDiscard;
            setPendingDiscard(null);
            dispatch({ type: 'saved' });
            dirtyRef.current = false;
            action();
          }}
          onCancel={() => setPendingDiscard(null)}
        />
      )}

      <div className="sr-only" role="status" aria-live="polite" data-testid="status">
        {status}
      </div>
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen(): void }) {
  return (
    <section className="empty" data-testid="empty-state">
      <div className="empty-card">
        <FileIcon />
        <h1>Open a PDF</h1>
        <p>Drag a PDF here, or choose one from your device.</p>
        <button type="button" className="btn primary large" onClick={onOpen}>
          Choose PDF
        </button>
        <p className="privacy-note">Your file is opened on this device. Nothing is uploaded.</p>
      </div>
    </section>
  );
}
