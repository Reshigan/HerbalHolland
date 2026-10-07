"use client";
import { PageError } from "@/components/admin/page-error";

export default function BooksError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError {...props} home={{ href: "/books", label: "All books" }} />;
}
