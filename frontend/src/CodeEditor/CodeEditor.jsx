import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import './CodeEditor.css';

const STORAGE_KEY = 'studymeet-code-workspaces';

const STARTER_CODE = {
  python: `def binary_search(arr, target):
    left = 0
    right = len(arr) - 1

    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return -1


numbers = [2, 4, 6, 8, 10, 12]
print(binary_search(numbers, 8))`,
  javascript: `function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

console.log(binarySearch([2, 4, 6, 8, 10, 12], 8));`,
  java: `public class Main {
  public static void main(String[] args) {
    int[] numbers = {2, 4, 6, 8, 10, 12};
    System.out.println(binarySearch(numbers, 8));
  }

  static int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
      int mid = left + (right - left) / 2;
      if (arr[mid] == target) return mid;
      if (arr[mid] < target) left = mid + 1;
      else right = mid - 1;
    }
    return -1;
  }
}`,
  cpp: `#include <iostream>
using namespace std;

int binarySearch(int arr[], int size, int target) {
  int left = 0, right = size - 1;
  while (left <= right) {
    int mid = left + (right - left) / 2;
    if (arr[mid] == target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}

int main() {
  int numbers[] = {2, 4, 6, 8, 10, 12};
  cout << binarySearch(numbers, 6, 8);
  return 0;
}`,
};

const LANGUAGES = [
  { id: 'python', label: 'Python', extension: 'py' },
  { id: 'javascript', label: 'JavaScript', extension: 'js' },
  { id: 'cpp', label: 'C++', extension: 'cpp' },
  { id: 'java', label: 'Java', extension: 'java' },
];

const INITIAL_WORKSPACES = [
  {
    id: 'binary-search',
    name: 'Binary Search',
    owner: 'You',
    access: 'private',
    language: 'python',
    code: STARTER_CODE.python,
    updatedAt: Date.now(),
    permissions: [],
  },
  {
    id: 'two-sum',
    name: 'Two Sum Problem',
    owner: 'Alex Morgan',
    access: 'view',
    language: 'javascript',
    code: 'const numbers = [2, 7, 11, 15];\nconst target = 9;\nconsole.log(`Pair found: ${numbers[0]} + ${numbers[1]}`);',
    updatedAt: Date.now() - 3600000,
    permissions: [{ name: 'You', role: 'Viewer' }],
  },
  {
    id: 'sorting-algorithms',
    name: 'Sorting Algorithms',
    owner: 'Sam Lee',
    access: 'collaborative',
    language: 'python',
    code: 'numbers = [8, 3, 5, 1, 9]\nnumbers.sort()\nprint(numbers)',
    updatedAt: Date.now() - 86400000,
    permissions: [
      { name: 'Sam Lee', role: 'Owner' },
      { name: 'You', role: 'Editor' },
    ],
  },
];

function readWorkspaces() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return INITIAL_WORKSPACES;
    const workspaces = JSON.parse(stored);
    if (!Array.isArray(workspaces)) {
      throw new Error('Saved workspaces must be a list.');
    }
    return workspaces;
  } catch (error) {
    console.error('Could not load saved workspaces.', error);
    return INITIAL_WORKSPACES;
  }
}

