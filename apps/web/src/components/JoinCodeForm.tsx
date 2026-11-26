"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROOM_CODE_LENGTH, roomCodeSchema } from "@pub-quiz/shared";
import { PrimaryButton } from "./ui";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = roomCodeSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the code");
    router.push(`/play/${parsed.data}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="room-code" className="sr-only">
        Room code
      </label>
      <input
        id="room-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase());
          setError(null);
        }}
        maxLength={ROOM_CODE_LENGTH}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="KDBX"
        className="rounded-2xl border-2 border-felt-lighter bg-felt px-5 py-3.5 text-center font-display text-3xl font-bold tracking-[0.4em] text-brass placeholder:text-chalk-dim/30 focus:border-brass focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
      <PrimaryButton type="submit">Join</PrimaryButton>
    </form>
  );
}
