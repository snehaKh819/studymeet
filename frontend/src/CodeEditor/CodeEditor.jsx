import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../utils/api';
import { createCollabSocket, WorkspaceCollab, watchRoom } from '../lib/collabProvider';
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

const API_LANGUAGES = LANGUAGES.filter(({ id }) => (
  id === 'python' || id === 'javascript'
));

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

function fromApiWorkspace(workspace) {
  const sharingModes = {
    PRIVATE: 'private',
    VIEW_ONLY: 'view',
    COLLABORATIVE: 'collaborative',
  };

  return {
    ...workspace,
    owner: workspace.ownerName || '',
    access: sharingModes[workspace.sharingMode] || 'private',
    updatedAt: Date.parse(workspace.updatedAt) || Date.now(),
    ...(typeof workspace.code === 'string' ? { code: workspace.code } : {}),
    apiPermissions: workspace.permissions,
    permissions: [],
  };
}

function mergeApiWorkspace(current, response) {
  const updatedWorkspace = fromApiWorkspace(response);
  return {
    ...current,
    ...updatedWorkspace,
    code: typeof response.code === 'string' ? response.code : current.code,
    permissions: current.permissions,
  };
}

function formatExecutionResult(result) {
  const output = [
    result.stdout,
    result.stderr && `Error output:\n${result.stderr}`,
  ].filter(Boolean).join('\n');

  return {
    output: output || 'Program completed with no output.',
    status: result.timedOut
      ? 'Timed out'
      : result.oomKilled
        ? 'Stopped · memory limit'
        : result.truncated
          ? 'Completed · output truncated'
          : result.exitCode === 0
            ? `Completed · ${result.durationMs} ms`
            : `Exited with code ${result.exitCode}`,
  };
}

