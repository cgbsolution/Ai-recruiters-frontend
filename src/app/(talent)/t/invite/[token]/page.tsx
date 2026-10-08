import InvitePage from "@/components/talent/candidate/InvitePage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitePage token={token} />;
}
