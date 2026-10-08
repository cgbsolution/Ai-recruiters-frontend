import MyDataPage from "@/components/talent/candidate/MyDataPage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MyDataPage token={token} />;
}
