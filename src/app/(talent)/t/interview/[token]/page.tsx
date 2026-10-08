import InterviewPage from "@/components/talent/candidate/InterviewPage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InterviewPage token={token} />;
}
