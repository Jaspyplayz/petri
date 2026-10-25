"use client";

import Link from "next/link";
import { useMemo, useState, type AnimationEvent, type ReactNode, type SubmitEvent } from "react";
import { track } from "@/shared/lib/track";
import { useLocalStorage } from "@/shared/lib/use-local-storage";
import { BlobGlyph } from "@/shared/ui/blob-glyph";
import { Button } from "@/shared/ui/button";
import {
  BLOB_NAME_MAX_LENGTH,
  BLOB_COLORS,
  BLOB_STORAGE_KEY,
  blobColor,
  feed,
  formatSize,
  isFullyGrown,
  parseBlobState,
  poke,
  recolor,
  rename,
  serializeBlobState,
  type BlobColorId,
  type BlobState,
} from "../lib/blob-state";
import { sizeMood, snackMood } from "../lib/size-mood";
import styles from "./blob.module.css";

type Mood = "calm" | "poked" | "fed";

const evolvedLinkClass =
  "inline-block bg-[linear-gradient(90deg,#e56b9a_0%,#ef9a45_18%,#e4c04a_38%,#6fbe73_58%,#6aa4e4_78%,#b07ad6_100%)] bg-clip-text text-center text-xl font-extrabold leading-tight tracking-tight text-transparent sm:text-2xl";

export function EvolvedLink({ label }: { readonly label: string }) {
  return (
    <Link href="/timeline" data-testid="blob-evolved" className={evolvedLinkClass}>
      {label}
    </Link>
  );
}

export function BlobCreature({ evolved }: { readonly evolved: ReactNode }) {
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

  const handleColor = (color: BlobColorId) => {
    save(recolor(state, color));
    track("blob", "recolor");
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
  const body = blobColor(state);
  const yum = snackMood(state.feeds);

  return (
    <section data-testid="blob-panel" aria-labelledby="blob-name" className="flex flex-col items-center gap-4">
      <h1 id="blob-name" data-testid="blob-name" className="sr-only">
        {state.name}
      </h1>

      <button
        type="button"
        onClick={handlePoke}
        data-testid="blob-creature"
        aria-label={`Poke ${state.name}`}
        className="rounded-full p-1"
      >
        <BlobGlyph
          fill={body.fill}
          look="full"
          mood={mood}
          shadowRx={46 * state.size}
          width={300}
          height={300}
          className={styles.lift}
          frameClassName={styles.creature}
          frameStyle={{ transform: `scale(${String(state.size * 0.8)})` }}
          poseKey={wobbles}
          body={{
            "data-testid": "blob-body",
            className: wobbling ? styles.wobble : styles.breathe,
            "data-mood": mood,
            onAnimationEnd: handleAnimationEnd,
          }}
          eyelid={{ "data-testid": "blob-eyelid", className: styles.eyelid }}
        />
      </button>

      <div className="flex justify-center px-2">{evolved}</div>

      <dl className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
        <div className="flex items-baseline gap-1.5">
          <dt>Size:</dt>
          <dd data-testid="blob-size">
            {sizeMood(state)}
            <span className="sr-only"> {formatSize(state)}</span>
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt>Pokes:</dt>
          <dd data-testid="blob-pokes">{state.pokes}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt>Snacks:</dt>
          <dd data-testid="blob-feeds">
            {state.feeds}
            {yum ? ` ${yum}` : ""}
          </dd>
        </div>
      </dl>

      <div className="flex gap-3">
        <Button onClick={handlePoke} variant="poke" data-testid="blob-poke-button" className="min-w-28">
          Poke
        </Button>
        <Button onClick={handleFeed} variant="feed" disabled={full} data-testid="blob-feed-button" className="min-w-28">
          {full ? "Too full" : "Feed"}
        </Button>
      </div>

      <div role="group" aria-label="Blob colour" data-testid="blob-color-picker" className="flex gap-2.5">
        {BLOB_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            onClick={() => {
              handleColor(color.id);
            }}
            data-testid={`blob-color-swatch-${color.id}`}
            aria-label={color.label}
            aria-pressed={state.color === color.id}
            style={{ backgroundColor: color.fill, borderColor: color.stroke }}
            className={`h-7 w-7 rounded-full border-2 ${state.color === color.id ? "ring-2 ring-ink ring-offset-2 ring-offset-agar" : ""}`}
          />
        ))}
      </div>

      <form onSubmit={handleRename} className="flex flex-col items-center gap-2" noValidate>
        <label htmlFor="blob-name-input" className="sr-only">
          Name your blob
        </label>
        <div className="flex items-center gap-2">
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
            className="w-52 rounded-full border border-ink/10 bg-card px-4 py-2.5 text-sm shadow-sm"
          />
          <Button type="submit" variant="tan" data-testid="blob-name-save">
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
