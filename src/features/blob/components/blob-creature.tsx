"use client";

import { useMemo, useState, type AnimationEvent, type SubmitEvent } from "react";
import { track } from "@/shared/lib/track";
import { useLocalStorage } from "@/shared/lib/use-local-storage";
import { Button } from "@/shared/ui/button";
import {
  BLOB_NAME_MAX_LENGTH,
  BLOB_STORAGE_KEY,
  feed,
  formatSize,
  isFullyGrown,
  parseBlobState,
  poke,
  rename,
  serializeBlobState,
  type BlobState,
} from "../lib/blob-state";
import styles from "./blob.module.css";

type Mood = "calm" | "poked" | "fed";

export function BlobCreature() {
  const [stored, setStored] = useLocalStorage(BLOB_STORAGE_KEY);
  const state = useMemo(() => parseBlobState(stored), [stored]);
  const [wobbles, setWobbles] = useState(0);
  const [wobbling, setWobbling] = useState(false);
  const [mood, setMood] = useState<Mood>("calm");
  const [draftName, setDraftName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const save = (next: BlobState) => {
    setStored(serializeBlobState(next));
  };

  const handlePoke = () => {
    save(poke(state));
    setWobbles((count) => count + 1);
    setWobbling(true);
    setMood("poked");
    track("blob", "poke");
  };

  const handleFeed = () => {
    save(feed(state));
    setWobbles((count) => count + 1);
    setWobbling(true);
    setMood("fed");
    track("blob", "feed");
  };

  const handleRename = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = rename(state, draftName ?? state.name);
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    save(result.state);
    setDraftName(null);
    setNameError(null);
    track("blob", "rename");
  };

  const handleAnimationEnd = (event: AnimationEvent<SVGGElement>) => {
    if (event.target !== event.currentTarget) return;
    setWobbling(false);
    setMood("calm");
  };

  const full = isFullyGrown(state);

  return (
    <section data-testid="blob-panel" aria-labelledby="blob-name" className="flex flex-col items-center gap-6">
      <h1 id="blob-name" data-testid="blob-name" className="text-3xl font-bold tracking-tight">
        {state.name}
      </h1>

      <button
        type="button"
        onClick={handlePoke}
        data-testid="blob-creature"
        aria-label={`Poke ${state.name}`}
        className="rounded-full p-2"
      >
        <svg viewBox="0 0 200 200" width="240" height="240" aria-hidden="true">
          <ellipse cx="100" cy="182" rx={46 * state.size} ry="8" className="fill-ink/10" />
          <g className={styles.creature} style={{ transform: `scale(${String(state.size * 0.8)})` }}>
            <g
              key={wobbles}
              className={wobbling ? styles.wobble : styles.breathe}
              data-mood={mood}
              data-testid="blob-body"
              onAnimationEnd={handleAnimationEnd}
            >
              <path
                d="M100 38c34 0 64 22 68 62 4 38-18 78-68 78s-74-36-70-76c4-40 36-64 70-64z"
                className="fill-culture stroke-culture-deep"
                strokeWidth="4"
              />
              <ellipse cx="78" cy="96" rx="9" ry={mood === "poked" ? 3 : 11} className="fill-blob-face" />
              <ellipse cx="122" cy="96" rx="9" ry={mood === "poked" ? 3 : 11} className="fill-blob-face" />
              <circle cx="81" cy="91" r="3" className="fill-white" />
              <circle cx="125" cy="91" r="3" className="fill-white" />
              <ellipse cx="78" cy="96" rx="11" ry="13" className={styles.eyelid} data-testid="blob-eyelid" />
              <ellipse cx="122" cy="96" rx="11" ry="13" className={styles.eyelid} />
              {mood === "fed" ? (
                <ellipse cx="100" cy="128" rx="12" ry="10" className="fill-blob-face" />
              ) : (
                <path d="M84 124q16 14 32 0" className="fill-none stroke-blob-face" strokeWidth="5" strokeLinecap="round" />
              )}
              <ellipse cx="62" cy="116" rx="9" ry="5" className="fill-spore/50" />
              <ellipse cx="138" cy="116" rx="9" ry="5" className="fill-spore/50" />
            </g>
          </g>
        </svg>
      </button>

      <dl className="flex gap-6 text-sm text-ink-soft">
        <div className="flex gap-1">
          <dt>Size</dt>
          <dd data-testid="blob-size" className="font-semibold text-ink">
            {formatSize(state)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Pokes</dt>
          <dd data-testid="blob-pokes" className="font-semibold text-ink">
            {state.pokes}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Snacks</dt>
          <dd data-testid="blob-feeds" className="font-semibold text-ink">
            {state.feeds}
          </dd>
        </div>
      </dl>

      <div className="flex gap-3">
        <Button onClick={handlePoke} variant="secondary" data-testid="blob-poke-button">
          Poke
        </Button>
        <Button onClick={handleFeed} disabled={full} data-testid="blob-feed-button">
          {full ? "Too full" : "Feed"}
        </Button>
      </div>

      <form onSubmit={handleRename} className="flex flex-col items-center gap-2" noValidate>
        <label htmlFor="blob-name-input" className="text-sm text-ink-soft">
          Name your blob
        </label>
        <div className="flex gap-2">
          <input
            id="blob-name-input"
            data-testid="blob-name-input"
            value={draftName ?? state.name}
            onChange={(event) => {
              setDraftName(event.target.value);
            }}
            maxLength={BLOB_NAME_MAX_LENGTH}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? "blob-name-error" : undefined}
            className="w-48 rounded-full border border-ink/20 bg-agar px-4 py-2 text-sm"
          />
          <Button type="submit" variant="secondary" data-testid="blob-name-save">
            Save
          </Button>
        </div>
        {nameError ? (
          <p id="blob-name-error" data-testid="blob-name-error" role="alert" className="text-sm text-warning">
            {nameError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
