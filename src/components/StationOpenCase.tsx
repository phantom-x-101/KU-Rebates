"use client";

import { useState } from "react";
import { openStationCaseAction } from "@/app/station/actions";
import type { CaseOpenOptions } from "@/lib/case-open";

function defaultRoom(options: CaseOpenOptions, labId: number) {
  const { last, rooms } = options;
  const inLab = rooms.filter((room) => room.departmentId === labId);
  if (last?.departmentId === labId && inLab.some((room) => room.id === last.roomId)) {
    return last.roomId!;
  }
  return inLab[0]?.id ?? null;
}

function defaultProcedure(options: CaseOpenOptions, labId: number) {
  const { last } = options;
  if (last?.departmentId === labId && last.procedureTypeId != null) {
    return last.procedureTypeId;
  }
  return options.commonProcedure[labId] ?? null;
}

export function StationOpenCase({
  options,
  disabled,
  onOpened,
}: {
  options: CaseOpenOptions;
  disabled: boolean;
  onOpened: (caseId: number) => void;
}) {
  const firstLab =
    options.labs.find((lab) => lab.id === options.last?.departmentId)?.id ??
    options.labs[0]?.id ??
    null;
  const [labId, setLabId] = useState<number | null>(firstLab);
  const [roomId, setRoomId] = useState<number | null>(
    firstLab != null ? defaultRoom(options, firstLab) : null,
  );
  const [procedureTypeId, setProcedureTypeId] = useState<number | null>(
    firstLab != null ? defaultProcedure(options, firstLab) : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<{ id: number; message: string } | null>(null);

  const lab = options.labs.find((entry) => entry.id === labId) ?? null;
  const rooms = options.rooms.filter((room) => room.departmentId === labId);
  const procedures = options.procedures.filter((proc) => proc.departmentId === labId);

  function pickLab(next: number) {
    setLabId(next);
    setRoomId(defaultRoom(options, next));
    setProcedureTypeId(defaultProcedure(options, next));
    setExisting(null);
    setError("");
  }

  async function submit() {
    if (labId == null || roomId == null || pending) return;
    setPending(true);
    setError("");
    setExisting(null);
    try {
      const result = await openStationCaseAction({
        departmentId: labId,
        roomId,
        procedureTypeId,
      });
      if (result.status === "opened") onOpened(result.id);
      else if (result.status === "exists") {
        setExisting({ id: result.id, message: result.message });
      } else setError(result.message);
    } finally {
      setPending(false);
    }
  }

  if (options.labs.length === 0) {
    return <p className="text-sm text-slate-600">No lab has rooms set up yet.</p>;
  }

  const selectClass =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base";

  return (
    <form
      data-keep-focus
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Lab
          <select
            value={labId ?? ""}
            onChange={(event) => pickLab(Number(event.target.value))}
            className={selectClass}
          >
            {options.labs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.preview ? " (preview)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Room
          <select
            value={roomId ?? ""}
            onChange={(event) => {
              setRoomId(Number(event.target.value));
              setExisting(null);
            }}
            className={selectClass}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Procedure <span className="font-normal text-slate-500">(optional)</span>
          <select
            value={procedureTypeId ?? ""}
            onChange={(event) =>
              setProcedureTypeId(event.target.value ? Number(event.target.value) : null)
            }
            className={selectClass}
          >
            <option value="">Not set</option>
            {procedures.map((proc) => (
              <option key={proc.id} value={proc.id}>
                {proc.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lab?.preview ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {lab.name} is a preview. Its real workflow (no scan, end-of-day GE report) is not
          built yet.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || pending || roomId == null}
        className="w-full rounded-lg bg-pc-teal px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open case"}
      </button>

      {existing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2">
          <p className="font-semibold text-amber-950">{existing.message}</p>
          <button
            type="button"
            onClick={() => onOpened(existing.id)}
            className="rounded-lg bg-pc-teal px-3 py-1.5 text-sm font-semibold text-white"
          >
            Resume it
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <p className="text-xs text-slate-500">
        A case is only lab, room, procedure type and time. No patient information.
      </p>
    </form>
  );
}
