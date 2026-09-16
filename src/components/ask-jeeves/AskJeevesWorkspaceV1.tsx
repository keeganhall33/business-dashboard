"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AskJeevesAnswerV1 } from "@/lib/ask-jeeves/answer-engine-v1";
import { askJeevesActionV1 } from "@/app/(app)/ask-jeeves/actions";
import { DateRangeControls } from "@/components/dashboard/DateRangeControls";
import type { RangePreset } from "@/lib/types/dashboard";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const DEFAULT_REPORTING_RANGE = {
  preset: "30d" as const,
  startDate: "",
  endDate: ""
};

export function AskJeevesWorkspaceV1({
  initialQuestion = "",
  reportingRange = DEFAULT_REPORTING_RANGE
}: {
  initialQuestion?: string;
  reportingRange?: { preset: RangePreset; startDate: string; endDate: string };
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState<AskJeevesAnswerV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const voiceBase = useRef("");
  const latestQuestion = useRef(initialQuestion);
  const keepListening = useRef(false);
  const initialQuestionHandled = useRef(false);

  useEffect(() => () => {
    keepListening.current = false;
    recognition.current?.stop();
  }, []);

  async function runQuestion(value: string) {
    const nextQuestion = value.trim();
    if (!nextQuestion || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askJeevesActionV1(nextQuestion, reportingRange);
      if (!result.ok) throw new Error(result.message);
      setAnswer(result.answer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jeeves could not answer that question.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialQuestion || initialQuestionHandled.current) return;
    initialQuestionHandled.current = true;
    void runQuestion(initialQuestion);
    // This should run only for the question supplied by the server on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuestion(question);
  }

  function beginVoiceSession(Recognition: new () => SpeechRecognitionLike, baseQuestion: string) {
    const instance = new Recognition();
    recognition.current = instance;
    voiceBase.current = baseQuestion.trim();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += `${event.results[index]?.[0]?.transcript ?? ""} `;
      const nextQuestion = [voiceBase.current, transcript.trim()].filter(Boolean).join(" ");
      latestQuestion.current = nextQuestion;
      setQuestion(nextQuestion);
    };
    instance.onerror = (event) => {
      if (event.error === "no-speech" && keepListening.current) return;
      keepListening.current = false;
      setError("I could not hear that clearly. Please try again or type your question.");
      setListening(false);
    };
    instance.onend = () => {
      if (!keepListening.current) {
        setListening(false);
        return;
      }
      window.setTimeout(() => {
        if (!keepListening.current) return;
        beginVoiceSession(Recognition, latestQuestion.current);
      }, 150);
    };
    instance.start();
  }

  function toggleVoice() {
    if (listening) {
      keepListening.current = false;
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported in this browser. You can still type your question.");
      return;
    }
    latestQuestion.current = question.trim();
    keepListening.current = true;
    setError(null);
    setListening(true);
    beginVoiceSession(Recognition, latestQuestion.current);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] py-8 text-slate-950" data-testid="ask-jeeves-workspace-v1">
      <div className="mx-auto max-w-4xl">
        <header className="text-center">
          <p className="text-sm font-semibold text-blue-700">Ask Jeeves</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">What do you want to know?</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">Ask anything. Jeeves can use your business data, reason through strategy, or research the wider market.</p>
        </header>

        <div className="mt-6">
          <DateRangeControls preset={reportingRange.preset} startDate={reportingRange.startDate} endDate={reportingRange.endDate} />
        </div>

        <form onSubmit={submit} className="mt-8 rounded-3xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/60">
          <label htmlFor="jeeves-question" className="sr-only">Ask Jeeves a question</label>
          <textarea id="jeeves-question" value={question} onChange={(event) => {
            latestQuestion.current = event.target.value;
            setQuestion(event.target.value);
          }} rows={3} maxLength={500} placeholder="What should I focus on next?" className="w-full resize-none rounded-2xl bg-slate-50 px-4 py-4 text-base leading-7 outline-none ring-blue-500 placeholder:text-slate-400 focus:ring-2" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <button type="button" onClick={toggleVoice} aria-pressed={listening} className={`rounded-full border px-4 py-2 text-sm font-semibold ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"}`}>{listening ? "Stop listening" : "Speak"}</button>
              {listening ? <p role="status" className="mt-2 text-xs text-slate-500">Listening continuously. Press Stop when you are finished.</p> : null}
            </div>
            <button type="submit" disabled={!question.trim() || loading} className="rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Thinking…" : "Send"}</button>
          </div>
        </form>

        {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        {answer ? <section aria-live="polite" className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Answer</p>
          <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-900">{answer.answer}</p>
          {answer.facts.length ? <ul className="mt-5 space-y-2 text-base leading-7 text-slate-700">{answer.facts.map((fact) => <li key={fact} className="rounded-2xl bg-slate-50 px-4 py-3">{fact}</li>)}</ul> : null}
          {answer.links.length ? <div className="mt-5 flex flex-wrap gap-2">{answer.links.map((link) => <a key={`${link.href}:${link.label}`} href={link.href} className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">{link.label}</a>)}</div> : null}
          {answer.sources.length ? <p className="mt-5 text-xs leading-5 text-slate-500">Sources: {answer.sources.join(" · ")}</p> : null}
        </section> : null}
      </div>
    </main>
  );
}
