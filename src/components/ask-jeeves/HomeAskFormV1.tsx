"use client";

import { useEffect, useRef, useState } from "react";
import type { RangePreset } from "@/lib/types/dashboard";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function HomeAskFormV1({
  reportingRange
}: {
  reportingRange?: { preset: RangePreset; startDate: string; endDate: string } | null;
}) {
  const [question, setQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const startingQuestion = useRef("");
  const latestQuestion = useRef("");
  const keepListening = useRef(false);

  useEffect(() => () => {
    keepListening.current = false;
    recognition.current?.stop();
  }, []);

  function beginVoiceSession(Recognition: new () => SpeechRecognitionLike, baseQuestion: string) {
    const instance = new Recognition();
    recognition.current = instance;
    startingQuestion.current = baseQuestion.trim();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += `${event.results[index]?.[0]?.transcript ?? ""} `;
      }
      const nextQuestion = [startingQuestion.current, transcript.trim()].filter(Boolean).join(" ");
      latestQuestion.current = nextQuestion;
      setQuestion(nextQuestion);
    };
    instance.onerror = (event) => {
      if (event.error === "no-speech" && keepListening.current) return;
      keepListening.current = false;
      setVoiceError("I could not hear that clearly. Try again or type your question.");
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
      setVoiceError("Voice input is not supported in this browser. You can still type your question.");
      return;
    }

    latestQuestion.current = question.trim();
    keepListening.current = true;
    setVoiceError(null);
    setListening(true);
    beginVoiceSession(Recognition, latestQuestion.current);
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl text-left">
      <form action="/ask-jeeves" method="get" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-2 pl-4 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 sm:flex-nowrap">
        <label htmlFor="home-ask-question" className="sr-only">Ask a question about your business</label>
        <input id="home-ask-question" name="q" required maxLength={500} value={question} onChange={(event) => {
          latestQuestion.current = event.target.value;
          setQuestion(event.target.value);
        }} className="min-w-0 basis-full bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 sm:flex-1 sm:basis-auto sm:py-0" placeholder="Ask anything about your business, strategy, or the wider market" />
        {reportingRange ? <input type="hidden" name="range" value={reportingRange.preset} /> : null}
        {reportingRange?.preset === "custom" ? <input type="hidden" name="start" value={reportingRange.startDate} /> : null}
        {reportingRange?.preset === "custom" ? <input type="hidden" name="end" value={reportingRange.endDate} /> : null}
        <button type="button" onClick={toggleVoice} aria-pressed={listening} aria-label={listening ? "Stop voice input" : "Start voice input"} className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${listening ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"}`}>
          {listening ? "Stop" : "Speak"}
        </button>
        <button type="submit" className="shrink-0 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Ask Jeeves</button>
      </form>
      {listening ? <p role="status" className="mt-2 text-xs text-slate-500">Listening continuously. Press Stop when you are finished.</p> : null}
      {voiceError ? <p role="alert" className="mt-2 text-xs text-red-700">{voiceError}</p> : null}
    </div>
  );
}