function CodeEditor({ roomId, currentUser }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState(() => (
    roomId ? [] : readWorkspaces()
  ));
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => (
    roomId ? '' : 'binary-search'
  ));
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [runStatus, setRunStatus] = useState('Ready');
  const [isLoading, setIsLoading] = useState(Boolean(roomId));
  const [isSaving, setIsSaving] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [showSharing, setShowSharing] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [isRenamingWorkspace, setIsRenamingWorkspace] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  const [syncState, setSyncState] = useState({ key: '', status: '' });
  const [participants, setParticipants] = useState([]);
  const [newEditorId, setNewEditorId] = useState('');
  const [collabSocket, setCollabSocket] = useState(null);
  const [collabSession, setCollabSession] = useState(null);
  const [collabStatus, setCollabStatus] = useState(roomId ? 'connecting' : '');
  const [presence, setPresence] = useState([]);
  const [editRequestStatus, setEditRequestStatus] = useState('');
  const [boundCollabSession, setBoundCollabSession] = useState(null);
  const [editorInstance, setEditorInstance] = useState(null);
  const [libraryWidth, setLibraryWidth] = useState(245);
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const layoutRef = useRef(null);
  const lastSavedCode = useRef(new Map());

  const activeWorkspace = workspaces.find(({ id }) => id === activeWorkspaceId)
    || workspaces[0];
  const workspaceIdForSharing = activeWorkspace?.id;
  const collabForActive = collabSession?.workspaceId === activeWorkspace?.id
    ? collabSession
    : null;
  const language = activeWorkspace?.language || 'python';
  const languageInfo = API_LANGUAGES.find((item) => item.id === language)
    || LANGUAGES.find((item) => item.id === language)
    || LANGUAGES[0];
  const activePermissions = collabForActive?.permissions
    || activeWorkspace?.apiPermissions;
  const collaborationPending = roomId && !collabForActive && collabStatus !== 'error';
  const bindingPending = collabForActive
    && boundCollabSession !== collabForActive;
  const isReadOnly = roomId
    ? collaborationPending || bindingPending || !activePermissions?.canEdit
    : activeWorkspace?.access === 'view';
  const isOwner = roomId
    ? Boolean(activePermissions?.isOwner)
    : activeWorkspace?.owner === 'You'
      || activeWorkspace?.owner === currentUser?.username;
  const canRenameWorkspace = roomId
    ? isOwner
    : activeWorkspace?.access === 'private' && isOwner;
  const workspaceId = activeWorkspace?.id;
  const syncKey = roomId && workspaceId ? `${roomId}-${workspaceId}` : '';
  const syncStatus = !roomId
    ? 'Local workspace'
    : collabForActive
      ? collabForActive.synced && collabStatus === 'connected'
        ? 'Live · connected'
        : 'Live · reconnecting'
      : isSaving
        ? 'Saving to server…'
        : syncState.key === syncKey && syncState.status
          ? syncState.status
          : `Live sync ${collabStatus || 'connecting'}`;

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

  const loadRoomWorkspaces = useCallback(async () => {
    const response = await api.get('/workspaces', { params: { roomId } });
    if (!Array.isArray(response.data?.workspaces)) {
      throw new Error('The workspace service returned an invalid workspace list.');
    }

    const nextWorkspaces = response.data.workspaces.map(fromApiWorkspace);
    setWorkspaces((current) => nextWorkspaces.map((workspace) => {
      const previous = current.find(({ id }) => id === workspace.id);
      return previous
        ? {
          ...previous,
          ...workspace,
          code: previous.code,
          permissions: previous.permissions,
        }
        : workspace;
    }));
    setActiveWorkspaceId((currentId) => (
      nextWorkspaces.some(({ id }) => id === currentId)
        ? currentId
        : nextWorkspaces.find(({ apiPermissions }) => apiPermissions?.isOwner)?.id
          || nextWorkspaces[0]?.id
          || ''
    ));
    return nextWorkspaces;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return undefined;

    const socket = createCollabSocket();
    const onConnect = () => setCollabSocket(socket);
    const onConnectError = () => setCollabStatus('error');
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !collabSocket) return undefined;

    return watchRoom(collabSocket, roomId, () => {
      loadRoomWorkspaces().catch((error) => {
        setWorkspaceError(
          error.response?.data?.message
            || error.message
            || 'Could not refresh the workspace list.'
        );
      });
    });
  }, [roomId, collabSocket, loadRoomWorkspaces]);

  useEffect(() => {
    if (!roomId || !collabSocket || !activeWorkspaceId) return undefined;

    const collab = new WorkspaceCollab(collabSocket, activeWorkspaceId, {
      user: {
        name: currentUser?.username || 'Student',
        color: '#8b5cf6',
      },
    });
    const subscriptions = [
      collab.on('synced', ({ permissions: nextPermissions, presence: nextPresence }) => {
        setCollabSession(collab);
        setCollabStatus('connected');
        setPresence(nextPresence);
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === activeWorkspaceId
            ? { ...workspace, apiPermissions: nextPermissions }
            : workspace
        )));
        setWorkspaceError('');
      }),
      collab.on('permissions', (nextPermissions) => {
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === activeWorkspaceId
            ? { ...workspace, apiPermissions: nextPermissions }
            : workspace
        )));
      }),
      collab.on('presence', (users) => {
        setPresence(users);
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === activeWorkspaceId
            ? {
              ...workspace,
              presence: {
                activeUsers: users.length,
                ownerOnline: users.some((user) => user.userId === workspace.ownerId),
              },
            }
            : workspace
        )));
      }),
      collab.on('status', setCollabStatus),
      collab.on('workspace', (updated) => {
        const access = {
          PRIVATE: 'private',
          VIEW_ONLY: 'view',
          COLLABORATIVE: 'collaborative',
        }[updated.sharingMode];
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === updated.id
            ? {
              ...workspace,
              name: updated.name,
              language: updated.language,
              owner: updated.ownerName,
              access: access || workspace.access,
              updatedAt: Date.parse(updated.updatedAt) || workspace.updatedAt,
            }
            : workspace
        )));
      }),
      collab.on('run:started', ({ by }) => {
        setIsRunning(true);
        setRunStatus(by ? `Running · ${by}` : 'Running');
      }),
      collab.on('run:result', ({ result }) => {
        if (result) {
          const formatted = formatExecutionResult(result);
          setOutput(formatted.output);
          setRunStatus(formatted.status);
        }
        setIsRunning(false);
      }),
      collab.on('run:error', ({ message }) => {
        setWorkspaceError(message || 'The code runner failed.');
        setRunStatus('Run failed');
        setIsRunning(false);
      }),
      collab.on('edit:requested', ({ username }) => {
        setEditRequestStatus(`${username} requested edit access.`);
      }),
      collab.on('error', ({ error }) => {
        setCollabStatus('error');
        setWorkspaceError(`Workspace collaboration failed: ${error}.`);
      }),
      collab.on('revoked', () => {
        setCollabSession(null);
        setWorkspaceError('You no longer have access to this workspace.');
      }),
      collab.on('deleted', () => {
        setCollabSession(null);
        setWorkspaceError('This workspace was deleted.');
        loadRoomWorkspaces().catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not refresh the workspace list.'
          );
        });
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      collab.destroy();
    };
  }, [roomId, collabSocket, activeWorkspaceId, currentUser?.username, loadRoomWorkspaces]);

  useEffect(() => {
    if (!collabForActive || !editorInstance) return undefined;
    let isMounted = true;
    let binding;

    import('y-monaco')
      .then(({ MonacoBinding }) => {
        if (!isMounted) return;
        const model = editorInstance.getModel();
        if (!model) return;

        binding = new MonacoBinding(
          collabForActive.text,
          model,
          new Set([editorInstance]),
          collabForActive.awareness
        );
        setBoundCollabSession(collabForActive);
      })
      .catch((error) => {
        if (!isMounted) return;
        setWorkspaceError(`Could not bind the collaborative editor: ${error.message}`);
        collabForActive.destroy();
        setCollabSession(null);
        setCollabStatus('error');
      });

    return () => {
      isMounted = false;
      binding?.destroy();
    };
  }, [collabForActive, editorInstance]);

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
    if (!roomId) return undefined;

    let isMounted = true;

    api.post('/workspaces', { roomId })
      .then(() => loadRoomWorkspaces())
      .then((nextWorkspaces) => {
        if (!isMounted) return;

        const personalWorkspace = nextWorkspaces.find(
          ({ apiPermissions }) => apiPermissions?.isOwner
        );
        if (!personalWorkspace) {
          throw new Error('Your room workspace was not returned by the workspace service.');
        }

        setActiveWorkspaceId((currentId) => (
          nextWorkspaces.some(({ id }) => id === currentId)
            ? currentId
            : personalWorkspace.id
        ));
      })
      .catch((error) => {
        if (isMounted) {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not load room workspaces.'
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [roomId, loadRoomWorkspaces]);

  useEffect(() => {
    if (!roomId || !activeWorkspaceId) return undefined;

    let isMounted = true;
    api.get(`/workspaces/${activeWorkspaceId}`)
      .then(({ data }) => {
        if (!isMounted) return;
        if (typeof data?.workspace?.code !== 'string') {
          throw new Error('The workspace service returned invalid workspace code.');
        }

        const workspace = fromApiWorkspace(data.workspace);
        lastSavedCode.current.set(workspace.id, workspace.code);
        setWorkspaces((items) => items.map((item) => (
          item.id === workspace.id ? mergeApiWorkspace(item, data.workspace) : item
        )));
      })
      .catch((error) => {
        if (isMounted) {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not open this workspace.'
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomId, activeWorkspaceId]);

  useEffect(() => {
    if (!roomId || !showSharing || !workspaceIdForSharing) return undefined;

    let isMounted = true;
    const requests = [
      api.get('/workspaces/participants', { params: { roomId } }),
      isOwner
        ? api.get(`/workspaces/${workspaceIdForSharing}/editors`)
        : Promise.resolve({ data: [] }),
    ];

    Promise.all(requests)
      .then(([participantsResponse, editorsResponse]) => {
        const nextParticipants = participantsResponse.data?.participants;
        const nextEditors = editorsResponse.data?.editors ?? [];
        if (!Array.isArray(nextParticipants) || !Array.isArray(nextEditors)) {
          throw new Error('The workspace service returned invalid sharing details.');
        }
        if (!isMounted) return;

        setParticipants(nextParticipants);
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === workspaceIdForSharing
            ? {
              ...workspace,
              permissions: nextEditors.map((editor) => ({
                userId: editor.userId,
                name: editor.username,
                role: 'Editor',
              })),
            }
            : workspace
        )));
      })
      .catch((error) => {
        if (isMounted) {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not load workspace sharing details.'
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomId, showSharing, workspaceIdForSharing, isOwner]);

  useEffect(() => {
    if (
      !roomId
      || !activeWorkspace
      || collabForActive
      || !activeWorkspace.apiPermissions?.canEdit
      || typeof activeWorkspace.code !== 'string'
      || lastSavedCode.current.get(activeWorkspace.id) === activeWorkspace.code
    ) {
      return undefined;
    }

    const { id, code } = activeWorkspace;
    const timeoutId = window.setTimeout(() => {
      setIsSaving(true);
      api.put(`/workspaces/${id}/code`, { code })
        .then(() => {
          lastSavedCode.current.set(id, code);
          setSyncState({ key: `${roomId}-${id}`, status: 'Saved to server' });
          setWorkspaceError('');
        })
        .catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not save workspace code.'
          );
          setSyncState({ key: `${roomId}-${id}`, status: 'Save failed' });
        })
        .finally(() => setIsSaving(false));
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [roomId, activeWorkspace, collabForActive]);

  useEffect(() => {
    if (roomId) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch (error) {
      console.error('Could not save workspaces locally.', error);
    }
  }, [roomId, workspaces]);

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

    if (roomId) {
      api.patch(`/workspaces/${activeWorkspace.id}`, { name })
        .then(() => {
          updateWorkspace(activeWorkspace.id, { name });
          cancelRenamingWorkspace();
          setWorkspaceError('');
        })
        .catch((error) => {
          setRenameError(
            error.response?.data?.message
              || error.message
              || 'Could not rename this workspace.'
          );
        });
      return;
    }

    updateWorkspace(activeWorkspace.id, { name });
    cancelRenamingWorkspace();
  };

  useEffect(() => {
    if (roomId || !workspaceId || typeof BroadcastChannel === 'undefined') return undefined;

    const channel = new BroadcastChannel(`studymeet-code-local-${workspaceId}`);
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

    if (!roomId && typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`studymeet-code-local-${activeWorkspace.id}`);
      channel.postMessage({ type: 'code:update', code });
      channel.close();
      setSyncState({ key: syncKey, status: 'Live · change sent' });
    }
  };

  const changeLanguage = (nextLanguage) => {
    if (!activeWorkspace || isReadOnly) return;
    if (roomId) {
      api.patch(`/workspaces/${activeWorkspace.id}`, { language: nextLanguage })
        .then(() => {
          updateWorkspace(activeWorkspace.id, { language: nextLanguage });
          setOutput('');
          setRunStatus('Ready');
          setWorkspaceError('');
        })
        .catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not change the workspace language.'
          );
        });
      return;
    }

    updateWorkspace(activeWorkspace.id, {
      language: nextLanguage,
      code: STARTER_CODE[nextLanguage],
    });
    setOutput('');
    setRunStatus('Ready');
  };

  const createWorkspace = () => {
    if (roomId) return;

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
    if (
      isRunning
      || !activeWorkspace
      || (roomId && !activeWorkspace.apiPermissions?.canRun)
    ) return;

    if (roomId) {
      setIsRunning(true);
      setRunStatus('Running');
      setOutput('');
      setWorkspaceError('');
      api.post(`/workspaces/${activeWorkspace.id}/run`, {
        ...(collabForActive ? {} : { code: activeWorkspace.code }),
      })
        .then(({ data }) => {
          const result = data.result;
          if (!result || typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
            throw new Error('The execution service returned an invalid result.');
          }

          const formatted = formatExecutionResult(result);
          setOutput(formatted.output);
          setRunStatus(formatted.status);
        })
        .catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not run this code.'
          );
          setRunStatus('Run failed');
        })
        .finally(() => setIsRunning(false));
      return;
    }

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
    if (roomId) {
      const sharingMode = {
        private: 'PRIVATE',
        view: 'VIEW_ONLY',
        collaborative: 'COLLABORATIVE',
      }[access];
      api.patch(`/workspaces/${activeWorkspace.id}`, { sharingMode })
        .then(() => {
          updateWorkspace(activeWorkspace.id, { access });
          setWorkspaceError('');
        })
        .catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not update workspace access.'
          );
        });
      return;
    }

    updateWorkspace(activeWorkspace.id, { access });
  };

  const changePermission = (permission, role) => {
    if (!activeWorkspace || !isOwner) return;
    if (roomId) {
        const request = role === 'Editor'
          ? api.put(`/workspaces/${activeWorkspace.id}/editors/${permission.userId}`)
            .then(({ data }) => data?.editors)
          : api.delete(`/workspaces/${activeWorkspace.id}/editors/${permission.userId}`)
            .then(() => api.get(`/workspaces/${activeWorkspace.id}/editors`))
            .then(({ data }) => data?.editors);
        request
          .then((editors) => {
          if (!Array.isArray(editors)) {
            throw new Error('The workspace service returned an invalid editor list.');
          }
          setWorkspaces((items) => items.map((workspace) => (
            workspace.id === activeWorkspace.id
              ? {
                ...workspace,
                permissions: editors.map((editor) => ({
                  userId: editor.userId,
                  name: editor.username,
                  role: 'Editor',
                })),
              }
              : workspace
          )));
          setWorkspaceError('');
        })
        .catch((error) => {
          setWorkspaceError(
            error.response?.data?.message
              || error.message
              || 'Could not update workspace editor access.'
          );
        });
      return;
    }

    const permissions = activeWorkspace.permissions.map((item) => (
      item === permission ? { ...item, role } : item
    ));
    updateWorkspace(activeWorkspace.id, { permissions });
  };

  const addEditor = () => {
    if (!roomId || !activeWorkspace || !isOwner || !newEditorId) return;

    api.put(`/workspaces/${activeWorkspace.id}/editors/${newEditorId}`)
      .then(({ data }) => {
        const editors = data?.editors;
        if (!Array.isArray(editors)) {
          throw new Error('The workspace service returned an invalid editor list.');
        }
        setWorkspaces((items) => items.map((workspace) => (
          workspace.id === activeWorkspace.id
            ? {
              ...workspace,
              permissions: editors.map((editor) => ({
                userId: editor.userId,
                name: editor.username,
                role: 'Editor',
              })),
            }
            : workspace
        )));
        setNewEditorId('');
        setWorkspaceError('');
      })
      .catch((error) => {
        setWorkspaceError(
          error.response?.data?.message
            || error.message
            || 'Could not grant editor access.'
        );
      });
  };

  const requestEditAccess = () => {
    if (!collabForActive) {
      setEditRequestStatus('Connect to the workspace before requesting edit access.');
      return;
    }

    collabForActive.requestEditAccess()
      .then((response) => {
        const messages = {
          already_requested: 'Your request is already pending.',
          owner_offline: 'The workspace owner is offline right now.',
          not_applicable: 'Edit access cannot be requested for this workspace.',
          not_joined: 'Reconnect to the workspace and try again.',
        };
        setEditRequestStatus(
          response?.ok
            ? 'Edit access request sent to the owner.'
            : messages[response?.error] || 'Could not send the edit access request.'
        );
      })
      .catch((error) => {
        setEditRequestStatus(error.message || 'Could not send the edit access request.');
      });
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

  if (roomId && isLoading) {
    return (
      <main className="code-editor-page room-code-editor">
        <div className="workspace-empty" role="status">Loading room workspaces…</div>
      </main>
    );
  }

  if (!activeWorkspace) {
    return (
      <main className="code-editor-page">
        <div className="workspace-empty">
          {workspaceError ? (
            <p role="alert">{workspaceError}</p>
          ) : (
            <>
              <h2>No workspaces yet</h2>
              <button type="button" className="primary-action" onClick={createWorkspace}>
                Create workspace
              </button>
            </>
          )}
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
              {(roomId ? API_LANGUAGES : LANGUAGES).map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="subtle-action"
            onClick={() => {
              setEditRequestStatus('');
              setShowSharing(true);
            }}
          >
            Share
          </button>
          <button
            type="button"
            className="run-code-button"
            onClick={handleRun}
            disabled={isRunning || (roomId && !activePermissions?.canRun)}
          >
            {isRunning ? 'Running…' : '▶ Run code'}
          </button>
        </div>
      </div>

      {workspaceError && <p className="workspace-error" role="alert">{workspaceError}</p>}

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
              value={collabForActive ? undefined : activeWorkspace.code}
              onChange={collabForActive ? undefined : (value) => updateCode(value ?? '')}
              onMount={(editor) => setEditorInstance(editor)}
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
              <span>{output ? (roomId ? 'Execution result' : 'Mock run') : 'Waiting to run'}</span>
            </div>
            <pre>{output || 'Run your code to see output here.'}</pre>
          </section>
          <div className="editor-footer">
            <span>{languageInfo.label}</span>
            <span className={roomId ? 'sync-indicator' : ''}>
              {roomId && <span className="status-dot" />}
              {syncStatus}
            </span>
            {roomId && presence.length > 0 && (
              <span>{presence.length} here</span>
            )}
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
                    disabled={Boolean(roomId)}
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
                {sortedWorkspaces.filter((workspace) => (
                  roomId
                    ? workspace.apiPermissions?.isOwner
                    : workspace.owner === 'You' || workspace.owner === currentUser?.username
                )).map((workspace) => (
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
                {sortedWorkspaces.filter((workspace) => (
                  roomId
                    ? !workspace.apiPermissions?.isOwner
                    : workspace.owner !== 'You' && workspace.owner !== currentUser?.username
                )).map((workspace) => (
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
                <p>{roomId
                  ? 'Workspace changes save to the server and sync live with participants.'
                  : 'This workspace is stored in this browser.'}</p>
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
            {roomId && !isOwner && activeWorkspace.access === 'collaborative' && (
              <div className="edit-request">
                <button type="button" onClick={requestEditAccess}>
                  Request edit access
                </button>
                {editRequestStatus && <span role="status">{editRequestStatus}</span>}
              </div>
            )}

            <div className="permissions-heading">
              <h3>People with access</h3>
              <span>{activeWorkspace.permissions.length}</span>
            </div>
            {roomId && isOwner && activeWorkspace.access === 'collaborative' && (
              <div className="share-editor-picker">
                <select
                  value={newEditorId}
                  onChange={(event) => setNewEditorId(event.target.value)}
                  aria-label="Choose a room member to grant edit access"
                >
                  <option value="">Choose a room member</option>
                  {participants
                    .filter(({ isMe, userId }) => (
                      !isMe
                      && !activeWorkspace.permissions.some((editor) => editor.userId === userId)
                    ))
                    .map(({ userId, username }) => (
                      <option key={userId} value={userId}>{username}</option>
                    ))}
                </select>
                <button type="button" onClick={addEditor} disabled={!newEditorId}>
                  Add editor
                </button>
              </div>
            )}
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
                  {isOwner && !roomId ? (
                    <select
                      className="permission-role-select"
                      value={permission.role}
                      onChange={(event) => changePermission(permission, event.target.value)}
                      aria-label={`${permission.name} permission`}
                    >
                      <option>Viewer</option>
                      <option>Editor</option>
                    </select>
                  ) : isOwner && roomId ? (
                    <select
                      className="permission-role-select"
                      value={permission.role}
                      onChange={(event) => changePermission(permission, event.target.value)}
                      aria-label={`${permission.name} permission`}
                    >
                      <option>Editor</option>
                      <option>Viewer</option>
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
  const isPersonal = workspace.apiPermissions?.isOwner || workspace.owner === 'You';
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
        <span>{isPersonal ? 'Personal workspace' : `By ${workspace.owner}`}</span>
        <span className={`workspace-access access-${workspace.access}`}>
          <span>{accessIcon}</span> {accessLabel}
        </span>
        {workspace.presence?.activeUsers > 0 && (
          <span className="workspace-presence">
            {workspace.presence.activeUsers} here now
          </span>
        )}
      </span>
      {active && <span className="workspace-active-mark" aria-label="Selected">●</span>}
    </button>
  );
}

export default CodeEditor;
