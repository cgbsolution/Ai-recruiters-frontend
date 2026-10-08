import RefreshPage from "@/components/talent/candidate/RefreshPage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RefreshPage token={token} />;
}
