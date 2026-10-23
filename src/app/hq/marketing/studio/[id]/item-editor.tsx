"use client";
// Edits one Studio post: when it goes out, its words (and the short version for Threads and Bluesky, or the subject or
// push title), and its card. With AI drafting on, a rewrite in the brand's voice can be asked for and used, or not.
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CARD_TEMPLATES, LIMITS, type Card, type StudioChannel } from "@/lib/studio";

type Props = {
  id: string;
  channel: StudioChannel;
  at: string;
  title: string | null;
  text: string;
  short: string | null;
  card: Card | null;
  video: string | null; // the file name of the video on the post, if any
  images: { key: string; label: string }[];
  save: FormAction;
  suggest: ((id: string, text: string, note: string) => Promise<{ text?: string; flags?: string[]; error?: string }>) | null;
};

export function ItemEditor({ id, channel, at, title, text, short, card, video, images, save, suggest }: Props) {
  const [words, setWords] = useState(text);
  const [template, setTemplate] = useState(card?.template ?? "");
  const [note, setNote] = useState("");
  const [idea, setIdea] = useState<{ text?: string; flags?: string[]; error?: string } | null>(null);
  const [asking, start] = useTransition();
  const cards = channel === "SOCIAL" || channel === "WHATSAPP" || channel === "GOOGLE";
  const f = (k: string) => `${id}-${k}`;
  return (
    <ActionForm action={save} className="mt-3 space-y-3" notices="bottom">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Goes out" htmlFor={f("at")}>
          <Input id={f("at")} name="at" type="datetime-local" defaultValue={at} required />
          <FieldError name="at" />
        </Field>
        {(channel === "EMAIL" || channel === "PUSH") && (
          <Field label={channel === "EMAIL" ? "Subject" : "Push title"} htmlFor={f("title")}>
            <Input id={f("title")} name="title" defaultValue={title ?? ""} maxLength={channel === "PUSH" ? LIMITS.PUSH_TITLE : LIMITS.EMAIL_TITLE} />
          </Field>
        )}
      </div>
      <Field label="Words" htmlFor={f("text")}>
        <Textarea id={f("text")} name="text" rows={channel === "EMAIL" ? 9 : 5} value={words} onChange={(e) => setWords(e.target.value)} />
        <FieldError name="text" />
      </Field>
      {suggest && (
        <div className="rounded-xl bg-ink-50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Ask for a rewrite (optional note)" htmlFor={f("note")} className="min-w-56 flex-1">
              <Input id={f("note")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shorter, warmer, mention the Open Day…" />
            </Field>
            <Button type="button" variant="outline" size="sm" disabled={asking} onClick={() => start(async () => setIdea(await suggest(id, words, note)))}>
              <Sparkles className="h-4 w-4" aria-hidden /> {asking ? "Writing…" : "Suggest"}
            </Button>
          </div>
          {idea?.error && <p className="mt-2 text-sm text-rose-600" role="alert">{idea.error}</p>}
          {idea?.text && (
            <div className="mt-3 space-y-2" aria-live="polite">
              <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-ink-800 ring-1 ring-ink-100">{idea.text}</p>
              {idea.flags?.length ? <p className="text-xs text-rose-600">Needs changes: {idea.flags.join(" · ")}</p> : null}
              <Button type="button" size="sm" variant="dark" onClick={() => setWords(idea.text!)}>
                Use this
              </Button>
            </div>
          )}
        </div>
      )}
      {channel === "SOCIAL" && (
        <>
          <Field label="Short version" hint={`For Threads and Bluesky, ${LIMITS.SHORT} characters at most. Needed when the words are longer.`} htmlFor={f("short")}>
            <Textarea id={f("short")} name="short" rows={2} defaultValue={short ?? ""} maxLength={LIMITS.SHORT} />
          </Field>
          <Field label="Video" hint={video ? `${video} is on this post. Choose another to replace it.` : "MP4 or MOV, up to 90 MB: TikTok and X post it instead of the card; YouTube Shorts only goes out with one."} htmlFor={f("video")}>
            <Input id={f("video")} name="video" type="file" accept="video/mp4,video/quicktime" className="h-auto py-2" />
            {video && (
              <label className="mt-1.5 flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" name="dropVideo" value="1" /> Take the video off this post
              </label>
            )}
          </Field>
        </>
      )}
      {cards && (
        <fieldset className="grid gap-3 rounded-xl border border-ink-100 p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold text-ink-600">Card</legend>
          <Field label="Design" htmlFor={f("template")}>
            <Select id={f("template")} name="template" value={template} onChange={(e) => setTemplate(e.target.value)}>
              {channel !== "SOCIAL" && <option value="">No card</option>}
              {Object.entries(CARD_TEMPLATES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {template && (
            <>
              <Field label="Small line above" htmlFor={f("eyebrow")}>
                <Input id={f("eyebrow")} name="eyebrow" defaultValue={card?.eyebrow ?? ""} />
              </Field>
              <Field label="Headline" htmlFor={f("headline")}>
                <Input id={f("headline")} name="headline" defaultValue={card?.headline ?? ""} required />
              </Field>
              <Field label="Line below" htmlFor={f("sub")}>
                <Input id={f("sub")} name="sub" defaultValue={card?.sub ?? ""} />
              </Field>
              {template === "promise" && (
                <Field label="Promises, one per line" htmlFor={f("lines")} className="sm:col-span-2">
                  <Textarea id={f("lines")} name="lines" rows={5} defaultValue={card?.lines?.join("\n") ?? ""} />
                </Field>
              )}
              {template === "merch" && (
                <Field label="Picture" htmlFor={f("image")}>
                  <Select id={f("image")} name="image" defaultValue={card?.image ?? ""}>
                    {images.map((i) => (
                      <option key={i.key} value={i.key}>
                        {i.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}
        </fieldset>
      )}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </ActionForm>
  );
}
