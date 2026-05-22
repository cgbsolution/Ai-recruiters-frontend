"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Play,
  Beaker,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Code2,
  AlertTriangle,
  Trash2,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, apiPost, ApiError, API_BASE } from "@/lib/api";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const LANGUAGES = [
  { id: "python", label: "Python", monacoId: "python" },
  { id: "python2", label: "Python 2", monacoId: "python" },
  { id: "javascript", label: "JavaScript", monacoId: "javascript" },
  { id: "typescript", label: "TypeScript", monacoId: "typescript" },
  { id: "java", label: "Java", monacoId: "java" },
  { id: "kotlin", label: "Kotlin", monacoId: "kotlin" },
  { id: "scala", label: "Scala", monacoId: "scala" },
  { id: "cpp", label: "C++", monacoId: "cpp" },
  { id: "c", label: "C", monacoId: "c" },
  { id: "csharp", label: "C#", monacoId: "csharp" },
  { id: "go", label: "Go", monacoId: "go" },
  { id: "rust", label: "Rust", monacoId: "rust" },
  { id: "ruby", label: "Ruby", monacoId: "ruby" },
  { id: "php", label: "PHP", monacoId: "php" },
  { id: "swift", label: "Swift", monacoId: "swift" },
  { id: "perl", label: "Perl", monacoId: "perl" },
  { id: "lua", label: "Lua", monacoId: "lua" },
  { id: "bash", label: "Bash", monacoId: "shell" },
  { id: "r", label: "R", monacoId: "r" },
  { id: "sqlite3", label: "SQLite", monacoId: "sql" },
];

interface TestCase {
  input: string;
  expected_output: string;
  description: string;
}

interface TestResult {
  test_index: number;
  description: string;
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
  stderr: string;
  error: string | null;
}

interface RunResult {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
  output?: {
    stdout: string;
    stderr: string;
    exit_code: number;
    error: string | null;
  };
}

const DEFAULT_TEST_CASES: TestCase[] = [
  { input: "5\n3", expected_output: "8", description: "Simple addition" },
];

