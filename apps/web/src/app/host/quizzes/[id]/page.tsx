import { Suspense } from "react";
import type { Metadata } from "next";
import { QuizEditor } from "@/components/dashboard/QuizEditor";
import { Splash } from "@/components/ui";

export const metadata: Metadata = { title: "Edit quiz · Pub Quiz" };

export default function EditQuizPage({ params }: PageProps<"/host/quizzes/[id]">) {
  return (
    <Suspense fallback={<Splash title="Loading…" />}>
      {params.then(({ id }) => (
        <QuizEditor quizId={id} />
      ))}
    </Suspense>
  );
}
