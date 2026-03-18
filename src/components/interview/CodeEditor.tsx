"use client";

import React, { useState, useRef, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import {
  Play,
  Send,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Code2,
  Maximize2,
  Minimize2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CodingQuestion } from "@/hooks/interview/useInterviewSession";

// ── Types ────────────────────────────────────────────────────────────────────

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
}

interface CodeEditorProps {
  question: CodingQuestion;
  sessionId: number;
  onSubmit: (code: string, language: string, testResult: RunResult) => void;
  onClose: () => void;
  apiBase: string;
}

// ── Language Config ──────────────────────────────────────────────────────────

const LANGUAGES = [
  { id: "python", label: "Python", monacoId: "python" },
  { id: "javascript", label: "JavaScript", monacoId: "javascript" },
  { id: "typescript", label: "TypeScript", monacoId: "typescript" },
  { id: "java", label: "Java", monacoId: "java" },
  { id: "cpp", label: "C++", monacoId: "cpp" },
  { id: "c", label: "C", monacoId: "c" },
  { id: "go", label: "Go", monacoId: "go" },
  { id: "csharp", label: "C#", monacoId: "csharp" },
];

const DIFFICULTY_COLORS = {
  easy: "bg-green-100 text-green-700 border-green-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  hard: "bg-red-100 text-red-700 border-red-300",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CodeEditor({
  question,
  sessionId,
  onSubmit,
  onClose,
  apiBase,
}: CodeEditorProps) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testResults, setTestResults] = useState<RunResult | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<"problem" | "results">("problem");
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(question.time_limit * 60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<any>(null);

  // Start timer on mount
  React.useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Load starter code when language changes
  React.useEffect(() => {
    fetch(`${apiBase}/interview/code/starter/${language}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code && !code.trim()) {
          setCode(d.code);
        }
      })
      .catch(() => {});
  }, [language, apiBase]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleRun = useCallback(async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    setActiveTab("results");

    try {
      const resp = await fetch(
        `${apiBase}/interview/sessions/${sessionId}/run-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            code,
            test_cases: question.test_cases,
          }),
        }
      );
      const data = await resp.json();
      setTestResults(data);
    } catch (err) {
      console.error("Run failed:", err);
    } finally {
      setRunning(false);
    }
  }, [code, language, sessionId, apiBase, question.test_cases, running]);

  const handleSubmit = useCallback(async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);

    try {
      // Run tests first
      const resp = await fetch(
        `${apiBase}/interview/sessions/${sessionId}/run-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            code,
            test_cases: question.test_cases,
          }),
        }
      );
      const finalResult: RunResult = await resp.json();
      setTestResults(finalResult);
      setActiveTab("results");

      // Submit to interview
      onSubmit(code, language, finalResult);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }, [code, language, sessionId, apiBase, question.test_cases, submitting, onSubmit]);

  const handleReset = () => {
    setCode("");
    setTestResults(null);
    setActiveTab("problem");
    // Reload starter code
    fetch(`${apiBase}/interview/code/starter/${language}`)
      .then((r) => r.json())
      .then((d) => setCode(d.code || ""))
      .catch(() => {});
  };

  const timerColor =
    timeLeft <= 60 ? "text-red-500" : timeLeft <= 180 ? "text-yellow-500" : "text-gray-400";

  return (
    <div
      className={`flex flex-col bg-[#1e1e1e] text-white rounded-xl overflow-hidden border border-gray-700 ${
        isExpanded ? "fixed inset-2 z-50" : "h-full"
      }`}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Code2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200 truncate max-w-[200px]">
            {question.title}
          </h3>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              DIFFICULTY_COLORS[question.difficulty]
            }`}
          >
            {question.difficulty.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Timer */}
          <div className={`flex items-center gap-1 text-xs font-mono ${timerColor}`}>
            <Clock className="w-3 h-3" />
            {formatTime(timeLeft)}
          </div>

          {/* Language selector */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#3c3c3c] border-gray-600 rounded-md hover:bg-[#4c4c4c] transition-colors text-gray-200"
            >
              {LANGUAGES.find((l) => l.id === language)?.label}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showLangDropdown && (
              <div className="absolute right-0 top-8 bg-[#2d2d2d] border border-gray-600 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                {LANGUAGES.map((lang) => (
                  <Button
                    key={lang.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLanguage(lang.id);
                      setShowLangDropdown(false);
                    }}
                    className={`w-full justify-start rounded-none px-3 py-1.5 text-xs hover:bg-[#3c3c3c] ${
                      language === lang.id ? "text-blue-400 bg-[#3c3c3c]" : "text-gray-300"
                    }`}
                  >
                    {lang.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="size-7 text-gray-400 hover:text-white"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel: Problem + Results */}
        <div className="w-[340px] flex flex-col border-r border-gray-700 bg-[#252526]">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("problem")}
              className={`flex-1 rounded-none px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "problem"
                  ? "text-blue-400 border-b-2 border-blue-400 bg-[#1e1e1e]"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Problem
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab("results")}
              className={`flex-1 rounded-none px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "results"
                  ? "text-blue-400 border-b-2 border-blue-400 bg-[#1e1e1e]"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Results
              {testResults && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                    testResults.passed === testResults.total
                      ? "bg-green-900/50 text-green-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {testResults.passed}/{testResults.total}
                </span>
              )}
            </Button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "problem" ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {question.description}
                </div>

                {/* Sample test cases */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Test Cases
                  </h4>
                  {question.test_cases.slice(0, 2).map((tc, i) => (
                    <div
                      key={i}
                      className="bg-[#1e1e1e] rounded-lg p-3 space-y-1.5 text-xs"
                    >
                      <p className="text-gray-500 font-medium">{tc.description}</p>
                      <div>
                        <span className="text-gray-500">Input: </span>
                        <code className="text-green-400 font-mono">
                          {tc.input.replace(/\n/g, " \\n ")}
                        </code>
                      </div>
                      <div>
                        <span className="text-gray-500">Expected: </span>
                        <code className="text-blue-400 font-mono">{tc.expected_output}</code>
                      </div>
                    </div>
                  ))}
                  {question.test_cases.length > 2 && (
                    <p className="text-[10px] text-gray-500">
                      + {question.test_cases.length - 2} hidden test case(s)
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {!testResults ? (
                  <p className="text-xs text-gray-500 text-center py-8">
                    Run your code to see test results
                  </p>
                ) : (
                  <>
                    {/* Summary */}
                    <div
                      className={`text-center py-3 rounded-lg text-sm font-medium ${
                        testResults.passed === testResults.total
                          ? "bg-green-900/30 text-green-400"
                          : "bg-red-900/30 text-red-400"
                      }`}
                    >
                      {testResults.passed === testResults.total
                        ? "All test cases passed!"
                        : `${testResults.passed}/${testResults.total} test cases passed`}
                    </div>

                    {/* Individual results */}
                    {testResults.results.map((r) => (
                      <div
                        key={r.test_index}
                        className={`rounded-lg p-3 text-xs border ${
                          r.passed
                            ? "bg-green-900/10 border-green-800/50"
                            : "bg-red-900/10 border-red-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {r.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          )}
                          <span className={r.passed ? "text-green-400" : "text-red-400"}>
                            {r.description}
                          </span>
                        </div>
                        {!r.passed && (
                          <div className="mt-2 space-y-1 text-[11px] font-mono">
                            <div>
                              <span className="text-gray-500">Expected: </span>
                              <span className="text-blue-400">{r.expected_output}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Got: </span>
                              <span className="text-red-400">
                                {r.actual_output || "(empty)"}
                              </span>
                            </div>
                            {r.stderr && (
                              <div className="mt-1 text-red-400/70 break-all">
                                {r.stderr.slice(0, 200)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Code Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <Editor
            height="100%"
            language={LANGUAGES.find((l) => l.id === language)?.monacoId || "python"}
            value={code}
            onChange={(v) => setCode(v || "")}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: "on",
              renderLineHighlight: "all",
              bracketPairColorization: { enabled: true },
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
            }}
          />
        </div>
      </div>

      {/* ── Footer Actions ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-t border-gray-700">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-[#3c3c3c] border-gray-600 rounded-md hover:bg-[#4c4c4c] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={running || !code.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-[#2ea043] hover:bg-[#3fb950] text-white border-transparent rounded-md transition-colors"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {running ? "Running..." : "Run Code"}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {submitting ? "Submitting..." : "Submit Solution"}
          </Button>
        </div>
      </div>
    </div>
  );
}
