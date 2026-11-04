import Link from "next/link";
import { OpenCaseForm } from "@/components/OpenCaseForm";
import {
  CASE_ROLES,
  listDepartmentsForCases,
  listProcedureTypesForDepartment,
  listRoomsForDepartment,
} from "@/lib/cases";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const user = await getCurrentUser();
  if (
    !user ||
    !CASE_ROLES.includes(user.role as (typeof CASE_ROLES)[number])
  ) {
    return (
      <p className="text-sm text-amber-800">
        Pick a tech, supply_chain, or admin user to open a case.
      </p>
    );
  }

  const departments = await listDepartmentsForCases();
  const rooms = (
    await Promise.all(departments.map((d) => listRoomsForDepartment(d.id)))
  ).flat();
  const procedures = (
    await Promise.all(
      departments.map((d) => listProcedureTypesForDepartment(d.id)),
    )
  ).flat();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/cases" className="text-sm underline">
          ← Cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Open case</h1>
      </div>
      <OpenCaseForm
        departments={departments}
        rooms={rooms}
        procedures={procedures}
      />
    </div>
  );
}
