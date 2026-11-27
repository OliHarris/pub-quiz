import type { Metadata } from "next";
import { QuizEditor } from "@/components/dashboard/QuizEditor";

export const metadata: Metadata = { title: "New quiz · Pub Quiz" };

export default function NewQuizPage() {
  return <QuizEditor />;
}