export default function CodeSandboxTester() {
  const { hasRole, isLoading: authLoading } = useAuth();

  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>(DEFAULT_TEST_CASES);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [runOutput, setRunOutput] = useState<RunResult["output"] | null>(null);
  const [testResults, setTestResults] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = hasRole("super_admin");

  const loadStarter = useCallback(async (lang: string) => {
    try {
      const data = await api<{ language: string; code: string }>(
        `/interview/code/starter/${lang}`,
        { skipAuth: true },
      );
      setCode(data.code || "");
    } catch {
      setCode("");
    }
  }, []);

  useEffect(() => {
    loadStarter(language);
  }, [language, loadStarter]);

  // Close the language dropdown when the user clicks outside of it
  useEffect(() => {
    if (!showLangDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowLangDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLangDropdown]);

  const handleRun = async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    setError(null);
    setRunOutput(null);
    setTestResults(null);
    try {
      const data = await apiPost<RunResult>("/interview/code/test-run", {
        language,
        code,
        stdin,
      });
      setRunOutput(
        data.output ?? {
          stdout: "",
          stderr: "",
          exit_code: 0,
          error: "Sandbox returned no output payload",
        },
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : (e as Error).message;
      setError(msg || "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const handleRunTests = async () => {
    if (!code.trim() || testing) return;
    if (testCases.length === 0) {
      setError("Add at least one test case to run tests");
      return;
    }
    setTesting(true);
    setError(null);
    setRunOutput(null);
    setTestResults(null);
    try {
      const data = await apiPost<RunResult>("/interview/code/test-run", {
        language,
        code,
        test_cases: testCases,
      });
      setTestResults(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : (e as Error).message;
      setError(msg || "Request failed");
    } finally {
      setTesting(false);
    }
  };

  const updateTestCase = (i: number, patch: Partial<TestCase>) => {
    setTestCases((prev) => prev.map((tc, idx) => (idx === i ? { ...tc, ...patch } : tc)));
  };

  const addTestCase = () => {
    setTestCases((prev) => [
      ...prev,
      { input: "", expected_output: "", description: `Test ${prev.length + 1}` },
    ]);
  };

  const removeTestCase = (i: number) => {
    setTestCases((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-10 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-amber-900">Super-admin only</h2>
        <p className="text-sm text-amber-800 mt-1">
          The standalone code sandbox tester is restricted to super-admins. If you need
          access, ask your administrator.
        </p>
      </div>
    );
  }

  const monacoLang = LANGUAGES.find((l) => l.id === language)?.monacoId ?? "plaintext";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-500" />
            Code Sandbox Tester
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Runs through the same Piston/Judge0 pipeline used during interviews — useful
            for diagnosing why the in-interview code editor is failing. Backend:{" "}
            <code className="text-[11px]">{API_BASE}/interview/code/test-run</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLangDropdown((v) => !v)}
              className="gap-1.5 text-xs"
            >
              {LANGUAGES.find((l) => l.id === language)?.label}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showLangDropdown && (
              <div className="absolute right-0 top-9 z-30 max-h-[60vh] min-w-[180px] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => {
                      setLanguage(lang.id);
                      setShowLangDropdown(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      language === lang.id
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadStarter(language)}
            className="gap-1.5 text-xs"
            title="Reload starter template"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRun}
            disabled={running || testing || !code.trim()}
            className="gap-1.5 text-xs"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Run
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleRunTests}
            disabled={running || testing || !code.trim()}
            className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-500"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Beaker className="w-3 h-3" />}
            Run test cases
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Editor */}
        <div className="lg:col-span-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="bg-[#1e1e1e] px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-700">
            editor — {language}
          </div>
          <div className="h-[520px] bg-[#1e1e1e]">
            <Editor
              language={monacoLang}
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                tabSize: 2,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>

        {/* Side panel: stdin + test cases */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 dark:border-gray-700">
              Stdin (for "Run")
            </div>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Optional stdin fed to the program when you press Run."
              className="w-full h-24 p-2.5 text-xs font-mono bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none resize-none"
            />
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Test cases ({testCases.length})
              </span>
              <Button variant="ghost" size="sm" onClick={addTestCase} className="h-6 gap-1 text-xs">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-3 space-y-3">
              {testCases.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No test cases.</p>
              ) : (
                testCases.map((tc, i) => (
                  <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={tc.description}
                        onChange={(e) => updateTestCase(i, { description: e.target.value })}
                        placeholder="Description"
                        className="flex-1 text-xs bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none font-medium"
                      />
                      <button
                        onClick={() => removeTestCase(i)}
                        className="text-red-500 hover:text-red-700"
                        title="Remove test case"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wide">Input (stdin)</label>
                      <textarea
                        value={tc.input}
                        onChange={(e) => updateTestCase(i, { input: e.target.value })}
                        className="w-full mt-0.5 p-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 focus:outline-none resize-y"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wide">Expected output</label>
                      <textarea
                        value={tc.expected_output}
                        onChange={(e) => updateTestCase(i, { expected_output: e.target.value })}
                        className="w-full mt-0.5 p-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 focus:outline-none resize-y"
                        rows={2}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Output panel */}
      {(runOutput || testResults) && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 dark:border-gray-700">
            {runOutput ? "Console output" : "Test results"}
          </div>

          {runOutput && (
            <div className="p-3 space-y-2">
              {runOutput.error && (
                <div className="rounded-md p-2.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs">
                  <p className="font-semibold mb-1">Sandbox error</p>
                  <p className="leading-relaxed break-words">{runOutput.error}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>stdout</span>
                <span className={runOutput.exit_code === 0 ? "text-green-600" : "text-red-600"}>
                  exit {runOutput.exit_code}
                </span>
              </div>
              <pre className="rounded-md p-3 bg-black/90 text-xs text-gray-100 font-mono whitespace-pre-wrap break-words min-h-[80px] max-h-[300px] overflow-auto">
                {runOutput.stdout || (runOutput.stderr ? "" : "(no output)")}
              </pre>
              {runOutput.stderr && (
                <>
                  <div className="text-[11px] text-red-500">stderr</div>
                  <pre className="rounded-md p-3 bg-red-950/90 text-xs text-red-200 font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
                    {runOutput.stderr}
                  </pre>
                </>
              )}
            </div>
          )}

          {testResults && (
            <div className="p-3 space-y-3">
              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  testResults.passed === testResults.total
                    ? "bg-green-50 text-green-700 border border-green-300"
                    : "bg-red-50 text-red-700 border border-red-300"
                }`}
              >
                {testResults.passed} / {testResults.total} tests passed
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {testResults.results.map((r) => (
                  <div
                    key={r.test_index}
                    className={`rounded-md border p-2.5 text-xs ${
                      r.passed
                        ? "border-green-300 bg-green-50/50"
                        : "border-red-300 bg-red-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-gray-800">
                        #{r.test_index + 1} — {r.description}
                      </span>
                      {r.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                      <div>
                        <div className="text-gray-500">Input</div>
                        <pre className="mt-0.5 p-1.5 bg-white rounded border border-gray-200 max-h-24 overflow-auto whitespace-pre-wrap break-words">
                          {r.input || "(empty)"}
                        </pre>
                      </div>
                      <div>
                        <div className="text-gray-500">Expected</div>
                        <pre className="mt-0.5 p-1.5 bg-white rounded border border-gray-200 max-h-24 overflow-auto whitespace-pre-wrap break-words">
                          {r.expected_output}
                        </pre>
                      </div>
                      <div>
                        <div className="text-gray-500">Actual</div>
                        <pre className="mt-0.5 p-1.5 bg-white rounded border border-gray-200 max-h-24 overflow-auto whitespace-pre-wrap break-words">
                          {r.actual_output || "(empty)"}
                        </pre>
                      </div>
                    </div>
                    {(r.stderr || r.error) && (
                      <div className="mt-1.5 text-[11px] text-red-700 font-mono whitespace-pre-wrap break-words">
                        {r.error ? `error: ${r.error}` : null}
                        {r.stderr ? `\n${r.stderr}` : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
