"use client";

import type { MichibiMood } from "@/lib/character";
import { Michibi } from "./Michibi";
import { SketchButton, SketchLinkButton } from "./sketch";

export function MessageView({
  mood,
  says,
  detail,
  action,
  secondary,
}: {
  mood: MichibiMood;
  says: string;
  detail?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="paper flex h-full flex-col items-center justify-center px-6 text-center" role="status">
      <Michibi mood={mood} size={120} animate="none" />
      <p className="mt-4 text-xl font-bold">{says}</p>
      {detail && <p className="mt-2 max-w-xs text-sm text-ink-soft">{detail}</p>}
      <div className="mt-6 flex flex-col items-center gap-3">
        {action &&
          (action.href ? (
            <SketchLinkButton href={action.href}>{action.label}</SketchLinkButton>
          ) : (
            <SketchButton onClick={action.onClick}>{action.label}</SketchButton>
          ))}
        {secondary && (
          <SketchLinkButton href={secondary.href} variant="sub" size="sm">
            {secondary.label}
          </SketchLinkButton>
        )}
      </div>
    </div>
  );
}
