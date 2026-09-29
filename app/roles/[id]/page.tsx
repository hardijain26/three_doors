import { redirect } from "next/navigation";

// Roles now live on one page, like the tracker. Old links jump to the role's card.
export default async function RoleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/roles#role-${encodeURIComponent(id)}`);
}
