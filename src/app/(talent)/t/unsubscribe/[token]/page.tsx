import UnsubscribePage from "@/components/talent/candidate/UnsubscribePage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribePage token={token} />;
}
