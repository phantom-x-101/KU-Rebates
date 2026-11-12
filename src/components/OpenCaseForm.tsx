"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { openCaseAction, type CaseActionState } from "@/app/cases/actions";

type Dept = { id: number; name: string };
type Room = { id: number; departmentId: number; name: string };
type Proc = { id: number; departmentId: number; name: string };

const initial: CaseActionState = { ok: false, message: "" };

export function OpenCaseForm({
  departments,
  rooms,
  procedures,
}: {
  departments: Dept[];
  rooms: Room[];
  procedures: Proc[];
}) {
  const [departmentId, setDepartmentId] = useState(
    departments[0] ? String(departments[0].id) : "",
  );
  const filteredRooms = useMemo(
    () => rooms.filter((r) => String(r.departmentId) === departmentId),
    [rooms, departmentId],
  );
  const filteredProcs = useMemo(
    () => procedures.filter((p) => String(p.departmentId) === departmentId),
    [procedures, departmentId],
  );
  const [state, action, pending] = useActionState(openCaseAction, initial);

  return (
    <form action={action} className="max-w-md space-y-3">
      <label className="block text-sm">
        <span className="text-slate-600">Department</span>
        <select
          name="departmentId"
          required
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Room</span>
        <select
          name="roomId"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          defaultValue={filteredRooms[0]?.id ?? ""}
        >
          <option value="">None</option>
          {filteredRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Procedure type</span>
        <select
          name="procedureTypeId"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          defaultValue={filteredProcs[0]?.id ?? ""}
        >
          <option value="">None</option>
          {filteredProcs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500">
        A case holds only department, room, procedure type, and timestamps — never
        patient identifiers.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-pc-teal px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open case"}
      </button>
      {state.resumeCaseId ? (
        <p className="text-sm text-amber-900">
          {state.message}.{" "}
          <Link href={`/cases/${state.resumeCaseId}`} className="font-semibold underline">
            Resume it
          </Link>
        </p>
      ) : state.message ? (
        <p className="text-sm text-red-700">{state.message}</p>
      ) : null}
    </form>
  );
}
