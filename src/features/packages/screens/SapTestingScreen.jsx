import { useEffect, useRef, useState } from 'react';

import AppButton from '../../../components/common/AppButton';
import Icon from '../../../components/common/Icon';
import ScreenContainer from '../../../components/common/ScreenContainer';
import { useAuth } from '../../auth/context/AuthContext';
import { packageService } from '../services/packageService';
import { sapTerminalService } from '../services/sapTerminalService';

const FINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);
const LANES = {
  gui: { label: 'GUI Lane', description: 'SAP GUI for Windows' },
  web: { label: 'Web Lane', description: 'Browser-based SAP testing' },
};
function detectCreateCaseIntent(text) {
  return /\b(create|add|new|make)\b.{0,40}\btest\s*cases?\b/i.test(text)
    || /\btest\s*cases?\b.{0,40}\b(create|add|new|make)\b/i.test(text);
}

function statusLabel(status, source) {
  return ({ idle: 'Ready', running: source === 'direct' ? 'Test is running' : 'AI Assistant is working', completed: 'Ready', failed: 'Needs attention', stopped: 'Stopped', stopping: 'Stopping' })[status] || 'Ready';
}

// The archive/log API (see gui_tests archive script -> POST /api/logs) wants
// the prefix of the user's email (e.g. "swarangi.k" from "swarangi.k@fourthsignal.com"),
// not the login/display username. Falls back to stripping "@..." off the
// username itself if the account only carries that field.
function emailPrefix(user) {
  const source = user?.email || user?.username || '';
  return String(source).split('@')[0].trim();
}