function CodeEditor({ roomId, currentUser }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState(readWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('binary-search');
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [runStatus, setRunStatus] = useState('Ready');
  const [showSharing, setShowSharing] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [isRenamingWorkspace, setIsRenamingWorkspace] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  const [syncState, setSyncState] = useState({ key: '', status: '' });
  const [libraryWidth, setLibraryWidth] = useState(245);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const layoutRef = useRef(null);

  const activeWorkspace = workspaces.find(({ id }) => id === activeWorkspaceId)
    || workspaces[0];
  const language = activeWorkspace?.language || 'python';
  const languageInfo = LANGUAGES.find((item) => item.id === language) || LANGUAGES[0];
  const isReadOnly = activeWorkspace?.access === 'view';
  const isOwner = activeWorkspace?.owner === 'You'
    || activeWorkspace?.owner === currentUser?.username;
  const canRenameWorkspace = activeWorkspace?.access === 'private' && isOwner;
  const workspaceId = activeWorkspace?.id;
  const syncKey = roomId && workspaceId ? `${roomId}-${workspaceId}` : '';
  const syncStatus = !roomId
    ? 'Local workspace'
    : typeof BroadcastChannel === 'undefined'
      ? 'Live sync unavailable'
      : syncState.key === syncKey ? syncState.status : 'Live · this browser';

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt),
    [workspaces]
  );

  const resizeLibrary = useCallback((width) => {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width;
    if (!layoutWidth) return;

    const maxWidth = Math.max(200, Math.min(480, layoutWidth - 360));
    setLibraryWidth(Math.min(maxWidth, Math.max(200, width)));
  }, []);

  const startRenamingWorkspace = () => {
    setWorkspaceNameDraft(activeWorkspace.name);
    setRenameError('');
    setIsRenamingWorkspace(true);
  };

  const cancelRenamingWorkspace = () => {
    setIsRenamingWorkspace(false);
    setWorkspaceNameDraft('');
    setRenameError('');
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch (error) {
      console.error('Could not save workspaces locally.', error);
    }
  }, [workspaces]);

  const updateWorkspace = useCallback((workspaceId, updates) => {
    setWorkspaces((items) => items.map((workspace) => (
      workspace.id === workspaceId
        ? { ...workspace, ...updates, updatedAt: Date.now() }
        : workspace
    )));
  }, []);

  const saveWorkspaceName = (event) => {
    event.preventDefault();
    const name = workspaceNameDraft.trim();
    if (!name) {
      setRenameError('Workspace name cannot be empty.');
      return;
    }

    updateWorkspace(activeWorkspace.id, { name });
    cancelRenamingWorkspace();
  };

  useEffect(() => {
    if (!roomId || !workspaceId || typeof BroadcastChannel === 'undefined') return undefined;

    const channel = new BroadcastChannel(`studymeet-code-${roomId}-${workspaceId}`);
    channel.onmessage = ({ data }) => {
      if (data?.type === 'code:update' && typeof data.code === 'string') {
        updateWorkspace(workspaceId, { code: data.code });
        setSyncState({ key: syncKey, status: 'Live · update received' });
      }
    };

    return () => channel.close();
  }, [roomId, workspaceId, syncKey, updateWorkspace]);

  const updateCode = (code) => {
    if (!activeWorkspace || isReadOnly) return;
    updateWorkspace(activeWorkspace.id, { code });

    if (roomId && typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`studymeet-code-${roomId}-${activeWorkspace.id}`);
      channel.postMessage({ type: 'code:update', code });
      channel.close();
      setSyncState({ key: syncKey, status: 'Live · change sent' });
    }
  };

  const changeLanguage = (nextLanguage) => {
    if (!activeWorkspace || isReadOnly) return;
    updateWorkspace(activeWorkspace.id, {
      language: nextLanguage,
      code: STARTER_CODE[nextLanguage],
    });
    setOutput('');
    setRunStatus('Ready');
  };

  const createWorkspace = () => {
    const id = `workspace-${Date.now()}`;
    const workspace = {
      id,
      name: `Untitled workspace ${workspaces.length}`,
      owner: currentUser?.username || 'You',
      access: 'private',
      language: 'python',
      code: STARTER_CODE.python,
      updatedAt: Date.now(),
      permissions: [],
    };
    cancelRenamingWorkspace();
    setWorkspaces((items) => [workspace, ...items]);
    setActiveWorkspaceId(id);
    setOutput('');
    setRunStatus('Ready');
  };

  const handleRun = () => {
    if (isRunning || !activeWorkspace) return;
    setIsRunning(true);
    setRunStatus('Running mock execution');
    setOutput('Sending code to the mock execution service…');
    window.setTimeout(() => {
      setOutput('3\n\nThis is sample output from the frontend mock. Connect the execution API to run your code.');
      setRunStatus('Completed · mock result');
      setIsRunning(false);
    }, 650);
  };

  const changeAccess = (access) => {
    if (!activeWorkspace || !isOwner) return;
    updateWorkspace(activeWorkspace.id, { access });
  };

  const changePermission = (index, role) => {
    if (!activeWorkspace || !isOwner) return;
    const permissions = activeWorkspace.permissions.map((permission, permissionIndex) => (
      permissionIndex === index ? { ...permission, role } : permission
    ));
    updateWorkspace(activeWorkspace.id, { permissions });
  };

  const copyWorkspaceLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage('Workspace link copied.');
    } catch (error) {
      console.error('Could not copy workspace link.', error);
      setCopyMessage('Clipboard access is unavailable in this browser.');
    }
  };

  if (!activeWorkspace) {
    return (
      <main className="code-editor-page">
        <div className="workspace-empty">
          <h2>No workspaces yet</h2>
          <button type="button" className="primary-action" onClick={createWorkspace}>
            Create workspace
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`code-editor-page${roomId ? ' room-code-editor' : ''}`}>
      {!roomId && (
        <nav className="workspace-topbar" aria-label="Workspace navigation">
          <button type="button" className="workspace-brand" onClick={() => navigate('/dashboard')}>
            <img src="/favicon.svg" alt="" />
            <span>StudyMeet</span>
          </button>
          <span className="workspace-topbar-label">Code workspace</span>
          <button type="button" className="subtle-action" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </nav>
      )}

      <div className="code-editor-header">
        <div className="workspace-heading">
          {!roomId && <div className="workspace-eyebrow">YOUR WORKSPACE</div>}
          {isRenamingWorkspace ? (
            <form className="workspace-rename-form" onSubmit={saveWorkspaceName}>
              <input
                autoFocus
                type="text"
                value={workspaceNameDraft}
                onChange={(event) => {
                  setWorkspaceNameDraft(event.target.value);
                  setRenameError('');
                }}
                aria-label="Workspace name"
              />
              <button type="submit" className="rename-save-button">Save</button>
              <button type="button" className="rename-cancel-button" onClick={cancelRenamingWorkspace}>
                Cancel
              </button>
              {renameError && <span className="rename-error" role="alert">{renameError}</span>}
            </form>
          ) : (
            <div className="workspace-title-line">
              <h1>{activeWorkspace.name}</h1>
              {canRenameWorkspace && (
                <button
                  type="button"
                  className="rename-workspace-button"
                  onClick={startRenamingWorkspace}
                  aria-label={`Rename ${activeWorkspace.name}`}
                  title="Rename workspace"
                >
                  Rename
                </button>
              )}
            </div>
          )}
          <p>Write, practise and collaborate on code.</p>
        </div>
        <div className="editor-header-actions">
          {!isLibraryOpen && (
            <button
              type="button"
              className="subtle-action library-show-button"
              onClick={() => setIsLibraryOpen(true)}
            >
              Show library
            </button>
          )}
          <label className="language-picker">
            <span>Language</span>
            <select
              value={language}
              onChange={(event) => changeLanguage(event.target.value)}
              disabled={isReadOnly}
              aria-label="Programming language"
            >
              {LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="subtle-action" onClick={() => setShowSharing(true)}>
            Share
          </button>
          <button
            type="button"
            className="run-code-button"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? 'Running…' : '▶ Run code'}
          </button>
        </div>
      </div>

      <div
        ref={layoutRef}
        className={`code-editor-layout${isLibraryOpen ? '' : ' library-closed'}`}
        style={{ '--workspace-library-width': `${libraryWidth}px` }}
      >
        <section className="editor-main" aria-label="Code editor">
          <div className="editor-titlebar">
            <div className="editor-file">
              <span className="file-indicator">◇</span>
              <span>main.{languageInfo.extension}</span>
              {isReadOnly && <span className="readonly-tag">View only</span>}
            </div>
            <span className={`editor-status${isRunning ? ' status-running' : ''}`}>
              <span className="status-dot" />
              {runStatus}
            </span>
          </div>

          <div className="monaco-editor-wrap">
            <Editor
              height="100%"
              language={language}
              value={activeWorkspace.code}
              onChange={(value) => updateCode(value ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                wordWrap: 'on',
                readOnly: isReadOnly,
                ariaLabel: `${languageInfo.label} code editor`,
              }}
            />
          </div>

          <section className="output-panel" aria-live="polite">
            <div className="output-heading">
              <h2>Console</h2>
              <span>{output ? 'Mock run' : 'Waiting to run'}</span>
            </div>
            <pre>{output || 'Run your code to see output here.'}</pre>
          </section>
          <div className="editor-footer">
            <span>{languageInfo.label}</span>
            <span className={roomId ? 'sync-indicator' : ''}>
              {roomId && <span className="status-dot" />}
              {syncStatus}
            </span>
          </div>
        </section>

        {isLibraryOpen && (
          <>
            <div
              className="workspace-resize-handle"
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize code editor and workspace library"
              aria-valuemin={200}
              aria-valuemax={480}
              aria-valuenow={libraryWidth}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeLibrary(layoutRef.current.getBoundingClientRect().right - event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  resizeLibrary(layoutRef.current.getBoundingClientRect().right - event.clientX);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  resizeLibrary(libraryWidth + 20);
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  resizeLibrary(libraryWidth - 20);
                }
              }}
            />

            <aside className="workspace-sidebar">
              <div className="sidebar-heading">
                <div>
                  <span className="sidebar-eyebrow">LIBRARY</span>
                  <h2>Workspaces</h2>
                </div>
                <div className="library-heading-actions">
                  <button
                    type="button"
                    className="add-workspace-button"
                    onClick={createWorkspace}
                    aria-label="Create workspace"
                    title="Create workspace"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="close-library-button"
                    onClick={() => setIsLibraryOpen(false)}
                    aria-label="Close workspace library"
                    title="Close workspace library"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="workspace-group">
                <h3><span className="group-icon">▣</span> My workspaces</h3>
                {sortedWorkspaces.filter(({ owner }) => owner === 'You' || owner === currentUser?.username).map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    active={workspace.id === activeWorkspace.id}
                    onSelect={() => {
                      setActiveWorkspaceId(workspace.id);
                      cancelRenamingWorkspace();
                    }}
                  />
                ))}
              </div>

              <div className="workspace-group">
                <h3><span className="group-icon">↗</span> Shared with me</h3>
                {sortedWorkspaces.filter(({ owner }) => owner !== 'You' && owner !== currentUser?.username).map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    active={workspace.id === activeWorkspace.id}
                    onSelect={() => {
                      setActiveWorkspaceId(workspace.id);
                      cancelRenamingWorkspace();
                    }}
                  />
                ))}
              </div>

              <div className="sidebar-sync-note">
                <span className="sync-note-icon">✦</span>
                <p>Shared workspaces are sample data until the workspace API is connected.</p>
              </div>
            </aside>
          </>
        )}
      </div>

      {showSharing && (
        <div className="sharing-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowSharing(false);
        }}>
          <section className="sharing-dialog" role="dialog" aria-modal="true" aria-labelledby="sharing-title">
            <div className="sharing-dialog-heading">
              <div>
                <span className="sidebar-eyebrow">WORKSPACE ACCESS</span>
                <h2 id="sharing-title">Share {activeWorkspace.name}</h2>
              </div>
              <button type="button" className="dialog-close" onClick={() => setShowSharing(false)} aria-label="Close sharing dialog">
                ×
              </button>
            </div>

            <label className="access-mode-label" htmlFor="access-mode">General access</label>
            <select
              id="access-mode"
              className="access-mode-select"
              value={activeWorkspace.access}
              disabled={!isOwner}
              onChange={(event) => changeAccess(event.target.value)}
            >
              <option value="private">Private · only you can access</option>
              <option value="view">View only · link holders can view</option>
              <option value="collaborative">Collaborative · link holders can edit</option>
            </select>
            {!isOwner && <p className="permission-note">Only the workspace owner can change access.</p>}

            <div className="permissions-heading">
              <h3>People with access</h3>
              <span>{activeWorkspace.permissions.length}</span>
            </div>
            <div className="permission-list">
              <div className="permission-person">
                <div className="permission-avatar">{(activeWorkspace.owner || 'U').charAt(0).toUpperCase()}</div>
                <div className="permission-person-details">
                  <strong>{activeWorkspace.owner}</strong>
                  <span>Workspace owner</span>
                </div>
                <span className="permission-role">Owner</span>
              </div>
              {activeWorkspace.permissions.map((permission, index) => (
                <div className="permission-person" key={`${permission.name}-${index}`}>
                  <div className="permission-avatar permission-avatar-muted">{permission.name.charAt(0).toUpperCase()}</div>
                  <div className="permission-person-details">
                    <strong>{permission.name}</strong>
                    <span>Workspace member</span>
                  </div>
                  {isOwner ? (
                    <select
                      className="permission-role-select"
                      value={permission.role}
                      onChange={(event) => changePermission(index, event.target.value)}
                      aria-label={`${permission.name} permission`}
                    >
                      <option>Viewer</option>
                      <option>Editor</option>
                    </select>
                  ) : (
                    <span className="permission-role">{permission.role}</span>
                  )}
                </div>
              ))}
              {activeWorkspace.permissions.length === 0 && (
                <p className="permission-note">No one else has been added yet.</p>
              )}
            </div>

            <div className="sharing-dialog-footer">
              <span className="copy-message" role="status">{copyMessage}</span>
              <button type="button" className="run-code-button" onClick={copyWorkspaceLink}>
                Copy link
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function WorkspaceCard({ workspace, active, onSelect }) {
  const accessLabel = workspace.access === 'collaborative'
    ? 'Collaborative'
    : workspace.access === 'view' ? 'View only' : 'Private';
  const accessIcon = workspace.access === 'collaborative'
    ? '✎'
    : workspace.access === 'view' ? '◉' : '▣';

  return (
    <button
      type="button"
      className={`workspace-card${active ? ' active-workspace' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
    >
      <span className="workspace-card-icon">⌘</span>
      <span className="workspace-card-copy">
        <strong>{workspace.name}</strong>
        <span>{workspace.owner === 'You' ? 'Personal workspace' : `By ${workspace.owner}`}</span>
        <span className={`workspace-access access-${workspace.access}`}>
          <span>{accessIcon}</span> {accessLabel}
        </span>
      </span>
      {active && <span className="workspace-active-mark" aria-label="Selected">●</span>}
    </button>
  );
}

export default CodeEditor;
