"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Michibi } from "@/components/Michibi";
import { APP_NAME, MAX_QUERY_LENGTH } from "@/lib/config";
import { MICHIBI_LINES } from "@/lib/character";
import { querySchema } from "@/lib/schemas";
import { useSearch } from "@/lib/store/search-context";
import { useVoiceInput } from "@/lib/use-voice-input";

const EXAMPLES = ["本屋行きたい", "落ち着きたい", "カレー食べたい", "暇", "一人になりたい", "なんか面白いところ"];

export default function HomePage() {
  const router = useRouter();
  const search = useSearch();
  const { locationStatus } = search;
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);
  const voice = useVoiceInput((heard) => {
    setText(heard);
    setInputError(null);
  });

  useEffect(() => {
    const t = setInterval(() => setExampleIndex((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, []);

  const ready = locationStatus === "ready";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = querySchema.safeParse(text);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "ひとこと入れてね");
      return;
    }
    if (!ready) return;
    setInputError(null);
    void search.runSearch(parsed.data);
    router.push("/map");
  }

  return (
    <main className="aurora min-h-[calc(100dvh-76px)]">
      <div className="flex min-h-[calc(100dvh-76px)] flex-col px-6 pt-[max(18px,env(safe-area-inset-top))] pb-10">
        <header>
          <h1 className="text-lg font-bold tracking-[0.08em]">{APP_NAME}</h1>
        </header>

        <div className="flex flex-1 flex-col justify-center">
          <div className="flex justify-center">
            <Michibi
              mood={ready ? "idle" : locationStatus === "locating" ? "peek" : "wonder"}
              size={132}
              says={MICHIBI_LINES.homeGreeting[0]}
              className="flex-col-reverse !items-center"
            />
          </div>

          <form onSubmit={onSubmit} className="mt-8">
            <label htmlFor="q" className="block text-center text-2xl font-bold">
              今、なにしたい？
            </label>

            <div className="mt-5 flex items-center gap-2 rounded-full bg-white py-2 pr-2 pl-5 shadow-lift focus-within:ring-2 focus-within:ring-lavender">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-ink-soft">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <input
                id="q"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (inputError) setInputError(null);
                }}
                maxLength={MAX_QUERY_LENGTH}
                enterKeyHint="go"
                autoComplete="off"
                placeholder={EXAMPLES[exampleIndex]}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? "q-error" : undefined}
                className="min-w-0 flex-1 bg-transparent py-3 text-lg font-bold placeholder:font-medium placeholder:text-ink-mute focus:outline-none"
              />
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  aria-label={voice.listening ? "音声入力を止める" : "声で入力する"}
                  aria-pressed={voice.listening}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                    voice.listening ? "rainbow text-ink" : "bg-paper-deep text-ink-soft"
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2.2" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {inputError && (
              <p id="q-error" role="alert" className="mt-2 px-2 text-sm font-bold text-[#c2255c]">
                {inputError}
              </p>
            )}

            <button type="submit" disabled={!ready} className="btn-primary mt-4 h-14 w-full text-lg">
              よりみちを探す
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h13m-5-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <LocationLine />
        </div>
      </div>
    </main>
  );
}

/** 「📍 現在地を使う」 */
function LocationLine() {
  const { locationStatus, locate, acceptOutsideArea } = useSearch();

  if (locationStatus === "ready") {
    return (
      <p className="mt-4 text-center text-sm font-bold text-mint-deep" role="status">
        📍 現在地を使用中
      </p>
    );
  }
  if (locationStatus === "locating") {
    return (
      <p className="mt-4 text-center text-sm text-ink-soft" role="status">
        📍 現在地を確認中…
      </p>
    );
  }
  if (locationStatus === "outside") {
    return (
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={acceptOutsideArea} className="btn-secondary h-10 px-5 text-sm">
          📍 現在地を使う
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 text-center" role="alert">
      {locationStatus !== "unsupported" && (
        <button type="button" onClick={locate} className="btn-secondary h-11 px-6 text-sm">
          📍 現在地を使う
        </button>
      )}
      {locationStatus !== "unavailable" && (
        <p className="mt-2 text-sm text-ink-soft">
          {locationStatus === "unsupported"
            ? "このブラウザでは位置情報を使えません。"
            : "ブラウザの設定で位置情報をオンにしてください。"}
        </p>
      )}
    </div>
  );
}