function explicitRunRequest(text) {
  if (/\b(?:do not|don't|dont|never)\s+(?:run|execute|start)|\b(?:preview|dry[- ]?run|explain|list)\b/i.test(text)) return null;
  if (!/\b(?:run|execute|start|perform)\b/i.test(text)) return null;
  const caseMatch = text.match(/\bTC[- ]?0*(\d{1,3})\b/i);
  if (!caseMatch) return null;
  const stageMatch = text.match(/\bstage\s+([a-z][a-z0-9-]*)\b/i)
    || text.match(/\bat\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+stage\b/i);
  return {
    caseId: `TC-${caseMatch[1].padStart(3, '0')}`,
    stage: stageMatch?.[1]?.toLowerCase() || '',
  };
}

// A case with no frozen automation script (AI-created via startCaseCreation
// below, or a browsed file that was never registered in config/gui-runs.json
// or config/runs.json) still has a full Steps section — this hands it to the
// real AI Assistant
// (the same claude.exe the terminal chat already drives) to execute live via
// its SAP GUI / web MCP tools, instead of leaving the case read-only forever.
function buildInteractiveRunPrompt(lane, testCase) {
  const laneLabel = lane === 'gui' ? 'SAP GUI for Windows' : 'Fiori / WebGUI';
  const locate = testCase.filePath
    ? `Its full text is at ${testCase.filePath} — read it first if you have not already.`
    : `Look it up as ${testCase.caseId} and read its full text first if you have not already.`;
  const sessionNote = lane === 'gui'
    ? 'A fresh session was just opened and logged on for this run — attach to it with sap_connect_existing rather than opening another (rule 2). '
    : '';
  return [
    `Run test case ${testCase.caseId} interactively right now, driving ${laneLabel} live through the MCP tools. `
    + 'This case has no frozen automation script, so you are the runner for this pass.',
    locate,
    `${sessionNote}Confirm the SAP session matches the System named in the case header before touching anything (CLAUDE.md rule 1). Then work through Preconditions, and the Steps in order.`,
    'Discover every screen element id live as you go (sap_get_screen_elements for the GUI lane) — never guess one or reuse one from another case (rule 4).',
    'Before any step that saves, posts, or otherwise commits a database write, stop, tell me exactly what it will write, and wait for my explicit confirmation in this chat before performing it (rule 3) — never write on your own.',
    'Record what actually happens at every step, including any deviation from what the case expected. Never write down an expected value as observed if you could not read it (rules 5-6).',
    'When you are done or blocked, summarize the outcome.',
  ].join('\n\n');
}

// Case creation hands the whole job to the live AI Assistant instead of
// building a file from typed answers with no SAP involved (the old wizard):
// explore the transaction live, actually drive it through SAP end to end
// (including the Save authorized by the creation request), then write the case
// files, matching how the cases
// already in this project were authored, not a fill-in-the-blanks form.
// prep comes from sapTerminalService.prepareCaseCreation() and names exactly
// where the finished file(s) must land so they survive (see that function's
// comment for why: the project folder Claude Code's cwd sits in is a
// temporary extraction in the packaged app and is discarded after this run).
function buildCaseCreationPrompt(lane, connectionServerName, connectedSystemId, userRequest, prep, author) {
  const laneLabel = lane === 'gui' ? 'SAP GUI for Windows' : 'Fiori / WebGUI';
  const laneHeader = lane === 'gui' ? 'sap-gui (SAP GUI for Windows)' : 'web (Fiori / WebGUI / UI5)';
  const sessionNote = lane === 'gui'
    ? 'A fresh session was just opened and logged on for this run — attach to it with sap_connect_existing rather than opening another (rule 2). '
    : '';
  const existingList = prep.existingFiles?.length ? prep.existingFiles.join(', ') : 'none yet';
  const filenamePattern = lane === 'gui'
    ? '`TC-<nnn>-<TCODE-or-slug>-gui.md` (e.g. TC-024-FTR_CREATE-term-loan-quarterly-gui.md)'
    : '`TC-<nnn>-<TCODE-or-slug>.md` (e.g. TC-024-FTR-term-loan-quarterly.md) — no lane suffix in the web lane';
  const createdDate = new Date().toISOString().slice(0, 10);
  return [
    `Create one or more new ${LANES[lane].label} test cases against ${connectionServerName}, for this request: "${userRequest}"`,
    `This is an authoring task, not a chat answer: work out the transaction for real by driving ${laneLabel} live through the MCP tools first, and only write a case file for what you actually did and observed — never for what the request merely implies should happen.`,
    `${sessionNote}Confirm the SAP session matches ${connectedSystemId} before touching anything (CLAUDE.md rule 1).`,
    'Read `.claude/skills/new-test-case/SKILL.md`, `docs/test-authoring-guide.md` and `test-cases/_TEMPLATE.md` in this project before writing anything — every case file must follow that template and match the level of detail in '
      + (prep.exampleCaseFile ? `the existing case at ${prep.exampleCaseFile}` : 'the existing cases already in this project')
      + " (full Purpose, Preconditions, Steps, Assertions naming real fields and values, Known deviations) — not the template's placeholder text left unfilled.",
    "Explore the transaction/app live before writing anything: discover its screens and fields with sap_get_screen_elements (GUI lane) or this project's web-lane screen models — never guess or reuse an element id from another case (rule 4). Work out every meaningful combination of inputs the request implies (e.g. fixed vs variable interest, different periods, different product types) rather than settling for one happy path.",
    'Create ONE separate test case file per meaningful combination you actually run through SAP — do not combine several scenarios into a single file. '
      + `The next free case id is ${prep.nextCaseId}; use it for the first file, then increment by one for each additional case you create in this run (never reuse a number, and never reuse a filename already in the folder: ${existingList}). Name each file ${filenamePattern}.`,
    `Write every case file into this folder inside the project — it already exists, and is a scratch area for this run only: ${prep.caseDirectory}\n`
      + "Do not write case files anywhere else (not test-cases/GUI-TC or test-cases/Web-TC, which are this project's own reference copies). Do not edit config/runs.json, config/gui-runs.json, or config/suites.json, and do not run scripts/check-suite.ps1 — none of that applies to a case authored this way. Once this run finishes, the app moves whatever you wrote in the scratch folder into the user's permanent test case library and registers it there automatically, the same way it already lists any other \"External created TC\".",
    `Each case file's header must include: Case id, Lane (${laneHeader}), Transaction / app, Spec file: "— external documentation-only case (created live via the AI Assistant; no frozen script yet)", `
      + `System: ${connectedSystemId}, Type, Author: "Claude (requested by ${author || 'the user'})", Created: ${createdDate}, `
      + 'Status: draft (never active or frozen — this case has not yet had the two clean regression runs freezing requires), Source: "External created TC", and Writes to the database.',
    'My request to create this testcase includes authorization to Save the requested deal. Announce the Save, then perform it without asking me again or waiting for a popup. Verify the SAP system and entered values first. Handle SAP validation messages and verify the saved document number and success status before recording a successful Save. Do not settle or post unless my request includes those steps. If a Save outcome is uncertain, inspect SAP before any retry to avoid duplicate deals.',
    'Record what actually happens at every step, including any deviation from what you expected. Never write down an expected value as observed if you could not read it (rules 5-6). Every assertion in the case file must name a field and the expected value you actually observed — "works correctly" is not an assertion.',
    'Before ending your response, use Write to create the Markdown file in the specified scratch folder and read it back. If SAP blocks completion, still write a draft containing only the observed steps, the blocking message and the unverified assertions; clearly mark the save as failed or unverified. Never stop with only a chat summary. Then report the filenames and the verified SAP document number, or the exact blocker.',
  ].join('\n\n');
}

export default function SapTestingScreen({ module, onBack, onUninstalled }) {
  const { user } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [lane, setLane] = useState('gui');
  const [prompt, setPrompt] = useState('');
  const [runId, setRunId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [activeSource, setActiveSource] = useState('claude');
  const [messages, setMessages] = useState([]);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  // A live Save/F11 the AI Assistant is mid-way through inside SAP itself —
  // distinct from pendingConfirmation above, which gates *starting* a known,
  // registered case. This one surfaces the sap-gui MCP server's own
  // elicitation request (relayed by .claude/hooks/sap-save-confirmation.ps1,
  // via sapTerminalManager's run-status poll below) for a write the AI
  // Assistant is about to make right now, mid-conversation.
  const [pendingElicitation, setPendingElicitation] = useState(null);
  const [isAnsweringElicitation, setIsAnsweringElicitation] = useState(false);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [oauthToken, setOauthToken] = useState('');
  const [tokenEnding, setTokenEnding] = useState('');
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [sapSystems, setSapSystems] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [sapUsername, setSapUsername] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [connectionServerName, setConnectionServerName] = useState('');
  const [connectedSystemId, setConnectedSystemId] = useState('');
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [cases, setCases] = useState([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [viewingCase, setViewingCase] = useState(null);
  const [isLoadingCaseFile, setIsLoadingCaseFile] = useState(false);
  const [caseFileError, setCaseFileError] = useState('');
  const [archiveDirectory, setArchiveDirectory] = useState('');
  const [isChoosingArchiveDirectory, setIsChoosingArchiveDirectory] = useState(false);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const conversationRef = useRef(null);
  const promptInputRef = useRef(null);
  // Set while a case-creation run (see startCaseCreation) is in flight, so the
  // run-completion poll below knows to register whatever new case file(s)
  // that run wrote instead of treating it as an ordinary chat reply.
  const caseCreationRef = useRef(null);

  useEffect(() => {
    Promise.all([sapTerminalService.getProject(emailPrefix(user)), sapTerminalService.getAuthStatus()])
      .then(([project, auth]) => {
        setIsConfigured(Boolean(project.configured));
        setSapSystems(project.systems || []);
        setSelectedSystemId(project.defaultSystemId || project.systems?.[0]?.id || '');
        setArchiveDirectory(project.archiveDirectory || '');
        setIsAuthenticated(Boolean(auth.loggedIn));
        setTokenEnding(auth.tokenEnding || '');
        if (!project.configured) setError('The SAP automation package is missing. Reinstall the application.');
        else if (!auth.available) setError('The bundled AI Assistant runtime is missing. Reinstall the application.');
      })
      .catch((projectError) => setError(projectError.message))
      .finally(() => setIsCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount with the initial lane
  }, []);

  useEffect(() => {
    if (!runId || FINAL_STATUSES.has(status)) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const run = await sapTerminalService.getRun(runId);
        if (cancelled) return;
        setStatus(run.status);
        setActiveSource(run.source || 'claude');
        setPendingElicitation(run.pendingElicitation || null);
        if (FINAL_STATUSES.has(run.status) && run.sessionId) setSessionId(run.sessionId);
        if (run.status === 'completed') {
          setMessages((current) => [...current, { id: `${run.id}-assistant`, role: run.source === 'direct' ? 'runner' : 'assistant', text: run.response || 'Completed.' }]);
        } else if (run.status === 'failed') {
          setError(run.error || 'AI Assistant could not complete the request.');
          if (run.response) setMessages((current) => [...current, { id: `${run.id}-assistant`, role: 'assistant', text: run.response }]);
        }
        // A case-creation run (see startCaseCreation) writes its case file(s)
        // itself during the run. The main process stores those files before
        // publishing a final status, including partially completed runs.
        if (FINAL_STATUSES.has(run.status) && caseCreationRef.current) {
          const pending = caseCreationRef.current;
          try {
            const result = { created: run.createdCases || [] };
            if (result.created?.length) {
              caseCreationRef.current = null;
              await loadCasesForLane(pending.lane);
              setSelectedCase(result.created[result.created.length - 1]);
              pushRunnerMessage(result.created.length === 1
                ? `${result.created[0].caseId} was saved to ${result.created[0].filePath}. It now shows in the left panel tagged "External created TC" — open it and choose "Run interactively" to have the AI Assistant run it again live.`
                : `${result.created.length} test cases were saved: ${result.created.map((created) => created.caseId).join(', ')}. They now show in the left panel tagged "External created TC".`);
            } else if (run.status === 'completed') {
              pushRunnerMessage('No testcase file was created yet. Your next message will continue this testcase with the same local output folder.');
            }
          } catch (finalizeError) {
            pushRunnerMessage(`I could not save the new test case file(s): ${finalizeError.message}`);
          }
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError.message);
      }
    }, 500);
    return () => { cancelled = true; window.clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCasesForLane/pushRunnerMessage are plain functions recreated every render; this poll should only restart on runId/status
  }, [runId, status]);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    let cancelled = false;
    // The current GUI-TC and Web-TC folders contain NIIF cases only.
    if (connectedSystemId !== 'DS4_100_NIIF') {
      return undefined;
    }
    sapTerminalService.listCases(lane)
      .then((result) => { if (!cancelled) setCases(result.cases || []); })
      .catch((listError) => { if (!cancelled) setError(listError.message); })
      .finally(() => { if (!cancelled) setIsLoadingCases(false); });
    return () => { cancelled = true; };
  }, [connectedSystemId, lane]);

  useEffect(() => {
    if (connectionStatus !== 'checking') return undefined;
    const progressTimer = window.setInterval(() => {
      setConnectionProgress((current) => {
        if (current >= 92) return current;
        if (current < 60) return Math.min(current + 4, 92);
        if (current < 84) return Math.min(current + 2, 92);
        return current + 1;
      });
    }, 150);
    return () => window.clearInterval(progressTimer);
  }, [connectionStatus]);

  async function loadCasesForLane(nextLane = lane) {
    if (connectedSystemId !== 'DS4_100_NIIF') return;
    setIsLoadingCases(true);
    try {
      const result = await sapTerminalService.listCases(nextLane);
      setCases(result.cases || []);
    } catch (listError) {
      setError(listError.message);
    } finally {
      setIsLoadingCases(false);
    }
  }

  function webCredentials() {
    const username = sapUsername.trim();
    return username && sapPassword ? { username, password: sapPassword } : null;
  }

  async function sendPrompt(event) {
    event.preventDefault();
    if (!connectionServerName) return;
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    if (!isBusy && connectedSystemId === 'DS4_100_NIIF' && detectCreateCaseIntent(nextPrompt)) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: nextPrompt }]);
      setPrompt('');
      startCaseCreation(nextPrompt);
      return;
    }

    const directRequest = explicitRunRequest(nextPrompt);
    setIsStarting(true);
    setError('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: nextPrompt }]);
    setPrompt('');
    try {
      if (directRequest) {
        const proposal = await sapTerminalService.prepareCase(lane, directRequest.caseId, directRequest.stage, webCredentials());
        setPendingConfirmation(proposal);
        return;
      }
      const pending = caseCreationRef.current;
      const continuationPrompt = pending
        ? `${nextPrompt}\n\nContinue the unfinished testcase. Inspect the existing SAP session before acting; do not recreate a deal that was already saved. Write the Markdown testcase to ${pending.caseDirectory}, using ${pending.nextCaseId} if no file has been created yet. Include the observed Save outcome and document number, or the exact blocker.`
        : nextPrompt;
      const run = await sapTerminalService.start(continuationPrompt, sessionId, lane, pending ? { caseCreation: pending } : undefined);
      setActiveSource('claude');
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(runError.message);
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  async function stopRun() {
    setIsStopping(true);
    try { await sapTerminalService.stop(runId); } catch (stopError) { setError(stopError.message); } finally { setIsStopping(false); }
  }

  async function configureToken(event) {
    event.preventDefault();
    setIsSigningIn(true);
    setError('');
    try {
      const auth = await sapTerminalService.configureToken(oauthToken);
      setIsAuthenticated(Boolean(auth.loggedIn));
      setTokenEnding(auth.tokenEnding || '');
      setOauthToken('');
      if (auth.loggedIn) setIsTokenDialogOpen(false);
    } catch (signInError) {
      setError(signInError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function disconnectToken() {
    setIsSigningIn(true);
    setError('');
    try {
      await sapTerminalService.clearToken();
      setIsAuthenticated(false);
      setTokenEnding('');
      setOauthToken('');
      setIsTokenDialogOpen(false);
      newChat();
    } catch (disconnectError) {
      setError(disconnectError.message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function testConnection() {
    if (!selectedSystemId) return;
    setConnectionProgress(0);
    setConnectionStatus('checking');
    setConnectionServerName('');
    setConnectedSystemId('');
    setCases([]);
    setIsLoadingCases(false);
    setSelectedCase(null);
    closeCaseDialog();
    setError('');
    try {
      const result = await sapTerminalService.testConnection(selectedSystemId, {
        username: sapUsername.trim(),
        password: sapPassword,
      });
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus(result.connected ? 'connected' : 'disconnected');
      setConnectedSystemId(result.connected ? selectedSystemId : '');
      setIsLoadingCases(result.connected && selectedSystemId === 'DS4_100_NIIF');
      setConnectionServerName(result.connected ? result.serverName || sapSystems.find((system) => system.id === selectedSystemId)?.name || '' : '');
      if (!result.connected) setError(result.reason || 'Connection failed. Check the SAP username and password.');
    } catch {
      setConnectionProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setConnectionStatus('disconnected');
      setConnectionServerName('');
      setError('Connection failed. Check the SAP username and password.');
    }
  }

  function closeConnectionDialog() {
    if (connectionStatus !== 'checking') setConnectionStatus('idle');
  }

  async function openCase(testCase) {
    setSelectedCase(testCase);
    setViewingCase({
      caseId: testCase.caseId,
      summary: testCase.summary,
      fileName: '',
      content: '',
      source: testCase.source || 'built-in',
      externalLabel: testCase.externalLabel || '',
    });
    setCaseFileError('');
    setIsLoadingCaseFile(true);
    try {
      const file = await sapTerminalService.getCaseFile(lane, testCase.caseId);
      setViewingCase((current) => (current && current.caseId === testCase.caseId ? { ...current, ...file } : current));
    } catch (fileError) {
      setCaseFileError(fileError.message);
    } finally {
      setIsLoadingCaseFile(false);
    }
  }

  function closeCaseDialog() {
    setViewingCase(null);
    setCaseFileError('');
  }

  async function browseForCase() {
    setError('');
    try {
      const result = await sapTerminalService.browseCase();
      if (result.canceled) return;
      if (result.lane !== lane) selectLane(result.lane);
      const source = result.runnable ? 'built-in' : 'external';
      const externalLabel = result.runnable ? '' : 'No frozen script — runs interactively';
      setSelectedCase({ caseId: result.caseId, summary: result.summary, source, externalLabel });
      setViewingCase({
        caseId: result.caseId,
        summary: result.summary,
        fileName: result.fileName,
        content: result.content,
        source,
        externalLabel,
        runnableReason: result.reason,
        filePath: result.filePath,
      });
      setCaseFileError('');
      setIsLoadingCaseFile(false);
    } catch (browseError) {
      setError(browseError.message);
    }
  }

  function pushRunnerMessage(text) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'runner', text }]);
  }

  // Clicking "Create" no longer opens a question-by-question wizard — it just
  // seeds a starter message so the request goes out as one free-text prompt,
  // same as if the user had typed it unprompted. sendPrompt's
  // detectCreateCaseIntent still catches it and calls startCaseCreation below.
  function seedCaseCreationDraft() {
    if (isBusy) return;
    setError('');
    setPrompt((current) => (current.trim() ? current : `Create a test case for ${LANES[lane].label} covering `));
    promptInputRef.current?.focus();
  }

  // Hands the whole authoring job to the live AI Assistant: it explores and
  // drives the transaction including its authorized Save and writes the case file(s).
  // This app's only remaining job is telling it exactly where those files
  // must land. The main process registers them when the run finishes.
  async function startCaseCreation(userRequest) {
    setIsCreatingCase(true);
    setError('');
    try {
      const prep = await sapTerminalService.prepareCaseCreation(lane, connectedSystemId);
      const author = user?.email || user?.username || '';
      caseCreationRef.current = { lane, systemId: connectedSystemId, existingFiles: prep.existingFiles || [], author, caseDirectory: prep.caseDirectory, nextCaseId: prep.nextCaseId };

      // Match how every frozen-script GUI-lane run already starts (session.py's
      // GuiSession.login(), CLAUDE.md rule 2/9): open a brand-new logged-on
      // session first, same as runCaseInteractively does before running an
      // existing case. Best-effort — if it fails, the AI Assistant still tries
      // to attach to whatever session is already open.
      if (lane === 'gui' && sapUsername.trim() && sapPassword) {
        pushRunnerMessage(`Opening a new SAP GUI session on ${connectionServerName}…`);
        try {
          const opened = await sapTerminalService.openGuiSession(connectedSystemId, { username: sapUsername.trim(), password: sapPassword });
          pushRunnerMessage(opened.opened
            ? `Session opened and logged on as ${opened.user || sapUsername.trim()}. Handing off to the AI Assistant…`
            : `Couldn't open a new session automatically (${opened.reason || 'unknown reason'}) — the AI Assistant will try to attach to whatever session is already open instead.`);
        } catch (sessionError) {
          pushRunnerMessage(`Couldn't open a new session automatically (${sessionError.message}) — the AI Assistant will try to attach to whatever session is already open instead.`);
        }
      }

      const casePrompt = buildCaseCreationPrompt(lane, connectionServerName, connectedSystemId, userRequest, prep, author);
      const run = await sapTerminalService.start(casePrompt, '', lane, { caseCreation: caseCreationRef.current });
      setActiveSource('claude');
      setRunId(run.id);
      setStatus(run.status);
    } catch (creationError) {
      caseCreationRef.current = null;
      setError(creationError.message);
      setStatus('failed');
    } finally {
      setIsCreatingCase(false);
    }
  }

  async function runViewedCase() {
    if (!viewingCase) return;
    if (viewingCase.source === 'external') {
      setError(viewingCase.runnableReason || 'This test case has no frozen automation script — use "Run interactively" instead.');
      return;
    }
    const caseId = viewingCase.caseId;
    closeCaseDialog();
    setIsStarting(true);
    setError('');
    try {
      const proposal = await sapTerminalService.prepareCase(lane, caseId, '', webCredentials());
      setPendingConfirmation(proposal);
    } catch (runError) {
      setError(runError.message);
    } finally {
      setIsStarting(false);
    }
  }

  async function runCaseInteractively() {
    if (!viewingCase) return;
    if (!isAuthenticated) {
      setError('Connect a Claude OAuth token before asking the AI Assistant to run a case interactively.');
      return;
    }
    const testCase = viewingCase;
    closeCaseDialog();
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: `Run ${testCase.caseId} interactively.` }]);
    setIsStarting(true);
    setError('');
    try {
      // Match how every frozen-script GUI-lane run already starts (session.py's
      // GuiSession.login(), CLAUDE.md rule 2/9): open a brand-new logged-on
      // session first, alongside whatever else is open, rather than asking the
      // AI Assistant to guess whether one already exists. Best-effort — if the
      // sidebar has no SAP credentials typed in, or the open fails, the AI
      // Assistant still tries to attach to whatever session is already open.
      if (lane === 'gui' && sapUsername.trim() && sapPassword) {
        pushRunnerMessage(`Opening a new SAP GUI session on ${connectionServerName}…`);
        try {
          const opened = await sapTerminalService.openGuiSession(connectedSystemId, { username: sapUsername.trim(), password: sapPassword });
          pushRunnerMessage(opened.opened
            ? `Session opened and logged on as ${opened.user || sapUsername.trim()}. Handing off to the AI Assistant…`
            : `Couldn't open a new session automatically (${opened.reason || 'unknown reason'}) — the AI Assistant will try to attach to whatever session is already open instead.`);
        } catch (sessionError) {
          pushRunnerMessage(`Couldn't open a new session automatically (${sessionError.message}) — the AI Assistant will try to attach to whatever session is already open instead.`);
        }
      }
      const run = await sapTerminalService.start(buildInteractiveRunPrompt(lane, testCase), sessionId, lane);
      setActiveSource('claude');
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(runError.message);
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  async function chooseArchiveDirectory() {
    setIsChoosingArchiveDirectory(true);
    setError('');
    try {
      const result = await sapTerminalService.chooseArchiveDirectory();
      setArchiveDirectory(result.archiveDirectory || '');
    } catch (chooseError) {
      setError(chooseError.message);
    } finally {
      setIsChoosingArchiveDirectory(false);
    }
  }

  async function confirmRun() {
    if (!pendingConfirmation) return;
    setIsStarting(true);
    setError('');
    try {
      const run = await sapTerminalService.startConfirmedCase(pendingConfirmation.confirmationId);
      setMessages((current) => [...current, {
        id: `${run.id}-approved`,
        role: 'runner',
        text: `${pendingConfirmation.caseId} was approved by the user and started against ${pendingConfirmation.systemLabel}.`,
      }]);
      setPendingConfirmation(null);
      setActiveSource('direct');
      setRunId(run.id);
      setStatus(run.status);
    } catch (runError) {
      setError(runError.message);
      setStatus('failed');
    } finally {
      setIsStarting(false);
    }
  }

  function cancelRun() {
    if (!pendingConfirmation) return;
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: 'runner',
      text: `${pendingConfirmation.caseId} was cancelled. No SAP write was authorized.`,
    }]);
    setPendingConfirmation(null);
  }

  // Answers the live sap-gui MCP elicitation sap-save-confirmation.ps1 is
  // blocked on (see pendingElicitation above). accept=false reaches the
  // AI Assistant as a normal declined elicitation — same as it always has
  // been for a genuinely interactive MCP client — so it can tell the user
  // what it skipped and carry on, rather than the run simply failing.
  async function answerElicitation(accept) {
    if (!pendingElicitation) return;
    setIsAnsweringElicitation(true);
    try {
      await sapTerminalService.answerElicitation(runId, accept);
      setPendingElicitation(null);
    } catch (answerError) {
      setError(answerError.message);
    } finally {
      setIsAnsweringElicitation(false);
    }
  }

  function newChat() {
    setSessionId('');
    setRunId('');
    setStatus('idle');
    setActiveSource('claude');
    setMessages([]);
    setPendingConfirmation(null);
    setPendingElicitation(null);
    caseCreationRef.current = null;
    setError('');
    setPrompt('');
  }

  function selectLane(nextLane) {
    if (nextLane === lane) return;
    setCases([]);
    setIsLoadingCases(connectedSystemId === 'DS4_100_NIIF');
    setLane(nextLane);
    newChat();
    setSelectedCase(null);
    closeCaseDialog();
  }

  async function uninstall() {
    setIsUninstalling(true);
    try {
      await packageService.uninstall(module.id);
      onUninstalled();
    } catch (uninstallError) {
      setError(uninstallError.message);
      setIsUninstalling(false);
    }
  }

  const isActive = status === 'running' || status === 'stopping';
  const isTestingConnection = connectionStatus === 'checking';
  const isBusy = isActive || isTestingConnection || isCreatingCase;
  const visibleSelectedCase = connectionServerName ? selectedCase : null;

  return (
    <ScreenContainer className="module-screen sap-testing-screen">
      <header className="module-screen__header">
        <button className="back-button" onClick={onBack} type="button"><Icon name="arrowLeft" /><span>Back to workspace</span></button>
        <strong>SAP Testing with AI Assistant</strong>
      </header>

      <main className="sap-chat-layout">
        <aside aria-label="SAP testing controls" className="sap-chat-sidebar">
          <div className="sap-sidebar-content">
            <div className="sap-testing-heading">
              <div className="module-placeholder__icon"><Icon name="building" size={38} /></div>
              <div>
                <p className="eyebrow">SAP TESTING</p>
                <p>{connectionServerName
                  ? 'Choose a testing mode, then select a test case.'
                  : 'Enter your SAP credentials to connect and begin testing.'}</p>
              </div>
            </div>

            <div className="sap-connection-section">
              <span className="sap-sidebar-label">SAP system</span>
              <select
                aria-label="SAP system to test"
                disabled={isBusy || sapSystems.length === 0}
                onChange={(event) => {
                  setSelectedSystemId(event.target.value);
                  setConnectionStatus('idle');
                  setConnectionServerName('');
                  setConnectedSystemId('');
                  setCases([]);
                  setIsLoadingCases(false);
                  setSelectedCase(null);
                  closeCaseDialog();
                }}
                value={selectedSystemId}
              >
                {sapSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
              </select>
              <span className="sap-sidebar-label">SAP credentials</span>
              <div className="sap-credential-fields">
                <label className="sap-credential-field">
                  <span>Username</span>
                  <input
                    autoComplete="off"
                    disabled={isBusy}
                    onChange={(event) => setSapUsername(event.target.value)}
                    placeholder="SAP username"
                    spellCheck="false"
                    type="text"
                    value={sapUsername}
                  />
                </label>
                <label className="sap-credential-field">
                  <span>Password</span>
                  <input
                    autoComplete="off"
                    disabled={isBusy}
                    onChange={(event) => setSapPassword(event.target.value)}
                    placeholder="SAP password"
                    type="password"
                    value={sapPassword}
                  />
                </label>
              </div>
              <AppButton
                disabled={!isConfigured || isActive || !selectedSystemId || !sapUsername.trim() || !sapPassword.trim()}
                loading={isTestingConnection}
                onClick={testConnection}
                title={isTestingConnection ? 'Testing connection...' : 'Test Connection'}
                variant="secondary"
              />
              {connectionStatus === 'disconnected' ? (
                <p className="sap-connection-result sap-connection-result--disconnected" role="status">Connection failed</p>
              ) : null}
            </div>

            {connectionServerName ? (
              <>
                <div className="sap-archive-section">
                  <span className="sap-sidebar-label">Evidence zip folder</span>
                  <p title={archiveDirectory}>{archiveDirectory || 'Downloads\\FSNXT SAP Test Archives'}</p>
                  <AppButton
                    disabled={isBusy}
                    loading={isChoosingArchiveDirectory}
                    onClick={chooseArchiveDirectory}
                    title="Change folder"
                    variant="secondary"
                  />
                </div>

                <div className="sap-lane-section">
                  <div className="sap-section-label">
                    <span className="sap-sidebar-label">Testing mode</span>
                    <Icon name="info" size={14} />
                  </div>
                  <div className="sap-lane-switch" role="group" aria-label="Testing mode">
                    {Object.entries(LANES).map(([laneId, details]) => (
                      <button aria-pressed={lane === laneId} className={lane === laneId ? 'is-active' : ''} disabled={isBusy} key={laneId} onClick={() => selectLane(laneId)} type="button">
                        <Icon className="sap-lane-switch__icon" name={laneId === 'gui' ? 'window' : 'globe'} size={20} />
                        <span className="sap-lane-switch__copy">
                          <strong>{details.label}</strong>
                          <span>{details.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {connectedSystemId === 'DS4_100_NIIF' ? <div className="sap-case-section">
                  <div className="sap-case-section__header">
                    <span className="sap-sidebar-label">{LANES[lane].label} test cases</span>
                    <div className="sap-case-section__tools">
                      <span className="sap-case-count">{cases.length} test {cases.length === 1 ? 'case' : 'cases'}</span>
                      <AppButton
                        disabled={isBusy}
                        icon="folder"
                        onClick={browseForCase}
                        title="Browse"
                        variant="secondary"
                      />
                      <AppButton
                        disabled={isBusy}
                        icon="testCase"
                        onClick={seedCaseCreationDraft}
                        title="Create"
                        variant="secondary"
                      />
                    </div>
                  </div>
                  <div className="sap-case-list">
                    {isLoadingCases ? (
                      <p>Loading test cases…</p>
                    ) : cases.length === 0 ? (
                      <p>No test cases found for this lane.</p>
                    ) : cases.map((testCase) => (
                      <button
                        aria-pressed={selectedCase?.caseId === testCase.caseId}
                        className={selectedCase?.caseId === testCase.caseId ? 'is-active' : ''}
                        disabled={isBusy}
                        key={testCase.caseId}
                        onClick={() => openCase(testCase)}
                        type="button"
                      >
                        <span className="sap-case-list__number">{testCase.caseId.replace('TC-', '')}</span>
                        <span>
                          <strong>{testCase.caseId}</strong>
                          {testCase.source === 'external' ? <em>External created TC</em> : null}
                          <span>{testCase.summary}</span>
                        </span>
                        <Icon className="sap-case-list__chevron" name="chevronRight" size={17} />
                      </button>
                    ))}
                  </div>
                </div> : null}
              </>
            ) : null}
          </div>

          <div className="sap-sidebar-actions">
            <AppButton disabled={isBusy || messages.length === 0} onClick={newChat} title="New chat" variant="secondary" />
            <AppButton className="package-uninstall-button" disabled={isBusy} icon="trash" loading={isUninstalling} onClick={uninstall} title="Uninstall" variant="secondary" />
          </div>
        </aside>

        <section className="sap-chat-panel">
          <div className="run-status-row sap-chat-header">
            <div><p className="eyebrow">AI ASSISTANT TERMINAL</p><h2>SAP automation assistant</h2></div>
            <div className="sap-chat-header-actions">
              {connectionServerName ? (
                <span className="sap-server-chip">
                  <span aria-hidden="true" className="sap-server-chip__dot" />
                  <span>Connected</span>
                  <strong>· {connectionServerName}</strong>
                </span>
              ) : null}
              {!isCheckingAuth ? (
                <AppButton
                  disabled={isBusy}
                  onClick={() => setIsTokenDialogOpen(true)}
                  title={isAuthenticated ? `OAuth token ••••${tokenEnding}` : 'Connect OAuth token'}
                  variant="secondary"
                />
              ) : null}
              {!connectionServerName ? (
                <span className={`run-status run-status--${status}`}>
                  {isAuthenticated ? statusLabel(status, activeSource) : 'OAuth token required'}
                </span>
              ) : null}
            </div>
          </div>
          {visibleSelectedCase ? (
            <section className="sap-selected-case" aria-label="Selected test case context">
              <div className="sap-selected-case__icon"><Icon name="testCase" size={24} /></div>
              <div className="sap-selected-case__copy">
                <div>
                  <strong>{visibleSelectedCase.caseId}</strong>
                  <span>{LANES[lane].label}</span>
                  {visibleSelectedCase.source === 'external' ? <span className="sap-selected-case__external">External created TC</span> : null}
                </div>
                <p>{visibleSelectedCase.summary}</p>
              </div>
            </section>
          ) : null}
          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
          <div className="sap-conversation" ref={conversationRef}>
            {messages.length === 0 ? (
              <div className="sap-chat-welcome">
                <Icon name="toolbox" size={36} />
                <h3>
                  {isAuthenticated
                    ? visibleSelectedCase ? `How can I help with ${visibleSelectedCase.caseId}?` : 'What would you like to test?'
                    : 'Connect a Claude OAuth token to begin'}
                </h3>
                <p>
                  {visibleSelectedCase
                    ? 'Ask about this test case, its steps, prerequisites, or a previous result.'
                    : `${LANES[lane].description} is selected.`}
                </p>
              </div>
            ) : messages.map((message) => (
              <article className={`sap-message sap-message--${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'You' : message.role === 'runner' ? 'Test runner' : 'AI Assistant'}</span><div>{message.text}</div>
              </article>
            ))}
            {isActive ? <div className="sap-thinking"><span /><span /><span /> AI Assistant is working in the SAP project…</div> : null}
          </div>
          <form className="sap-prompt-form" onSubmit={sendPrompt}>
            <textarea disabled={!isConfigured || !isAuthenticated || isBusy} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
            }} placeholder={visibleSelectedCase ? `Ask the AI Assistant anything about ${visibleSelectedCase.caseId}…` : 'Ask the AI Assistant about an SAP test…'} ref={promptInputRef} value={prompt} />
            <div>
              <span>Enter to send · Shift+Enter for a new line</span>
              {isActive ? <AppButton loading={isStopping} onClick={stopRun} title="Stop" variant="secondary" /> : (
                <div
                  aria-label={!connectionServerName ? 'Connect to SAP to begin testing' : undefined}
                  className={`sap-send-action${!connectionServerName ? ' sap-send-action--connection-required' : ''}`}
                  data-tooltip={!connectionServerName ? 'Connect to SAP to begin testing' : undefined}
                  tabIndex={!connectionServerName ? 0 : undefined}
                >
                  <AppButton disabled={!isConfigured || !isAuthenticated || !connectionServerName || !prompt.trim() || isBusy} loading={isStarting || isCreatingCase} title="Send" type="submit" />
                </div>
              )}
            </div>
          </form>
        </section>
      </main>
      {isTokenDialogOpen ? (
        <div className="sap-token-backdrop" role="presentation">
          <section aria-labelledby="sap-token-dialog-title" aria-modal="true" className="sap-token-dialog" role="dialog">
            <p className="eyebrow">CLAUDE AUTHENTICATION</p>
            <h2 id="sap-token-dialog-title">{isAuthenticated ? 'Manage OAuth token' : 'Connect OAuth token'}</h2>
            <p className="sap-token-dialog__description">
              The token is encrypted using Windows secure storage and is supplied only to this app's Claude processes.
            </p>
            <form onSubmit={configureToken}>
              <label htmlFor="claude-oauth-token">OAuth token</label>
              <input
                autoComplete="off"
                autoFocus
                id="claude-oauth-token"
                onChange={(event) => setOauthToken(event.target.value)}
                placeholder={isAuthenticated ? `Current token ends in ${tokenEnding}` : 'Paste your Claude OAuth token'}
                spellCheck="false"
                type="password"
                value={oauthToken}
              />
              <span>Generate a long-lived token with the Claude Code setup-token command.</span>
              <div className="sap-token-dialog__actions">
                {isAuthenticated ? <AppButton disabled={isSigningIn} onClick={disconnectToken} title="Disconnect" variant="secondary" /> : null}
                <AppButton disabled={isSigningIn} onClick={() => { setOauthToken(''); setIsTokenDialogOpen(false); }} title="Cancel" variant="secondary" />
                <AppButton disabled={!oauthToken.trim()} loading={isSigningIn} title={isAuthenticated ? 'Replace token' : 'Connect'} type="submit" />
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {connectionStatus !== 'idle' ? (
        <div className="sap-connection-backdrop" role="presentation">
          <section
            aria-describedby="sap-connection-dialog-description"
            aria-labelledby="sap-connection-dialog-title"
            aria-live="polite"
            aria-modal="true"
            className={`sap-connection-dialog sap-connection-dialog--${connectionStatus}`}
            role="dialog"
          >
            {isTestingConnection ? (
              <div aria-label="SAP connection test progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow={connectionProgress} className="sap-connection-progress" role="progressbar">
                <div aria-hidden="true" className="sap-connection-progress__track">
                  <span style={{ width: `${connectionProgress}%` }} />
                </div>
                <strong aria-hidden="true">{connectionProgress}%</strong>
              </div>
            ) : (
              <div className="sap-connection-dialog__visual" aria-hidden="true">
                {connectionStatus === 'connected' ? <Icon name="check" size={46} /> : null}
                {connectionStatus === 'disconnected' ? <Icon name="warning" size={46} /> : null}
              </div>
            )}
            <p className="eyebrow">SAP CONNECTION</p>
            <h2 id="sap-connection-dialog-title">
              {isTestingConnection ? 'Testing Connection to SAP' : null}
              {connectionStatus === 'connected' ? 'Connection Successful' : null}
              {connectionStatus === 'disconnected' ? 'Connection Failed to SAP' : null}
            </h2>
            <p id="sap-connection-dialog-description">
              {isTestingConnection ? 'Please wait while we verify your SAP system connection.' : null}
              {connectionStatus === 'connected' ? 'SAP is connected and ready to perform tests.' : null}
              {connectionStatus === 'disconnected' ? 'Connect to SAP to perform tests, then try the connection again.' : null}
            </p>
            {!isTestingConnection ? (
              <div className="sap-connection-dialog__actions">
                <AppButton onClick={closeConnectionDialog} title="Close" variant="secondary" />
                {connectionStatus === 'disconnected' ? <AppButton onClick={testConnection} title="Test Again" /> : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {viewingCase ? (
        <div className="sap-case-backdrop" onClick={closeCaseDialog} role="presentation">
          <section
            aria-labelledby="sap-case-dialog-title"
            aria-modal="true"
            className="sap-case-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="sap-case-dialog__header">
              <div>
                <p className="eyebrow">{LANES[lane].label.toUpperCase()} TEST CASE</p>
                <h2 id="sap-case-dialog-title">{viewingCase.caseId}{viewingCase.summary ? ` — ${viewingCase.summary}` : ''}</h2>
              </div>
              <button aria-label="Close" className="sap-case-dialog__close" onClick={closeCaseDialog} type="button">×</button>
            </header>
                {viewingCase.source === 'external' ? <span className="sap-external-case-tag">{viewingCase.externalLabel || 'External created TC'}</span> : null}
            <div className="sap-case-dialog__body">
              {isLoadingCaseFile ? (
                <p className="sap-case-dialog__status">Loading test case…</p>
              ) : caseFileError ? (
                <p className="sap-case-dialog__status sap-case-dialog__status--error">{caseFileError}</p>
              ) : (
                <pre>{viewingCase.content}</pre>
              )}
            </div>
            <div className="sap-case-dialog__actions">
              <AppButton onClick={closeCaseDialog} title="Close" variant="secondary" />
              {viewingCase.source === 'external' ? (
                <AppButton
                  disabled={!connectionServerName || !isAuthenticated || isBusy || isStarting || isLoadingCaseFile || Boolean(caseFileError)}
                  loading={isStarting}
                  onClick={runCaseInteractively}
                  title="Run interactively"
                />
              ) : (
                <AppButton
                  disabled={!connectionServerName || isBusy || isStarting || isLoadingCaseFile || Boolean(caseFileError)}
                  loading={isStarting}
                  onClick={runViewedCase}
                  title="Run test case"
                />
              )}
            </div>
          </section>
        </div>
      ) : null}
      {pendingConfirmation ? (
        <div className="sap-confirmation-backdrop" role="presentation">
          <section aria-labelledby="sap-confirmation-title" aria-modal="true" className="sap-confirmation-dialog" role="dialog">
            <p className="eyebrow">HUMAN APPROVAL REQUIRED</p>
            <h2 id="sap-confirmation-title">Confirm SAP database writes</h2>
            <dl>
              <div>
                <dt>Test case</dt>
                <dd><strong>{pendingConfirmation.caseId}</strong> — {pendingConfirmation.summary}</dd>
              </div>
              <div>
                <dt>SAP system</dt>
                <dd>{pendingConfirmation.systemLabel}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{pendingConfirmation.stage}</dd>
              </div>
              <div>
                <dt>Database writes</dt>
                <dd>{pendingConfirmation.writes}</dd>
              </div>
              {pendingConfirmation.lane === 'web' ? (
                <div>
                  <dt>Fiori logon</dt>
                  <dd>{pendingConfirmation.usesCustomCredentials ? 'Using the username entered in the sidebar' : 'Using the default configured account'}</dd>
                </div>
              ) : null}
            </dl>
            <p className="sap-confirmation-warning">Confirm only if you intend to make these changes in the displayed SAP system. Cancel performs no write.</p>
            <div className="sap-confirmation-actions">
              <AppButton disabled={isStarting} onClick={cancelRun} title="Cancel" variant="secondary" />
              <AppButton loading={isStarting} onClick={confirmRun} title="Confirm & Run" />
            </div>
          </section>
        </div>
      ) : null}
      {pendingElicitation ? (
        <div className="sap-confirmation-backdrop" role="presentation">
          <section aria-labelledby="sap-elicitation-title" aria-modal="true" className="sap-confirmation-dialog" role="dialog">
            <p className="eyebrow">HUMAN APPROVAL REQUIRED</p>
            <h2 id="sap-elicitation-title">Confirm SAP Save</h2>
            <dl>
              <div>
                <dt>Requested by</dt>
                <dd>The AI Assistant, mid-conversation, via {pendingElicitation.toolName || 'SAP GUI'}</dd>
              </div>
              <div>
                <dt>It says</dt>
                <dd>{pendingElicitation.message}</dd>
              </div>
            </dl>
            <p className="sap-confirmation-warning">Confirm only if you intend to make this change in the displayed SAP system. Cancel performs no write and lets the AI Assistant continue without saving.</p>
            <div className="sap-confirmation-actions">
              <AppButton disabled={isAnsweringElicitation} onClick={() => answerElicitation(false)} title="Cancel" variant="secondary" />
              <AppButton loading={isAnsweringElicitation} onClick={() => answerElicitation(true)} title="Confirm & Save" />
            </div>
          </section>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
